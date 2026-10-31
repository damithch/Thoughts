# Plan — Claude tools, attention fixes, day summary and PDF report (2026-10-31)

Four requests, in build order.

## 1. Claude (MCP) can see and control more

Gaps found in `src/app/api/mcp/route.ts`:

| Gap | Change |
|---|---|
| `get_daily_summary` has no attention or worry data | Add the day's attention sessions + a small attention summary, and the day's worry postponement data |
| Can't edit or delete an attention session | New `update_attention_session`, `delete_attention_session` |
| No analysis view of attention training | New `get_attention_insights` (date range): per-task averages and change, how often each sense helped, meditation minutes and mood change, practice by weekday, recent notes |
| `get_tasks` only filters one day | Add `from` / `to` range and `query` (title search) |
| Routines can be created but not changed or removed (functions were imported but never exposed) | New `update_recurring_task`, `delete_recurring_task` |
| No task progress numbers | New `get_task_stats` (completion % per day, current streak, routine adherence) |
| No single summary of therapy homework | New `get_therapy_report` (date range): the same data the PDF uses, as JSON |

All tools reuse the existing user scoping and validation (`saveAttentionSession` / `editAttentionSession`).

## 2. Attention training fixes

- **Phone slider:** the position was read from `locationX`, which is unreliable on Android while dragging inside a scrolling screen. Read the finger's screen position (`pageX`) against the track's measured position instead, and add − / + buttons (5% steps) so it can always be adjusted precisely.
- **Phone session screen:** the day picker allowed future days, which the server then rejected. Stop at today.
- **Phone settings:** "Add" with an empty box said "Added."; it now does nothing.
- **Web meditation:** after a guided run finished there was no way to start again, and the chime between steps could be silent because browsers block sound that isn't started by a tap. Add "Start again", and create the sound player when "Begin" is tapped.

## 3. Day summary JSON

`/api/reports/daily` already lists every task. Add:
- `task_details`: overdue open tasks, Inbox count, and per task the routine name and how many times it was pushed back.
- `attention_summary`: session counts, minutes, average task-focus change, senses used.
- CSV export: attention session rows.

The monthly report also gets the attention sessions.

## 4. PDF report (attention training + worry postponement)

- `GET /api/reports/therapy?from=&to=&sections=attention,worry&format=pdf|json`. It works with the web cookie and the phone token, like the other reports. Ranges up to 92 days.
- Built with `pdf-lib`, which is pure JavaScript and runs on Vercel with no native parts.
- **Contents:**
  - Cover: name, date range, created date.
  - Attention: totals, days practised, average focus change, a before/after chart, a session table and your notes.
  - Worry postponement: belief and before/after %, the thinking-time plan, evidence for and against, experiment days with controllability, and postponed worries per day.
- **Where to get it:**
  - Web: Attention page → Progress tab → "Download PDF", with a date range.
  - Phone: Export reports → "Therapy report (PDF)", with last 7 / 14 / 30 days or custom dates, then the share sheet.
- The built-in PDF fonts can't show some symbols, which are replaced, e.g. → becomes "->". Sinhala/Tamil text would show as "?"; supporting it would need an embedded font. That's a possible follow-up.

## Tests
Unit tests for the PDF text cleanup, the insights maths and the date range parsing. DB tests for the new tools' data functions. A Playwright pass over the fixed screens. The PDF is generated end to end and its pages are checked.
