import { pool } from "@/lib/db/client";
import { ensureInitialized } from "@/lib/db/init";
import type { RagDocumentKind, SupportContact, UserSettings } from "@/lib/db/types";
import { DEFAULT_MEDITATION_STEPS, MEDITATION_STEP_LIMITS } from "@/lib/attention/rules";
import { parseClockTime } from "@/lib/tasks/validation";

const ALL_RAG_KINDS: RagDocumentKind[] = [
  "thought",
  "book_idea",
  "conversation_summary",
  "ba_entry",
  "day_note",
  "daily_rollup",
];

// Starting coping steps for the support plan; the user edits them to their own.
export const DEFAULT_COPING_STEPS = [
  "Eat something small, even if you're not hungry",
  "Message or call someone you trust",
  "Breathe slowly for two minutes",
  "Step outside or into daylight for a few minutes",
  "Decide nothing tonight. Look at it again in daylight, after food and rest",
];

export const SUPPORT_LIMITS = { steps: 8, stepLength: 140, contacts: 3, nameLength: 60 };

export const DEFAULT_USER_SETTINGS: UserSettings = {
  // RAG Retrieval
  rag_default_k: 6,
  rag_k_thought: 10,
  rag_k_summary: 10,
  rag_chunk_size: 1500,
  rag_chunk_overlap: 200,
  rag_enabled_kinds: ALL_RAG_KINDS,
  rag_exclude_hidden_thoughts: true,
  rag_custom_prompt: "",

  // AI Agent
  agent_temperature: 0.1,
  agent_max_tokens: 1024,
  agent_custom_prompt: "",
  agent_default_tag: "agent",

  // Smart Capture
  smart_capture_temperature: 0.3,
  smart_capture_max_tokens: 2048,

  // Live Context Panel
  live_context_enabled: true,
  live_context_debounce_ms: 600,
  live_context_min_length: 20,
  live_context_k: 3,

  // Model Selection
  llm_model: "gemini-3.6-flash",

  // Support on hard days
  support_enabled: true,
  support_coping_steps: DEFAULT_COPING_STEPS,
  support_contacts: [],
  support_helpline_name: "National Mental Health Helpline",
  support_helpline_phone: "1926",

  // Phone reminders
  reminders_evening_enabled: true,
  reminders_evening_time: "21:30",
  reminders_thinking_enabled: true,
  reminders_morning_enabled: true,
  reminders_morning_time: "09:00",
  reminders_habits_enabled: true,
  reminders_quiet_enabled: true,
  reminders_quiet_start: "23:00",
  reminders_quiet_end: "07:00",

  // Attention training
  attention_observe_seconds: DEFAULT_MEDITATION_STEPS.observe,
  attention_belly_seconds: DEFAULT_MEDITATION_STEPS.belly,
  attention_body_seconds: DEFAULT_MEDITATION_STEPS.body,

  // Server push
  push_support_alerts: true,
  push_last_support_trigger: "",
};

