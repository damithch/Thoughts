// Pure helpers for the voice capture screen (kept apart so they can be unit tested).

// Speech recognition delivers the words in pieces (one per pause). Joins a finished piece onto
// what's already there, with one space and the first letter capitalised.
export function appendSegment(text: string, segment: string) {
  const piece = segment.replace(/\s+/g, " ").trim();

  if (!piece) return text;

  const capitalised = piece.charAt(0).toUpperCase() + piece.slice(1);
  const base = text.trimEnd();

  return base ? `${base} ${capitalised}` : capitalised;
}

// Errors that just mean "nothing heard yet". While the person is still talking we quietly start
// listening again instead of stopping.
const QUIET_ERRORS = new Set(["no-speech", "speech-timeout"]);

export function isQuietSpeechError(code: string) {
  return QUIET_ERRORS.has(code);
}

// A friendly message for the errors that do stop listening.
export function speechErrorMessage(code: string) {
  switch (code) {
    case "not-allowed":
      return "Thoughts needs microphone permission to listen. You can allow it in the phone's settings, or type below.";
    case "service-not-allowed":
    case "language-not-supported":
      return "Speech recognition isn't available on this phone. Make sure the Google app is installed and up to date, or type below.";
    case "network":
      return "Speech recognition needs an internet connection right now. Your words so far are kept.";
    case "audio-capture":
      return "The microphone couldn't be used. Another app may be using it.";
    case "busy":
      return "The speech service is busy. Tap the mic again in a moment.";
    default:
      return "Listening stopped unexpectedly. Your words so far are kept; tap the mic to carry on.";
  }
}

// The Save button's label, so it's clear what one tap will create.
export function saveLabel(tasks: number, worries: number) {
  const extras = [
    tasks > 0 ? `${tasks} task${tasks === 1 ? "" : "s"}` : null,
    worries > 0 ? `${worries} worr${worries === 1 ? "y" : "ies"}` : null,
  ].filter(Boolean);

  return extras.length > 0 ? `Save thought + ${extras.join(" + ")}` : "Save thought";
}
