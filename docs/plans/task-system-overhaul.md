# Task system: analysis and overhaul plan

Date: 2026-10-06. Scope: `/dashboard/today`, `/dashboard/tasks`, `/dashboard/agent`, `/dashboard/completion`,
`src/app/actions.ts` (task actions), `src/app/api/agent/tasks/route.ts`, the task tools in `src/app/api/mcp/route.ts`,
and `src/lib/db/tasks.ts`.

## 1. How it works today

| Surface | What it does | How it writes |
|---|---|---|
| `/dashboard/today` | One day at a time. Quick-add form, status buttons, rollover, day note, check-ins | Server Actions |
| `/dashboard/tasks` | Recurring templates only (create/edit/delete) | Server Actions |
| `/dashboard/agent` | A second task list for one date, AI prompt box, preset buttons, its own quick-add | `/api/agent/tasks` (LLM) **and** `/api/mcp` |
| `/dashboard/completion` | 30-day and monthly stats | read-only |
| MCP (`/api/mcp`) | External assistant tools: create/update/delete/roll forward/apply recurring | DB functions directly |

So there are **three different write paths** (Server Actions, the agent API, and the MCP endpoint called from the browser), and each has its own validation and its own idea of "roll forward".

## 2. Root causes of what you're seeing

### "Sometimes I can't create a task for an upcoming date"
1. **No date field on the Today quick-add.** The form submits a hidden `date` equal to the day you're viewing (`today/page.tsx:737`). The only navigation is the ◀ ▶ one-day arrows, so a task for next Friday means clicking forward day by day.
2. **On the agent page, Quick Add goes through the LLM.** `handleQuickAdd` turns your form into an English sentence (`Create a medium priority task titled "X" for 2026-10-10`) and asks Gemini to parse it back (`AgentTaskControlCenter.tsx:192`). If the model returns a malformed date, an invalid priority, or nothing at all:
   - an invalid `scheduledDate` or `priority` reaches Postgres and the whole request 500s ("Failed to communicate with AI Task Agent"), or
   - the keyword fallback kicks in and creates a task literally titled `a medium priority task titled "X" for 2026-10-10`.
3. **On error, the Today form redirects to `/dashboard/today` with no `date`**, so you're thrown back to *today* and your input is lost (`actions.ts` `createTaskAction`).

### "The agent works on different pages / does random things"
4. **Changing the date on the agent page sends a prompt to the LLM**: `runAgentCommand({ customPrompt: "Fetch tasks for date …" })` (`AgentTaskControlCenter.tsx:244`). There is no "fetch" tool, so the model may create a task. When the LLM is unavailable, the fallback's default branch **creates a task titled "Fetch tasks for date 2026-10-10"**. Just looking at a date can create junk tasks.
5. **"Roll forward" means three different things:**
   - Today page: viewed date → the day after.
   - Agent page: *real* yesterday → the date selected in the picker (even a date weeks ahead).
   - MCP: explicit from/to.

   None of them handle tasks overdue by more than one day.
6. **The agent page keeps its own copy of the task list** in React state while the Today page reads from the server. The two drift apart until you reload.
7. **Status changes and deletes on the agent page call `/api/mcp` from the browser** and ignore the response. A failed update still shows as done (an "optimistic" update with no rollback).

### Recurring tasks
8. **Just viewing a day generates its recurring tasks** (`today/page.tsx:309`, a write during page render). As a result:
   - **Deleted recurring tasks come back.** Delete today's "Gym", reload, and it's regenerated.
   - **Rolling a recurring task forward duplicates it.** It moves to tomorrow, and today gets a fresh copy on the next view.
   - Browsing future days fills them with instances, which then count against completion stats.
9. Duplicate detection is by **exact title**, so a one-off task named "Gym" blocks the routine, and renaming a template re-creates it.
10. The insert loop has no `ON CONFLICT`, so two simultaneous page loads can hit the unique index and throw. The error is only logged.

### Stats
11. **`skipped` counts as completed** in both stats queries, so skipping everything gives 100%.
12. Future days created by browsing (cause 8) and empty days (0%) both affect streaks.

### Safety and code quality
13. **`NEXT_PUBLIC_MCP_API_KEY` is read in client code.** If that env var is ever set, Next inlines the MCP key into the public JS bundle, and anyone could read and modify all your data through `/api/mcp`. Today it works only because your session cookie also authorises MCP.
14. The agent's natural-language mode can **delete or bulk-complete** tasks with no confirmation; its keyword fallback matches loosely, so a prompt containing "done" and "medium" can mark every medium task done.
15. `updateTaskAction` casts `priority` and `status` from form data without validation; the DB CHECK constraint is the only guard (throws → 500).
16. Task logic is spread over `actions.ts` (8 task actions), `agent/tasks/route.ts` (361 lines), `mcp/route.ts`, and the 959-line Today page. Validation is written three times.
17. There's no way to see "everything coming up", overdue tasks across days, or an inbox of undated tasks.

## 3. Target design

**One tasks area, one write path, a deterministic agent.**

```
/dashboard/tasks
  ├─ Today      (default)  — today's list + overdue banner
  ├─ Upcoming              — next 14 days grouped by day, add to any day
  ├─ Inbox                 — tasks with no date yet
  └─ Routines              — recurring templates (current /dashboard/tasks content)
/dashboard/completion      — stats (kept, fixed)
Agent                      — a command bar on every tasks view, not a separate page
```

### Core rules
- **One service module** `src/lib/tasks/service.ts` owns every task mutation and its validation (a single schema).
  - Server Actions, the agent API and MCP all call it.
  - The browser never calls `/api/mcp`.
