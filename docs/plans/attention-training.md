# Plan — Attention Training tracker

> **Status (2026-10-31): implemented.** Built as planned, with these differences:
> - Web meditation finishes with a one-tap Save (the phone saves automatically, as in AC 3).
> - No Home-screen card on the phone yet; the entry point is More → Attention training.
> - Backup includes attention data in the export; restoring it from a backup is not wired up yet.
> - The optional twice-daily target and a RAG document kind are left for later.

Source: the "Attention Training Tracker – Implementation Spec" and CCI *What? Me Worry!?!* Module 4 (My Attention Workout, Attention Training Diary).
Approach: build it the same way as the existing Behavioural Activation and Worry Postponement modules, and reuse existing pieces wherever they fit.

## 0. What already exists and gets reused

| Need from spec | Already in the codebase | Reuse |
|---|---|---|
| Mark daily task done after a session | `recordBreathingSession()` in `src/lib/db/support.ts` finds today's open `%breath%` task and sets it `done` | Same query pattern, wider title match |
| Daily reminder (AC 7) | Recurring tasks have `remind_at`; mobile `lib/reminder-plan.ts` already schedules "habit" reminders for them | Create an "Attention training" routine with `remind_at`, so no new reminder system is needed |
| Guided timer with haptics, keep-awake | `mobile/src/app/breathe.tsx` | Copy its timer/keep-awake structure for the 3-step meditation |
| Mobile auth + JSON helpers | `withMobileUser`, `readJsonObject`, `apiError` in `src/lib/mobile-api.ts` | All `/api/v1/attention/*` routes |
| Per-user settings | `user_settings` JSON, normalised in `src/lib/db/settings.ts` | Step durations; no migration needed |
| Create thought with tag | `createThought()` | "Add reflection" button |
| MCP auth + user scoping | `src/app/api/mcp/route.ts` | 3 new tools |
| "Today's date" | `getCurrentColomboDate()` | `entry_date` for grouping and streaks |

## 1. Database (`src/lib/db/init.ts`)

Add the table next to `behavioural_activation_entries`:

```sql
CREATE TABLE IF NOT EXISTS attention_sessions (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_type TEXT NOT NULL CHECK (session_type IN ('mundane_task', 'meditation')),
  task_name TEXT NOT NULL,
  entry_date DATE NOT NULL,                     -- Colombo date, used for grouping/streaks
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes BETWEEN 1 AND 120),
  self_focus_before INTEGER CHECK (self_focus_before BETWEEN 0 AND 100),
  self_focus_after  INTEGER CHECK (self_focus_after  BETWEEN 0 AND 100),
  task_focus_before INTEGER GENERATED ALWAYS AS (100 - self_focus_before) STORED,
  task_focus_after  INTEGER GENERATED ALWAYS AS (100 - self_focus_after)  STORED,
  anchors_used TEXT[] CHECK (anchors_used <@ ARRAY['touch','sight','hearing','smell','taste']),
  mood_before INTEGER CHECK (mood_before BETWEEN 1 AND 10),
  mood_after  INTEGER CHECK (mood_after  BETWEEN 1 AND 10),
  comments TEXT,
  linked_task_id BIGINT REFERENCES daily_tasks(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Percentages and anchors only make sense for mundane tasks
  CHECK (session_type = 'mundane_task' OR
         (self_focus_before IS NULL AND self_focus_after IS NULL AND anchors_used IS NULL))
);
CREATE INDEX IF NOT EXISTS attention_sessions_user_date_idx
  ON attention_sessions (user_id, entry_date DESC, started_at DESC);

CREATE TABLE IF NOT EXISTS attention_task_ideas (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS attention_task_ideas_user_name_idx
  ON attention_task_ideas (user_id, lower(name));
```

Changes from the spec:
- **`task_focus_*` are generated columns.** The database computes `100 − self_focus`, so the "always sums to 100" rule (AC 2) can't be broken by any client, MCP call or bug. It also removes the need for a separate sum constraint.
- **Added `entry_date`.** Grouping by day and streaks use the app's Colombo date, matching tasks and check-ins. Deriving the day from a timestamp would shift late-night sessions to the wrong day.
- **Added `mood_before/after`** (spec §5, optional).
- **`linked_task_id` is `ON DELETE SET NULL`**, so deleting a task doesn't delete the session.

## 2. Data layer — new `src/lib/db/attention.ts`

Export from `src/lib/db.ts`. Functions, all taking `userId`:

