// Guided breathing patterns (shared wording and timing; the mobile app mirrors these).
// The exhale is longer than the inhale in "calm", which is what makes it settling.

export type BreathingPhase = { label: string; seconds: number; scale: number };

export type BreathingPattern = { id: "calm" | "box"; name: string; description: string; phases: BreathingPhase[] };

const EXPANDED = 1;
const RESTING = 0.55;

export const BREATHING_PATTERNS: BreathingPattern[] = [
  {
    id: "calm",
    name: "Calm",
    description: "In 4 · hold 2 · out 6",
    phases: [
      { label: "Breathe in", seconds: 4, scale: EXPANDED },
      { label: "Hold", seconds: 2, scale: EXPANDED },
      { label: "Breathe out", seconds: 6, scale: RESTING },
    ],
  },
  {
    id: "box",
    name: "Box",
    description: "In 4 · hold 4 · out 4 · hold 4",
    phases: [
      { label: "Breathe in", seconds: 4, scale: EXPANDED },
      { label: "Hold", seconds: 4, scale: EXPANDED },
      { label: "Breathe out", seconds: 4, scale: RESTING },
      { label: "Hold", seconds: 4, scale: RESTING },
    ],
  },
];

export const BREATHING_MINUTES = [1, 2, 5];

export const RESTING_SCALE = RESTING;

// Whole cycles closest to the chosen length, so a session always ends on a full breath.
export function cyclesFor(pattern: BreathingPattern, minutes: number) {
  const cycleSeconds = pattern.phases.reduce((total, phase) => total + phase.seconds, 0);

  return Math.max(1, Math.round((minutes * 60) / cycleSeconds));
}
