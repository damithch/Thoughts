import type { SupportStatus } from "@/lib/types";

// Wording and phone helpers for support on hard days (mirrors the web's src/lib/support-copy.ts).

export function supportHeadline(status: SupportStatus | null) {
  if (!status?.active) {
    return {
      title: "Your support plan",
      body: "Small things that help when it gets hard. Set them up on a good day so they're ready on a bad one.",
    };
  }

  if (status.reason === "late_night") {
    return {
      title: "It's late, and things feel heavy",
      body: "Nights make everything louder. Nothing needs to be decided tonight.",
    };
  }

  return {
    title: "A heavy stretch",
    body: `Your last ${status.lowStreak} entries have been really hard. You've come through stretches like this before. Start with something small.${
      status.lateNight ? " It's late, too: nothing needs to be decided tonight." : ""
    }`,
  };
}

// Sri Lanka's free ambulance service (Suwa Seriya).
export const AMBULANCE_NUMBER = "1990";

export function urgentLine(helplinePhone: string) {
  return `If you might act on thoughts of hurting yourself, call ${helplinePhone} now or go to the nearest hospital. For an ambulance, call ${AMBULANCE_NUMBER}.`;
}

export function telUrl(phone: string) {
  return `tel:${phone.replace(/[^0-9+]/g, "")}`;
}

export function smsUrl(phone: string) {
  return `sms:${phone.replace(/[^0-9+]/g, "")}`;
}

export const BASICS = [
  { key: "ate", label: "I've eaten", nudge: "Something small to eat can change how the next hour feels." },
  { key: "slept", label: "I slept okay", nudge: "Running on little sleep makes everything heavier. Be gentle with yourself today." },
  { key: "connected", label: "I've talked to someone", nudge: "A short message to someone you trust counts." },
] as const;

// Guided breathing (mirrors the web's src/lib/breathing.ts). Longer out-breaths are settling.
export type BreathingPhase = { label: string; seconds: number; expanded: boolean };

export const BREATHING_PATTERNS: { id: "calm" | "box"; name: string; description: string; phases: BreathingPhase[] }[] = [
  {
    id: "calm",
    name: "Calm",
    description: "In 4 · hold 2 · out 6",
    phases: [
      { label: "Breathe in", seconds: 4, expanded: true },
      { label: "Hold", seconds: 2, expanded: true },
      { label: "Breathe out", seconds: 6, expanded: false },
    ],
  },
  {
    id: "box",
    name: "Box",
    description: "In 4 · hold 4 · out 4 · hold 4",
    phases: [
      { label: "Breathe in", seconds: 4, expanded: true },
      { label: "Hold", seconds: 4, expanded: true },
      { label: "Breathe out", seconds: 4, expanded: false },
      { label: "Hold", seconds: 4, expanded: false },
    ],
  },
];

export const BREATHING_MINUTES = [1, 2, 5];

// Whole cycles closest to the chosen length, so a session always ends on a full breath.
export function cyclesFor(phases: BreathingPhase[], minutes: number) {
  const cycleSeconds = phases.reduce((total, phase) => total + phase.seconds, 0);

  return Math.max(1, Math.round((minutes * 60) / cycleSeconds));
}
