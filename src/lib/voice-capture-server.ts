import "server-only";

import { pool } from "@/lib/db/client";
import { getActiveWorryModule, getBookIdeasByUser, getUserSettings } from "@/lib/db";
import { GeminiApiError, generateWithFallback, type PromptPart } from "@/lib/gemini";
import { apiError } from "@/lib/mobile-api";
import { getCurrentColomboDate } from "@/lib/time";
import { buildVoiceCaptureInstruction, extractJsonObject } from "@/lib/voice-capture";

const ERROR_STATUS: Record<string, number> = {
  rate_limit: 429,
  token_exceeded: 400,
  auth_error: 502,
  overloaded: 503,
  api_error: 502,
};

// Everything a voice capture needs from the user's data: existing tags and categories to reuse,
// book ideas to link, and whether worries can be parked right now.
export async function loadVoiceCaptureContext(userId: number) {
  const today = getCurrentColomboDate();
  const [settings, tagsResult, categoriesResult, bookIdeas, worryModule] = await Promise.all([
    getUserSettings(userId),
    pool.query<{ tag: string }>(
      `SELECT DISTINCT unnest(tags) AS tag FROM thoughts WHERE user_id = $1 ORDER BY tag LIMIT 50`,
      [userId],
    ),
    pool.query<{ category: string }>(
      `SELECT DISTINCT category FROM thoughts WHERE user_id = $1 ORDER BY category LIMIT 30`,
      [userId],
    ),
    getBookIdeasByUser(userId),
    getActiveWorryModule(userId),
  ]);

  const promptContext = {
    today,
    tags: tagsResult.rows.map((row) => row.tag),
    categories: categoriesResult.rows.map((row) => row.category),
    bookIdeas: bookIdeas.map((idea) => ({ id: idea.id, bookTitle: idea.book_title, ideaText: idea.idea_text })),
  };

  return {
    today,
    settings,
    bookIdeaIds: bookIdeas.map((idea) => idea.id),
    instruction: (source: "transcript" | "audio") => buildVoiceCaptureInstruction(promptContext, source),
    // Worries can only be parked while a worry-postponement module is running.
    worryParking: worryModule ? { thinkingTime: worryModule.thinking_time_start || null } : null,
  };
}

type VoiceContext = Awaited<ReturnType<typeof loadVoiceCaptureContext>>;

// Runs the capture prompt. Returns the parsed JSON object, or a ready error Response.
export async function runVoiceCapturePrompt(
  context: VoiceContext,
  source: "transcript" | "audio",
  parts: PromptPart[],
  keptMessage: string,
): Promise<{ parsed: Record<string, unknown> | null; modelUsed: string } | Response> {
  try {
    const { text, modelUsed } = await generateWithFallback(
      parts,
      // Audio replies carry the transcript as well as the card, so allow more room.
      Math.max(context.settings.smart_capture_max_tokens, source === "audio" ? 8192 : 4096),
      context.settings.smart_capture_temperature,
      context.settings.llm_model,
      // Plain JSON instructions rather than Gemini's schema mode: same result, several times faster.
      { systemInstruction: context.instruction(source) },
    );

    return { parsed: extractJsonObject(text), modelUsed };
  } catch (error) {
    if (error instanceof GeminiApiError) {
      console.error("Voice capture: Gemini failed.", source, error.errorType, error.statusCode);
      return apiError(
        error.errorType === "rate_limit"
          ? `The AI is busy right now. ${keptMessage} Try again in a minute.`
          : `The AI couldn't read that right now. ${keptMessage} Try again.`,
        ERROR_STATUS[error.errorType] ?? 502,
      );
    }
    throw error;
  }
}
