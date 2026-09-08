# Thoughts

A private, single-user personal operating system for journaling, daily execution, structured reflection, and AI-assisted self-review.

Thoughts brings together a structured journal, task and routine management, an insight library, behavioural exercises, AI-assisted capture, semantic search, retrieval-augmented generation (RAG), and an MCP server that lets an external assistant work with the user's private data.

## What it does

Thoughts is organized around four connected workflows:

- **Capture** - Write structured thought cards, use AI to turn raw text into a completed journal entry, and record ideas from books, articles, podcasts, or principles.
- **Execute** - Plan a day, manage recurring routines, track check-ins, and use the agent control center to update tasks.
- **Reflect** - Review moods, completion trends, behavioural activation activities, worry experiments, and AI conversation summaries.
- **Connect** - Search the entire personal archive semantically, ask grounded questions about past entries, and connect lived experiences to source ideas.

## Features

### Journal and reflection

- Create, edit, and delete thought cards with titles, categories, mood scores, summaries, long-form notes, tags, and concept tags.
- Link thoughts to ideas in the insight library and record evidence of applying those ideas.
- Review entries on a monthly calendar and in an archive of mood- and category-aware cards.
- Add day intentions, end-of-day notes, mood ratings, and timestamped mood/energy/focus check-ins.

### AI smart capture

The **Smart Capture** workflow accepts raw journal text and uses Gemini to infer:

- Title, category, mood, summary, and long-form body
- Tags and concept tags
- Related insight-library ideas
- The reflection explaining how an idea appeared in real life

The generated fields are placed into the journal form for review before saving. API errors, rate limits, overloaded models, token limits, and parse failures are surfaced with actionable feedback.

### Tasks and routines

- Create date-specific tasks with priorities, tags, notes, and statuses: `todo`, `in_progress`, `done`, or `skipped`.
- Create recurring task templates with weekday schedules, start/end dates, priorities, tags, notes, and active/inactive controls.
- Apply active recurring templates to a date while preventing duplicate instances.
- Roll unfinished tasks forward to another date.
- Track daily completion percentages, 30-day trends, monthly breakdowns, current streaks, and best days.

### AI task agent

The **AI Task Control Center** provides a focused interface for reviewing and changing tasks for a selected date. It can load daily and recurring tasks, create tasks, update task status or details, delete tasks, and apply recurring routines through the application's authenticated APIs.

### Insight library

- Store sources such as books, articles, podcasts, and standalone principles.
- Capture individual ideas from each source.
- Track idea depth through `understood`, `noticed`, `applied`, and `internalized`.
- Link journal thoughts to source ideas and update progress as understanding becomes practice.

### Behavioural and cognitive exercises

- **Behavioural Activation**: record activities with before/after ratings for depression, pleasure, and achievement, then save them to the journal.
- **Worry Postponement**: complete a structured seven-day module with worry definitions, evidence for and against, scheduled thinking time, postponed items, experiment-day observations, and outcome comparisons.

### RAG and semantic personal search

Thoughts materializes supported journal data into RAG documents and stores chunked embeddings in PostgreSQL with `pgvector`.

- Index thoughts, book ideas, conversation summaries, behavioural activation entries, day notes, and daily rollups.
- Re-sync documents and optionally force re-embedding when source content changes.
- Configure enabled document types, chunk size, overlap, retrieval counts, custom grounding instructions, and the selected language model in Settings.
- Search the archive using vector similarity with a text-search fallback.
- Augment searches with temporal expressions such as "today", "this week", and "last month".
- Ask questions through grounded RAG generation; responses include provenance excerpts and return "I don't know" when the indexed context does not contain the answer.
- Show live RAG context while writing when live context is enabled.

### MCP integration

Thoughts includes a JSON-RPC MCP server at `/api/mcp`, secured with an API key and configured for one MCP user. Compatible assistants can use tools to read and update the personal workspace, including:

- `get_daily_summary`, `get_thoughts`, and `get_conversation_logs`
- `create_thought` and `create_conversation_log`
- `get_tasks`, `create_task`, `update_task_status`, `update_task`, `delete_task`, and `roll_forward_tasks`
- `get_recurring_tasks`, `create_recurring_task`, and `apply_recurring_tasks`
- `get_behavioural_activation_entries`
- `delete_conversation_log`
- `search_journal` for semantic search across the indexed archive

The server implements MCP protocol version `2024-11-05`, exposes `initialize`, `tools/list`, and `tools/call`, and keeps MCP data scoped to the configured user.

### Conversation archive

External assistants can save structured conversation summaries containing a date, title, topics, insights, action items, and optional mood context. These summaries remain separate from normal thought cards while still being available to RAG search.

### Reports, backup, and portability

- Export daily reports as JSON or CSV.
- Export monthly reports as JSON with grouped day-by-day summaries.
- Export a full JSON backup of thoughts, tasks, routines, and related personal data.
- Restore data from a previous JSON backup.