export async function getUserSettings(userId: number): Promise<UserSettings> {
  await ensureInitialized();

  const { rows } = await pool.query<{ settings: Record<string, unknown> }>(
    `SELECT settings FROM user_settings WHERE user_id = $1`,
    [userId],
  );

  if (rows.length === 0 || !rows[0].settings) {
    return { ...DEFAULT_USER_SETTINGS };
  }

  const stored = rows[0].settings;
  const ragChunkSize = clampInt(
    stored.rag_chunk_size,
    500,
    3000,
    DEFAULT_USER_SETTINGS.rag_chunk_size,
  );
  const ragChunkOverlap = Math.min(
    clampInt(stored.rag_chunk_overlap, 0, 500, DEFAULT_USER_SETTINGS.rag_chunk_overlap),
    ragChunkSize - 1,
  );

  // Merge stored values over defaults, ensuring every key has a valid value.
  return {
    rag_default_k: clampInt(stored.rag_default_k, 1, 50, DEFAULT_USER_SETTINGS.rag_default_k),
    rag_k_thought: clampInt(stored.rag_k_thought, 1, 50, DEFAULT_USER_SETTINGS.rag_k_thought),
    rag_k_summary: clampInt(stored.rag_k_summary, 1, 50, DEFAULT_USER_SETTINGS.rag_k_summary),
    rag_chunk_size: ragChunkSize,
    rag_chunk_overlap: ragChunkOverlap,
    rag_enabled_kinds: parseRagKinds(stored.rag_enabled_kinds),
    rag_exclude_hidden_thoughts: safeBool(
      stored.rag_exclude_hidden_thoughts,
      DEFAULT_USER_SETTINGS.rag_exclude_hidden_thoughts,
    ),
    rag_custom_prompt: safeString(stored.rag_custom_prompt, DEFAULT_USER_SETTINGS.rag_custom_prompt),

    agent_temperature: clampFloat(stored.agent_temperature, 0, 1, DEFAULT_USER_SETTINGS.agent_temperature),
    agent_max_tokens: clampInt(stored.agent_max_tokens, 256, 4096, DEFAULT_USER_SETTINGS.agent_max_tokens),
    agent_custom_prompt: safeString(stored.agent_custom_prompt, DEFAULT_USER_SETTINGS.agent_custom_prompt),
    agent_default_tag: safeString(stored.agent_default_tag, DEFAULT_USER_SETTINGS.agent_default_tag),

    smart_capture_temperature: clampFloat(stored.smart_capture_temperature, 0, 1, DEFAULT_USER_SETTINGS.smart_capture_temperature),
    smart_capture_max_tokens: clampInt(stored.smart_capture_max_tokens, 512, 4096, DEFAULT_USER_SETTINGS.smart_capture_max_tokens),

    live_context_enabled: safeBool(stored.live_context_enabled, DEFAULT_USER_SETTINGS.live_context_enabled),
    live_context_debounce_ms: clampInt(stored.live_context_debounce_ms, 200, 2000, DEFAULT_USER_SETTINGS.live_context_debounce_ms),
    live_context_min_length: clampInt(stored.live_context_min_length, 10, 100, DEFAULT_USER_SETTINGS.live_context_min_length),
    live_context_k: clampInt(stored.live_context_k, 1, 10, DEFAULT_USER_SETTINGS.live_context_k),

    llm_model: safeString(stored.llm_model, DEFAULT_USER_SETTINGS.llm_model),

    support_enabled: safeBool(stored.support_enabled, DEFAULT_USER_SETTINGS.support_enabled),
    support_coping_steps: parseCopingSteps(stored.support_coping_steps),
    support_contacts: parseSupportContacts(stored.support_contacts),
    support_helpline_name: safeString(stored.support_helpline_name, DEFAULT_USER_SETTINGS.support_helpline_name),
    support_helpline_phone: normalizePhone(stored.support_helpline_phone) ?? DEFAULT_USER_SETTINGS.support_helpline_phone,

    reminders_evening_enabled: safeBool(stored.reminders_evening_enabled, DEFAULT_USER_SETTINGS.reminders_evening_enabled),
    reminders_evening_time: parseClockTime(stored.reminders_evening_time) ?? DEFAULT_USER_SETTINGS.reminders_evening_time,
    reminders_thinking_enabled: safeBool(stored.reminders_thinking_enabled, DEFAULT_USER_SETTINGS.reminders_thinking_enabled),
    reminders_morning_enabled: safeBool(stored.reminders_morning_enabled, DEFAULT_USER_SETTINGS.reminders_morning_enabled),
    reminders_morning_time: parseClockTime(stored.reminders_morning_time) ?? DEFAULT_USER_SETTINGS.reminders_morning_time,
    reminders_habits_enabled: safeBool(stored.reminders_habits_enabled, DEFAULT_USER_SETTINGS.reminders_habits_enabled),
    reminders_quiet_enabled: safeBool(stored.reminders_quiet_enabled, DEFAULT_USER_SETTINGS.reminders_quiet_enabled),
    reminders_quiet_start: parseClockTime(stored.reminders_quiet_start) ?? DEFAULT_USER_SETTINGS.reminders_quiet_start,
    reminders_quiet_end: parseClockTime(stored.reminders_quiet_end) ?? DEFAULT_USER_SETTINGS.reminders_quiet_end,

    attention_observe_seconds: clampInt(stored.attention_observe_seconds, MEDITATION_STEP_LIMITS.min, MEDITATION_STEP_LIMITS.max, DEFAULT_USER_SETTINGS.attention_observe_seconds),
    attention_belly_seconds: clampInt(stored.attention_belly_seconds, MEDITATION_STEP_LIMITS.min, MEDITATION_STEP_LIMITS.max, DEFAULT_USER_SETTINGS.attention_belly_seconds),
    attention_body_seconds: clampInt(stored.attention_body_seconds, MEDITATION_STEP_LIMITS.min, MEDITATION_STEP_LIMITS.max, DEFAULT_USER_SETTINGS.attention_body_seconds),

    push_support_alerts: safeBool(stored.push_support_alerts, DEFAULT_USER_SETTINGS.push_support_alerts),
    push_last_support_trigger: safeString(stored.push_last_support_trigger, DEFAULT_USER_SETTINGS.push_last_support_trigger),
  };
}

