# Report 3 — Code issues, security & tooling

Baseline results (run in this sandbox on the current branch):

| Check | Result |
|---|---|
| `npx tsc --noEmit` | **Clean** |
| `npm test` | **24 passed, 0 failed** |
| `npx eslint` | **86 problems: 71 errors, 15 warnings** (`no-explicit-any` ×42, `no-require-imports` ×28 in `scripts/`, `no-unused-vars` ×15, `react-hooks/set-state-in-effect` ×1) |
| `npm run build` | not run (needs env: `AUTH_SECRET`, `DATABASE_URL` throw at import) |

## 1. Security (ordered by severity)

| Sev | Issue | Location | Fix |
|---|---|---|---|
| **High** | Password-reset emails never send in prod (`Authorization: Token`, must be `Bearer` + `User-Agent`). | `lib/email.ts:23` | See Report 1 §2.1 |
| **High** | RAG sync deletes the index for everything beyond the newest 1000 thoughts/conversations. | `db/rag.ts` (`getThoughtsByUser(userId, 1000)` + `DELETE … <> ALL(keys)`) | Page all rows before the prune |
| **High** | DB TLS config self-contradictory; `rejectUnauthorized:false` may disable cert verification. | `db/client.ts` | Supply CA, remove flag |
| **High** | MCP API key: non-constant-time compare and accepted via query string. | `api/mcp/route.ts:~1225` | `timingSafeEqual`; header only |
| **High** | Login has no throttling; user enumeration via timing and via register "exists". Open registration on a private app. | `actions.ts` | Limiter, dummy hash, registration gate |
| **Med** | Backup import: unbounded body, no origin check, non-transactional, duplicates, silently drops tasks. Export omits most tables. | `api/backup/route.ts` | Report 1 §8 |
| **Med** | `x-use-synthetic-embedding` accepted in production on `/api/retrieval` & `/api/rag/generate` (also bypasses LLM, returns fake answer). | both routes | Dev-only |
| **Med** | In-memory rate limiter + spoofable `x-forwarded-for`. | `reset-rate-limit.ts`, forgot-password route | DB/Redis limiter; trusted proxy header |
| **Med** | Stateless session cookie can't be revoked on logout; `AUTH_SECRET` reused for reset hashing. | `auth.ts` | Server-side sessions |
| **Med** | `/api/health` triggers paid LLM calls for any authenticated request (cost amplification). | `api/health/route.ts` | Cache/limit |
| **Med** | No security headers / CSP; empty `next.config.ts`. | `next.config.ts` | Add headers |
| **Low** | Error details leaked to clients (`details: message`, `rawResponse`). | smart-capture, generate | Generic message, log server-side |
| **Low** | scrypt params below OWASP minimum; `scryptSync` blocks event loop. | `auth.ts` | Async, tuned params |
| **Low** | Prompt-injection surface: untrusted journal text concatenated into prompts without delimiting/system role. | smart-capture, generate | `systemInstruction` + tagging |
| **Low** | `seedThoughts` inserted with `user_id NULL` into any empty DB. | `db/init.ts` | Remove |

What is **good** (keep): parameterised SQL everywhere I looked; `timingSafeEqual` for session HMAC; httpOnly + sameSite=lax + secure cookie; session invalidation via `password_updated_at`; single-use, revoked-on-new reset tokens consumed under `FOR UPDATE`; generic forgot-password response; per-user scoping on queries; MCP `linkedBookIdeaId` ownership check; RAG sync lease with renewal; Origin check on auth POST routes.

## 2. Correctness bugs

