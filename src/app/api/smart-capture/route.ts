import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { pool } from "@/lib/db/client";
import { getBookIdeasByUser } from "@/lib/db/insights";
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

    // Fetch user's existing tags and categories for context consistency
    const [tagsResult, categoriesResult, bookIdeas] = await Promise.all([
      pool.query<{ tag: string }>(
        `
          SELECT DISTINCT unnest(tags) AS tag
          FROM thoughts
          WHERE user_id = $1
          ORDER BY tag ASC
          LIMIT 50
        `,
        [currentUser.id],
      ),
      pool.query<{ category: string }>(
        `
          SELECT DISTINCT category
          FROM thoughts
          WHERE user_id = $1
          ORDER BY category ASC
          LIMIT 30
        `,
        [currentUser.id],
      ),
      getBookIdeasByUser(currentUser.id),
    ]);

    const existingTags = tagsResult.rows.map((r) => r.tag);
    const existingCategories = categoriesResult.rows.map((r) => r.category);
    const bookIdeaContext = bookIdeas.map((idea) => ({
      id: idea.id,
      bookTitle: idea.book_title,
      ideaText: idea.idea_text,
    }));

    const systemPrompt = `You are a journal assistant for a personal thought-tracking app. The user will paste raw unstructured text from their journal entry. Your job is to extract structured fields from it.

IMPORTANT RULES:
- Output ONLY valid JSON, no markdown fences, no explanation text.
- Reuse existing tags and categories when they fit. Only create new ones if none match.
- mood is an integer from 1 (lowest) to 10 (highest). Infer it from the emotional tone.
- summary should be 1-2 SHORT sentences that capture the core of the entry. Keep it brief and scannable.
- body is the FULL journal text, cleaned up slightly for readability but preserving the user's voice. If the raw text is long, the summary stays short and ALL the detail goes into body. Never truncate body.
- tags are general grouping labels (max 5).
- conceptTags: ALWAYS return an empty array []. The user fills these manually.
- linkedBookIdeaId: set to the numeric ID of a matching book idea if the entry clearly relates to one, otherwise null.
- insightReflection: if a book idea is linked, write a short note on how it appeared in the entry. Otherwise empty string.

EXISTING CONTEXT (reuse when appropriate):
- Existing tags: ${existingTags.length > 0 ? existingTags.join(", ") : "(none yet)"}
- Existing categories: ${existingCategories.length > 0 ? existingCategories.join(", ") : "(none yet)"}
- Book ideas: ${bookIdeaContext.length > 0 ? JSON.stringify(bookIdeaContext) : "(none yet)"}

OUTPUT JSON SCHEMA:
{
  "title": "string (short, descriptive title)",
  "category": "string (single category label)",
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
    const output = {
      title: typeof parsed.title === "string" ? parsed.title.trim().slice(0, 200) : "",
      category: typeof parsed.category === "string" ? parsed.category.trim().slice(0, 100) : "",
      mood: typeof parsed.mood === "number" && Number.isInteger(parsed.mood) && parsed.mood >= 1 && parsed.mood <= 10
        ? parsed.mood
        : 5,
      tags: Array.isArray(parsed.tags)
        ? parsed.tags.filter((t: unknown) => typeof t === "string").map((t: string) => t.trim().toLowerCase()).filter(Boolean).slice(0, 8)
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
