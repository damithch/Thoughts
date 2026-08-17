import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { pool } from "@/lib/db/client";
import { getUserSettings } from "@/lib/db/settings";
import { embedTexts } from "@/lib/gemini";
import { resolveTemporalRange } from "@/lib/temporal";
import crypto from "node:crypto";

type RetrievalRow = {
  id: number;
  user_id: number;
  document_key: string;
  source_entity_id: string;
  chunk_index: number;
  chunk_text: string;
  metadata: Record<string, unknown>;
  distance: number;
};

export async function POST(request: Request) {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const settings = await getUserSettings(currentUser.id);

  let payload: { query?: string; k?: number; mode?: string; kThought?: number; kSummary?: number };

  try {
    payload = await request.json() as typeof payload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const isLiveSuggestion = payload.mode === "live_suggestion";
  const defaultK = isLiveSuggestion ? settings.live_context_k : settings.rag_default_k;
  const query = (payload.query ?? "").toString().trim();
  const k = Math.max(1, Math.min(Number(payload.k ?? defaultK), 50));

  if (!query) return NextResponse.json({ error: "Query is required." }, { status: 400 });

  try {
    let qEmb: number[] = [];

    // Allow a synthetic deterministic embedding for local testing by setting
    // the request header `x-use-synthetic-embedding: 1`.
    const useSynthetic = request.headers.get("x-use-synthetic-embedding") === "1";

    if (useSynthetic) {
      const hash = crypto.createHash("sha256").update(query).digest();
      qEmb = Array.from({ length: 1536 }, (_, i) => hash[i % hash.length] / 255);
    } else {
      qEmb = (await embedTexts([query]))[0] ?? [];
    }

    const embStr = `[${qEmb.join(",")}]`;

    console.log(
      `[RAG Retrieval] Mode: "${payload.mode ?? "search"}" | Query: "${query.slice(0, 60)}..." | Embedding length: ${qEmb.length}`,
    );

    const kThought = Math.max(1, Math.min(Number(payload.kThought ?? (isLiveSuggestion ? settings.live_context_k + 2 : settings.rag_k_thought)), 50));
    const kSummary = Math.max(1, Math.min(Number(payload.kSummary ?? (isLiveSuggestion ? settings.live_context_k + 2 : settings.rag_k_summary)), 50));

    let merged: RetrievalRow[] = [];

    try {
      // Parallel retrieval for thoughts/general docs and conversation_summary logs via vector
      const [thoughtRes, summaryRes] = await Promise.all([
        pool.query<RetrievalRow>(
          `
            SELECT e.id, e.user_id, e.document_key, e.source_entity_id, e.chunk_index, e.chunk_text, e.metadata,
                   e.embedding <-> $1::vector AS distance
            FROM embeddings e
            JOIN rag_documents d ON e.document_key = d.document_key
            WHERE e.user_id = $2 AND d.document_kind <> 'conversation_summary'
            ORDER BY distance ASC
            LIMIT $3
          `,
          [embStr, currentUser.id, kThought],
        ),
        pool.query<RetrievalRow>(
          `
            SELECT e.id, e.user_id, e.document_key, e.source_entity_id, e.chunk_index, e.chunk_text, e.metadata,
                   e.embedding <-> $1::vector AS distance
            FROM embeddings e
            JOIN rag_documents d ON e.document_key = d.document_key
            WHERE e.user_id = $2 AND d.document_kind = 'conversation_summary'
            ORDER BY distance ASC
            LIMIT $3
          `,
          [embStr, currentUser.id, kSummary],
        ),
      ]);

      merged = [...thoughtRes.rows, ...summaryRes.rows].sort(
        (a, b) => Number(a.distance) - Number(b.distance),
      );
    } catch (err) {
      console.warn("[RAG Retrieval] Vector search query failed, using text fallback:", err);
    }

    // Fallback: If no vector results were found, search rag_documents directly using ILIKE
    if (merged.length === 0) {
      const searchPattern = `%${query.replace(/[%_]/g, "\\$&")}%`;
      const fallbackRes = await pool.query<RetrievalRow>(
        `
          SELECT id, user_id, document_key, source_entity_id, 0 AS chunk_index, content AS chunk_text, metadata, 0 AS distance
          FROM rag_documents
          WHERE user_id = $1
            AND (title ILIKE $2 OR content ILIKE $2)
          ORDER BY source_updated_at DESC
          LIMIT $3
        `,
        [currentUser.id, searchPattern, k],
      );
      merged = fallbackRes.rows;
    }

    // Temporal date-range augmentation: if the query mentions "today", "this week", etc.,
    // fetch matching rag_documents by source_date and merge them ahead of vector results.
    const temporalRange = resolveTemporalRange(query);

    if (temporalRange) {
      console.log(
        `[RAG Retrieval] Temporal range detected: "${temporalRange.label}" → ${temporalRange.startDate} to ${temporalRange.endDate}`,
      );

      const temporalRes = await pool.query<RetrievalRow>(
        `
          SELECT id, user_id, document_key, source_entity_id, 0 AS chunk_index, content AS chunk_text, metadata, 0 AS distance
          FROM rag_documents
          WHERE user_id = $1
            AND source_date >= $2::date
            AND source_date <= $3::date
          ORDER BY source_date DESC, source_updated_at DESC
          LIMIT $4
        `,
        [currentUser.id, temporalRange.startDate, temporalRange.endDate, k],
      );

      // Merge temporal results ahead of vector results, de-duplicating by document_key
      const existingKeys = new Set(temporalRes.rows.map((row) => row.document_key));
      const vectorOnly = merged.filter((row) => !existingKeys.has(row.document_key));
      merged = [...temporalRes.rows, ...vectorOnly];
    }

    // Slice to top k results
    const results = merged.slice(0, k);

    console.log(`[RAG Retrieval] Returned ${results.length} rows.`);

    return NextResponse.json({ results });
  } catch (error) {
    console.error("Retrieval failed", error);
    return NextResponse.json({ error: "Retrieval failed." }, { status: 500 });
  }
}
