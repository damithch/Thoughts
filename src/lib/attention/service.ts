import "server-only";

import {
  mergeAttentionUpdate,
  parseAttentionSessionInput,
  sessionToInput,
} from "@/lib/attention/rules";
import {
  createAttentionReflection,
  createAttentionSession,
  getAttentionSessionForUser,
  updateAttentionSession,
} from "@/lib/db/attention";
import type { AttentionSession } from "@/lib/db/types";
import { getCurrentColomboDate } from "@/lib/time";

// One place for create / edit / reflect, shared by the mobile API, the web actions and the MCP
// tools, so each path validates and behaves the same way.

type Failure = { ok: false; error: string; status: 400 | 404 };

export async function saveAttentionSession(userId: number, body: Record<string, unknown>) {
  const today = getCurrentColomboDate();
  const parsed = parseAttentionSessionInput(body, today);

  if (!parsed.ok) {
    return { ok: false, error: parsed.error, status: 400 } satisfies Failure;
  }

  const result = await createAttentionSession(userId, parsed.value, {
    today,
    completeTask: body.completeTask === true,
  });

  return { ok: true as const, ...result };
}

export async function editAttentionSession(userId: number, id: number, changes: Record<string, unknown>) {
  const stored = await getAttentionSessionForUser(id, userId);

  if (!stored) {
    return { ok: false, error: "That session doesn't exist.", status: 404 } satisfies Failure;
  }

  const parsed = parseAttentionSessionInput(
    mergeAttentionUpdate(sessionToInput(stored), changes),
    getCurrentColomboDate(),
  );

  if (!parsed.ok) {
    return { ok: false, error: parsed.error, status: 400 } satisfies Failure;
  }

  const session = await updateAttentionSession(id, userId, parsed.value);

  return session
    ? { ok: true as const, session }
    : ({ ok: false, error: "That session doesn't exist.", status: 404 } satisfies Failure);
}

// Turns a session into a journal thought. The mood defaults to the session's own mood.
export async function reflectOnAttentionSession(
  userId: number,
  id: number,
  input: { mood?: unknown; text?: unknown },
) {
  const session: AttentionSession | null = await getAttentionSessionForUser(id, userId);

  if (!session) {
    return { ok: false, error: "That session doesn't exist.", status: 404 } satisfies Failure;
  }

  const sent = typeof input.mood === "number" && Number.isInteger(input.mood) && input.mood >= 1 && input.mood <= 10
    ? input.mood
    : null;
  const mood = sent ?? session.mood_after ?? session.mood_before;

  if (mood === null) {
    return { ok: false, error: "Pick a mood (1-10) for the journal entry.", status: 400 } satisfies Failure;
  }

  const text = typeof input.text === "string" ? input.text.slice(0, 4000) : session.comments ?? "";
  const thoughtId = await createAttentionReflection(userId, session, { mood, text });

  return { ok: true as const, thoughtId };
}
