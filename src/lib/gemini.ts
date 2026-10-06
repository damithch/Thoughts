import { pool } from "@/lib/db/client";
import { chunkText } from "@/lib/chunk";
import {
  EMBEDDING_DIM,
  EMBEDDING_MODEL,
  normalizeVector,
  type EmbeddingTaskType,
} from "@/lib/embedding-config";

const GEMINI_KEY = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY ?? "";
const GEMINI_LLM_MODEL = process.env.GEMINI_LLM_MODEL ?? "gemini-3.6-flash";
// The pgvector schema and every embedding request use the EMBEDDING_DIM constant (1536);
// the env var does not change that. A mismatched value is only worth a warning, not a crash
// that fails `next build` while collecting page data.
const configuredEmbeddingDim = Number(process.env.EMBEDDING_DIM ?? EMBEDDING_DIM);
if (configuredEmbeddingDim !== EMBEDDING_DIM) {
  console.warn(
    `EMBEDDING_DIM=${configuredEmbeddingDim} is ignored; embeddings always use ${EMBEDDING_DIM} dimensions to match the pgvector schema. Remove or update the variable.`,
  );
}
const GEMINI_REQUEST_TIMEOUT_MS = Number(process.env.GEMINI_REQUEST_TIMEOUT_MS ?? 60_000);

// Resilient multi-model fallback array. When the primary model is unavailable
// (rate-limited, overloaded, deprecated, 5xx), the system walks through this
// list until one responds successfully. Uses verified active 2026 models.
const GEMINI_FALLBACK_MODELS = [
  'gemini-3.6-flash',
  'gemini-3.1-flash-lite',
  'gemini-3.5-flash-lite',
  'gemini-flash-lite-latest',
  'gemma-4-26b-a4b-it',
  'gemma-4-31b-it',
  'gemini-pro-latest',
  'gemini-2.0-flash',
  'gemini-flash-latest',
];

// We only support API-key auth in this environment to avoid requiring
// google-auth-library / ADC. Use `GEMINI_API_KEY` or `GOOGLE_API_KEY`.

export type GeminiErrorType = "rate_limit" | "token_exceeded" | "auth_error" | "api_error" | "overloaded";

export class GeminiApiError extends Error {
  statusCode: number;
  errorType: GeminiErrorType;
  rawBody: string;

  constructor(statusCode: number, errorType: GeminiErrorType, message: string, rawBody: string) {
    super(message);
    this.name = "GeminiApiError";
    this.statusCode = statusCode;
    this.errorType = errorType;
    this.rawBody = rawBody;
  }
}

function classifyGeminiError(status: number, body: string): { errorType: GeminiErrorType; message: string } {
  const lower = body.toLowerCase();

  // Try to parse the JSON error body for a more specific message.
  let apiMessage = "";
  try {
    const parsed = JSON.parse(body);
    apiMessage = parsed?.error?.message ?? parsed?.message ?? "";
  } catch {
    // body is not JSON — use raw text
  }

  if (status === 429) {
    return {
      errorType: "rate_limit",
      message: apiMessage || "API rate limit exceeded — please wait a moment and try again.",
    };
  }

  if (status === 401 || status === 403) {
    return {
      errorType: "auth_error",
      message: apiMessage || "API key is invalid or missing permissions. Check your Gemini API key in settings.",
    };
  }

  if (
    status === 400 &&
    (lower.includes("token") || lower.includes("too long") || lower.includes("exceeds") || lower.includes("max_tokens"))
  ) {
    return {
      errorType: "token_exceeded",
      message: apiMessage || "Input is too long for the model to process. Try with shorter text.",
    };
  }

  // "The model is currently experiencing high demand" — Gemini overload (503/429/other).
  if (lower.includes("high demand") || lower.includes("overloaded") || lower.includes("resource exhausted")) {
    return {
      errorType: "overloaded",
      message: apiMessage || "The model is experiencing high demand. Please try again in a few minutes.",
    };
  }

  return {
    errorType: "api_error",
    message: apiMessage || `Gemini API error (HTTP ${status}).`,
  };
}

