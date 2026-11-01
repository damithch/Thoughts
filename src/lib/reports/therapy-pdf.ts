import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage, type RGB } from "pdf-lib";

import { ATTENTION_COPY } from "@/lib/attention/copy";
import { describeFocusChange } from "@/lib/attention/rules";
import { toPdfText, wrapText } from "@/lib/reports/pdf-text";
import type { TherapyReportData } from "@/lib/reports/therapy-data";

// A4 in points.
const PAGE = { width: 595.28, height: 841.89 };
const MARGIN = { x: 50, top: 56, bottom: 56 };
const CONTENT_WIDTH = PAGE.width - MARGIN.x * 2;

const COLORS = {
  ink: rgb(0.11, 0.1, 0.09),
  soft: rgb(0.34, 0.33, 0.31),
  faint: rgb(0.62, 0.6, 0.58),
  accent: rgb(0.02, 0.37, 0.27),
  rule: rgb(0.85, 0.9, 0.86),
  band: rgb(0.94, 0.97, 0.94),
};

function formatDate(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function formatTime(value: Date | string) {
  return new Date(value).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Colombo" });
}

function signed(value: number | null, suffix = "") {
  if (value === null) return "-";
  return `${value > 0 ? "+" : ""}${value}${suffix}`;
}

// Keeps a cursor and starts a new page whenever the next block won't fit.
class Layout {
  doc: PDFDocument;
  regular: PDFFont;
  bold: PDFFont;
  page!: PDFPage;
  y = 0;

  constructor(doc: PDFDocument, regular: PDFFont, bold: PDFFont) {
    this.doc = doc;
    this.regular = regular;
    this.bold = bold;
    this.newPage();
  }

  newPage() {
    this.page = this.doc.addPage([PAGE.width, PAGE.height]);
    this.y = PAGE.height - MARGIN.top;
  }

  ensure(height: number) {
    if (this.y - height < MARGIN.bottom) this.newPage();
  }

  gap(height: number) {
    this.y -= height;
  }

  text(value: string, options: { size?: number; font?: PDFFont; color?: RGB; x?: number; width?: number; lineGap?: number } = {}) {
    const size = options.size ?? 10;
    const font = options.font ?? this.regular;
    const x = options.x ?? MARGIN.x;
    const width = options.width ?? CONTENT_WIDTH - (x - MARGIN.x);
    const lineHeight = size * (options.lineGap ?? 1.4);
    const lines = wrapText(toPdfText(value), width, (line) => font.widthOfTextAtSize(line, size));

    for (const line of lines) {
      this.ensure(lineHeight);
      this.page.drawText(line, { x, y: this.y - size, size, font, color: options.color ?? COLORS.ink });
      this.y -= lineHeight;
    }
  }

  heading(value: string) {
    this.ensure(48);
    this.gap(10);
    this.text(value, { size: 16, font: this.bold, color: COLORS.accent });
    this.page.drawLine({
      start: { x: MARGIN.x, y: this.y + 2 },
      end: { x: PAGE.width - MARGIN.x, y: this.y + 2 },
      thickness: 1,
      color: COLORS.rule,
    });
    this.gap(8);
  }

  subheading(value: string) {
    this.ensure(30);
    this.gap(6);
    this.text(value, { size: 11.5, font: this.bold });
    this.gap(2);
  }

  label(value: string) {
    this.text(value.toUpperCase(), { size: 7.5, font: this.bold, color: COLORS.accent });
  }

  // Up to four "label / big value / hint" tiles in a row.
  tiles(items: { label: string; value: string; hint?: string }[]) {
    const height = 52;
    this.ensure(height + 8);
    const width = (CONTENT_WIDTH - (items.length - 1) * 8) / items.length;
    items.forEach((item, index) => {
      const x = MARGIN.x + index * (width + 8);
      this.page.drawRectangle({ x, y: this.y - height, width, height, color: COLORS.band });
      this.page.drawText(toPdfText(item.label.toUpperCase()), { x: x + 8, y: this.y - 14, size: 7, font: this.bold, color: COLORS.accent });
      this.page.drawText(toPdfText(item.value), { x: x + 8, y: this.y - 33, size: 16, font: this.bold, color: COLORS.ink });
      if (item.hint) {
        this.page.drawText(toPdfText(item.hint), { x: x + 8, y: this.y - 45, size: 7, font: this.regular, color: COLORS.soft });
      }
    });
    this.y -= height + 10;
  }

  // Simple table; long cells wrap and a row never splits across pages.
  table(columns: { title: string; width: number }[], rows: string[][], size = 8.5) {
    const lineHeight = size * 1.35;
    const totalWidth = columns.reduce((sum, column) => sum + column.width, 0);
    const widths = columns.map((column) => (column.width / totalWidth) * CONTENT_WIDTH);

    const drawHeader = () => {
      this.ensure(lineHeight + 8);
      let x = MARGIN.x;
      this.page.drawRectangle({ x: MARGIN.x, y: this.y - lineHeight - 4, width: CONTENT_WIDTH, height: lineHeight + 4, color: COLORS.band });
      columns.forEach((column, index) => {
        this.page.drawText(toPdfText(column.title), { x: x + 4, y: this.y - size - 1, size, font: this.bold, color: COLORS.accent });
        x += widths[index];
      });
      this.y -= lineHeight + 6;
    };

    drawHeader();
    for (const row of rows) {
      const cells = row.map((cell, index) =>
        wrapText(toPdfText(cell), widths[index] - 8, (line) => this.regular.widthOfTextAtSize(line, size)),
      );
      const height = Math.max(...cells.map((lines) => lines.length)) * lineHeight + 4;
      if (this.y - height < MARGIN.bottom) {
        this.newPage();
        drawHeader();
      }
      let x = MARGIN.x;
      cells.forEach((lines, index) => {
        lines.forEach((line, lineIndex) => {
          this.page.drawText(line, { x: x + 4, y: this.y - size - lineIndex * lineHeight, size, font: this.regular, color: COLORS.ink });
        });
        x += widths[index];
      });
      this.y -= height;
      this.page.drawLine({ start: { x: MARGIN.x, y: this.y + 1 }, end: { x: PAGE.width - MARGIN.x, y: this.y + 1 }, thickness: 0.5, color: COLORS.rule });
    }
    this.gap(6);
  }

  // Task focus before (grey, dashed) and after (green) per rated session.
  focusChart(points: { before: number; after: number }[]) {
    const height = 120;
    this.ensure(height + 24);
    const left = MARGIN.x + 28;
    const right = PAGE.width - MARGIN.x;
    const top = this.y - 6;
    const bottom = top - height;
    const x = (index: number) => (points.length === 1 ? (left + right) / 2 : left + (index / (points.length - 1)) * (right - left));
    const y = (value: number) => bottom + (value / 100) * height;

    for (const value of [0, 50, 100]) {
      this.page.drawLine({ start: { x: left, y: y(value) }, end: { x: right, y: y(value) }, thickness: 0.5, color: COLORS.rule });
      this.page.drawText(`${value}%`, { x: MARGIN.x, y: y(value) - 3, size: 7, font: this.regular, color: COLORS.faint });
    }

    const series = (key: "before" | "after", color: RGB, dashed: boolean) => {
      points.forEach((point, index) => {
        if (index > 0) {
          this.page.drawLine({
            start: { x: x(index - 1), y: y(points[index - 1][key]) },
            end: { x: x(index), y: y(point[key]) },
            thickness: dashed ? 1 : 1.6,
            color,
            dashArray: dashed ? [3, 3] : undefined,
          });
        }
        this.page.drawCircle({ x: x(index), y: y(point[key]), size: 2.2, color });
      });
    };
    series("before", COLORS.faint, true);
    series("after", COLORS.accent, false);

    this.y = bottom - 10;
    this.text("Grey dashed: % on the task before.  Green: % on the task after.", { size: 7.5, color: COLORS.soft });
    this.gap(4);
  }
}

function attentionSection(layout: Layout, data: NonNullable<TherapyReportData["attention"]>) {
  const { insights, sessions } = data;
  layout.heading("Attention training");
  layout.text(ATTENTION_COPY.principle, { size: 9, color: COLORS.soft });
  layout.gap(6);

  if (sessions.length === 0) {
    layout.text("No attention training sessions were logged in this period.", { size: 10 });
    return;
  }

  layout.tiles([
    { label: "Sessions", value: String(insights.sessionCount), hint: `${insights.mundaneCount} task, ${insights.meditationCount} meditation` },
    { label: "Minutes", value: String(insights.totalMinutes), hint: "total practice" },
    { label: "Days practised", value: String(insights.daysPractised), hint: `${insights.from} to ${insights.to}` },
    { label: "Task focus", value: signed(insights.focus.avgChange, " pts"), hint: "average change, before to after" },
  ]);

  if (insights.focus.ratedSessions > 0) {
    layout.subheading("Attention on the task");
    layout.text(
      `Across ${insights.focus.ratedSessions} rated task session${insights.focus.ratedSessions === 1 ? "" : "s"}, attention on the task averaged ${insights.focus.avgTaskFocusBefore}% before and ${insights.focus.avgTaskFocusAfter}% after.` +
        (insights.focus.earlierAvgAfter !== null && insights.focus.laterAvgAfter !== null
          ? ` Earlier sessions averaged ${insights.focus.earlierAvgAfter}% after; later ones ${insights.focus.laterAvgAfter}%.`
          : ""),
      { size: 9.5 },
    );
    layout.gap(4);
    layout.focusChart(
      sessions
        .filter((session) => session.task_focus_before !== null && session.task_focus_after !== null)
        .map((session) => ({ before: session.task_focus_before as number, after: session.task_focus_after as number })),
    );
  }

  if (insights.byTask.length > 0) {
    layout.subheading("By everyday task");
    layout.table(
      [
        { title: "Task", width: 3 },
        { title: "Sessions", width: 1 },
        { title: "Minutes", width: 1 },
        { title: "Avg before", width: 1.2 },
        { title: "Avg after", width: 1.2 },
        { title: "Avg change", width: 1.2 },
      ],
      insights.byTask.map((task) => [
        task.taskName,
        String(task.sessions),
        String(task.minutes),
        task.avgBefore === null ? "-" : `${task.avgBefore}%`,
        task.avgAfter === null ? "-" : `${task.avgAfter}%`,
        signed(task.avgChange, " pts"),
      ]),
    );
  }

  if (insights.anchors.length > 0 || insights.meditation.sessions > 0) {
    layout.subheading("Anchors and meditation");
    if (insights.anchors.length > 0) {
      layout.text(
        `Senses that helped bring attention back: ${insights.anchors
          .map((anchor) => `${anchor.anchor} (${anchor.count}, ${anchor.shareOfTaskSessions}% of task sessions)`)
          .join(", ")}.`,
        { size: 9.5 },
      );
    }
    if (insights.meditation.sessions > 0) {
      layout.text(
        `Meditation: ${insights.meditation.sessions} session${insights.meditation.sessions === 1 ? "" : "s"}, ${insights.meditation.minutes} minutes in total (about ${insights.meditation.avgMinutes} minutes each).` +
          (insights.meditation.avgMoodChange !== null ? ` Average mood change where rated: ${signed(insights.meditation.avgMoodChange)} (1-10 scale).` : ""),
        { size: 9.5 },
      );
    }
  }

  layout.subheading("Session log");
  layout.table(
    [
      { title: "Date", width: 1.6 },
      { title: "Time", width: 0.8 },
      { title: "Type", width: 1.2 },
      { title: "Task", width: 2 },
      { title: "Min", width: 0.6 },
      { title: "Focus on task", width: 1.6 },
      { title: "Anchors", width: 1.6 },
    ],
    sessions.map((session) => [
      formatDate(session.entry_date),
      formatTime(session.started_at),
      session.session_type === "meditation" ? "Meditation" : "Mundane task",
      session.task_name,
      String(session.duration_minutes),
      describeFocusChange(session.task_focus_before, session.task_focus_after)?.replace(" on the task", "") ?? "-",
      session.anchors_used?.join(", ") ?? "-",
    ]),
  );

  const notes = sessions.filter((session) => session.comments && session.comments.trim());
  if (notes.length > 0) {
    layout.subheading("What I noticed");
    for (const session of notes) {
      layout.text(`${formatDate(session.entry_date)} · ${session.task_name}`, { size: 8.5, font: layout.bold, color: COLORS.soft });
      layout.text(session.comments as string, { size: 9.5 });
      layout.gap(4);
    }
  }
}

function worrySection(layout: Layout, data: NonNullable<TherapyReportData["worry"]>) {
  layout.heading("Worry postponement");

  if (data.modules.length === 0) {
    layout.text("No worry postponement experiment was running in this period.", { size: 10 });
    return;
  }

  data.modules.forEach((mod, index) => {
    if (data.modules.length > 1) layout.subheading(`Experiment ${index + 1} (${mod.status})`);
    layout.label("Worry belief being tested");
    layout.text(mod.belief_text || "-", { size: 10.5, font: layout.bold });
    layout.gap(4);
    layout.tiles([
      { label: "Belief before", value: mod.belief_before_pct === null ? "-" : `${mod.belief_before_pct}%` },
      { label: "Belief after", value: mod.belief_after_pct === null ? "-" : `${mod.belief_after_pct}%` },
      {
        label: "Thinking time",
        value: mod.thinking_time_start || "-",
        hint: `${mod.thinking_time_duration} min${mod.thinking_time_place ? ` · ${mod.thinking_time_place}` : ""}`,
      },
      { label: "Status", value: mod.status },
    ]);

    if (mod.prediction_text) {
      layout.label("Prediction");
      layout.text(
        `${mod.prediction_text}${mod.prediction_confidence !== null ? ` (confidence ${mod.prediction_confidence}/10)` : ""}`,
        { size: 9.5 },
      );
      layout.gap(4);
    }

    const forEvidence = mod.evidence.filter((item) => item.side === "for");
    const againstEvidence = mod.evidence.filter((item) => item.side === "against");
    if (forEvidence.length > 0 || againstEvidence.length > 0) {
      layout.subheading("Evidence");
      layout.table(
        [
          { title: "For the belief", width: 1 },
          { title: "Against the belief", width: 1 },
        ],
        Array.from({ length: Math.max(forEvidence.length, againstEvidence.length) }, (_, row) => [
          forEvidence[row]?.content ?? "",
          againstEvidence[row]?.content ?? "",
        ]),
      );
    }

    layout.subheading("Experiment days");
    if (mod.experiment_days.length === 0) {
      layout.text("No experiment days recorded in this period.", { size: 9.5, color: COLORS.soft });
    } else {
      layout.table(
        [
          { title: "Date", width: 1.3 },
          { title: "What happened", width: 3 },
          { title: "Thinking time notes", width: 3 },
          { title: "Control (0-10)", width: 1 },
        ],
        mod.experiment_days.map((day) => [formatDate(day.entry_date), day.what_happened || "-", day.thinking_time_notes || "-", String(day.controllability)]),
      );
    }

    layout.subheading("Postponed worries");
    if (mod.postponed_items.length === 0) {
      layout.text("No postponed worries recorded in this period.", { size: 9.5, color: COLORS.soft });
    } else {
      const byDay = new Map<string, string[]>();
      for (const item of mod.postponed_items) byDay.set(item.entry_date, [...(byDay.get(item.entry_date) ?? []), item.content]);
      layout.table(
        [
          { title: "Date", width: 1.3 },
          { title: "Count", width: 0.6 },
          { title: "Worries postponed", width: 6 },
        ],
        [...byDay.entries()].map(([date, items]) => [formatDate(date), String(items.length), items.map((item) => `- ${item}`).join("\n")]),
      );
    }

    if (mod.reflection_text) {
      layout.subheading("Reflection");
      layout.text(mod.reflection_text, { size: 9.5 });
    }
    layout.gap(8);
  });
}

export async function renderTherapyReportPdf(data: TherapyReportData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(toPdfText(`Therapy homework report ${data.from} to ${data.to}`));
  doc.setAuthor(toPdfText(data.userName));
  doc.setCreator("Thoughts");
  doc.setCreationDate(new Date(data.generatedAt));

  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const layout = new Layout(doc, regular, bold);

  layout.text("THERAPY HOMEWORK REPORT", { size: 8, font: bold, color: COLORS.accent });
  layout.gap(4);
  layout.text(
    [data.attention ? "Attention training" : null, data.worry ? "Worry postponement" : null].filter(Boolean).join(" and "),
    { size: 22, font: bold },
  );
  layout.text(`${formatDate(data.from)} to ${formatDate(data.to)}`, { size: 12, color: COLORS.soft });
  layout.gap(4);
  layout.text(
    `${data.userName} · created ${new Date(data.generatedAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Colombo" })} (Colombo time)`,
    { size: 9, color: COLORS.faint },
  );
  layout.gap(6);

  if (data.attention) attentionSection(layout, data.attention);
  if (data.worry) worrySection(layout, data.worry);

  const pages = doc.getPages();
  pages.forEach((page, index) => {
    const footer = toPdfText(`Thoughts · ${data.from} to ${data.to} · page ${index + 1} of ${pages.length}`);
    page.drawText(footer, {
      x: PAGE.width / 2 - regular.widthOfTextAtSize(footer, 7.5) / 2,
      y: 28,
      size: 7.5,
      font: regular,
      color: COLORS.faint,
    });
  });

  return doc.save();
}
