import "server-only";

import { computeAttentionInsights, ATTENTION_LIMITS, type AttentionInsights } from "@/lib/attention/rules";
import { getAttentionSessions } from "@/lib/db/attention";
import { getSessionNotesForReport } from "@/lib/db/session-notes";
import { splitSessionNotes, type SessionNote } from "@/lib/session-notes";
import type { AttentionSession } from "@/lib/db/types";
import { getWorryReportData, type WorryReportModule } from "@/lib/db/worry-postponement";

export const THERAPY_SECTIONS = ["session", "attention", "worry"] as const;
export type TherapySection = (typeof THERAPY_SECTIONS)[number];

export type TherapyReportData = {
  userName: string;
  from: string;
  to: string;
  generatedAt: string;
  // "For my next session": everything still open, plus what was discussed in the range.
  session: { open: SessionNote[]; discussed: SessionNote[] } | null;
  attention: { insights: AttentionInsights; sessions: AttentionSession[] } | null;
  worry: { modules: WorryReportModule[] } | null;
};

// "attention,worry" -> the known sections; empty or unknown -> all of them.
export function parseSections(value: string | null | undefined): TherapySection[] {
  const picked = (value ?? "")
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter((part): part is TherapySection => (THERAPY_SECTIONS as readonly string[]).includes(part));

  return picked.length > 0 ? [...new Set(picked)] : [...THERAPY_SECTIONS];
}

export async function getTherapyReportData(
  user: { id: number; name: string },
  from: string,
  to: string,
  sections: TherapySection[],
): Promise<TherapyReportData> {
  const [notes, sessions, modules] = await Promise.all([
    sections.includes("session") ? getSessionNotesForReport(user.id, from, to) : Promise.resolve(null),
    sections.includes("attention")
      ? getAttentionSessions(user.id, { from, to, limit: ATTENTION_LIMITS.listMax })
      : Promise.resolve(null),
    sections.includes("worry") ? getWorryReportData(user.id, from, to) : Promise.resolve(null),
  ]);

  // Oldest first reads naturally in a report.
  const ordered = sessions ? [...sessions].reverse() : null;

  return {
    userName: user.name,
    from,
    to,
    generatedAt: new Date().toISOString(),
    session: notes ? splitSessionNotes(notes) : null,
    attention: ordered ? { insights: computeAttentionInsights(ordered, from, to), sessions: ordered } : null,
    worry: modules ? { modules } : null,
  };
}
