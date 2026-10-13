import { revalidatePath } from "next/cache";

import { createBook, createBookIdea, getBookIdeasByUser, getBooksByUser } from "@/lib/db";
import type { BookSourceType } from "@/lib/db";
import { apiError, IDEA_STATUSES, readJsonObject, readString, withMobileUser } from "@/lib/mobile-api";

export const dynamic = "force-dynamic";

const SOURCE_TYPES: BookSourceType[] = ["book", "article", "podcast", "principle"];

async function library(userId: number) {
  const [sources, ideas] = await Promise.all([getBooksByUser(userId), getBookIdeasByUser(userId)]);

  return { sources, ideas };
}

// GET /api/v1/insights -> { sources, ideas }
export const GET = withMobileUser(async (_request, user) => {
  return Response.json(await library(user.id));
});

// POST /api/v1/insights
//   { kind: "source", title, author?, sourceType }        adds a book/article/podcast/principle
//   { kind: "idea", sourceId, ideaText, status? }          adds an idea to one of your sources
// -> 201 { sources, ideas }
export const POST = withMobileUser(async (request, user) => {
  const body = await readJsonObject(request);

  if (body?.kind === "source") {
    const title = readString(body.title, 300);
    const sourceType = SOURCE_TYPES.find((type) => type === body.sourceType);

    if (!title || !sourceType) {
      return apiError("A source needs a title and a type (book, article, podcast or principle).", 400);
    }

    await createBook({ title, author: readString(body.author, 200), sourceType, userId: user.id });
  } else if (body?.kind === "idea") {
    const sourceId = typeof body.sourceId === "number" && Number.isInteger(body.sourceId) ? body.sourceId : 0;
    const ideaText = readString(body.ideaText, 2000);
    const status = IDEA_STATUSES.find((value) => value === (body.status ?? "understood"));

    if (sourceId <= 0 || !ideaText || !status) {
      return apiError("An idea needs a source, its text and a status.", 400);
    }

    // createBookIdea checks the source belongs to the user and returns null otherwise.
    if (!(await createBookIdea({ bookId: sourceId, ideaText, status }, user.id))) {
      return apiError("That source isn't in your library.", 404);
    }
  } else {
    return apiError('kind must be "source" or "idea".', 400);
  }

  revalidatePath("/dashboard/insights");

  return Response.json(await library(user.id), { status: 201 });
});
