import { undoAgentRunAction } from "@/app/dashboard/tasks/task-actions";
import type { AgentUndo } from "@/lib/tasks/agent-execute";
import { apiError, readJsonObject, withMobileUser } from "@/lib/mobile-api";

export const dynamic = "force-dynamic";

// POST /api/v1/agent/undo { undo } -> { ok: true }. Reverses a run of POST /api/agent/tasks using
// the `undo` object it returned; reuses the web's undo action and its checks.
export const POST = withMobileUser(async (request) => {
  const body = await readJsonObject(request);

  if (!body || typeof body.undo !== "object" || body.undo === null) {
    return apiError("Nothing to undo.", 400);
  }

  const result = await undoAgentRunAction(body.undo as AgentUndo);

  return result.ok ? Response.json({ ok: true }) : apiError(result.error, 400);
});
