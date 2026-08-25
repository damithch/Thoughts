import { pool } from "@/lib/db/client";
import { chunkText } from "@/lib/chunk";

const GEMINI_KEY = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY ?? "";
// Use current Gemini naming by default; allow overrides via env.
const GEMINI_EMBEDDING_MODEL = process.env.GEMINI_EMBEDDING_MODEL ?? "gemini-embedding-001";
const GEMINI_LLM_MODEL = process.env.GEMINI_LLM_MODEL ?? "gemini-flash-latest";
const EMBEDDING_DIM = Number(process.env.EMBEDDING_DIM ?? 1536);

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
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${path}`;

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
    const resp = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

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
  }

  // All retries exhausted — classify the last error we saw.
  const classified = classifyGeminiError(lastStatus, lastBody);
  throw new GeminiApiError(lastStatus, classified.errorType, classified.message, lastBody);
}

export async function embedTexts(texts: string[]) {
  if (!texts || texts.length === 0) return [] as number[][];
  const embeddings: number[][] = [];

  // Use the modern Gemini embed method name and nested body shape. Send one
  // request per text chunk to avoid array/proto shape issues observed earlier.
  const path = `${GEMINI_EMBEDDING_MODEL}:embedContent`;

  for (const t of texts) {
    try {
      const body = {
        content: {
          parts: [{ text: t }],
        },
      };

      const json = await callGenerativeApi(path, body);

      // Normalized response handling (various shapes across versions)
      // Some API variants return a bare numeric array as the top-level body.
      if (Array.isArray(json) && typeof json[0] === 'number') {
        embeddings.push(json as unknown as number[]);
      } else if (Array.isArray((json as any).embeddings)) {
        embeddings.push((json as any).embeddings[0]?.embedding ?? (json as any).embeddings[0]?.vector ?? []);
      } else if (Array.isArray((json as any).data)) {
        embeddings.push((json as any).data[0]?.embedding ?? (json as any).data[0]?.vector ?? []);
      } else if ((json as any).embedding && Array.isArray((json as any).embedding)) {
        embeddings.push((json as any).embedding);
      } else if ((json as any).embedding && Array.isArray((json as any).embedding?.values)) {
        // Some responses nest the numeric array under `embedding.values`.
        embeddings.push((json as any).embedding.values);
      } else if ((json as any).results && Array.isArray((json as any).results)) {
        // Some variants return results with embedding inside
        const resEmb = (json as any).results[0]?.embedding;
        if (resEmb && Array.isArray(resEmb)) embeddings.push(resEmb);
        else if (resEmb && Array.isArray(resEmb.values)) embeddings.push(resEmb.values);
        else embeddings.push([]);
      } else {
        embeddings.push([]);
      }
    } catch (e) {
      console.error("Embedding request failed for a chunk:", e);
      embeddings.push([]);
    }
  }

  // Normalize embeddings to the configured dimension: truncate or pad with zeros.
  const dim = EMBEDDING_DIM || 1536;
  const normalized = embeddings.map((vec) => {
    if (!vec || !Array.isArray(vec) || vec.length === 0) {
      return new Array(dim).fill(0);
    }

    if (vec.length === dim) return vec;

    if (vec.length > dim) return vec.slice(0, dim);

    // pad with zeros
    const out = vec.slice();
    while (out.length < dim) out.push(0);
    return out;
  });

  return normalized;
}

export async function generateFromPrompt(promptOrParts: string | string[], maxOutputTokens = 2048, temperature = 0.0, modelOverride?: string) {
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
    },
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

export async function ingestMaterializedDocument(userId: number, documentKey: string, sourceEntityId: string, text: string, metadata: Record<string, unknown> = {}) {
  const chunks = chunkText(text, 1500, 300);

  if (chunks.length === 0) return 0;

  const embeddings = await embedTexts(chunks);

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
