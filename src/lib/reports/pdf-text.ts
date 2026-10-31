// The PDF's built-in fonts (Helvetica) only cover the WinAnsi character set. Map common symbols to
// close equivalents and replace anything else, so a stray emoji can't break the whole report.

const REPLACEMENTS: Record<string, string> = {
  "→": "->",
  "←": "<-",
  "↑": "^",
  "↓": "v",
  "✓": "v",
  "✔": "v",
  "✗": "x",
  "≥": ">=",
  "≤": "<=",
  "≈": "~",
  "×": "x",
  "−": "-",
  " ": " ",
  "\t": "  ",
};

// Characters above 0xFF that WinAnsi (Windows-1252) does include.
const WIN_ANSI_EXTRAS = new Set("€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ");

export function toPdfText(value: string | null | undefined) {
  let out = "";
  for (const char of (value ?? "").normalize("NFC")) {
    if (REPLACEMENTS[char] !== undefined) {
      out += REPLACEMENTS[char];
      continue;
    }
    const code = char.codePointAt(0) ?? 0;
    if (char === "\n" || (code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff) || WIN_ANSI_EXTRAS.has(char)) {
      out += char;
    } else if (code < 0x20) {
      out += " ";
    } else if (code >= 0x1f000 || (code >= 0x2600 && code <= 0x27bf) || (code >= 0xfe00 && code <= 0xfe0f) || code === 0x200d) {
      // Emoji, pictographs, variation selectors and joiners: leave them out.
    } else {
      out += "?";
    }
  }
  return out;
}

// Greedy word wrap using a width-measuring function (from the PDF font).
export function wrapText(text: string, maxWidth: number, measure: (text: string) => number): string[] {
  const lines: string[] = [];

  for (const paragraph of text.split("\n")) {
    const words = paragraph.split(/ +/).filter((word) => word.length > 0);
    if (words.length === 0) {
      lines.push("");
      continue;
    }

    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (measure(candidate) <= maxWidth) {
        line = candidate;
        continue;
      }
      if (line) lines.push(line);
      // A single word wider than the line is split by characters.
      let rest = word;
      while (measure(rest) > maxWidth && rest.length > 1) {
        let cut = rest.length - 1;
        while (cut > 1 && measure(rest.slice(0, cut)) > maxWidth) cut -= 1;
        lines.push(rest.slice(0, cut));
        rest = rest.slice(cut);
      }
      line = rest;
    }
    lines.push(line);
  }

  return lines;
}
