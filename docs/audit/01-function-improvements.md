# Report 1 — Function-level improvements (with researched best practice)

Audit date: 2026-10-05. Scope: `src/lib/*`, `src/lib/db/*`, `src/app/actions.ts`, all `src/app/api/**` routes.
Priority: **P0** = broken/insecure now, **P1** = should fix soon, **P2** = worthwhile upgrade.

> Coverage note: I read in full auth, session, password-reset, email, rate-limit, request-origin, Gemini client, chunking, RAG
> sync/retrieval/generate, MCP route, backup, health, smart-capture, DB init, users, password-resets, and the first half of
> `actions.ts`. I skimmed (patterns, queries, limits) `db/tasks.ts`, `db/thoughts.ts`, `temporal.ts`, and the worry/activation/
> conversation routes. These are not line-by-line verified; findings there are marked "skim".

---

## 1. Authentication & session (`src/lib/auth.ts`, `actions.ts`)

| # | Function | Issue | Better approach | Pri |
|---|---|---|---|---|
| 1.1 | `hashPassword` / `verifyPassword` | Uses **synchronous** `scryptSync` with Node defaults (N=16384). Blocks the event loop ~50–100 ms per login/register; N=16384 is below OWASP's scrypt minimum (N=2^17, r=8, p=1). | Move to async `crypto.scrypt` with explicit `{N: 2**17, r: 8, p: 1, maxmem}` or Argon2id (OWASP: ≥19 MiB, t=2, p=1). Store params in the hash string (`scrypt$N$r$p$salt$hash`) so they can be upgraded; rehash on login when params are old. | P1 |
| 1.2 | `loginAction` | No rate limiting / lockout; user-not-found returns instantly while found users pay a full scrypt → **timing-based account enumeration**. | Per-IP + per-email limiter; always run a dummy `verifyPassword` against a fixed hash when the user is missing. | P0 |
| 1.3 | `registerAction` | Open registration on an app described as "private, single-user"; reveals "exists" (enumeration); no password max length (scrypt on megabyte input = CPU DoS). | Gate with `ALLOW_REGISTRATION` env / invite code or disable after first user; cap password at ~128 chars; generic error. | P0 |
| 1.4 | `createSession` / `decodeSession` | Stateless HMAC cookie: **logout cannot revoke it**; no sliding expiry; HMAC compare of signature strings is OK (`timingSafeEqual`) but `AUTH_SECRET` is also reused for reset-token hashing (key reuse). | Add a `sessions` table (random id, hash stored, expires, revoked) or at least a per-user `session_version`. Use separate keys per purpose (`RESET_TOKEN_SECRET` is supported but falls back to `AUTH_SECRET`). | P1 |
| 1.5 | `isValidPassword` | Length ≥ 8 only. | NIST 800-63B: min 8 (prefer 12+), no composition rules, block breached passwords (HIBP k-anonymity). | P2 |
| 1.6 | `getCurrentUser` | Hits the DB (`getUserById` → `ensureInitialized`) on every page *and* every API call; called repeatedly per request tree. | Wrap in `React.cache()` so a render pass resolves once. | P2 |
| 1.7 | `src/proxy.ts` missing | Next.js 16 renamed `middleware.ts` → `proxy.ts`. There is none, so every route re-implements its own redirect. | Add `proxy.ts` as an *optimistic* cookie check/redirect for `/dashboard/*` and keep the real check in a data-access layer (don't do DB work in proxy). [Auth0 on Next 16](https://auth0.com/blog/handling-auth-nextjs16-with-server-actions-middleware/) | P2 |

## 2. Password reset (`password-reset.ts`, `reset-rate-limit.ts`, `email.ts`, `/api/auth/*`)

| # | Function | Issue | Fix | Pri |
|---|---|---|---|---|
| 2.1 | `sendWithResend` | **Bug:** header is `Authorization: "Token " + key`. Resend requires `Bearer`, and also requires a `User-Agent`. Result: every production reset email silently fails (errors are swallowed). [Resend docs summary](https://apidog.com/blog/resend-api-key/) | `Authorization: Bearer ${key}`, add `User-Agent`, log non-2xx status, add `html` part. | **P0** |
| 2.2 | `sendPasswordResetEmail` | In production with no key it silently does nothing; user sees "check your email". | Throw/log loudly at boot if `NODE_ENV=production` and no provider configured. | P1 |
| 2.3 | `hashPasswordResetToken` | Uses `scryptSync` for a 256-bit random token. Slow KDF buys nothing for high-entropy secrets and gives attackers a cheap CPU-DoS lever on `/api/auth/reset-password`. | `createHmac("sha256", secret).update(token)`. | P1 |
| 2.4 | `consumePasswordResetAttempt` | In-memory `Map` — resets on restart, not shared across serverless instances; key is `ip:email` so an attacker rotating emails is never limited; bare `catch` hides failures. | Postgres-backed counter (table + `INSERT … ON CONFLICT`) or Upstash/Redis; limit per IP *and* per email separately. | P1 |
| 2.5 | `getRequestIdentity` | Trusts `x-forwarded-for` first hop — client-spoofable unless a trusted proxy overwrites it. | Take the right-most trusted hop / platform header (`x-vercel-forwarded-for`, `cf-connecting-ip`). | P1 |
| 2.6 | Forgot-password timing | Constant 400 ms floor, but real path (DB + token + email fetch) can exceed it → still distinguishable. | Do the email send after responding (`after()` from `next/server`) so both paths return in the same time. | P2 |
| 2.7 | Reset POST | After reset, `clearSession()` only clears *this* browser; other sessions are invalidated via `password_updated_at` (good). | Keep; add a test that old cookies fail (exists). | ✔ |

## 3. Database layer (`db/client.ts`, `db/init.ts`)

| # | Function | Issue | Fix | Pri |
|---|---|---|---|---|
| 3.1 | `pool` creation | `normalizeDatabaseUrl` rewrites `sslmode` to `verify-full` **and** passes `ssl: { rejectUnauthorized: false }`. These contradict; node-postgres builds TLS options from the URL when `sslmode` is present and may ignore the `ssl` object, so actual behaviour is ambiguous and certificate checking may be silently off. [pg SSL notes](https://oneuptime.com/blog/post/2026-01-21-postgresql-ssl-tls/markdown) | Pick one: provide the CA (`ssl: { ca }`) and keep verification on; remove `rejectUnauthorized:false`. No `max`, `idleTimeoutMillis`, `connectionTimeoutMillis`, or `pool.on("error")` handler → an idle-client error crashes the process. | **P0** |
| 3.2 | `ensureInitialized` | ~60 sequential DDL statements run lazily **on the request path**, no advisory lock (two cold instances race), and `CREATE EXTENSION` failure is swallowed. Also seeds 3 `thoughts` rows with `user_id NULL` into an empty DB. | Move to a migration tool (node-pg-migrate / Drizzle Kit / Prisma Migrate) run at deploy; wrap in `pg_advisory_lock`. Delete the seed rows. | P1 |
| 3.3 | Missing indexes | `thoughts` has no `(user_id, created_at)` index; keyword search computes `to_tsvector(...)` per row with no GIN index. | Add both; store a generated `tsvector` column on `rag_documents` + GIN. | P1 |

## 4. Gemini client (`src/lib/gemini.ts`, `embedding-config.ts`)

| # | Function | Issue | Better approach | Pri |
|---|---|---|---|---|
| 4.1 | `embedTexts` | Embeds **one text per HTTP call, sequentially**. A re-index of N chunks = N round trips. | Use `batchEmbedContents` (up to 100 requests/call) with concurrency limit. [Embeddings API](https://ai.google.dev/api/embeddings) | P1 |
| 4.2 | `embedTexts` response parsing | 6 speculative response shapes with `any` — the real API returns `embedding.values` (single) / `embeddings[].values` (batch). | Type the real shape; delete the rest (also removes ~20 lint errors). | P1 |
| 4.3 | Embedding model | `gemini-embedding-001` still works (shutdown 2028) but Google's recommended successor is **`gemini-embedding-2`** (released 2026-04-22). [Deprecations](https://ai.google.dev/gemini-api/docs/deprecations) | Evaluate on your own queries (`scripts/query-intent-eval`); migration needs full re-embed — `EMBEDDING_INDEX_VERSION` already triggers that. | P2 |
| 4.4 | `normalizeVector` | Correct — non-3072 dims must be normalised. ✔ | — | ✔ |
| 4.5 | `callGenerativeApi` | Retries 429 in-place (3× with backoff) *before* the model-fallback chain, so a rate-limited primary wastes ~3.5 s before trying another model; no jitter; ignores `Retry-After`; `JSON.parse` failure returns a raw string typed as object. | Fail over to next model immediately on 429/503; honour `Retry-After`; add full jitter. | P1 |
| 4.6 | `GEMINI_FALLBACK_MODELS` | Includes `gemini-2.0-flash`, **shut down 2026-06-01**; list is hard-coded and mixes Gemma open models. | Move to env/config; drop dead IDs; add a startup `models.list` check. | P1 |
| 4.7 | `generateFromPrompt` | No `systemInstruction` (instructions are sent as a user part — weaker injection resistance), no `responseMimeType/responseSchema`, `temperature` default 0.0 (Google advises leaving Gemini 3 at default 1.0 — **verify against current docs for your model**), and thinking-model token budget isn't separated from `maxOutputTokens` (health check uses 8 tokens → can return empty text). | Add `systemInstruction`, `thinkingConfig`, and structured output support. | P1 |
| 4.8 | `ingestMaterializedDocument` | One `INSERT` per chunk, no transaction; a crash mid-way leaves a mix of old/new chunks. Embedding string built with `join(",")`. | Single transaction; multi-row `unnest()` insert. | P2 |
| 4.9 | Module top-level | Throws at import if `EMBEDDING_DIM` env ≠ 1536 and reads env at import → breaks `next build` if env absent. | Validate lazily / use a zod env schema. | P2 |

## 5. Smart capture (`/api/smart-capture`)

* **5.1 Five hand-written JSON-recovery strategies** (fences, first/last brace, regex, prefix strip). Replace with Gemini **structured output** (`responseMimeType: "application/json"` + `responseSchema`), which is supported on all active models. [Structured output docs](https://ai.google.dev/gemini-api/docs/json-mode). Deletes ~60 lines and removes parse-failure 502s. **P1**
* 5.2 Raw user text is concatenated into the prompt next to instructions → prompt injection can force arbitrary `linkedBookIdeaId`/fields. Use `systemInstruction` + delimited user content; the existing server-side validation of the id is good. P2
* 5.3 On parse failure the response echoes `rawResponse` (500 chars of model output) to the client — leak of prompt context. Remove. P2
* 5.4 `getBookIdeasByUser` loads *all* ideas into every prompt: unbounded token cost. Cap / pre-filter by embedding similarity. P2
* 5.5 `catch` returns `details: message` for non-Gemini errors (internal error text to client). P2
* 5.6 No per-user rate limit on a paid endpoint. P1

## 6. RAG: sync, retrieval, generate

| # | Function | Issue | Fix | Pri |
|---|---|---|---|---|
| 6.1 | `syncRagDocumentsForUserUnlocked` | **Data-loss bug:** loads `getThoughtsByUser(userId, 1000)` and `getConversationSummariesByUser(…, 1000)`, then **deletes every `rag_documents`/`embeddings` row not in that list**. User with >1000 thoughts silently loses the index for older ones on every sync. | Page through all rows (or remove the limit) before the delete step; only delete keys whose source row no longer exists. | **P0** |
| 6.2 | Same | Loads every month's tasks/check-ins in a loop of 3 queries/month; embeds sequentially (see 4.1). | Single range queries; batch embedding. | P1 |
| 6.3 | `rankHybridResults` | Score = `0.35*ts_rank − 0.65*distance`. `ts_rank` is unbounded/un-normalised and keyword/temporal rows are given a fake `distance` of 1 / 0, so temporal rows (distance 0) always outrank real semantic hits, and keyword rows are penalised by a constant. | Use **Reciprocal Rank Fusion**: `score = Σ 1/(60+rank_i)` over each list — scale-free and standard for Postgres hybrid search. [Hybrid search on Postgres](https://docs.railway.com/guides/hybrid-search-postgres-pgvector) | P1 |
| 6.4 | Keyword query | `plainto_tsquery('simple', …)` ANDs every word of a natural-language question → almost always zero rows; `'simple'` config does no stemming; no index. | `websearch_to_tsquery('english', …)` (or OR-ed terms), precomputed `tsvector` + GIN. | P1 |
| 6.5 | Vector search | No ANN index (deliberately dropped; fine for one user). If data grows: HNSW + `hnsw.iterative_scan` (pgvector ≥0.8) so filtered queries still return k rows. | — | P2 |
| 6.6 | `/api/retrieval` & `/api/rag/generate` | ~150 lines of retrieval logic copy-pasted; `generate` skips `extractRagQueryIntent` so the same question retrieves differently in search vs answer. | Extract `retrieveContext(userId, query, opts)` in `lib/rag-retrieval.ts`. | P1 |
| 6.7 | `x-use-synthetic-embedding` header | Any logged-in user can send it in **production**; it also hard-codes 1536. | Gate on `NODE_ENV !== "production"`. | P1 |
| 6.8 | Prompt in `generate` | Journal chunks are passed as bare parts; text inside an entry can instruct the model ("ignore previous…"). | Wrap in `<excerpt>` tags, put rules in `systemInstruction`, state that excerpts are data. | P2 |
| 6.9 | Chunking `chunkText` | Fixed-size character windows cut mid-word/sentence. | Split on paragraph → sentence boundaries with the same overlap; keep metadata header (Title/Date) on every chunk (contextual chunking). | P2 |
| 6.10 | Re-ranking | None. | Optional cross-encoder or LLM rerank of top-20 for `generate`. | P2 |

## 7. MCP server (`/api/mcp`)

| # | Issue | Fix | Pri |
|---|---|---|---|
| 7.1 | `providedApiKey !== expectedApiKey` — non-constant-time compare. | `timingSafeEqual` on equal-length hashes. | P0 |
| 7.2 | API key accepted in **query string** (`?api_key=`) → ends up in access logs, browser history, referrers. | Header only (`Authorization: Bearer`). | P0 |
| 7.3 | Declares `protocolVersion: "2024-11-05"` (HTTP+SSE era). Spec has since moved through 2025-03-26 (Streamable HTTP, OAuth 2.1, annotations) to **2026-07-28**, which also removes protocol-level sessions. [MCP changelog](https://modelcontextprotocol.io/specification/latest/changelog) | Negotiate version from the client's `initialize`; return 202 (not 204) for notifications; add `ping`. Prefer the official `@modelcontextprotocol/sdk` over a hand-rolled JSON-RPC layer. | P1 |
| 7.4 | Tool failures returned as HTTP 4xx/5xx JSON-RPC errors. MCP says tool *execution* errors should be a normal result with `isError: true` so the model can self-correct. | Wrap `handleToolCall`. | P1 |
| 7.5 | No **tool annotations** (`readOnlyHint`, `destructiveHint`, `idempotentHint`) — delete_task / delete_conversation_log look identical to reads for the client's confirmation UX. | Add them. | P1 |
| 7.6 | `create_conversation_log` calls its own HTTP API via `request.url` (self-fetch; host-header dependent, extra latency, breaks behind some proxies). | Call the DB function directly. | P1 |
| 7.7 | `get_conversation_logs` default month uses `new Date().toISOString()` (UTC) while everything else uses Colombo time → wrong month for ~5.5 h/day. | `getCurrentColomboMonth()`. | P1 |
| 7.8 | `search_journal` is vector-only (no keyword/temporal/filters) and returns `distance` only. | Reuse the shared retrieval function (6.6). | P2 |
| 7.9 | `get_thoughts`/`get_tasks` hard `LIMIT 100`, no pagination cursor; `get_behavioural_activation_entries` loads all rows then filters in JS. | Push filters into SQL; add `limit/offset`. | P2 |
| 7.10 | `create_recurring_task` trusts `daysOfWeek as string[]` without enum validation (schema says enum, code doesn't enforce). | Validate server-side. | P1 |
| 7.11 | 1,330-line single file. | Split: `tools/*.ts` registry + `auth.ts` + `transport.ts`. | P2 |

## 8. Backup / restore (`/api/backup`)

* 8.1 **Export is incomplete**: only thoughts, tasks, recurring tasks, book ideas. Missing: anchor notes, conversation logs, day records, check-ins, activation entries, worry module data, settings, concept tags/insight links. A "backup" that loses these is a data-loss trap. P0
* 8.2 **Import is lossy and non-idempotent**: tasks are parsed then never inserted; `ON CONFLICT DO NOTHING` has no matching unique key so re-importing **duplicates everything**; `created_at`, concept tags, insight logs are dropped; no transaction (partial failure leaves half-imported data); one query per row; no payload size/array-length cap; no schema/version validation; no origin check. P0
* 8.3 Fix: versioned schema (zod), single transaction, `unnest` bulk inserts, stable `id`/`request_id` for dedupe, size cap, `isTrustedPostOrigin`. Export as streamed NDJSON for large archives.

## 9. Other endpoints & actions

* `/api/health` (`GET`) performs a **real paid LLM call on every request** and walks the whole fallback chain on failure → easy cost/quota amplifier and slow. Cache result for 60 s or add a cheap `models.get` check; separate liveness (`/api/health`) from LLM diagnostics. P1
* `actions.ts`: every action repeats `getCurrentUser → redirect`, the `failed` flag + redirect-in-try dance, and string-typed toast codes. Factor into `withUser(action)` + `useActionState` returning `{ok, error, fieldErrors}` (keeps form input on error, removes the `?toast=` query-param protocol). P1
* `actions.ts` validation is hand-rolled (`parseMood`, `parseTags`…) and duplicated in MCP route (`normalizeMood`, `normalizeStringArray`…) with **different limits** (tags capped at 8 in both, but smart-capture caps at 5). Share one zod schema module. P1
* No length limits on `title/summary/body/note` in actions (Server Action default body cap is 1 MB). Add per-field caps. P1
* `time.ts`: `hour12:false` with `en-CA` can emit `"24"` for midnight in some ICU versions → use `hourCycle: "h23"`. P1. Timezone is hard-coded to `Asia/Colombo`; store `timezone` in `user_settings`. P2
* `request-origin.ts`: allows requests with **no** Origin/Referer outside production only — correct; also add `Sec-Fetch-Site` check. P2
* `next.config.ts` is empty: add security headers (CSP with nonce, HSTS, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `frame-ancestors`), and `experimental.serverActions.allowedOrigins`/`bodySizeLimit` if behind a proxy. [Server Actions config](https://nextjs.org/docs/app/api-reference/config/next-config-js/serverActions) P1

## 10. New features worth considering (researched)

1. **Hybrid retrieval with RRF + GIN** (6.3/6.4) — biggest quality gain for "find that thing I wrote" queries.
2. **Passkeys / WebAuthn** (SimpleWebAuthn) — best fit for a single-user private journal; removes password-reset surface entirely.
3. **Streaming answers** for `/api/rag/generate` (`streamGenerateContent` + `ReadableStream`) — perceived latency drops from seconds to ~first token.
4. **Client-side encryption option** for journal body (WebCrypto, user-held key) — journal data is sensitive; also makes DB leaks harmless.
5. **Background jobs** for RAG sync (Vercel Cron / `after()` / queue) instead of a user-triggered request with a 10-min lease.
6. **Optimistic UI** via `useOptimistic` for task status toggles (today a full redirect + re-render per click).
7. **`use cache` / `cacheTag`** for read-heavy aggregates (monthly completion, insights) with `revalidateTag` from actions — all pages are currently `force-dynamic`.
8. **Observability**: replace `console.log` of query text with structured logs (pino) + request ids; add OpenTelemetry (Next has built-in `instrumentation.ts`).
9. **Offline write queue** in the service worker (Background Sync) for thought capture — the PWA currently only caches static assets.
10. **Tests**: only 24 pure-function tests. Add route-level tests for auth, backup round-trip, MCP tool contract.

## Sources
* [Auth in Next.js 16 (proxy.ts)](https://auth0.com/blog/handling-auth-nextjs16-with-server-actions-middleware/)
* [OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
* [Gemini Embeddings API](https://ai.google.dev/api/embeddings) · [Gemini deprecations](https://ai.google.dev/gemini-api/docs/deprecations) · [Gemini JSON/structured output](https://ai.google.dev/gemini-api/docs/json-mode)
* [Hybrid search on Postgres/pgvector (RRF, GIN, HNSW)](https://docs.railway.com/guides/hybrid-search-postgres-pgvector)
* [MCP spec changelog](https://modelcontextprotocol.io/specification/latest/changelog)
* [Resend send-email auth](https://apidog.com/blog/resend-api-key/)
* [node-postgres TLS](https://oneuptime.com/blog/post/2026-01-21-postgresql-ssl-tls/markdown)
* [Next.js Server Actions config](https://nextjs.org/docs/app/api-reference/config/next-config-js/serverActions)
