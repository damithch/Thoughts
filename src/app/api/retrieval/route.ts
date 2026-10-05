import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { pool } from "@/lib/db/client";
import { getUserSettings } from "@/lib/db/settings";
import { embedTexts } from "@/lib/gemini";
import { extractRagQueryIntent } from "@/lib/temporal";
import { rankHybridResults, selectDiverseResults } from "@/lib/rag-retrieval";
import {
  appendRagFilterClauses,
  parseRagQueryFilters,
  type RagQueryFilters,
} from "@/lib/rag-filters";
import crypto from "node:crypto";

type RetrievalRow = {
  id: number;
  user_id: number;
  document_key: string;
  document_kind: string;
  source_date: string | null;
  source_entity_id: string;
  chunk_index: number;
  chunk_text: string;
  metadata: Record<string, unknown>;
  distance: number;
  keyword_rank?: number;
};

export async function POST(request: Request) {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const settings = await getUserSettings(currentUser.id);

  let payload: { query?: string; k?: number; mode?: string; kThought?: number; kSummary?: number } & RagQueryFilters;

  try {
    payload = await request.json() as typeof payload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const isLiveSuggestion = payload.mode === "live_suggestion";
  const defaultK = isLiveSuggestion ? settings.live_context_k : settings.rag_default_k;
  const query = (payload.query ?? "").toString().trim();
  const kValue = payload.k ?? defaultK;
  if (!Number.isInteger(kValue) || kValue < 1 || kValue > 50) {
    return NextResponse.json({ error: "k must be an integer between 1 and 50." }, { status: 400 });
  }
  const k = kValue;

  if (!query) return NextResponse.json({ error: "Query is required." }, { status: 400 });

  try {
    const filters = parseRagQueryFilters(payload, settings.rag_enabled_kinds);
    if (filters.error) {
      return NextResponse.json({ error: filters.error }, { status: 400 });
    }
    const explicitFilters = filters.value!;
    const intent = extractRagQueryIntent(query);
    const queryFilters: RagQueryFilters = {
      ...explicitFilters,
      ...Object.fromEntries(
        Object.entries(intent.filters).filter(([field]) => explicitFilters[field as keyof RagQueryFilters] === undefined),
      ),
    };
    let qEmb: number[] = [];

    // Allow a synthetic deterministic embedding for local testing by setting
    // the request header `x-use-synthetic-embedding: 1`.
    const useSynthetic = request.headers.get("x-use-synthetic-embedding") === "1";

    if (useSynthetic) {
      const hash = crypto.createHash("sha256").update(intent.rewrittenQuery).digest();
      qEmb = Array.from({ length: 1536 }, (_, i) => hash[i % hash.length] / 255);
    } else {
      qEmb = (await embedTexts([intent.rewrittenQuery], "RETRIEVAL_QUERY"))[0] ?? [];
    }

    const embStr = `[${qEmb.join(",")}]`;

    console.log(
      `[RAG Retrieval] Mode: "${payload.mode ?? "search"}" | Query: "${query.slice(0, 60)}..." | Embedding length: ${qEmb.length}`,
    );

    const kThoughtValue = payload.kThought ?? (isLiveSuggestion ? settings.live_context_k + 2 : settings.rag_k_thought);
    const kSummaryValue = payload.kSummary ?? (isLiveSuggestion ? settings.live_context_k + 2 : settings.rag_k_summary);
    if (!Number.isInteger(kThoughtValue) || kThoughtValue < 1 || kThoughtValue > 50 ||
        !Number.isInteger(kSummaryValue) || kSummaryValue < 1 || kSummaryValue > 50) {
      return NextResponse.json({ error: "kThought and kSummary must be integers between 1 and 50." }, { status: 400 });
    }
    const kThought = kThoughtValue;
    const kSummary = kSummaryValue;
    const candidateK = Math.min(50, Math.max(k, kThought, kSummary) * 3);

    let merged: RetrievalRow[] = [];

    try {
      // Chunks of pending/failed documents may still hold text from before an edit.
      const thoughtClauses = [
        "e.user_id = $2",
        "d.ingestion_status = 'indexed'",
        "d.document_kind <> 'conversation_summary'",
      ];
      const thoughtValues: unknown[] = [embStr, currentUser.id];
      appendRagFilterClauses(thoughtClauses, thoughtValues, queryFilters, "d");
      const summaryClauses = [
        "e.user_id = $2",
        "d.ingestion_status = 'indexed'",
        "d.document_kind = 'conversation_summary'",
      ];
      const summaryValues: unknown[] = [embStr, currentUser.id];
      appendRagFilterClauses(summaryClauses, summaryValues, queryFilters, "d");

      const [thoughtRes, summaryRes] = await Promise.all([
        pool.query<RetrievalRow>(
          `
            SELECT e.id, e.user_id, e.document_key, d.document_kind, d.source_date,
                   e.source_entity_id, e.chunk_index, e.chunk_text, e.metadata,
                   e.embedding <=> $1::vector AS distance
            FROM embeddings e
            JOIN rag_documents d
              ON e.document_key = d.document_key
             AND e.user_id = d.user_id
            WHERE ${thoughtClauses.join(" AND ")}
            ORDER BY distance ASC
            LIMIT ${Math.max(kThought, candidateK)}
          `,
          thoughtValues,
        ),
        pool.query<RetrievalRow>(
          `
            SELECT e.id, e.user_id, e.document_key, d.document_kind, d.source_date,
                   e.source_entity_id, e.chunk_index, e.chunk_text, e.metadata,
                   e.embedding <=> $1::vector AS distance
            FROM embeddings e
            JOIN rag_documents d
              ON e.document_key = d.document_key
             AND e.user_id = d.user_id
            WHERE ${summaryClauses.join(" AND ")}
            ORDER BY distance ASC
            LIMIT ${Math.max(kSummary, candidateK)}
          `,
          summaryValues,
        ),
      ]);

      merged = [...thoughtRes.rows, ...summaryRes.rows].sort(
        (a, b) => Number(a.distance) - Number(b.distance),
      );

      const keywordClauses = ["d.user_id = $1", "d.document_kind = ANY($2::text[])"];
      const keywordValues: unknown[] = [currentUser.id, queryFilters.kinds];
      appendRagFilterClauses(keywordClauses, keywordValues, queryFilters, "d");
      const queryPlaceholder = keywordValues.length + 1;
      keywordClauses.push(
        `to_tsvector('simple', coalesce(d.title, '') || ' ' || coalesce(d.content, '')) @@ plainto_tsquery('simple', $${queryPlaceholder})`,
      );
      keywordValues.push(intent.rewrittenQuery);
      const keywordRes = await pool.query<RetrievalRow>(
        `
          SELECT 0 AS id, d.user_id, d.document_key, d.document_kind, d.source_date,
                 d.source_entity_id, 0 AS chunk_index, d.content AS chunk_text, d.metadata,
                 1 AS distance,
                 ts_rank(
                   to_tsvector('simple', coalesce(d.title, '') || ' ' || coalesce(d.content, '')),
                   plainto_tsquery('simple', $${queryPlaceholder})
                 ) AS keyword_rank
          FROM rag_documents d
          WHERE ${keywordClauses.join(" AND ")}
          ORDER BY keyword_rank DESC
          LIMIT ${candidateK}
        `,
        keywordValues,
      );
      const seen = new Set(merged.map((row) => `${row.document_key}:${row.chunk_index}`));
      merged.push(...keywordRes.rows.filter((row) => !seen.has(`${row.document_key}:${row.chunk_index}`)));
      merged = rankHybridResults(merged);
    } catch (err) {
      console.warn("[RAG Retrieval] Vector search query failed, using text fallback:", err);
    }

    // Fallback: If no vector results were found, search rag_documents directly using ILIKE
    if (merged.length === 0) {
      const searchPattern = `%${intent.rewrittenQuery.replace(/[%_]/g, "\\$&")}%`;
      const fallbackClauses = [
        "d.user_id = $1",
        "(d.title ILIKE $2 OR d.content ILIKE $2)",
      ];
      const fallbackValues: unknown[] = [currentUser.id, searchPattern];
      appendRagFilterClauses(fallbackClauses, fallbackValues, queryFilters, "d");
      const fallbackRes = await pool.query<RetrievalRow>(
        `
          SELECT id, user_id, document_key, document_kind, source_date, source_entity_id,
                 0 AS chunk_index, content AS chunk_text, metadata, 0 AS distance
          FROM rag_documents d
          WHERE ${fallbackClauses.join(" AND ")}
          ORDER BY d.source_updated_at DESC
          LIMIT ${candidateK}
        `,
        fallbackValues,
      );
      merged = fallbackRes.rows;
    }

    // Temporal date-range augmentation: if the query mentions "today", "this week", etc.,
    // fetch matching rag_documents by source_date and merge them ahead of vector results.
    const temporalRange = intent.temporalRange;

    if (temporalRange) {
      console.log(
        `[RAG Retrieval] Temporal range detected: "${temporalRange.label}" → ${temporalRange.startDate} to ${temporalRange.endDate}`,
      );

      const temporalClauses = [
        "d.user_id = $1",
        "d.source_date >= $2::date",
        "d.source_date <= $3::date",
      ];
      const temporalValues: unknown[] = [
        currentUser.id,
        temporalRange.startDate,
        temporalRange.endDate,
      ];
      appendRagFilterClauses(temporalClauses, temporalValues, queryFilters, "d");
      const temporalRes = await pool.query<RetrievalRow>(
        `
          SELECT id, user_id, document_key, document_kind, source_date, source_entity_id,
                 0 AS chunk_index, content AS chunk_text, metadata, 0 AS distance
          FROM rag_documents d
          WHERE ${temporalClauses.join(" AND ")}
          ORDER BY d.source_date DESC, d.source_updated_at DESC
          LIMIT ${candidateK}
        `,
        temporalValues,
      );

      // Merge temporal results ahead of vector results, de-duplicating by document_key
      const existingKeys = new Set(temporalRes.rows.map((row) => row.document_key));
      const vectorOnly = merged.filter((row) => !existingKeys.has(row.document_key));
      merged = rankHybridResults([...temporalRes.rows, ...vectorOnly]);
    }

    // Slice to top k results
    const results = selectDiverseResults(merged, k);

    console.log(`[RAG Retrieval] Returned ${results.length} rows.`);

    return NextResponse.json({ results });
  } catch (error) {
    console.error("Retrieval failed", error);
    return NextResponse.json({ error: "Retrieval failed." }, { status: 500 });
  }
}