async function callGenerativeApi(path: string, body: unknown) {
  // Overridable for proxies and local testing; defaults to the public Gemini API.
  const baseUrl = process.env.GEMINI_API_BASE_URL?.replace(/\/+$/, "") || "https://generativelanguage.googleapis.com/v1beta";
  const url = `${baseUrl}/models/${path}`;

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  // Use API key header only.
  if (GEMINI_KEY) {
    headers["X-goog-api-key"] = GEMINI_KEY;
  }

  // Retry transient server errors (503, 429) with exponential backoff.
  const maxAttempts = 3;
  let lastStatus = 0;
  let lastBody = "";

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), GEMINI_REQUEST_TIMEOUT_MS);

    let resp: Response;
    try {
      try {
        resp = await fetch(url, {
          method: "POST",
          headers,
          body: JSON.stringify(body),
          signal: controller.signal,
        });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          throw new GeminiApiError(
            504,
            "api_error",
            `Gemini request timed out after ${GEMINI_REQUEST_TIMEOUT_MS} ms.`,
            "",
          );
        }
        throw error;
      }
      const text = await resp.text();
      lastStatus = resp.status;
      lastBody = text;

      if (resp.ok) {
        try {
          return JSON.parse(text);
        } catch (e) {
          return text;
        }
      }

      // For transient server-side errors, retry after a delay.
      if (resp.status === 503 || resp.status === 429 || resp.status >= 500) {
        const backoffMs = 500 * Math.pow(2, attempt - 1);
        await new Promise((res) => setTimeout(res, backoffMs));
        continue;
      }

      // Non-retriable client error: classify and throw immediately.
      const classified = classifyGeminiError(resp.status, text);
      throw new GeminiApiError(resp.status, classified.errorType, classified.message, text);
    } finally {
      clearTimeout(timeout);
    }
  }

  // All retries exhausted — classify the last error we saw.
  const classified = classifyGeminiError(lastStatus, lastBody);
  throw new GeminiApiError(lastStatus, classified.errorType, classified.message, lastBody);
}

// No cross-model fallback: vectors from different embedding models are not comparable,
// so a query embedded by a fallback model would be matched against the wrong vector space.
export async function embedTexts(texts: string[], taskType: EmbeddingTaskType) {
  if (!texts || texts.length === 0) return [] as number[][];
  const embeddings: number[][] = [];

  for (const t of texts) {
    const json = await callGenerativeApi(`${EMBEDDING_MODEL}:embedContent`, {
      content: {
        parts: [{ text: t }],
      },
      taskType,
      outputDimensionality: EMBEDDING_DIM,
    });

    // Normalized response handling (various shapes across versions)
    let vec: number[] = [];
    if (Array.isArray(json) && typeof json[0] === 'number') {
      vec = json as unknown as number[];
    } else if (Array.isArray((json as any).embeddings)) {
      vec = (json as any).embeddings[0]?.embedding ?? (json as any).embeddings[0]?.vector ?? [];
    } else if (Array.isArray((json as any).data)) {
      vec = (json as any).data[0]?.embedding ?? (json as any).data[0]?.vector ?? [];
    } else if ((json as any).embedding && Array.isArray((json as any).embedding)) {
      vec = (json as any).embedding;
    } else if ((json as any).embedding && Array.isArray((json as any).embedding?.values)) {
      vec = (json as any).embedding.values;
    } else if ((json as any).results && Array.isArray((json as any).results)) {
      const resEmb = (json as any).results[0]?.embedding;
      if (resEmb && Array.isArray(resEmb)) vec = resEmb;
      else if (resEmb && Array.isArray(resEmb.values)) vec = resEmb.values;
    }

    if (vec.length !== EMBEDDING_DIM) {
      throw new Error(
        `Embedding model "${EMBEDDING_MODEL}" returned ${vec.length} dimensions; expected ${EMBEDDING_DIM}.`,
      );
    }

    embeddings.push(normalizeVector(vec));
  }

  return embeddings;
}

export type GenerateOptions = {
  // Sent as systemInstruction, so instructions are kept apart from user-supplied text.
  systemInstruction?: string;
  // Gemini structured output: the response is JSON matching this (OpenAPI-subset) schema.
  responseSchema?: Record<string, unknown>;
};

export async function generateFromPrompt(
  promptOrParts: string | string[],
  maxOutputTokens = 2048,
  temperature = 0.0,
  modelOverride?: string,
  options: GenerateOptions = {},
) {
  // Use the modern generateContent method and the nested `contents.parts` body shape
  const model = modelOverride || GEMINI_LLM_MODEL;
  const path = `${model}:generateContent`;

  const parts = Array.isArray(promptOrParts) ? promptOrParts : [promptOrParts];

  const body = {
    contents: [
      {
        parts: parts.map((p) => ({ text: p })),
      },
    ],
    generationConfig: {
      temperature,
      maxOutputTokens,
      ...(options.responseSchema
        ? { responseMimeType: "application/json", responseSchema: options.responseSchema }
        : {}),
    },
    ...(options.systemInstruction
      ? { systemInstruction: { parts: [{ text: options.systemInstruction }] } }
      : {}),
  } as any;

  const json = await callGenerativeApi(path, body);

  // Response: choices/candidates or output
  // Extract text from candidate/output shapes
  if (Array.isArray((json as any).candidates) && (json as any).candidates[0]) {
    // Newer shapes: candidates[0].content.parts[].text
    const cand = (json as any).candidates[0];
    if (cand.content && Array.isArray(cand.content.parts)) {
      return cand.content.parts.map((p: any) => p.text ?? "").join("");
    }

    return cand.content?.[0]?.text ?? cand.text ?? "";
  }

  if ((json as any).output && Array.isArray((json as any).output)) {
    return (json as any).output
      .map((o: any) => (o.content || []).map((c: any) => c.text ?? "").join("") )
      .join("");
  }

  if ((json as any).candidates && Array.isArray((json as any).candidates) && (json as any).candidates[0]?.content) {
    const parts = json.candidates[0].content.parts ?? [];
    return parts.map((p: any) => p.text ?? "").join("");
  }

  return String(JSON.stringify(json));
}

