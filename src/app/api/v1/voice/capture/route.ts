import { apiError, readJsonObject, withMobileUser } from "@/lib/mobile-api";
import { normalizeVoiceCapture, VOICE_LIMITS } from "@/lib/voice-capture";
import { loadVoiceCaptureContext, runVoiceCapturePrompt } from "@/lib/voice-capture-server";

export const dynamic = "force-dynamic";

// POST /api/v1/voice/capture { transcript }
// -> { draft: { thought, tasks, worries }, worryParking: { thinkingTime } | null, modelUsed }
// For typed or corrected text (the recorded-audio path is /voice/capture-audio). Nothing is
// saved here: the app shows the draft for review, then calls /voice/save.
export const POST = withMobileUser(async (request, user) => {
  const body = await readJsonObject(request);
  const transcript = typeof body?.transcript === "string" ? body.transcript.trim() : "";

  if (!transcript) return apiError("Say something first: the transcript is empty.", 400);
  if (transcript.length > VOICE_LIMITS.transcript) {
    return apiError("That's too long for one capture. Try splitting it into two.", 400);
  }

  const context = await loadVoiceCaptureContext(user.id);
  const result = await runVoiceCapturePrompt(context, "transcript", [`TRANSCRIPT:\n${transcript}`], "Your words are kept.");

  if (result instanceof Response) return result;

  const draft = result.parsed
    ? normalizeVoiceCapture(result.parsed, { transcript, today: context.today, bookIdeaIds: context.bookIdeaIds })
    : null;

  if (!draft) {
    console.error("Voice capture: unusable model output.");
    return apiError("The AI's answer didn't make sense. Your words are kept, so try again.", 502);
  }

  return Response.json({ draft, worryParking: context.worryParking, modelUsed: result.modelUsed });
});
