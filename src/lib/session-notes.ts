// "For my next session": things to bring up with a therapist, collected as they come up
// (typed, tapped on a thought, spoken in a voice capture, or added by Claude) and ticked off
// once discussed. Pure rules shared by the web, the phone API, Claude's tools and the tests.

export const SESSION_NOTE_LIMITS = { content: 500, perRequest: 5, list: 200 };

export const SESSION_NOTE_SOURCES = ["manual", "thought", "voice", "claude"] as const;
export type SessionNoteSource = (typeof SESSION_NOTE_SOURCES)[number];

export type SessionNote = {
  id: number;
  user_id: number;
  content: string;
  source: SessionNoteSource;
  thought_id: number | null;
  created_at: Date | string;
  discussed_at: Date | string | null;
};

export function normalizeSessionNoteContent(value: unknown) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, SESSION_NOTE_LIMITS.content) : "";
}

// De-duplicated, non-empty notes from a list a client sent (voice capture, Claude).
export function normalizeSessionNoteList(value: unknown, max = SESSION_NOTE_LIMITS.perRequest) {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  const notes: string[] = [];

  for (const item of value) {
    const content = normalizeSessionNoteContent(item);
    const key = content.toLowerCase();
    if (!content || seen.has(key)) continue;
    seen.add(key);
    notes.push(content);
    if (notes.length >= max) break;
  }

  return notes;
}

export function sourceLabel(source: string) {
  if (source === "thought") return "From a thought";
  if (source === "voice") return "Voice capture";
  if (source === "claude") return "Added by Claude";

  return "Added by you";
}

// The note made when "bring to session" is tapped on a thought: its title, plus the summary
// when the title alone doesn't say much.
export function sessionNoteFromThought(thought: { title: string; summary: string }) {
  const title = thought.title.trim();
  const summary = thought.summary.trim();
  const combined = summary && summary.toLowerCase() !== title.toLowerCase() ? `${title}: ${summary}` : title;

  return normalizeSessionNoteContent(combined);
}

// What the report prints: everything still open, then what was discussed inside the range.
export function splitSessionNotes<T extends { discussed_at: Date | string | null }>(notes: readonly T[]) {
  return {
    open: notes.filter((note) => !note.discussed_at),
    discussed: notes.filter((note) => note.discussed_at),
  };
}
