import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { pool } from "@/lib/db/client";
import { getUserSettings } from "@/lib/db/settings";
import { embedTexts, generateFromPrompt } from "@/lib/gemini";
import { resolveTemporalRange } from "@/lib/temporal";
import crypto from "node:crypto";

type RetrievalRow = {
  document_key: string;
  source_entity_id: string;
  chunk_index: number;
  chunk_text: string;
  metadata: Record<string, unknown>;
  distance: number;
};

export async function POST(request: Request) {
  const currentUser = await getCurrentUser();

  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const settings = await getUserSettings(currentUser.id);

  let payload: { question?: string; k?: number; kThought?: number; kSummary?: number };

  try {
    payload = await request.json() as typeof payload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const question = (payload.question ?? "").toString().trim();
  const k = Math.max(1, Math.min(Number(payload.k ?? settings.rag_default_k), 50));

  if (!question) return NextResponse.json({ error: "Question is required." }, { status: 400 });

  try {
    let qEmb: number[] = [];
    const useSynthetic = request.headers.get("x-use-synthetic-embedding") === "1";

    if (useSynthetic) {
      const hash = crypto.createHash("sha256").update(question).digest();
      qEmb = Array.from({ length: 1536 }, (_, i) => hash[i % hash.length] / 255);
    } else {
      qEmb = (await embedTexts([question]))[0] ?? [];
    }

    const embStr = `[${qEmb.join(",")}]`;

    const kThought = Math.max(1, Math.min(Number(payload.kThought ?? settings.rag_k_thought), 50));
    const kSummary = Math.max(1, Math.min(Number(payload.kSummary ?? settings.rag_k_summary), 50));

    let rows: RetrievalRow[] = [];

    try {
      // Parallel retrieval for thoughts/general docs and conversation_summary logs via vector
      const [thoughtRes, summaryRes] = await Promise.all([
        pool.query<RetrievalRow>(
          `
            SELECT e.document_key, e.source_entity_id, e.chunk_index, e.chunk_text, e.metadata,
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
            SELECT e.document_key, e.source_entity_id, e.chunk_index, e.chunk_text, e.metadata,
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

      rows = [...thoughtRes.rows, ...summaryRes.rows].sort(
        (a, b) => Number(a.distance) - Number(b.distance),
      );
    } catch (err) {
      console.warn("[RAG Generate] Vector search query failed, using text fallback:", err);
    }

    // Fallback: If vector search yields zero results, search rag_documents directly
    if (rows.length === 0) {
      const searchPattern = `%${question.replace(/[%_]/g, "\\$&")}%`;
      const fallbackRes = await pool.query<RetrievalRow>(
        `
          SELECT document_key, source_entity_id, 0 AS chunk_index, content AS chunk_text, metadata, 0 AS distance
          FROM rag_documents
          WHERE user_id = $1
            AND (title ILIKE $2 OR content ILIKE $2)
          ORDER BY source_updated_at DESC
          LIMIT $3
        `,
        [currentUser.id, searchPattern, k],
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

      const temporalRes = await pool.query<RetrievalRow>(
        `
          SELECT document_key, source_entity_id, 0 AS chunk_index, content AS chunk_text, metadata, 0 AS distance
          FROM rag_documents
          WHERE user_id = $1
            AND source_date >= $2::date
            AND source_date <= $3::date
          ORDER BY source_date DESC, source_updated_at DESC
          LIMIT $4
        `,
        [currentUser.id, temporalRange.startDate, temporalRange.endDate, k],
      );

      const existingKeys = new Set(temporalRes.rows.map((row) => row.document_key));
      const vectorOnly = rows.filter((row) => !existingKeys.has(row.document_key));
      rows = [...temporalRes.rows, ...vectorOnly];
    }

    // Build prompt parts: instruction + each retrieved chunk as its own part + question
    const temporalContext = temporalRange
      ? `\n\nThe user is asking about the period from ${temporalRange.startDate} to ${temporalRange.endDate} (${temporalRange.label}). Prioritise information from this date range in your answer.`
      : "";

    const baseInstruction = `You are a helpful assistant with access to the user's private journal excerpts. Rely strictly on the information provided in the excerpts to give a direct, clear, and comprehensive answer to the user's question. If the information is not present in the excerpts, respond with "I don't know".${temporalContext}`;
    const instruction = settings.rag_custom_prompt
      ? `${baseInstruction}\n\nAdditional instructions from user: ${settings.rag_custom_prompt}`
      : baseInstruction;

    const chunkParts = rows.map((r, i) => {
      return `[Excerpt #${i + 1}] (Document: ${r.document_key})\n${r.chunk_text}`;
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

    const answer = await generateFromPrompt(parts, 2048, 0.0, settings.llm_model);

    return NextResponse.json({ answer, provenance: rows });
  } catch (error) {
    console.error("RAG generate failed", error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: "RAG generation failed.", details: message }, { status: 500 });
  }
}
