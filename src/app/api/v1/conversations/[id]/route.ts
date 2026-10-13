import { revalidatePath } from "next/cache";

import { deleteConversationSummary } from "@/lib/db";
import { apiError, parseIdParam, withMobileUser } from "@/lib/mobile-api";

export const dynamic = "force-dynamic";

type ConversationContext = { params: Promise<{ id: string }> };

// DELETE /api/v1/conversations/:id -> 204
export const DELETE = withMobileUser<ConversationContext>(async (_request, user, { params }) => {
  const id = parseIdParam((await params).id);

  if (!id || !(await deleteConversationSummary(id, user.id))) {
    return apiError("That conversation log doesn't exist.", 404);
  }

  revalidatePath("/dashboard/conversations");

  return new Response(null, { status: 204 });
});
