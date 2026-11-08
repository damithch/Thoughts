// Lays journal pages out on the dashboard's thought sphere. Pure (no DB, no DOM) so it can be
// unit tested; the page passes plain data in and the client component only draws the result.
//
// - Each page gets a mood band (low / steady / light) from its 1-10 mood.
// - Each page gets one theme: the most specific of its tags that is common across the archive
//   (falling back to its category). Pages with the same theme sit in the same region of the
//   sphere and are joined by a thread to their nearest neighbour.
// - Positions are seeded by the thought id, so a page stays in the same place on every load.

export type SphereInput = {
  id: number;
  title: string;
  mood: number;
  tags: string[];
  category: string;
  date: string; // YYYY-MM-DD (Colombo)
};

export type MoodBand = "low" | "steady" | "light";

export type SphereNode = {
  id: number;
  title: string;
  date: string;
  mood: number;
  band: MoodBand;
  theme: string;
  today: boolean;
  p: [number, number, number];
};

export type SphereLayout = {
  nodes: SphereNode[];
  arcs: Array<[number, number]>; // indexes into nodes
  themes: Array<{ name: string; count: number }>;
  bands: Record<MoodBand, number>;
};

export const OTHER_THEME = "other";
const MAX_THEMES = 8;
const MIN_THEME_COUNT = 2;

export function moodBand(mood: number): MoodBand {
  if (mood <= 3) return "low";
  if (mood >= 7) return "light";
  return "steady";
}

function clean(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function categoryTheme(category: string) {
  return clean(category.split(/[,/]/)[0] ?? "");
}

function candidateThemes(input: SphereInput) {
  const tags = input.tags.map(clean).filter(Boolean);
  if (tags.length > 0) return Array.from(new Set(tags));
  const fallback = categoryTheme(input.category);
  return fallback ? [fallback] : [];
}

// The common themes: the most frequent tags (or categories) across all pages.
export function pickThemes(inputs: SphereInput[]) {
  const counts = new Map<string, number>();
  for (const input of inputs) {
    for (const theme of candidateThemes(input)) {
      counts.set(theme, (counts.get(theme) ?? 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .filter(([, count]) => count >= MIN_THEME_COUNT)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, MAX_THEMES)
    .map(([name, count]) => ({ name, count }));
}

// Small deterministic PRNG (Park-Miller), seeded per thought.
function seeded(seed: number) {
  let state = (Math.abs(Math.floor(seed)) % 2147483646) + 1;
  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

function normalize(v: [number, number, number]): [number, number, number] {
  const length = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / length, v[1] / length, v[2] / length];
}

function dot(a: [number, number, number], b: [number, number, number]) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

// Evenly spaced points on a sphere (Fibonacci lattice).
function fibonacciPoint(index: number, total: number): [number, number, number] {
  const golden = Math.PI * (3 - Math.sqrt(5));
  const y = total === 1 ? 0 : 1 - (index / (total - 1)) * 2;
  const radius = Math.sqrt(Math.max(0, 1 - y * y));
  const theta = golden * index;
  return [Math.cos(theta) * radius, y * 0.85, Math.sin(theta) * radius];
}

export function buildSphereLayout(inputs: SphereInput[], today: string): SphereLayout {
  const themeList = pickThemes(inputs);
  const themeRank = new Map(themeList.map((theme, index) => [theme.name, index]));
  const centers = themeList.map((_, index) => normalize(fibonacciPoint(index, themeList.length)));

  const nodes: SphereNode[] = inputs.map((input) => {
    const rnd = seeded(input.id * 7919 + 13);
    // Most specific common theme: the known theme with the fewest pages.
    const known = candidateThemes(input).filter((theme) => themeRank.has(theme));
    known.sort((a, b) => (themeRank.get(b) ?? 0) - (themeRank.get(a) ?? 0));
    const theme = known[0] ?? OTHER_THEME;

    let p: [number, number, number];
    const rank = themeRank.get(theme);
    if (rank === undefined) {
      const y = rnd() * 2 - 1;
      const angle = rnd() * Math.PI * 2;
      const r = Math.sqrt(1 - y * y);
      p = [Math.cos(angle) * r, y, Math.sin(angle) * r];
    } else {
      const c = centers[rank];
      const spread = 0.55;
      p = normalize([
        c[0] + (rnd() * 2 - 1) * spread,
        c[1] + (rnd() * 2 - 1) * spread,
        c[2] + (rnd() * 2 - 1) * spread,
      ]);
    }

    return {
      id: input.id,
      title: input.title,
      date: input.date,
      mood: input.mood,
      band: moodBand(input.mood),
      theme,
      today: input.date === today,
      p,
    };
  });

  // Join each themed page to its nearest page of the same theme.
  const arcs: Array<[number, number]> = [];
  const seen = new Set<string>();
  nodes.forEach((node, i) => {
    if (node.theme === OTHER_THEME) return;
    let best = -1;
    let bestDot = -2;
    nodes.forEach((other, j) => {
      if (i === j || other.theme !== node.theme) return;
      const d = dot(node.p, other.p);
      if (d > bestDot && d < 0.9995) {
        bestDot = d;
        best = j;
      }
    });
    if (best < 0) return;
    const key = i < best ? `${i}-${best}` : `${best}-${i}`;
    if (seen.has(key)) return;
    seen.add(key);
    arcs.push([i, best]);
  });

  const bands: Record<MoodBand, number> = { low: 0, steady: 0, light: 0 };
  for (const node of nodes) bands[node.band] += 1;

  const themeCounts = new Map<string, number>();
  for (const node of nodes) {
    if (node.theme !== OTHER_THEME) themeCounts.set(node.theme, (themeCounts.get(node.theme) ?? 0) + 1);
  }
  const themes = themeList
    .map((theme) => ({ name: theme.name, count: themeCounts.get(theme.name) ?? 0 }))
    .filter((theme) => theme.count > 0)
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  return { nodes, arcs, themes, bands };
}
