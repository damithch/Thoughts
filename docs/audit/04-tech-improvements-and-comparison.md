# Report 4 — Technical improvements & platform comparison (2026-10-30)

Re-checked against the code on `master` (4b8120b). Report 3 (`03-code-issues.md`) listed security items; most are **still open**.

## 1. Still-open issues from Report 3 (fix first)

| Priority | Issue | Where |
|---|---|---|
| High | MCP API key compared with `!==` (not constant-time) and accepted via `?api_key=` query string (leaks into logs/history) | `src/app/api/mcp/route.ts` ~L1229 |
| High | DB TLS uses `rejectUnauthorized: false` — cert not verified | `src/lib/db/client.ts:38` |
| High | No login throttling; open registration on a single-user app | `src/app/actions.ts` |
| Med | `x-use-synthetic-embedding` header honoured in production (returns fake answers) | `api/retrieval`, `api/rag/generate` |
| Med | No security headers / CSP | `next.config.ts` |
| Med | Stateless cookie sessions can't be revoked on logout | `src/lib/auth.ts` |
| Low | `scryptSync` blocks the event loop | `src/lib/auth.ts:37` |
| Low | Dead model `gemini-2.0-flash` still in fallback chain | `src/lib/gemini.ts:35` |
| Low | Keyword search uses `plainto_tsquery` (AND of all words) — rarely matches natural questions; use `websearch_to_tsquery` or OR terms | `api/retrieval`, `api/rag/generate` |
| Low | `seedThoughts` inserted into empty DBs | `src/lib/db/init.ts` |

## 2. Architecture improvements

1. **Real migrations instead of `ensureInitialized()`.** `init.ts` runs ~900 lines of `CREATE/ALTER` on first request of every cold start (slow on serverless, no rollback, no history). Move to versioned SQL migrations (e.g. node-pg-migrate, Drizzle Kit) run in CI/deploy.
2. **Typed query layer + input validation.** Raw `pg` with hand-written row types and hand-rolled `normalize*` helpers. A schema library (Zod/Valibot) shared by API routes, MCP tools and the mobile app removes duplication and catches drift. Drizzle or Kysely would give typed SQL without an ORM-heavy model.
3. **Split the big files.** `api/mcp/route.ts` (1.3k lines), `app/actions.ts` (1.2k), `worry-module-client.tsx` (1.9k), `dashboard/page.tsx` (900). One module per MCP tool; a shared service layer that web actions, `/api/v1` (mobile) and MCP all call — today some MCP tools call the app's own HTTP API (`createConversationLogViaApi`), which is an avoidable round trip.
4. **MCP protocol upgrade.** Server pins `2024-11-05`. Current spec revisions add Streamable HTTP transport, OAuth 2.1 authorization (replaces static API keys), structured tool output and tool annotations (read-only/destructive hints). Upgrading lets Claude/ChatGPT connectors attach without a shared secret. The official `@modelcontextprotocol/sdk` handles the protocol so the hand-written JSON-RPC can go.
5. **Background jobs for RAG.** Embedding sync runs inside a request (`/api/rag/documents`) under a DB lease. Move to a queue/cron (Vercel Cron + `after()`, or pg-boss) and embed incrementally on each write so search is never stale.
6. **Vector index.** IVFFlat was dropped because per-user filtering returned too few rows. With pgvector ≥0.8, an HNSW index plus `hnsw.iterative_scan = relaxed_order` fixes that, so search stays fast as the archive grows.
7. **Hybrid ranking.** Replace the constant fake distances in `rankHybridResults` with Reciprocal Rank Fusion of vector + keyword ranks.
8. **Lint must block CI.** Lint is `continue-on-error`. Fix the ~70 errors and make it required; add Playwright smoke tests for login → capture → search.
9. **Observability.** No error tracking or LLM cost logging. Add Sentry (or OpenTelemetry via Vercel) and log tokens/model per AI call; the multi-model fallback hides failures today.
10. **AI provider abstraction.** Gemini is hard-wired. A thin provider interface (or Vercel AI SDK) allows swapping models, structured output with schemas, and streaming responses in the UI.

## 3. Comparison with similar platforms

| Capability | Thoughts | Rosebud | Day One | Reflect | Obsidian (+ plugins) |
|---|---|---|---|---|---|
| AI journaling / prompts | Smart Capture (one-shot) | Conversational, long-term memory | Add-on | AI assistant | Plugins |
| Semantic search / ask your archive | Yes (pgvector RAG) | Yes | Limited | Yes | Smart Connections plugin |
| Tasks & routines | Yes, strong | No | No | Light | Plugins |
| CBT-style exercises (BA, worry) | Yes — unique | Guided programs | No | No | No |
| MCP / external assistant access | Yes (built-in) | No | No | No | Community servers |
| End-to-end encryption | **No** | No | Yes | Yes | Yes (Sync) |
| Offline / local-first | PWA fallback page only | No | Yes | Partial | Yes |
| Mobile app | Expo app (Android build) | iOS/Android | iOS/Android/Mac | iOS/Mac | All |
| Voice capture | Yes (Gemini) | Yes | Yes (transcription) | Yes | Plugins |
| Media (photos/audio attachments) | No | Limited | Yes, rich | Yes | Yes |

**Where Thoughts is ahead:** one place for journal + tasks + therapeutic exercises + idea library, and native MCP access — none of the commercial apps combine these.

**Where it is behind (technical gaps):**
1. **Privacy** — no encryption at rest beyond the DB provider; journal text is sent to Gemini. Competitors (Day One, Reflect) market E2EE. Realistic step: encrypt sensitive columns with a per-user key (pgcrypto or app-level AES-GCM) and document what goes to the LLM.
2. **Offline** — the service worker only serves an offline page. Day One and Obsidian work fully offline. A local store on mobile (SQLite via `expo-sqlite`) with a sync queue would close this.
3. **Conversational reflection** — Rosebud's core feature is a back-and-forth chat that remembers past entries. Thoughts already has RAG; adding a streaming "reflect with me" chat on top of it is mostly UI.
4. **Attachments** — no photos/audio storage. Add object storage (Vercel Blob / S3) with per-user keys.
5. **Periodic insights** — competitors send weekly/monthly AI summaries. Thoughts has report endpoints; schedule them and generate a narrative.

## 4. Suggested order

1. Close Section 1 security items (≈1–2 days).
2. Migrations + validation layer + lint gate.
3. MCP SDK/spec upgrade with OAuth.
4. Background embedding + HNSW + RRF ranking.
5. Product gaps: reflection chat, encryption, offline mobile, attachments.

Sources: [Life Note AI journaling comparison](https://blog.mylifenote.ai/ai-journaling-apps-compared/), [Mindsera tested list](https://mindsera.com/articles/the-7-best-ai-journaling-apps-in-2026-tested), [Rosebud roundup](https://www.rosebud.app/blog/top-10-ai-journaling-apps-for-self-reflection), [Reflect vs Obsidian](https://fabric.so/comparison/reflect-vs-obsidian), [Obsidian MCP server guide](https://verdent.ai/guides/obsidian-mcp-server). The vendor blogs are biased toward their own products, so treat the competitor feature details as approximate.
