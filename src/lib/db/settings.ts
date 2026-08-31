import { pool } from "@/lib/db/client";
import { ensureInitialized } from "@/lib/db/init";
import type { RagDocumentKind, UserSettings } from "@/lib/db/types";

const ALL_RAG_KINDS: RagDocumentKind[] = [
  "thought",
  "book_idea",
  "conversation_summary",
  "ba_entry",
  "day_note",
  "daily_rollup",
];

export const DEFAULT_USER_SETTINGS: UserSettings = {
  // RAG Retrieval
  rag_default_k: 6,
  rag_k_thought: 10,
  rag_k_summary: 10,
  rag_chunk_size: 1500,
  rag_chunk_overlap: 200,
  rag_enabled_kinds: ALL_RAG_KINDS,
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

  // Merge stored values over defaults, ensuring every key has a valid value.
  return {
    rag_default_k: clampInt(stored.rag_default_k, 1, 50, DEFAULT_USER_SETTINGS.rag_default_k),
    rag_k_thought: clampInt(stored.rag_k_thought, 1, 50, DEFAULT_USER_SETTINGS.rag_k_thought),
    rag_k_summary: clampInt(stored.rag_k_summary, 1, 50, DEFAULT_USER_SETTINGS.rag_k_summary),
    rag_chunk_size: clampInt(stored.rag_chunk_size, 500, 3000, DEFAULT_USER_SETTINGS.rag_chunk_size),
    rag_chunk_overlap: clampInt(stored.rag_chunk_overlap, 0, 500, DEFAULT_USER_SETTINGS.rag_chunk_overlap),
    rag_enabled_kinds: parseRagKinds(stored.rag_enabled_kinds),
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

function parseRagKinds(value: unknown): RagDocumentKind[] {
  if (!Array.isArray(value)) return ALL_RAG_KINDS;
  const valid = value.filter(
    (v): v is RagDocumentKind =>
      typeof v === "string" && ALL_RAG_KINDS.includes(v as RagDocumentKind),
  );
  return valid.length > 0 ? valid : ALL_RAG_KINDS;
}