- **Dates are explicit.** Every create form has a date input that defaults to the viewed day. It also accepts quick picks (Today, Tomorrow, Next Mon, Someday). `scheduled_date` becomes nullable, and null means Inbox.
- **Viewing never writes.** Recurring instances are generated by:
  - an explicit "Plan my day" action, or
  - a once-per-day idempotent job (cron or first-visit-of-day) for **today only**.
- **Deleting a recurring instance is remembered.** Either a `skipped_occurrences` table or a soft-delete `status='cancelled'` keeps the instance row so it isn't regenerated.
- **Roll forward = "move all open tasks scheduled before X to X"**, the same function everywhere, and it catches multi-day overdue tasks.
- **The agent plans, then you confirm.** The LLM uses Gemini structured output (JSON schema) to return a list of proposed operations.
  - The UI shows them: "Create *Call bank* on Fri 10 Oct · high".
  - Creates and status changes run straight away. Delete and bulk changes need a click.
  - With no LLM available, the agent says so instead of guessing; there is no keyword fallback.
  - Plain forms (quick-add, the date picker) never go through the LLM.

## 4. Phased plan

### Phase 1: stop the bleeding (small, safe; about 1 day)
| # | Change | Fixes |
|---|---|---|
| 1.1 | Add a visible date input to the Today quick-add (default = viewed date) + "Jump to date" picker next to ◀ ▶ | 1 |
| 1.2 | Error redirects keep `?date=`; switch the form to `useActionState` so input survives errors | 3 |
| 1.3 | Agent page: date picker calls a plain `GET` (no LLM); Quick Add calls the create action directly | 2, 4 |
| 1.4 | Agent page: replace the browser `/api/mcp` calls with Server Actions; check results, roll back the optimistic state on failure; remove `NEXT_PUBLIC_MCP_API_KEY` | 7, 13 |
| 1.5 | Validate `scheduledDate`/`priority`/`status` in the agent route and `updateTaskAction`; skip invalid operations with a logged warning instead of a 500 | 2, 15 |
| 1.6 | Remove the agent's keyword fallback (or reduce it to "LLM unavailable, nothing changed") | 2, 4, 14 |
| 1.7 | Exclude `skipped` from "completed"; show it separately | 11 |

### Phase 2: fix recurring (about 1–2 days)
| # | Change | Fixes |
|---|---|---|
| 2.1 | Stop generating in page render. Generate for **today** on first load of the day via an idempotent `INSERT … ON CONFLICT DO NOTHING`, plus the explicit "Apply routines" button for other dates | 8, 10 |
| 2.2 | Remember deleted occurrences (`recurring_task_skips(recurring_task_id, date)`) and check it during generation | 8 |
| 2.3 | Dedupe only by `recurring_task_id` (drop the title match) | 9 |
| 2.4 | Rolling a recurring instance forward records a skip for its original date | 8 |
| 2.5 | Unify roll forward: `rollForwardOpenTasks(userId, toDate)` moves **all** open tasks before `toDate`; used by Today, agent and MCP | 5 |

### Phase 3: one tasks area (about 2–3 days)
| # | Change | Fixes |
|---|---|---|
| 3.1 | `src/lib/tasks/service.ts` + one shared schema; actions/agent/MCP become thin wrappers | 16 |
| 3.2 | `/dashboard/tasks` with tabs Today / Upcoming / Inbox / Routines; `/dashboard/today` and `/dashboard/agent` redirect into it | 6, 17 |
| 3.3 | Upcoming view: next 14 days, inline add per day, drag (or "Move to…") between days | 1, 17 |
| 3.4 | Overdue banner: "4 tasks from earlier days → Move to today / Review" | 5, 17 |
| 3.5 | Nullable `scheduled_date` → Inbox (migration: none needed for existing rows) | 17 |
| 3.6 | Inline edit (title, date, priority, note) and Undo toast for delete/complete | UX |
| 3.7 | `useOptimistic` for status toggles (no full-page redirect per click) | UX |

### Phase 4: a better agent (about 2 days)
| # | Change |
|---|---|
| 4.1 | Gemini structured output with a JSON schema of operations (`create`, `update`, `move`, `complete`, `delete`, `apply_routines`), each with `taskId`/`date` validated against the service |
| 4.2 | Resolve "tomorrow / next Friday / in 3 days" in code (the existing `src/lib/temporal.ts` patterns) before and after the LLM, in Colombo time |
| 4.3 | Preview → confirm flow for destructive or bulk operations; the action log shows exactly what changed, with Undo |
| 4.4 | The agent sees a **compact** context (id, title, status, date for the next 14 days + overdue), not the full JSON of one day |
| 4.5 | Command bar (Ctrl+J) available on every tasks view |

### Phase 5: stats and polish (about 1 day)
- Completion rate = done / (done + open) for **past** days only; skipped shown separately; days with no tasks don't break streaks.
- Weekly review: what slipped, what keeps getting rolled forward (a roll-forward count per task).
- Tests: the service module (create/move/roll forward/recurring generation and skips) against a real Postgres in CI.

## 5. Decisions needed
1. **Merge `/dashboard/today` and `/dashboard/agent` into one Tasks area** (recommended), or keep separate pages and only fix the bugs?
2. **Recurring generation:** generate today's instances automatically on the first visit of the day (recommended), or only when you press "Plan my day"?
3. **Agent confirmation:** confirm only destructive/bulk operations (recommended), or every operation?
4. **Inbox (undated tasks):** wanted?