/**
 * Generate text with automatic multi-model fallback.
 * Tries the primary model first, then walks the GEMINI_FALLBACK_MODELS list
 * on retriable failures (rate_limit, overloaded, 5xx server errors).
 * Non-retriable errors (auth_error, token_exceeded) are thrown immediately.
 */
export async function generateWithFallback(
  promptOrParts: string | string[],
  maxOutputTokens = 2048,
  temperature = 0.0,
  primaryModel?: string,
  options: GenerateOptions = {},
): Promise<{ text: string; modelUsed: string }> {
  const primary = primaryModel || GEMINI_LLM_MODEL;

  // Build the full ordered model list: primary first, then fallbacks (deduped)
  const modelChain = [primary, ...GEMINI_FALLBACK_MODELS.filter((m) => m !== primary)];

  let lastError: GeminiApiError | Error | null = null;

  for (const model of modelChain) {
    try {
      const result = await generateFromPrompt(promptOrParts, maxOutputTokens, temperature, model, options);
      return { text: result, modelUsed: model };
    } catch (err) {
      lastError = err as Error;

      // Only retry on retriable model-availability errors
      if (err instanceof GeminiApiError) {
        const rawLower = err.rawBody.toLowerCase();
        const isModelUnavailable =
          err.statusCode === 404 ||
          rawLower.includes("no longer available") ||
          rawLower.includes("not found") ||
          rawLower.includes("is not available") ||
          rawLower.includes("deprecated");
        const retriable =
          err.errorType === "rate_limit" ||
          err.errorType === "overloaded" ||
          err.statusCode >= 500 ||
          isModelUnavailable;
        if (!retriable) {
          // Auth errors, token-exceeded, etc. won't be fixed by switching models
          throw err;
        }
        console.warn(
          `[Fallback] Model "${model}" failed (${err.errorType}, HTTP ${err.statusCode}${isModelUnavailable ? ", model unavailable" : ""}). Trying next model...`,
        );
        continue;
      }

      // Unknown errors — don't retry across models
      throw err;
    }
  }

  // All models exhausted
  console.error(`[Fallback] All ${modelChain.length} models failed. Last error:`, lastError);
  throw lastError ?? new Error("All fallback models failed.");
}

export async function ingestMaterializedDocument(
  userId: number,
  documentKey: string,
  sourceEntityId: string,
  text: string,
  metadata: Record<string, unknown> = {},
  chunkOptions?: { maxChars?: number; overlap?: number },
) {
  const chunks = chunkText(
    text,
    chunkOptions?.maxChars ?? 1500,
    chunkOptions?.overlap ?? 300,
  );

  if (chunks.length === 0) return 0;

  const embeddings = await embedTexts(chunks, "RETRIEVAL_DOCUMENT");

  // Upsert per-chunk into embeddings table. Store embedding as vector literal string.
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const embedding = embeddings[i] ?? [];
    const embeddingStr = `[${embedding.join(",")}]`;

    await pool.query(
      `
        INSERT INTO embeddings (user_id, document_key, source_entity_id, chunk_index, chunk_text, embedding, metadata, created_at)
        VALUES ($1, $2, $3, $4, $5, $6::vector, $7::jsonb, NOW())
        ON CONFLICT (user_id, document_key, chunk_index)
        DO UPDATE SET chunk_text = EXCLUDED.chunk_text, embedding = EXCLUDED.embedding, metadata = EXCLUDED.metadata, created_at = NOW()
      `,
      [userId, documentKey, sourceEntityId, i, chunk, embeddingStr, JSON.stringify(metadata)],
    );
  }

  // Delete any stale chunks if the document was shortened
  await pool.query(
    `
      DELETE FROM embeddings
      WHERE user_id = $1
        AND document_key = $2
        AND chunk_index >= $3
    `,
    [userId, documentKey, chunks.length],
  );

  return chunks.length;
}
