import type { RagDocumentKind } from "@/lib/db/types";

export type RagQueryFilters = {
  kinds?: RagDocumentKind[];
  tags?: string[];
  categories?: string[];
  minMood?: number;
  maxMood?: number;
  fromDate?: string;
  toDate?: string;
};

export function parseRagQueryFilters(
  input: RagQueryFilters,
  enabledKinds: RagDocumentKind[],
): { value?: RagQueryFilters; error?: string } {
  const requestedKinds = input.kinds;
  if (requestedKinds !== undefined && (!Array.isArray(requestedKinds) || requestedKinds.length === 0)) {
    return { error: "kinds must be a non-empty array." };
  }

  const kinds = requestedKinds
    ? requestedKinds.filter((kind) => enabledKinds.includes(kind))
    : enabledKinds;
  if (kinds.length === 0) {
    return { error: "No requested document kinds are enabled." };
  }

  for (const field of ["tags", "categories"] as const) {
    const values = input[field];
    if (
      values !== undefined &&
      (!Array.isArray(values) ||
        values.some((value) => typeof value !== "string" || !value.trim()))
    ) {
      return { error: `${field} must contain non-empty strings.` };
    }
  }

  for (const field of ["minMood", "maxMood"] as const) {
    const value = input[field];
    if (
      value !== undefined &&
      (!Number.isFinite(value) || value < 1 || value > 10)
    ) {
      return { error: `${field} must be a number between 1 and 10.` };
    }
  }
  if (input.minMood !== undefined && input.maxMood !== undefined && input.minMood > input.maxMood) {
    return { error: "minMood cannot be greater than maxMood." };
  }

  for (const field of ["fromDate", "toDate"] as const) {
    const value = input[field];
    if (
      value !== undefined &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value)))
    ) {
      return { error: `${field} must be a valid YYYY-MM-DD date.` };
    }
  }
  if (input.fromDate && input.toDate && input.fromDate > input.toDate) {
    return { error: "fromDate cannot be after toDate." };
  }

  return {
    value: {
      ...input,
      kinds,
      tags: input.tags?.map((tag) => tag.trim()).filter(Boolean),
      categories: input.categories?.map((category) => category.trim()).filter(Boolean),
    },
  };
}

export function appendRagFilterClauses(
  clauses: string[],
  values: unknown[],
  filters: RagQueryFilters,
  alias: string,
) {
  if (filters.kinds?.length) {
    values.push(filters.kinds);
    clauses.push(`${alias}.document_kind = ANY($${values.length}::text[])`);
  }

  if (filters.tags?.length) {
    values.push(filters.tags);
    clauses.push(
      `(
        (${alias}.metadata->'tags') ?| $${values.length}::text[]
        OR (${alias}.metadata->'concept_tags') ?| $${values.length}::text[]
      )`,
    );
  }

  if (filters.categories?.length) {
    values.push(filters.categories);
    clauses.push(`${alias}.metadata->>'category' = ANY($${values.length}::text[])`);
  }

  if (filters.minMood !== undefined) {
    values.push(filters.minMood);
    clauses.push(
      `(${alias}.metadata->>'mood') ~ '^[0-9]+(\\.[0-9]+)?$' AND (${alias}.metadata->>'mood')::numeric >= $${values.length}`,
    );
  }

  if (filters.maxMood !== undefined) {
    values.push(filters.maxMood);
    clauses.push(
      `(${alias}.metadata->>'mood') ~ '^[0-9]+(\\.[0-9]+)?$' AND (${alias}.metadata->>'mood')::numeric <= $${values.length}`,
    );
  }

  if (filters.fromDate) {
    values.push(filters.fromDate);
    clauses.push(`${alias}.source_date >= $${values.length}::date`);
  }

  if (filters.toDate) {
    values.push(filters.toDate);
    clauses.push(`${alias}.source_date <= $${values.length}::date`);
  }
}
