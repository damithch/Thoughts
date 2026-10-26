// Pure helpers for the voice capture screen (kept apart so they can be unit tested).

// Gemini hears the recording itself. Ten minutes keeps the upload under the server's body limit
// (16 kHz mono AAC is about 240 KB a minute).
export const VOICE_MAX_MS = 10 * 60 * 1000;
export const VOICE_WARN_MS = VOICE_MAX_MS - 60 * 1000;

// The recorder writes AAC in an ADTS stream, a format Gemini reads directly.
export const VOICE_AUDIO_MIME_TYPE = "audio/aac";

// Recorder metering is in dBFS (about -160 silent to 0 loudest). Speech sits roughly between
// -50 and -10, so map -60..0 onto 0..1 for the level ring.
export function meteringToLevel(metering: number | undefined) {
  if (typeof metering !== "number" || !Number.isFinite(metering)) return 0;

  return Math.max(0, Math.min(1, (metering + 60) / 60));
}

// 0:07, 3:42, 10:00
export function formatElapsed(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function recordingHint(state: { started: boolean; recording: boolean; elapsedMs: number }) {
  if (!state.started) return "Tap the mic and talk. Any language, as long as you like (up to 10 minutes).";
  if (!state.recording) return "Paused. Tap the mic to carry on, or Done when you're finished.";
  if (state.elapsedMs >= VOICE_WARN_MS) return `About a minute left. It stops by itself at ${formatElapsed(VOICE_MAX_MS)}.`;

  return "Listening. Pauses are fine, take your time.";
}

// The Save button's label, so it's clear what one tap will create.
export function saveLabel(tasks: number, worries: number) {
  const extras = [
    tasks > 0 ? `${tasks} task${tasks === 1 ? "" : "s"}` : null,
    worries > 0 ? `${worries} worr${worries === 1 ? "y" : "ies"}` : null,
  ].filter(Boolean);

  return extras.length > 0 ? `Save thought + ${extras.join(" + ")}` : "Save thought";
}
