import { apiError, readJsonObject, withMobileUser } from "@/lib/mobile-api";
import { normalizeAudioCapture, validateVoiceAudio } from "@/lib/voice-capture";
import { loadVoiceCaptureContext, runVoiceCapturePrompt } from "@/lib/voice-capture-server";

export const dynamic = "force-dynamic";
// A few minutes of audio can take Gemini a while to transcribe.
export const maxDuration = 60;

// POST /api/v1/voice/capture-audio { audio (base64), mimeType, durationMs }
// -> { transcript, draft: { thought, tasks, worries }, worryParking, modelUsed }
// Gemini hears the recording and returns a verbatim transcript plus the draft in one call. The
// audio only passes through memory on its way to Gemini; it is never written anywhere.
export const POST = withMobileUser(async (request, user) => {
  const checked = validateVoiceAudio(await readJsonObject(request));

  if (!checked.ok) return apiError(checked.error, 400);

  const context = await loadVoiceCaptureContext(user.id);
  const result = await runVoiceCapturePrompt(
    context,
    "audio",
    [
      { inlineData: { mimeType: checked.value.mimeType, data: checked.value.audio } },
      "Transcribe this journal entry and turn it into the JSON described.",
    ],
    "Your recording is kept on your phone.",
  );

  if (result instanceof Response) return result;

  const capture = result.parsed
    ? normalizeAudioCapture(result.parsed, { today: context.today, bookIdeaIds: context.bookIdeaIds })
    : null;

  if (!capture) {
    const heardNothing = result.parsed && typeof result.parsed.transcript === "string" && !result.parsed.transcript.trim();
    return apiError(
      heardNothing
        ? "Couldn't make out any words in that recording. Try again a little closer to the phone."
        : "The AI's answer didn't make sense. Your recording is kept on your phone, so try again.",
      heardNothing ? 422 : 502,
    );
  }

  return Response.json({
    transcript: capture.transcript,
    draft: capture.draft,
    worryParking: context.worryParking,
    modelUsed: result.modelUsed,
  });
});
