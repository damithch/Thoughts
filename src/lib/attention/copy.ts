// Every user-facing sentence about attention training lives here. The framing comes from the
// worksheet: the mind wandering is expected; the skill is noticing and gently coming back.
// A unit test checks these strings never call wandering a failure.

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

// Words the attention screens must not use about the practice.
export const ATTENTION_BANNED_WORDS = [
  /\bfail\w*/i,
  /\blost focus\b/i,
  /\bdistracted\b/i,
  /\bmissed\b/i,
  /\bbroke\b/i,
  /\bbroken\b/i,
  /\bshould have\b/i,
  /\bbad\b/i,
];
