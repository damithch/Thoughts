import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { RagSyncInProgressError, syncRagDocumentsForUser } from "@/lib/db";

const MAX_RETRY_DOCUMENTS = 10;

export async function POST() {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await syncRagDocumentsForUser(currentUser.id, {
      retryFailedOnly: true,
      maxDocuments: MAX_RETRY_DOCUMENTS,
    });
    const response = {
      retried: true,
      limit: MAX_RETRY_DOCUMENTS,
      ...result,
    };

    return NextResponse.json(
      result.failedDocuments.length > 0
        ? { ...response, error: "Some RAG documents still failed." }
        : response,
      { status: result.failedDocuments.length > 0 ? 502 : 200 },
    );
  } catch (error) {
    if (error instanceof RagSyncInProgressError) {
      return NextResponse.json(
        { error: "A RAG sync is already in progress. Please try again shortly." },
        { status: 409 },
      );
    }
    console.error("Failed to retry RAG documents.", error);
    return NextResponse.json(
      { error: "Unable to retry RAG documents right now." },
      { status: 500 },
    );
  }
}
