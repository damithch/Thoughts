// Attention training on the phone: API shapes, wording and small pure helpers.
// The wording mirrors src/lib/attention/copy.ts on the server; a unit test keeps them identical.

export type AttentionSessionType = "mundane_task" | "meditation";
export type AttentionAnchor = "touch" | "sight" | "hearing" | "smell" | "taste";

export const ATTENTION_ANCHORS: AttentionAnchor[] = ["touch", "sight", "hearing", "smell", "taste"];

export type AttentionSession = {
  id: number;
  session_type: AttentionSessionType;
  task_name: string;
  entry_date: string;
  started_at: string;
  duration_minutes: number;
  self_focus_before: number | null;
  self_focus_after: number | null;
  task_focus_before: number | null;
  task_focus_after: number | null;
  anchors_used: AttentionAnchor[] | null;
  mood_before: number | null;
  mood_after: number | null;
  comments: string | null;
  linked_task_id: number | null;
};

export type AttentionDay = { date: string; mundane: number; meditation: number; minutes: number };

export type AttentionStats = {
  range: 7 | 30;
  from: string;
  to: string;
  days: AttentionDay[];
  sessionCount: number;
  mundaneCount: number;
  meditationCount: number;
  totalMinutes: number;
  avgTaskFocusChange: number | null;
  daysWithBoth: number;
  streak: number;
  trend: { date: string; taskName: string; before: number; after: number }[];
};

export type AttentionIdea = { id: number; name: string };

export type AttentionReminder = { routineId: number; time: string | null; active: boolean } | null;

export type AttentionSettings = {
  attention_observe_seconds: number;
  attention_belly_seconds: number;
  attention_body_seconds: number;
};

export type SaveResult = { session: AttentionSession; completedTask: string | null };

export const ATTENTION_COPY = {
  title: "Attention training",
  principle:
    "Your mind will wander — that's expected. The practice is noticing where it went and gently bringing it back.",
  mundaneIntro:
    "Pick an everyday task and give it your full attention. When thoughts pull you away, use your senses to come back to the task.",
  meditationIntro:
    "Sit comfortably and follow three short steps. When you notice your mind has drifted, that noticing is the practice.",
  beforeQuestion: "Right now, where is your attention?",
  afterQuestion: "And now, after the task?",
  selfLabel: "on me / my thoughts",
  taskLabel: "on the task",
  anchorsTitle: "Anchors that helped",
  anchorsHint: "When your mind wandered, which senses brought you back?",
  commentsLabel: "What did you notice?",
  commentsPlaceholder:
    "Did you catch your mind wandering? Could you bring it back? How did it compare to doing the task on autopilot?",
  emptyHistory: "Nothing logged yet. Even one minute of noticing counts.",
  emptyTrend: "Log a few mundane task sessions with before and after ratings to see your trend here.",
  restDay: "A rest day",
  saved: "Saved. Every round of noticing and returning builds the skill.",
  meditationDone: "Nicely done. Each time you came back to the breath, you practised the skill.",
  meditationEarly: "That counts too. Save the time you practised?",
  reflectionTag: "attention-training",
  targetHint: "Aim for one task session and one meditation each day, whenever suits you.",
} as const;

export const ANCHOR_PROMPTS: Record<string, { label: string; prompt: string }> = {
  touch: { label: "Touch", prompt: "Water on your hands, your feet on the ground" },
  sight: { label: "Sight", prompt: "Colours, shapes, light and movement" },
  hearing: { label: "Hearing", prompt: "Your footsteps, running water, sounds around you" },
  smell: { label: "Smell", prompt: "Soap, food, fresh air" },
  taste: { label: "Taste", prompt: "Flavours and textures as you eat or drink" },
};

export const MEDITATION_STEP_COPY = [
  { key: "observe", title: "Notice what's here", prompt: "Observe your thoughts, feelings and body sensations, just as they are." },
  { key: "belly", title: "Breathe into the belly", prompt: "Rest your attention on the rise and fall of the belly with each breath." },
  { key: "body", title: "Breathe with the whole body", prompt: "Widen your attention to the whole body breathing — posture, face, every sensation." },
] as const;

export const DEFAULT_ATTENTION_SETTINGS: AttentionSettings = {
  attention_observe_seconds: 60,
  attention_belly_seconds: 120,
  attention_body_seconds: 120,
};

export type MeditationStep = { key: string; title: string; prompt: string; seconds: number };

export function meditationSteps(settings: Partial<AttentionSettings> | null | undefined): MeditationStep[] {
  const merged = { ...DEFAULT_ATTENTION_SETTINGS, ...(settings ?? {}) };
  const seconds = [merged.attention_observe_seconds, merged.attention_belly_seconds, merged.attention_body_seconds];

  return MEDITATION_STEP_COPY.map((step, index) => ({ ...step, seconds: seconds[index] }));
}

// Elapsed seconds -> minutes to save: rounded, at least 1, at most 120.
export function minutesFromSeconds(seconds: number) {
  return Math.min(120, Math.max(1, Math.round(seconds / 60)));
}

// One slider value (attention on self) -> both sides, always adding up to 100.
export function splitAttention(selfFocus: number) {
  const self = Math.min(100, Math.max(0, Math.round(selfFocus)));

  return { self, task: 100 - self };
}

export function describeFocusChange(before: number | null, after: number | null) {
  if (before === null && after === null) return null;
  if (after === null) return `${before}% on the task before`;
  if (before === null) return `${after}% on the task after`;
  return `${before}% → ${after}% on the task`;
}

export function sessionTypeLabel(type: AttentionSessionType) {
  return type === "meditation" ? "Meditation" : "Mundane task";
}

// Sessions (newest first) grouped by day, keeping that order.
export function groupSessionsByDay(sessions: AttentionSession[]) {
  const groups: { date: string; sessions: AttentionSession[] }[] = [];

  for (const session of sessions) {
    const last = groups[groups.length - 1];
    if (last && last.date === session.entry_date) last.sessions.push(session);
    else groups.push({ date: session.entry_date, sessions: [session] });
  }

  return groups;
}
