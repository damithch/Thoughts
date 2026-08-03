import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { pool } from "@/lib/db/client";
import { embedTexts } from "@/lib/gemini";
import crypto from "node:crypto";

export async function POST(request: Request) {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: { query?: string; k?: number };

  try {
    payload = (await request.json()) as any;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const query = (payload.query ?? "").toString().trim();
  const k = Math.max(1, Math.min(Number(payload.k ?? 6), 50));

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

    const embStr = `[${qEmb.join(",")} ]`;

    console.log(`[RAG Retrieval] Query: "${query}" | Embedding length: ${qEmb.length} | First 5 values:`, qEmb.slice(0, 5));

    const kThought = Math.max(1, Math.min(Number((payload as any).kThought ?? 10), 50));
    const kSummary = Math.max(1, Math.min(Number((payload as any).kSummary ?? 10), 50));

    let merged: any[] = [];

    try {
      // Parallel retrieval for thoughts/general docs and conversation_summary logs via vector
      const [thoughtRes, summaryRes] = await Promise.all([
        pool.query(
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
        pool.query(
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
        (a: any, b: any) => Number(a.distance) - Number(b.distance),
      );
    } catch (err) {
      console.warn("[RAG Retrieval] Vector search query failed, using text fallback:", err);
    }

    // Fallback: If no vector results were found, search rag_documents directly using ILIKE
    if (merged.length === 0) {
      const searchPattern = `%${query.replace(/[%_]/g, "\\$&")}%`;
      const fallbackRes = await pool.query(
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

    console.log(`[RAG Retrieval] Returned ${merged.length} rows.`);

    return NextResponse.json({ results: merged });
  } catch (error) {
    console.error("Retrieval failed", error);
    return NextResponse.json({ error: "Retrieval failed." }, { status: 500 });
  }
}
