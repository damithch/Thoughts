import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { generateFromPrompt, GeminiApiError } from "@/lib/gemini";
import { getUserSettings } from "@/lib/db/settings";

export const dynamic = "force-dynamic";

export async function GET() {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const settings = await getUserSettings(currentUser.id);
  const model = settings.llm_model || "gemini-flash-latest";
  const apiKeyConfigured = !!(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY);
  const embeddingModel = process.env.GEMINI_EMBEDDING_MODEL ?? "gemini-embedding-001";

  if (!apiKeyConfigured) {
    return NextResponse.json({
      status: "error",
      model,
      embeddingModel,
      apiKeyConfigured: false,
      message: "No API key configured. Set GEMINI_API_KEY in your .env.local file.",
      latencyMs: 0,
    });
  }

  const startTime = Date.now();

  try {
    // Make a minimal API call to verify the key and model work.
    const result = await generateFromPrompt("Respond with exactly: OK", 8, 0, model);
    const latencyMs = Date.now() - startTime;

    return NextResponse.json({
      status: "ok",
      model,
      embeddingModel,
      apiKeyConfigured: true,
      message: `Model responded successfully.`,
      response: String(result).trim().slice(0, 50),
      latencyMs,
    });
  } catch (error) {
    const latencyMs = Date.now() - startTime;

    if (error instanceof GeminiApiError) {
      return NextResponse.json({
        status: "error",
        model,
        embeddingModel,
        apiKeyConfigured: true,
        errorType: error.errorType,
        message: error.message,
        latencyMs,
      });
    }

    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({
      status: "error",
      model,
      embeddingModel,
      apiKeyConfigured: true,
      errorType: "api_error",
      message,
      latencyMs,
    });
  }
}
