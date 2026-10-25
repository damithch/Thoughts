import { pool } from "@/lib/db/client";
import { getActiveWorryModule, getBookIdeasByUser, getUserSettings } from "@/lib/db";
import { GeminiApiError, generateWithFallback } from "@/lib/gemini";
import { apiError, readJsonObject, withMobileUser } from "@/lib/mobile-api";
import { getCurrentColomboDate } from "@/lib/time";
import {
  buildVoiceCaptureInstruction,
  extractJsonObject,
  normalizeVoiceCapture,
  VOICE_LIMITS,
} from "@/lib/voice-capture";

export const dynamic = "force-dynamic";

const ERROR_STATUS: Record<string, number> = {
  rate_limit: 429,
  token_exceeded: 400,
  auth_error: 502,
  overloaded: 503,
  api_error: 502,
};

// POST /api/v1/voice/capture { transcript }
// -> { draft: { thought, tasks, worries }, worryParking: { thinkingTime } | null, modelUsed }
// Nothing is saved here: the app shows the draft for review, then calls /voice/save.
export const POST = withMobileUser(async (request, user) => {
  const body = await readJsonObject(request);
  const transcript = typeof body?.transcript === "string" ? body.transcript.trim() : "";

  if (!transcript) return apiError("Say something first: the transcript is empty.", 400);
  if (transcript.length > VOICE_LIMITS.transcript) {
    return apiError("That's too long for one capture. Try splitting it into two.", 400);
  }

  const today = getCurrentColomboDate();
  const [settings, tagsResult, categoriesResult, bookIdeas, worryModule] = await Promise.all([
    getUserSettings(user.id),
    pool.query<{ tag: string }>(
      `SELECT DISTINCT unnest(tags) AS tag FROM thoughts WHERE user_id = $1 ORDER BY tag LIMIT 50`,
      [user.id],
    ),
    pool.query<{ category: string }>(
      `SELECT DISTINCT category FROM thoughts WHERE user_id = $1 ORDER BY category LIMIT 30`,
      [user.id],
    ),
    getBookIdeasByUser(user.id),
    getActiveWorryModule(user.id),
  ]);

  const systemInstruction = buildVoiceCaptureInstruction({
    today,
    tags: tagsResult.rows.map((row) => row.tag),
    categories: categoriesResult.rows.map((row) => row.category),
    bookIdeas: bookIdeas.map((idea) => ({ id: idea.id, bookTitle: idea.book_title, ideaText: idea.idea_text })),
  });

  let text: string;
  let modelUsed: string;

  try {
    ({ text, modelUsed } = await generateWithFallback(
      [`TRANSCRIPT:\n${transcript}`],
      Math.max(settings.smart_capture_max_tokens, 4096),
      settings.smart_capture_temperature,
      settings.llm_model,
      // Plain JSON instructions rather than Gemini's schema mode: same result, several times faster.
      { systemInstruction },
    ));
  } catch (error) {
    if (error instanceof GeminiApiError) {
      console.error("Voice capture: Gemini failed.", error.errorType, error.statusCode);
      return apiError(
        error.errorType === "rate_limit"
          ? "The AI is busy right now. Your words are kept, so try again in a minute."
          : "The AI couldn't read that right now. Your words are kept, so try again.",
        ERROR_STATUS[error.errorType] ?? 502,
      );
    }
    throw error;
  }

  const parsed = extractJsonObject(text);
  const draft = parsed
    ? normalizeVoiceCapture(parsed, { transcript, today, bookIdeaIds: bookIdeas.map((idea) => idea.id) })
    : null;

  if (!draft) {
    console.error("Voice capture: unusable model output.");
    return apiError("The AI's answer didn't make sense. Your words are kept, so try again.", 502);
  }

  return Response.json({
    draft,
    // Worries can only be parked while a worry-postponement module is running.
    worryParking: worryModule ? { thinkingTime: worryModule.thinking_time_start || null } : null,
    modelUsed,
  });
});