- `createAttentionSession(input)`. In one transaction, it inserts the session, upserts `task_name` into `attention_task_ideas` for mundane tasks, and optionally completes the matching daily task (below).
- `getAttentionSessions(userId, { from, to, type, limit })`. Filters run in SQL, not in JS (unlike the current activation code).
- `getAttentionSessionById`, `updateAttentionSession`, `deleteAttentionSession`. Every `WHERE` includes `user_id`.
- `getAttentionStats(userId, range: 7 | 30)` returns:
  - `days[]`: `{ date, mundane: n, meditation: n, minutes }`
  - `totalMinutes`, `sessionCount`
  - `avgTaskFocusChange`: average of `task_focus_after − task_focus_before` where both are present
  - `streak`: consecutive days up to today (or yesterday, so today isn't counted missed until it ends) with at least one session of either type
  - `trend[]`: per-session `{ date, before, after }` for the 30-day chart
- `getAttentionTaskIdeas`, `addAttentionTaskIdea`, `deleteAttentionTaskIdea`.

**Completing the daily task.** Generalise the breathing query: after `generateDailyTasksFromRecurring(userId, date)`, find today's open task where `title ILIKE '%attention%'`. For meditation, also match `'%meditat%'` and `'%breath%'`. Set it to `done`, store its id in `linked_task_id`, and return `completedTask` so the UI can say "Ticked off *Attention training*". This runs only when the client sends `completeTask: true`, which is a checkbox the UI shows ticked by default. That covers "offers to mark it done".

Decision: meditation sessions should **not** also add to `support_days.breathing_seconds`, so the two features stay independent. This is easy to add later if wanted.

## 3. Validation — new `src/lib/attention/validation.ts` (pure, unit-testable)

`parseAttentionSessionInput(body)` returns `{ ok, value } | { ok: false, error }`. Used by server actions, `/api/v1` and MCP, so the rules live in one place:
- `session_type` must be one of the two values.
- `duration_minutes` must be an integer from 1 to 120.
- `self_focus_*` must be integers from 0 to 100. These are rejected for `meditation`. Any `task_focus_*` sent by the client is ignored, because the database computes it.
- `anchors_used` keeps only the 5 allowed values, with duplicates removed.
- `task_name` is trimmed, max 120 characters. It defaults to "Breathing meditation" for meditation and is required for mundane tasks.
- `comments` max 4000 characters; `mood_*` must be 1–10.
- `entry_date` defaults to today in Colombo time and must pass `isValidTaskDate`.

## 4. API

**Mobile REST** (`withMobileUser`, matching existing `/api/v1/*`):

| Method & path | Purpose |
|---|---|
| `POST /api/v1/attention/sessions` | Create; body may include `completeTask` |
| `GET /api/v1/attention/sessions?from=&to=&type=` | List |
| `GET/PATCH/DELETE /api/v1/attention/sessions/[id]` | One session |
| `GET /api/v1/attention/stats?range=7d\|30d` | Progress data |
| `GET/POST/DELETE /api/v1/attention/ideas` | Saved task chips |
| `POST /api/v1/attention/sessions/[id]/reflection` | Create a thought from the session (tag `attention-training`) |

**Web:** server actions in `src/app/dashboard/attention/actions.ts` that call the same db + validation functions, then `revalidatePath` for `/dashboard/attention` and `/dashboard/tasks`.

## 5. MCP tools (`src/app/api/mcp/route.ts`)

Add to the tools list and the `tools/call` switch, using the same `userId` resolution as `create_thought` / `get_tasks`:
- `create_attention_session`: same fields as the POST body; returns the saved row plus `completedTask`.
- `get_attention_sessions`: `{ from?, to?, type?, limit? }`.
- `get_attention_stats`: `{ range?: "7d" | "30d" }`.

Each tool calls `lib/db/attention.ts` directly, not over HTTP. Tool descriptions should include the principle that wandering is part of the practice, so Claude's replies use the same framing.

## 6. Screens

### Mobile (primary; Expo Router, `mobile/src/app/attention/`)

| File | Screen |
|---|---|
| `index.tsx` | **Quick Log**: Mundane / Meditation toggle |
| `meditate.tsx` | 3-step guided timer (based on `breathe.tsx`) |
| `history.tsx` | Sessions grouped by day |
| `[id].tsx` | View / edit / delete |
| `progress.tsx` | Weekly dots, streak, minutes, 30-day chart |

Plus an entry on the **More** tab and a card on Home when today has no session yet.

**Mundane flow, aiming for under 30 s (AC 1):**
1. Chips of saved tasks, plus a "+ new" text field. Tapping a chip moves straight on.
2. "Before" slider labelled *"Where's my attention right now?"* It shows `70% on me / thoughts · 30% on the task` live. Default 50.
3. Optional "Start timer" button. If it's not used, a duration stepper (default 5 min) appears on the after step.
4. Anchor card: five sense chips (touch, sight, hearing, smell, taste) with the worksheet's prompts (e.g. hearing: *"the sound of your footsteps"*).
5. "After" slider, same style.
6. Comments, with placeholder prompts from the diary: *What did I notice? Did I catch my mind wandering? Could I bring it back?*
7. Save. A ticked checkbox reads "Tick off today's *Attention training*". Afterwards it shows "Saved · 30% → 60% on the task" and an **Add reflection** button.

A fast path is two chip taps, two slider drags and Save, with comments optional.

**Meditation flow (AC 3):** three steps from settings (defaults 1 / 2 / 2 min): *Notice what's here → Breathe into the belly → Breathe with the whole body*. Haptic tap + short chime between steps (`expo-audio`, already installed; bundle one small chime file). The screen stays awake. At the end it saves automatically with the measured duration (rounded, minimum 1), then shows an optional comments box and mood-after field that update the saved row. Leaving early offers "Save the X minutes you did?"; no "incomplete" wording.

**Progress (AC 5):** 7-day strip, each day showing two small dots (task / meditation). Missed days are drawn empty and neutral, not red. Streak, minutes this week, and a line chart of task-focus before vs after over 30 days, drawn with `react-native-svg` (already installed). No chart library needed.

### Web (`src/app/dashboard/attention/`)

`page.tsx` (server) + `attention-client.tsx` with Log / History / Progress tabs, following `dashboard/activation`. The meditation timer works on web too, with a simple interval and Web Audio chime. Add a link wherever Activation and Worry are linked (dashboard page, support card).

### Settings (spec §4.4)

Add to `UserSettings` + `normalizeSettings`: `attention_step_seconds: [60, 120, 120]` and `attention_default_minutes: 5`. In Settings (web and mobile):
- step durations
- manage saved tasks (list with delete)
- **"Daily reminder"**, which creates or updates a recurring task "Attention training" (every day, `remind_at` = chosen time, default the morning reminder time). The existing habit reminder then fires it, so AC 7 needs no new notification code.

## 7. Copy rules (AC 9)

One shared file, `src/lib/attention/copy.ts`, imported by web and mobile (mobile already shares pure files with web tests), holding every user-facing string:
- Intro line on every screen: *"Your mind will wander — that's expected. The practice is noticing and gently coming back."*
- Never use: "fail", "lost focus", "distracted", "missed", "broke your streak", red colours for low scores.
- Zero-session empty state: *"Nothing logged yet. Even one minute of noticing counts."*
- Streak reset: show only the current number, no "you lost a 5-day streak".
- A lower "after" score is shown neutrally (*"30% → 25%"*) with no up/down arrow colouring.

A unit test scans `copy.ts` for the banned words.

## 8. Other integrations

- **Backup:** add both tables to `/api/backup` export/import.
- **Daily report:** include the day's sessions in `/api/reports/daily`.
- **Search (later, optional):** add an `attention_session` RAG document kind so comments are searchable. For v1, "Add reflection" thoughts are already indexed.

## 9. Tests

- `scripts/run-tests.mjs` (unit): validation (rejects percents on meditation, clamps duration, ignores client `task_focus`), stats/streak maths on fixed data, copy banned-words check.
- `scripts/db-tests.mts` (DB, runs in CI against pgvector Postgres):
  - generated columns always equal `100 − self`
  - CHECK rejects meditation with percents
  - user A can't read, edit or delete user B's session
  - creating with `completeTask` marks the right daily task done
  - deleting the task keeps the session

## 10. Build order and rough size

| # | Step | Size |
|---|---|---|
| 1 | Tables + `lib/db/attention.ts` + validation + unit/DB tests | ½ day |
| 2 | `/api/v1/attention/*` routes + web server actions | ½ day |
| 3 | Mobile Quick Log (mundane) + task-completion checkbox | ½–1 day |
| 4 | Meditation timer (mobile + web) | ½ day |
| 5 | History + edit/delete (mobile + web) | ½ day |
| 6 | Stats + Progress screens | ½–1 day |
| 7 | Settings: step durations, task list, reminder routine | ½ day |
| 8 | MCP tools | 2 h |
| 9 | Copy pass, empty states, backup/report, Add reflection | ½ day |

About 4–5 days in total. Steps 1, 2 and 8 alone give a working backend Claude can log to via MCP on day one.

## 11. Open questions (defaults chosen; change if wanted)

1. **Streak:** a day counts with *either* session type (gentler). The alternative is to require both.
2. **Reminder:** one shared "Attention training" routine, or link the existing "Breathing exercises" routine to meditation? The default is a new routine; meditation also ticks off a `%breath%` task if one is open.
3. **Platform priority:** mobile first, web after. Both use the same API.
4. **Twice-daily meditation goal** (worksheet target, building toward 2 × 10 min): show as an optional target in Progress, off by default.
