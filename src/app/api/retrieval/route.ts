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

    const { rows } = await pool.query(
      `
        SELECT id, user_id, document_key, source_entity_id, chunk_index, chunk_text, metadata,
               embedding <-> $1::vector AS distance
        FROM embeddings
        WHERE user_id = $2
        ORDER BY embedding <-> $1::vector
        LIMIT $3
      `,
      [embStr, currentUser.id, k],
    );

    return NextResponse.json({ results: rows });
  } catch (error) {
    console.error("Retrieval failed", error);
    return NextResponse.json({ error: "Retrieval failed." }, { status: 500 });
  }
}