### PWA and operational tooling

- Installable PWA manifest with app icons.
- Service worker and offline fallback page.
- Health endpoint for checking database and Gemini configuration.
- Global semantic search and API-backed retrieval components.
- User-configurable AI, RAG, live-context, and task-agent settings.

## Routes

| Area | Route |
|---|---|
| Public landing page | `/` |
| Authentication | `/login`, `/register` |
| Journal dashboard | `/dashboard` |
| Daily execution | `/dashboard/today` |
| Recurring tasks | `/dashboard/tasks` |
| Completion analytics | `/dashboard/completion` |
| Insight library | `/dashboard/insights` |
| AI task control center | `/dashboard/agent` |
| Conversation archive | `/dashboard/conversations` |
| Behavioural Activation | `/dashboard/activation` |
| Worry Postponement | `/dashboard/worry-postponement` |
| Settings | `/dashboard/settings` |

## API and integration endpoints

- `POST /api/smart-capture` - Convert raw text into structured thought fields with Gemini.
- `GET /api/retrieval` - Retrieve relevant indexed excerpts.
- `POST /api/rag/generate` - Answer a question using grounded retrieved context.
- `GET|POST /api/rag/documents` - Inspect, synchronize, and embed materialized RAG documents.
- `POST /api/mcp` - MCP JSON-RPC endpoint for external assistants.
- `POST /api/conversations/create` - Authenticated integration endpoint for conversation summaries.
- `GET|POST /api/backup` - Export or restore a full JSON backup.
- `GET /api/reports/daily` - Generate a daily report.
- `GET /api/reports/monthly` - Generate a monthly report.
- `GET /api/health` - Check service configuration and database health.

## Tech stack

- **Framework:** Next.js App Router
- **Language:** TypeScript
- **UI:** React
- **Styling:** Tailwind CSS
- **Database:** PostgreSQL via `pg`
- **Vector search:** PostgreSQL `pgvector`
- **AI:** Google Gemini for embeddings, smart capture, and grounded generation
- **Authentication:** Signed cookie-based sessions
- **Protocol integration:** Model Context Protocol (MCP) over JSON-RPC
- **Runtime:** Node.js
- **Client capabilities:** Progressive Web App with service-worker offline fallback

## Data model

Core entities include:

- Users and signed sessions
- Thought cards and concept tags
- Daily tasks and recurring task templates
- Day notes and daily check-ins
- Source library items and source ideas
- Insight links between thoughts and ideas
- Behavioural activation modules and entries
- Worry-postponement modules, evidence, postponed items, and experiment days
- Conversation summaries
- RAG documents and embedding chunks
- Per-user AI and retrieval settings

## Getting started

### Prerequisites

- Node.js
- PostgreSQL with the `pgvector` extension enabled
- A Google Gemini API key for AI features

### Install and run

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

### Environment variables

Create `.env.local` with the database, authentication, and AI settings required by your deployment:

```env
DATABASE_URL=postgresql://user:password@localhost:5432/thoughts
AUTH_SECRET=replace-with-a-long-random-secret
GEMINI_API_KEY=your-gemini-api-key

# Optional Gemini configuration
GEMINI_EMBEDDING_MODEL=gemini-embedding-001
GEMINI_LLM_MODEL=gemini-3.6-flash
EMBEDDING_DIM=768

# Required only for external MCP access
MCP_API_KEY=replace-with-a-secret-api-key
MCP_USER_ID=1
```

`GOOGLE_API_KEY` can be used as an alternative to `GEMINI_API_KEY`. Never commit real credentials or expose server-only secrets in client code. If the browser-based task agent is enabled, configure its public client key according to the deployment's security model.

## Development commands

```bash
npm run dev
npm run build
npm run start
npm run lint
npm test
```

## Export shape

Daily and monthly exports preserve timestamps, mood scores, task states, check-ins, day notes, linked ideas, and grouped summaries in machine-readable formats. A simplified daily report looks like:

```json
{
  "date": "2026-06-22",
  "thoughts": [],
  "tasks": [],
  "task_progress": {
    "total": 3,
    "done": 2,
    "completion_rate": 66.7
  },
  "day_note": {
    "intention": "...",
    "note": "..."
  },
  "check_ins": []
}
```

## Privacy and security

Thoughts is designed for one private user account. Dashboard routes require a signed session, database queries are scoped by user ID, and the MCP endpoint requires an API key plus an explicitly configured user. Use HTTPS in production, keep `AUTH_SECRET`, `DATABASE_URL`, `GEMINI_API_KEY`, and `MCP_API_KEY` server-side, and treat exported backups as sensitive personal data.

## In one sentence

Thoughts is a private AI-assisted personal operating system that turns journaling, tasks, routines, therapeutic exercises, ideas, conversations, and semantic memory into one searchable and actionable workspace.
