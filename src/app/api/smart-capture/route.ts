import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getBookIdeasByUser } from "@/lib/db/insights";
import { getTagCounts, getTriggerCounts } from "@/lib/db/thoughts";
import { EMOTIONS, LIFE_AREAS, rankTags, resolveThoughtFields, THOUGHT_FIELD_LIMITS } from "@/lib/thought-fields";
import { getUserSettings } from "@/lib/db/settings";
import { generateWithFallback, GeminiApiError } from "@/lib/gemini";

export async function POST(request: Request) {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: { rawText?: string };

  try {
    payload = (await request.json()) as any;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const rawText = (payload.rawText ?? "").toString().trim();

  if (!rawText) {
    return NextResponse.json({ error: "rawText is required." }, { status: 400 });
  }

  if (rawText.length > 10000) {
    return NextResponse.json({ error: "rawText is too long (max 10,000 characters)." }, { status: 400 });
  }

  try {
    const settings = await getUserSettings(currentUser.id);

    // The user's own tags (most used first) and triggers, so the model reuses them.
    const [tagCounts, triggerCounts, bookIdeas] = await Promise.all([
      getTagCounts(currentUser.id),
      getTriggerCounts(currentUser.id),
      getBookIdeasByUser(currentUser.id),
    ]);

    const existingTags = rankTags(tagCounts);
    const existingTriggers = triggerCounts.map((row) => row.trigger);
    const bookIdeaContext = bookIdeas.map((idea) => ({
      id: idea.id,
      bookTitle: idea.book_title,
      ideaText: idea.idea_text,
    }));

    const systemPrompt = `You are a journal assistant for a personal thought-tracking app. The user will paste raw unstructured text from their journal entry. Your job is to extract structured fields from it.

IMPORTANT RULES:
- Output ONLY valid JSON, no markdown fences, no explanation text.
- Reuse existing tags when they fit. Only create a new one if none match, and never add a near-duplicate of an existing tag (for example "calmness" when "calm" exists).
- emotions: 1 to ${THOUGHT_FIELD_LIMITS.emotions} of exactly these words, strongest first: ${EMOTIONS.join(", ")}.
- lifeArea: exactly one of ${LIFE_AREAS.map((area) => area.key).join(", ")} (${LIFE_AREAS.map((area) => `${area.key} = ${area.label}`).join("; ")}), or "" if unclear.
- trigger: the person, place or event that set the feeling off, in a few words (reuse an existing trigger's exact wording when it is the same one), or "" if there is none.
- mood is an integer from 1 (lowest) to 10 (highest). Infer it from the emotional tone.
- summary should be 1-2 SHORT sentences that capture the core of the entry, written in the first person as the user ("I felt...", "I studied..."). Never write "the user", "they", "he" or "she" about the writer. Keep it brief and scannable.
- body is the FULL journal text, cleaned up slightly for readability but preserving the user's voice. If the raw text is long, the summary stays short and ALL the detail goes into body. Never truncate body.
- tags are specific topic labels (max 5). Skip labels so general they would fit almost any entry (such as "emotional processing"), and do not repeat the emotions or life area as tags.
- conceptTags: ALWAYS return an empty array []. The user fills these manually.
- linkedBookIdeaId: set to the numeric ID of a matching book idea if the entry clearly relates to one, otherwise null.
- insightReflection: if a book idea is linked, write a short note on how it appeared in the entry. Otherwise empty string.

EXISTING CONTEXT (reuse when appropriate):
- Existing tags: ${existingTags.length > 0 ? existingTags.join(", ") : "(none yet)"}
- Existing triggers: ${existingTriggers.length > 0 ? existingTriggers.join(", ") : "(none yet)"}
- Book ideas: ${bookIdeaContext.length > 0 ? JSON.stringify(bookIdeaContext) : "(none yet)"}

OUTPUT JSON SCHEMA:
{
  "title": "string (short, descriptive title)",
  "emotions": ["string array, from the list above"],
  "lifeArea": "string (one key from the list above, or empty)",
  "trigger": "string or empty",
  "mood": "integer 1-10",
  "tags": ["string array"],
  "conceptTags": [],
  "summary": "string (1-2 sentence summary, keep SHORT)",
  "body": "string (full cleaned-up text, never truncate)",
  "linkedBookIdeaId": "integer or null",
  "insightReflection": "string or empty"
}`;

    const userPrompt = `RAW JOURNAL TEXT:\n${rawText}`;

    const { text: result, modelUsed } = await generateWithFallback([systemPrompt, userPrompt], settings.smart_capture_max_tokens, settings.smart_capture_temperature, settings.llm_model);

    // ---- Robust JSON extraction ----
    // Models may wrap JSON in markdown fences, explanation text, or other artifacts.
    // We try multiple strategies to extract valid JSON.
    let parsed: any;
    const rawResult = result.trim();

    function tryParse(str: string): any {
      try { return JSON.parse(str); } catch { return null; }
    }

    // Strategy 1: Direct parse
    parsed = tryParse(rawResult);

    // Strategy 2: Strip markdown code fences (```json ... ``` or ``` ... ```)
    if (!parsed) {
      const fenceMatch = rawResult.match(/```(?:json)?\s*([\s\S]*?)```/i);
      if (fenceMatch) {
        parsed = tryParse(fenceMatch[1].trim());
      }
    }

    // Strategy 3: Find the first { and last } for balanced extraction
    if (!parsed) {
      const firstBrace = rawResult.indexOf("{");
      const lastBrace = rawResult.lastIndexOf("}");
      if (firstBrace !== -1 && lastBrace > firstBrace) {
        const candidate = rawResult.slice(firstBrace, lastBrace + 1);
        parsed = tryParse(candidate);
      }
    }

    // Strategy 4: Greedy regex extraction (handles nested objects)
    if (!parsed) {
      const jsonMatch = rawResult.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = tryParse(jsonMatch[0]);
      }
    }

    // Strategy 5: Try stripping common prose prefixes like "Here is the JSON:" or "Sure,"
    if (!parsed) {
      const stripped = rawResult
        .replace(/^[\s\S]*?(?=\{)/m, "")  // strip everything before first {
        .replace(/\}[\s\S]*$/m, "}")        // strip everything after last }
        .trim();
      parsed = tryParse(stripped);
    }

    if (!parsed) {
      console.error("Smart capture: all 5 JSON parse strategies failed. Raw response:", rawResult);
      return NextResponse.json(
        { error: "The AI returned an invalid response. Please try again.", errorType: "parse_error" as const, rawResponse: rawResult.slice(0, 500) },
        { status: 502 },
      );
    }

    // Validate and sanitize the parsed fields
    const fields =
      resolveThoughtFields({
        emotions: parsed.emotions ?? [],
        lifeArea: parsed.lifeArea ?? "",
        trigger: parsed.trigger ?? "",
        category: parsed.category,
      }) ?? { category: "Neutral", emotions: ["neutral"], lifeArea: "", trigger: "" };
    const output = {
      title: typeof parsed.title === "string" ? parsed.title.trim().slice(0, 200) : "",
      // `category` is the short label older phone builds still read.
      category: fields?.category ?? "",
      emotions: fields?.emotions ?? [],
      lifeArea: fields?.lifeArea ?? "",
      trigger: fields?.trigger ?? "",
      mood: typeof parsed.mood === "number" && Number.isInteger(parsed.mood) && parsed.mood >= 1 && parsed.mood <= 10
        ? parsed.mood
        : 5,
      tags: Array.isArray(parsed.tags)
        ? Array.from(new Set(parsed.tags
            .filter((t: unknown) => typeof t === "string")
            .map((t: string) => t.trim().toLowerCase())
            .filter(Boolean))).slice(0, 5)
        : [],
      conceptTags: Array.isArray(parsed.conceptTags)
        ? parsed.conceptTags.filter((t: unknown) => typeof t === "string").map((t: string) => t.trim().toLowerCase()).filter(Boolean).slice(0, 8)
        : [],
      summary: typeof parsed.summary === "string" ? parsed.summary.trim().slice(0, 500) : "",
      body: typeof parsed.body === "string" ? parsed.body.trim() : rawText,
      linkedBookIdeaId:
        typeof parsed.linkedBookIdeaId === "number" &&
        Number.isInteger(parsed.linkedBookIdeaId) &&
        parsed.linkedBookIdeaId > 0 &&
        bookIdeas.some((idea) => idea.id === parsed.linkedBookIdeaId)
          ? parsed.linkedBookIdeaId
          : null,
      insightReflection: typeof parsed.insightReflection === "string" ? parsed.insightReflection.trim() : "",
    };

    if (!output.title || !output.category || !output.summary || !output.body) {
      console.error("Smart capture: model returned incomplete structured output.");
      return NextResponse.json(
        { error: "The AI returned incomplete fields. Please try again.", errorType: "parse_error" as const },
        { status: 502 },
      );
    }

    return NextResponse.json({ ...output, modelUsed });
  } catch (error) {
    console.error("Smart capture failed", error);

    if (error instanceof GeminiApiError) {
      const statusMap: Record<string, number> = {
        rate_limit: 429,
        token_exceeded: 400,
        auth_error: 401,
        overloaded: 503,
        api_error: 502,
      };

      return NextResponse.json(
        {
          error: error.message,
          errorType: error.errorType,
          details: error.message,
        },
        { status: statusMap[error.errorType] ?? 502 },
      );
    }

    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: "Smart capture failed.", errorType: "api_error" as const, details: message },
      { status: 500 },
    );
  }
}
