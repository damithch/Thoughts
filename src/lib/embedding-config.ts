export const EMBEDDING_MODEL = process.env.GEMINI_EMBEDDING_MODEL ?? "gemini-embedding-001";
export const EMBEDDING_DIM = 1536;

// Part of every document's content hash: changing it re-embeds all documents on the next sync.
export const EMBEDDING_INDEX_VERSION = `${EMBEDDING_MODEL}:${EMBEDDING_DIM}:normalized:task-type`;

export type EmbeddingTaskType = "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY";

// gemini-embedding-001 only returns unit-length vectors at its full 3072 dimensions.
export function normalizeVector(vector: number[]): number[] {
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (!Number.isFinite(norm) || norm === 0) return vector;
  return vector.map((value) => value / norm);
}
