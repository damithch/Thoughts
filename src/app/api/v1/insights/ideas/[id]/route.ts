import { revalidatePath } from "next/cache";

import { getBookIdeasByUser, getBooksByUser, updateBookIdeaStatus } from "@/lib/db";
import { apiError, IDEA_STATUSES, parseIdParam, readJsonObject, withMobileUser } from "@/lib/mobile-api";

export const dynamic = "force-dynamic";

type IdeaContext = { params: Promise<{ id: string }> };

// PATCH /api/v1/insights/ideas/:id { status: understood|noticed|applied|internalized } -> { sources, ideas }
export const PATCH = withMobileUser<IdeaContext>(async (request, user, { params }) => {
  const id = parseIdParam((await params).id);
  const body = await readJsonObject(request);
  const status = IDEA_STATUSES.find((value) => value === body?.status);

  if (!status) {
    return apiError("status must be understood, noticed, applied or internalized.", 400);
  }

  if (!id || !(await updateBookIdeaStatus(id, status, user.id))) {
    return apiError("That idea doesn't exist.", 404);
  }

  revalidatePath("/dashboard/insights");
  revalidatePath("/dashboard");

  const [sources, ideas] = await Promise.all([getBooksByUser(user.id), getBookIdeasByUser(user.id)]);

  return Response.json({ sources, ideas });
});
