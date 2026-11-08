"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

import type { MoodBand, SphereLayout, SphereNode } from "@/lib/thought-sphere";

const BAND_COLORS: Record<MoodBand, [number, number, number]> = {
  steady: [14, 116, 144], // cyan-700
  light: [5, 150, 105], // emerald-600
  low: [180, 83, 9], // amber-700
};

const BAND_LABELS: Record<MoodBand, string> = {
  steady: "Steady",
  light: "Light",
  low: "Low",
};

const GRAIN = 1500;

type Projected = SphereNode & { sx: number; sy: number; sz: number };

function rgba(c: [number, number, number], a: number) {
  return `rgba(${c[0]},${c[1]},${c[2]},${a.toFixed(3)})`;
}

function dot(a: number[], b: number[]) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function formatDate(date: string) {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

function titleCase(value: string) {
  return value.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function ThoughtSphere({ layout }: { layout: SphereLayout }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    const tip = tipRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !stage || !tip || !ctx) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const nodes: Projected[] = layout.nodes.map((node) => ({ ...node, sx: 0, sy: 0, sz: -1 }));

    // Faint "paper grain" dots spread evenly over the sphere.
    const grain: number[][] = [];
    const golden = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < GRAIN; i += 1) {
      const y = 1 - (i / (GRAIN - 1)) * 2;
      const r = Math.sqrt(1 - y * y);
      grain.push([Math.cos(golden * i) * r, y, Math.sin(golden * i) * r]);
    }

    let width = 0;
    let height = 0;
    let radius = 0;
    const resize = () => {
      const rect = stage.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = rect.width;
      height = rect.height;
      radius = width * 0.36;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(stage);

    let rotation = 0;
    const tilt = 0.38;
    let pageVisible = !document.hidden;
    let onScreen = true;
    let dragX: number | null = null;
    let dragDistance = 0;
    let hover: Projected | null = null;
    let last = performance.now();
    let frameId = 0;

    const project = (p: number[]) => {
      const c = Math.cos(rotation);
      const s = Math.sin(rotation);
      const x = p[0] * c + p[2] * s;
      const z = -p[0] * s + p[2] * c;
      const ct = Math.cos(tilt);
      const st = Math.sin(tilt);
      const y2 = p[1] * ct - z * st;
      const z2 = p[1] * st + z * ct;
      return [width / 2 + x * radius, height / 2 + y2 * radius, z2];
    };

    const draw = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      if (!reduceMotion && dragX === null && !hover) rotation += dt * 0.12;
      ctx.clearRect(0, 0, width, height);
      const cx = width / 2;
      const cy = height / 2;

      // Sphere body.
      const body = ctx.createRadialGradient(cx - radius * 0.35, cy - radius * 0.4, radius * 0.1, cx, cy, radius * 1.05);
      body.addColorStop(0, "rgba(255,255,255,.95)");
      body.addColorStop(0.65, "rgba(236,253,245,.75)");
      body.addColorStop(1, "rgba(167,243,208,.55)");
      ctx.save();
      ctx.shadowColor = "rgba(48,84,53,.18)";
      ctx.shadowBlur = 60;
      ctx.shadowOffsetY = 26;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fillStyle = body;
      ctx.fill();
      ctx.restore();
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(6,78,59,.12)";
      ctx.lineWidth = 1;
      ctx.stroke();

      // Grain.
      for (const point of grain) {
        const q = project(point);
        if (q[2] < -0.05) continue;
        ctx.fillStyle = `rgba(6,95,70,${(0.12 + 0.38 * q[2]).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(q[0], q[1], 1.1 + q[2] * 0.7, 0, Math.PI * 2);
        ctx.fill();
      }

      // Threads between pages that share a theme, lifted slightly off the surface.
      ctx.lineWidth = 1.2;
      for (const [from, to] of layout.arcs) {
        const a = nodes[from].p;
        const b = nodes[to].p;
        const omega = Math.acos(Math.max(-1, Math.min(1, dot(a, b))));
        const sinOmega = Math.sin(omega);
        if (sinOmega < 1e-4) continue;
        ctx.beginPath();
        let depth = 0;
        for (let step = 0; step <= 24; step += 1) {
          const t = step / 24;
          const f1 = Math.sin((1 - t) * omega) / sinOmega;
          const f2 = Math.sin(t * omega) / sinOmega;
          const lift = 1 + 0.22 * Math.sin(Math.PI * t) * (omega / 1.5);
          const q = project([(a[0] * f1 + b[0] * f2) * lift, (a[1] * f1 + b[1] * f2) * lift, (a[2] * f1 + b[2] * f2) * lift]);
          depth += q[2];
          if (step === 0) ctx.moveTo(q[0], q[1]);
          else ctx.lineTo(q[0], q[1]);
        }
        const avg = depth / 25;
        if (avg < -0.15) continue;
        ctx.strokeStyle = rgba(BAND_COLORS[nodes[from].band], Math.max(0, 0.15 + 0.4 * avg));
        ctx.stroke();
      }

      // Pages, drawn back to front.
      const visible: Projected[] = [];
      for (const node of nodes) {
        const q = project(node.p);
        node.sx = q[0];
        node.sy = q[1];
        node.sz = q[2];
        if (q[2] > -0.1) visible.push(node);
      }
      visible.sort((a, b) => a.sz - b.sz);
      const pulse = reduceMotion ? 0.6 : 0.5 + 0.5 * Math.sin(now / 600);
      for (const node of visible) {
        const color = BAND_COLORS[node.band];
        const alpha = 0.35 + 0.65 * Math.max(0, node.sz);
        const r = 3.2 + node.sz * 2.2;
        const glow = ctx.createRadialGradient(node.sx, node.sy, 0, node.sx, node.sy, r * 4);
        glow.addColorStop(0, rgba(color, 0.35 * alpha));
        glow.addColorStop(1, rgba(color, 0));
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(node.sx, node.sy, r * 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = rgba(color, alpha);
        ctx.beginPath();
        ctx.arc(node.sx, node.sy, r, 0, Math.PI * 2);
        ctx.fill();
        if (node.today) {
          ctx.strokeStyle = rgba(color, (0.6 * pulse + 0.15) * alpha);
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(node.sx, node.sy, r + 4 + pulse * 8, 0, Math.PI * 2);
          ctx.stroke();
        }
        if (node === hover) {
          ctx.strokeStyle = "#022c22";
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(node.sx, node.sy, r + 4, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      if (hover && hover.sz > -0.1) {
        tip.style.left = `${hover.sx}px`;
        tip.style.top = `${hover.sy}px`;
        tip.style.opacity = "1";
      } else {
        tip.style.opacity = "0";
      }

      frameId = pageVisible && onScreen ? requestAnimationFrame(draw) : 0;
    };

    const start = () => {
      if (frameId === 0 && pageVisible && onScreen) {
        last = performance.now();
        frameId = requestAnimationFrame(draw);
      }
    };
    start();

    const setHover = (node: Projected | null) => {
      if (node === hover) return;
      hover = node;
      if (node) {
        tip.replaceChildren();
        const heading = document.createElement("b");
        heading.textContent = `${formatDate(node.date)}${node.today ? " · today" : ""}`;
        const title = document.createElement("span");
        title.className = "block max-w-[16rem] truncate";
        title.textContent = node.title;
        const meta = document.createElement("span");
        meta.className = "block text-emerald-200/80";
        meta.textContent = `${BAND_LABELS[node.band]} · mood ${node.mood}/10 · ${titleCase(node.theme)}`;
        tip.append(heading, title, meta);
      }
    };

    const pointerPosition = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      return [event.clientX - rect.left, event.clientY - rect.top];
    };

    const nearestNode = (x: number, y: number) => {
      let best: Projected | null = null;
      let bestDistance = 18 * 18;
      for (const node of nodes) {
        if (node.sz < -0.1) continue;
        const dx = node.sx - x;
        const dy = node.sy - y;
        const distance = dx * dx + dy * dy;
        if (distance < bestDistance) {
          bestDistance = distance;
          best = node;
        }
      }
      return best;
    };

    const onPointerMove = (event: PointerEvent) => {
      const [x, y] = pointerPosition(event);
      if (dragX !== null) {
        rotation += (x - dragX) * 0.008;
        dragDistance += Math.abs(x - dragX);
        dragX = x;
        if (reduceMotion || !frameId) start();
        return;
      }
      if (event.pointerType === "mouse") {
        setHover(nearestNode(x, y));
        canvas.style.cursor = hover ? "pointer" : "grab";
      }
    };

    const onPointerDown = (event: PointerEvent) => {
      dragX = pointerPosition(event)[0];
      dragDistance = 0;
      canvas.setPointerCapture(event.pointerId);
    };

    const onPointerUp = (event: PointerEvent) => {
      const wasTap = dragDistance < 6;
      dragX = null;
      if (!wasTap) return;
      const [x, y] = pointerPosition(event);
      const node = nearestNode(x, y);
      // Mouse: click opens the day. Touch: first tap shows the label, second tap opens it.
      if (node && (event.pointerType === "mouse" || node === hover)) {
        router.push(`/dashboard/day?date=${node.date}`);
      } else {
        setHover(node);
      }
    };

    const onPointerLeave = (event: PointerEvent) => {
      if (event.pointerType === "mouse") setHover(null);
    };

    const onVisibility = () => {
      pageVisible = !document.hidden;
      start();
    };

    const intersection = new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting;
      start();
    });
    intersection.observe(stage);

    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointerleave", onPointerLeave);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      intersection.disconnect();
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointerleave", onPointerLeave);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [layout, router]);

  const total = layout.nodes.length;
  const todayCount = layout.nodes.filter((node) => node.today).length;
  const summary =
    total === 0
      ? "An empty sphere. Pages you write will appear here as points of light."
      : `A slowly rotating sphere of ${total} journal pages: ${layout.bands.light} light, ${layout.bands.steady} steady and ${layout.bands.low} low. Pages that share a theme are joined by threads. Main themes: ${layout.themes
          .slice(0, 5)
          .map((theme) => theme.name)
          .join(", ")}.`;

  return (
    <section className="rounded-[1.75rem] border border-emerald-950/10 bg-white/45 p-5 shadow-[0_20px_50px_rgba(48,84,53,0.10)] backdrop-blur sm:rounded-[2rem] sm:p-8">
      <div className="flex flex-col items-center gap-8 md:flex-row md:gap-12">
        <div className="flex min-w-0 flex-1 flex-col gap-5">
          <p className="text-xs uppercase tracking-[0.22em] text-emerald-800/70 sm:text-sm sm:tracking-[0.28em]">
            Your mind, mapped
          </p>
          <h2 className="font-[family:var(--font-display)] text-4xl leading-[1.05] text-emerald-950 sm:text-5xl">
            Every page becomes a point of light.
          </h2>
          <p className="max-w-md text-base leading-7 text-stone-700 sm:text-lg sm:leading-8">
            {total === 0
              ? "Write your first page and it will settle onto the sphere."
              : `Your last ${total} pages, grouped by theme. Related pages are joined by a thread${
                  todayCount > 0 ? ", and today's pages glow softly" : ""
                }. Drag to spin, and tap or click a point to open that day.`}
          </p>
          <ul className="flex flex-wrap gap-2.5" aria-label="Mood legend">
            {(["light", "steady", "low"] as const).map((band) => (
              <li
                key={band}
                className="inline-flex min-h-9 items-center gap-2 rounded-full border border-emerald-950/10 bg-white/70 px-3.5 text-xs uppercase tracking-[0.08em] text-emerald-950"
              >
                <i
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{ background: rgba(BAND_COLORS[band], 1) }}
                />
                {BAND_LABELS[band]}
                <span className="text-stone-500">{layout.bands[band]}</span>
              </li>
            ))}
          </ul>
          {layout.themes.length > 0 ? (
            <p className="text-sm leading-6 text-stone-600">
              <span className="text-xs uppercase tracking-[0.14em] text-emerald-800/70">Themes · </span>
              {layout.themes
                .slice(0, 6)
                .map((theme) => `${theme.name} (${theme.count})`)
                .join(" · ")}
            </p>
          ) : null}
          <p className="text-xs leading-5 text-stone-500">Mood bands: low 1–3 · steady 4–6 · light 7–10.</p>
        </div>
        <div ref={stageRef} className="relative mx-auto aspect-square w-full max-w-[560px] flex-1">
          <canvas
            ref={canvasRef}
            role="img"
            aria-label={summary}
            className="block h-full w-full cursor-grab touch-pan-y"
          />
          <div
            ref={tipRef}
            role="status"
            className="pointer-events-none absolute -translate-x-1/2 -translate-y-[130%] whitespace-nowrap rounded-2xl bg-emerald-950 px-3.5 py-2.5 text-[13px] leading-[18px] text-emerald-50 opacity-0 shadow-[0_14px_28px_rgba(6,78,59,0.22)] transition-opacity duration-150 [&_b]:block [&_b]:font-[family:var(--font-display)] [&_b]:text-[15px] [&_b]:font-normal"
          />
        </div>
      </div>
    </section>
  );
}
