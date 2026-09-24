export function chunkText(text: string, maxChars = 1500, overlap = 200) {
  const chunks: string[] = [];

  if (!text || !text.length) return chunks;

  const safeMaxChars = Number.isInteger(maxChars) && maxChars > 0 ? maxChars : 1500;
  const safeOverlap =
    Number.isInteger(overlap) && overlap >= 0
      ? Math.min(overlap, safeMaxChars - 1)
      : Math.min(200, safeMaxChars - 1);
  let start = 0;

  while (start < text.length) {
    const end = Math.min(start + safeMaxChars, text.length);
    const chunk = text.slice(start, end).trim();

    if (chunk) chunks.push(chunk);

    if (end === text.length) break;

    start = end - safeOverlap;
  }

  return chunks;
}
