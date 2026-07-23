import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import {
  getRagDocumentsByUser,
  syncRagDocumentsForUser,
  type RagDocumentKind,
} from "@/lib/db";
import { ingestMaterializedDocument } from "@/lib/gemini";

const ALLOWED_KINDS = new Set<RagDocumentKind>([
  "thought",
  "book_idea",
  "conversation_summary",
  "ba_entry",
  "day_note",
  "daily_rollup",
]);

function parseKind(value: string | null) {
  if (!value) {
    return null;
  }

  return ALLOWED_KINDS.has(value as RagDocumentKind)
    ? (value as RagDocumentKind)
    : null;
}

function parseLimit(value: string | null) {
  if (!value) {
    return 50;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

export async function GET(request: Request) {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const kindParam = searchParams.get("kind");
  const dateParam = searchParams.get("date");
  const limitParam = searchParams.get("limit");
  const kind = parseKind(kindParam);
  const limit = parseLimit(limitParam);

  if (kindParam && !kind) {
    return NextResponse.json({ error: "Invalid kind." }, { status: 400 });
  }

  if (dateParam && !/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
    return NextResponse.json({ error: "Invalid date." }, { status: 400 });
  }

  if (limit === null) {
    return NextResponse.json({ error: "Invalid limit." }, { status: 400 });
  }

  try {
    const documents = await getRagDocumentsByUser(currentUser.id, {
      kind,
      date: dateParam,
      limit,
    });

    return NextResponse.json({
      count: documents.length,
      documents,
    });
  } catch (error) {
    console.error("Failed to load RAG documents.", error);

    return NextResponse.json(
      { error: "Unable to load RAG documents right now." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const limitParam = searchParams.get("limit");
    const limit = parseLimit(limitParam);

    const result = await syncRagDocumentsForUser(currentUser.id);

    // After syncing rag_documents, ingest each materialized document into the
    // embeddings table so retrieval/generation endpoints can work end-to-end.
    try {
      // If the client supplied a `limit` query param, validate it. When
      // omitted, use the full materialized count so we process all documents.
      if (limitParam && limit === null) {
        return NextResponse.json({ error: "Invalid limit." }, { status: 400 });
      }

      const docsLimit: number | undefined = limitParam ? (limit as number) : result.count;
      const docs = await getRagDocumentsByUser(currentUser.id, { limit: docsLimit });

      let ingestedChunks = 0;

      for (const doc of docs) {
        try {
          const c = await ingestMaterializedDocument(
            currentUser.id,
            doc.document_key,
            String(doc.source_entity_id),
            doc.content,
            doc.metadata ?? {},
          );

          ingestedChunks += c;
        } catch (e) {
          console.error("Failed to ingest document:", doc.document_key, e);
        }
      }

      return NextResponse.json({
        synced: true,
        count: result.count,
        document_kinds: result.documentKinds,
        processed_documents: docs.length,
        ingested_chunks: ingestedChunks,
      });
    } catch (e) {
      console.error("Failed to ingest materialized documents", e);

      return NextResponse.json({
        synced: true,
        count: result.count,
        document_kinds: result.documentKinds,
        processed_documents: 0,
        ingested_chunks: 0,
      });
    }
  } catch (error) {
    console.error("Failed to sync RAG documents.", error);

    return NextResponse.json(
      { error: "Unable to sync RAG documents right now." },
      { status: 500 },
    );
  }
}