export async function upsertUserSettings(
  userId: number,
  patch: Partial<UserSettings>,
): Promise<UserSettings> {
  await ensureInitialized();

  // Sanitize the patch before storing
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined) {
      sanitized[key] = value;
    }
  }

  await pool.query(
    `
      INSERT INTO user_settings (user_id, settings, updated_at)
      VALUES ($1, $2::jsonb, NOW())
      ON CONFLICT (user_id)
      DO UPDATE SET
        settings = user_settings.settings || $2::jsonb,
        updated_at = NOW()
    `,
    [userId, JSON.stringify(sanitized)],
  );

  return getUserSettings(userId);
}

// --- Validation helpers ---

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  const int = Math.round(value);
  return Math.max(min, Math.min(max, int));
}

function clampFloat(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, value));
}

function safeString(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  return value;
}

function safeBool(value: unknown, fallback: boolean): boolean {
  if (typeof value !== "boolean") return fallback;
  return value;
}

export function parseCopingSteps(value: unknown): string[] {
  if (!Array.isArray(value)) return DEFAULT_COPING_STEPS;

  return value
    .filter((step): step is string => typeof step === "string")
    .map((step) => step.trim().slice(0, SUPPORT_LIMITS.stepLength))
    .filter(Boolean)
    .slice(0, SUPPORT_LIMITS.steps);
}

// Digits with an optional leading +, keeping spaces, dashes and brackets for readability.
export function normalizePhone(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const phone = value.trim();

  return /^\+?[0-9][0-9 ()-]{1,18}$/.test(phone) ? phone : null;
}

export function parseSupportContacts(value: unknown): SupportContact[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((contact) => {
      if (!contact || typeof contact !== "object") return null;
      const { name, phone } = contact as Record<string, unknown>;
      const cleanName = typeof name === "string" ? name.trim().slice(0, SUPPORT_LIMITS.nameLength) : "";
      const cleanPhone = normalizePhone(phone);

      return cleanName && cleanPhone ? { name: cleanName, phone: cleanPhone } : null;
    })
    .filter((contact): contact is SupportContact => contact !== null)
    .slice(0, SUPPORT_LIMITS.contacts);
}

function parseRagKinds(value: unknown): RagDocumentKind[] {
  if (!Array.isArray(value)) return ALL_RAG_KINDS;
  const valid = value.filter(
    (v): v is RagDocumentKind =>
      typeof v === "string" && ALL_RAG_KINDS.includes(v as RagDocumentKind),
  );
  return valid.length > 0 ? valid : ALL_RAG_KINDS;
}
