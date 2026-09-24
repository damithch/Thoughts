import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { pool } from "@/lib/db/client";
import { getUserSettings } from "@/lib/db/settings";
import { embedTexts, generateWithFallback, GeminiApiError } from "@/lib/gemini";
import { resolveTemporalRange } from "@/lib/temporal";
import { rankHybridResults, selectDiverseResults } from "@/lib/rag-retrieval";
import {
  appendRagFilterClauses,
  parseRagQueryFilters,
  type RagQueryFilters,
} from "@/lib/rag-filters";
import crypto from "node:crypto";

type RetrievalRow = {
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

  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const settings = await getUserSettings(currentUser.id);

  let payload: { question?: string; k?: number; kThought?: number; kSummary?: number } & RagQueryFilters;

  try {
    payload = await request.json() as typeof payload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const question = (payload.question ?? "").toString().trim();
  const kValue = payload.k ?? settings.rag_default_k;
  if (!Number.isInteger(kValue) || kValue < 1 || kValue > 50) {
    return NextResponse.json({ error: "k must be an integer between 1 and 50." }, { status: 400 });
  }
  const k = kValue;

  if (!question) return NextResponse.json({ error: "Question is required." }, { status: 400 });

  try {
    const filters = parseRagQueryFilters(payload, settings.rag_enabled_kinds);
    if (filters.error) {
      return NextResponse.json({ error: filters.error }, { status: 400 });
    }
    const queryFilters = filters.value!;
    let qEmb: number[] = [];
    const useSynthetic = request.headers.get("x-use-synthetic-embedding") === "1";

    if (useSynthetic) {
      const hash = crypto.createHash("sha256").update(question).digest();
      qEmb = Array.from({ length: 1536 }, (_, i) => hash[i % hash.length] / 255);
    } else {
      qEmb = (await embedTexts([question]))[0] ?? [];
    }

    const embStr = `[${qEmb.join(",")}]`;

    const kThoughtValue = payload.kThought ?? settings.rag_k_thought;
    const kSummaryValue = payload.kSummary ?? settings.rag_k_summary;
    if (!Number.isInteger(kThoughtValue) || kThoughtValue < 1 || kThoughtValue > 50 ||
        !Number.isInteger(kSummaryValue) || kSummaryValue < 1 || kSummaryValue > 50) {
      return NextResponse.json({ error: "kThought and kSummary must be integers between 1 and 50." }, { status: 400 });
    }
    const kThought = kThoughtValue;
    const kSummary = kSummaryValue;
    const candidateK = Math.min(50, Math.max(k, kThought, kSummary) * 3);

    let rows: RetrievalRow[] = [];

    try {
      // Parallel retrieval for thoughts/general docs and conversation_summary logs via vector
      const thoughtClauses = [
        "e.user_id = $2",
        "d.document_kind <> 'conversation_summary'",
      ];
      const thoughtValues: unknown[] = [embStr, currentUser.id];
      appendRagFilterClauses(thoughtClauses, thoughtValues, queryFilters, "d");
      const summaryClauses = [
        "e.user_id = $2",
        "d.document_kind = 'conversation_summary'",
      ];
      const summaryValues: unknown[] = [embStr, currentUser.id];
      appendRagFilterClauses(summaryClauses, summaryValues, queryFilters, "d");

      const [thoughtRes, summaryRes] = await Promise.all([
        pool.query<RetrievalRow>(
          `
            SELECT e.document_key, d.document_kind, d.source_date, e.source_entity_id,
                   e.chunk_index, e.chunk_text, e.metadata,
                   e.embedding <-> $1::vector AS distance
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
            SELECT e.document_key, d.document_kind, d.source_date, e.source_entity_id,
                   e.chunk_index, e.chunk_text, e.metadata,
                   e.embedding <-> $1::vector AS distance
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

      rows = [...thoughtRes.rows, ...summaryRes.rows]
        .sort((a, b) => Number(a.distance) - Number(b.distance))
        ;

      const keywordClauses = ["d.user_id = $1", "d.document_kind = ANY($2::text[])"];
      const keywordValues: unknown[] = [currentUser.id, queryFilters.kinds];
      appendRagFilterClauses(keywordClauses, keywordValues, queryFilters, "d");
      const queryPlaceholder = keywordValues.length + 1;
      keywordClauses.push(
        `to_tsvector('simple', coalesce(d.title, '') || ' ' || coalesce(d.content, '')) @@ plainto_tsquery('simple', $${queryPlaceholder})`,
      );
      keywordValues.push(question);
      const keywordRes = await pool.query<RetrievalRow>(
        `
          SELECT d.document_key, d.document_kind, d.source_date, d.source_entity_id,
                 0 AS chunk_index, d.content AS chunk_text, d.metadata,
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
      const seen = new Set(rows.map((row) => `${row.document_key}:${row.chunk_index}`));
      rows.push(...keywordRes.rows.filter((row) => !seen.has(`${row.document_key}:${row.chunk_index}`)));
      rows = rankHybridResults(rows).slice(0, candidateK);
    } catch (err) {
      console.warn("[RAG Generate] Vector search query failed, using text fallback:", err);
    }

    // Fallback: If vector search yields zero results, search rag_documents directly
    if (rows.length === 0) {
      const searchPattern = `%${question.replace(/[%_]/g, "\\$&")}%`;
      const fallbackClauses = [
        "d.user_id = $1",
        "(d.title ILIKE $2 OR d.content ILIKE $2)",
      ];
      const fallbackValues: unknown[] = [currentUser.id, searchPattern];
      appendRagFilterClauses(fallbackClauses, fallbackValues, queryFilters, "d");
      const fallbackRes = await pool.query<RetrievalRow>(
        `
          SELECT document_key, document_kind, source_date, source_entity_id,
                 0 AS chunk_index, content AS chunk_text, metadata, 0 AS distance
          FROM rag_documents d
          WHERE ${fallbackClauses.join(" AND ")}
          ORDER BY d.source_updated_at DESC
          LIMIT ${candidateK}
        `,
        fallbackValues,
      );
      rows = fallbackRes.rows;
    }

    // Temporal date-range augmentation: merge date-filtered documents when the
    // query contains expressions like "today", "this week", "last month", etc.
    const temporalRange = resolveTemporalRange(question);

    if (temporalRange) {
      console.log(
        `[RAG Generate] Temporal range detected: "${temporalRange.label}" → ${temporalRange.startDate} to ${temporalRange.endDate}`,
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
          SELECT document_key, document_kind, source_date, source_entity_id,
                 0 AS chunk_index, content AS chunk_text, metadata, 0 AS distance
          FROM rag_documents d
          WHERE ${temporalClauses.join(" AND ")}
          ORDER BY d.source_date DESC, d.source_updated_at DESC
          LIMIT ${candidateK}
        `,
        temporalValues,
      );

      const existingKeys = new Set(temporalRes.rows.map((row) => row.document_key));
      const vectorOnly = rows.filter((row) => !existingKeys.has(row.document_key));
      rows = rankHybridResults([...temporalRes.rows, ...vectorOnly]);
    }

    rows = selectDiverseResults(rows, k);

    // Build prompt parts: instruction + each retrieved chunk as its own part + question
    const temporalContext = temporalRange
      ? `\n\nThe user is asking about the period from ${temporalRange.startDate} to ${temporalRange.endDate} (${temporalRange.label}). Prioritise information from this date range in your answer.`
      : "";

    const baseInstruction = `You are a helpful assistant with access to the user's private journal excerpts. Rely strictly on the information provided in the excerpts to give a direct, clear, and comprehensive answer to the user's question. If the information is not present in the excerpts, respond with "I don't know". Cite supporting excerpts inline using their exact labels, such as [Excerpt 1]. Do not invent citations or cite an excerpt that does not support the claim.${temporalContext}`;
    const instruction = settings.rag_custom_prompt
      ? `${baseInstruction}\n\nAdditional instructions from user: ${settings.rag_custom_prompt}`
      : baseInstruction;

    const chunkParts = rows.map((r, i) => {
      const date = r.source_date ? `, Date: ${r.source_date}` : "";
      return `[Excerpt ${i + 1}] (Document: ${r.document_key}, Kind: ${r.document_kind}${date})\n${r.chunk_text}`;
    });

    const questionPart = `USER QUESTION:\n${question}\n\nANSWER:`;

    const parts = [instruction, ...chunkParts, questionPart];

    // If synthetic testing mode is enabled, avoid calling Gemini to generate
    // an answer. Instead return a simple summary composed from the retrieved
    // excerpts so local testing doesn't require LLM calls.
    if (useSynthetic) {
      if (!rows || rows.length === 0) {
        return NextResponse.json({ answer: "I don't know.", provenance: rows });
      }

      const excerpts = rows.map((r, i) => `(${i + 1}) ${(r.chunk_text || "").slice(0, 200).replace(/\n+/g, " ")}...`);
      const answer = `Found ${rows.length} relevant excerpts. First excerpts: ${excerpts.slice(0, 3).join(" | ")}`;

      return NextResponse.json({ answer, provenance: rows });
    }

    const { text: answer, modelUsed } = await generateWithFallback(parts, 2048, 0.0, settings.llm_model);
    console.log(`[RAG Generate] Answered using model: ${modelUsed}`);

    return NextResponse.json({ answer, provenance: rows });
  } catch (error) {
    console.error("RAG generate failed", error);

    if (error instanceof GeminiApiError) {
      const statusMap: Record<string, number> = {
        rate_limit: 429,
        token_exceeded: 400,
        auth_error: 401,
        overloaded: 503,
        api_error: error.statusCode === 504 ? 504 : 502,
      };
      return NextResponse.json(
        { error: error.message, errorType: error.errorType, details: error.message },
        { status: statusMap[error.errorType] ?? 502 },
      );
    }

    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: "RAG generation failed.", details: message }, { status: 500 });
  }
}
