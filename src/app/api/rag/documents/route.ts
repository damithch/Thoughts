import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import {
  getRagDocumentsByUser,
  RagSyncInProgressError,
  syncRagDocumentsForUser,
  type RagDocumentKind,
} from "@/lib/db";

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
    const forceReEmbed = searchParams.get("force") === "1";

    const result = await syncRagDocumentsForUser(currentUser.id, { forceReEmbed });
    const response = {
      synced: true,
      count: result.count,
      embedded: result.embedded,
      skipped: result.skipped,
      failed_documents: result.failedDocuments,
      forced: forceReEmbed,
      document_kinds: result.documentKinds,
      processed_documents: result.processedDocuments,
      ingested_chunks: result.ingestedChunks,
    };

    if (result.failedDocuments.length > 0) {
      return NextResponse.json(
        {
          ...response,
          error: "RAG sync completed with indexing failures.",
        },
        { status: 502 },
      );
    }

    return NextResponse.json(response);
  } catch (error) {
    if (error instanceof RagSyncInProgressError) {
      return NextResponse.json(
        { error: "A RAG sync is already in progress. Please try again shortly." },
        { status: 409 },
      );
    }

    console.error("Failed to sync RAG documents.", error);

    return NextResponse.json(
      { error: "Unable to sync RAG documents right now." },
      { status: 500 },
    );
  }
}
