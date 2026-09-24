type DocumentResult = {
  document_key: string;
  distance?: number;
  keyword_rank?: number;
};

export function rankHybridResults<T extends DocumentResult>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const score = (row: T) =>
      (row.keyword_rank ?? 0) * 0.35 - (row.distance ?? 1) * 0.65;
    return score(b) - score(a);
  });
}

export function selectDiverseResults<T extends DocumentResult>(
  rows: T[],
  limit: number,
  maxPerDocument = 2,
): T[] {
  const selected: T[] = [];
  const deferred: T[] = [];
  const counts = new Map<string, number>();

  for (const row of rows) {
    const count = counts.get(row.document_key) ?? 0;

    if (count < maxPerDocument) {
      selected.push(row);
      counts.set(row.document_key, count + 1);
    } else {
      deferred.push(row);
    }

    if (selected.length === limit) {
      break;
    }
  }

  if (selected.length < limit) {
    for (const row of deferred) {
      selected.push(row);
      if (selected.length === limit) {
        break;
      }
    }
  }

  return selected;
}
