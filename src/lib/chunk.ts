export function chunkText(text: string, maxChars = 1500, overlap = 200) {
  const chunks: string[] = [];

  if (!text || !text.length) return chunks;

  let start = 0;

  while (start < text.length) {
    const end = Math.min(start + maxChars, text.length);
    const chunk = text.slice(start, end).trim();

    if (chunk) chunks.push(chunk);

    if (end === text.length) break;

    start = Math.max(0, end - overlap);
  }

  return chunks;
}