1. **Resend auth header** (above).
2. **RAG prune beyond 1000 rows** (above).
3. **MCP default month in UTC** (`new Date().toISOString().slice(0,7)`) vs Colombo elsewhere.
4. **`rankHybridResults`**: fake `distance` values (0 for temporal, 1 for keyword) make ordering depend on constants, not relevance.
5. **`plainto_tsquery` AND semantics** → keyword leg rarely returns anything for natural-language questions.
6. **`time.ts` `hour12:false`** may output hour `24` (ICU quirk) in `toColomboExportParts` → malformed ISO strings in RAG metadata.
7. **Backup import** says "success" while skipping tasks and creating duplicates.
8. `generateWithFallback` **retries models on 404/"not found"** by string-matching the body — a legitimate "cached content not found"-type error would also cascade; and dead model `gemini-2.0-flash` (shut down 2026-06-01) is still in the chain.
9. `callGenerativeApi`: a successful non-JSON body is returned as a string, then accessed as an object by callers (`json.candidates` → `undefined`, silently returns `JSON.stringify(json)` of a string).
10. `consumePasswordResetToken` swallows every error in a bare `catch` and returns `"failed"`; no log → impossible to debug a failing reset.
11. `AgentTaskControlCenter.tsx:53` `isPending` unused → buttons are never disabled during requests (double-submit possible).
12. `settings/page.tsx` imports `DEFAULT_USER_SETTINGS` but never uses it (dead import / likely dropped behaviour).

## 3. Maintainability

* **Duplicated logic**: retrieval pipeline (2×), input normalisers (actions vs MCP), month/date helpers (several pages), toast-message tables.
* **Oversized modules**: `worry-module-client.tsx` 1,869 · `mcp/route.ts` 1,330 · `actions.ts` 1,096 · `today/page.tsx` 959 · `rag.ts` 890 · `init.ts` 828 · `dashboard/page.tsx` 854.
* **Type safety**: 42 `any` (mostly `gemini.ts`, `smart-capture`), `payload = … as any`. Define response types or use zod.
* **Env handling**: `process.env.X` read in ~10 places at import time with different defaults (`GEMINI_EMBEDDING_MODEL` default repeated in health route, config, gemini). Single `env.ts` (zod) validated at boot.
* **Logging**: `console.log` of user query text (first 60 chars) in retrieval — journal content in server logs. Remove or redact.
* **Docs drift**: `IMPLEMENTATION_COMPLETE.md`, `TASK_MANAGEMENT_GUIDE.md` at repo root and 17 ad-hoc `scripts/*.js` (CommonJS, 28 lint errors, some seed *fake embeddings* into the DB: `seed_fake_embeddings.js`, `delete_synthetic_embeddings.js`) → move to `docs/` and `scripts/dev/`, add the scripts dir to ESLint ignores or convert to ESM.
* **`package.json`**: no `"type"` → Node prints `MODULE_TYPELESS_PACKAGE_JSON` warning on every test; `test` relies on `--experimental-strip-types`. No `typecheck` script, no CI workflow in repo (`.github/` absent).
* **AGENTS.md** warns this Next.js version differs from training data and asks to read `node_modules/next/dist/docs/`; the codebase has no `proxy.ts`, uses `force-dynamic` everywhere and none of the Next 16 caching APIs — worth a dedicated pass against those docs.

## 4. Testing gaps

Existing 24 tests cover reset flow, session invalidation, anchor streak, time shifting, malformed hash. Missing: login/register actions, rate limiter, backup round-trip, RAG ranking (RRF), `chunkText` edge cases, MCP tool schemas vs implementation, retrieval filters (`rag-filters.ts`), temporal parsing across month/year boundaries, and any UI/e2e (Playwright is pre-installed in the environment).

## 5. Suggested fix order

**Week 1 (P0):** Resend header · RAG 1000-row prune · pg TLS/pool config · MCP key (header-only, constant-time) · login throttle + registration gate · backup completeness/idempotency.
**Week 2 (P1):** security headers · shared retrieval module + RRF + GIN/websearch · batch embeddings · structured output for smart-capture · MCP spec bump + annotations + `isError` · toast/focus/dialog a11y · loading/error boundaries · fix all lint errors and add CI (`tsc`, `eslint`, `npm test`).
**Later (P2):** migrations tool, server-side sessions or passkeys, `use cache`, offline queue, split mega-components, `gemini-embedding-2` evaluation.
