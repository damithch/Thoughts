# Report 2 — UI / UX / accessibility issues

Method: static review of `globals.css`, `layout.tsx`, shared components (toast, global-search, range-slider, submit-button, service worker) and structural greps across all pages. **I could not run the app** (no `DATABASE_URL`/`AUTH_SECRET` in this sandbox), so nothing here was verified in a browser; items marked *(verify)* need a visual check. Standard: [WCAG 2.2](https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/).

## A. High impact

| # | Where | Issue | Fix |
|---|---|---|---|
| A1 | `toast.tsx` | No `role="status"`/`aria-live`; the node is mounted *with* its content, so screen readers usually don't announce it. Auto-dismisses after 4.5 s (WCAG 2.2.1 Timing Adjustable) and error toasts vanish before they can be read. Literal tone word ("error") shown as the label. The toast message lives in `?toast=` so **refresh/back re-shows it**. [Accessible toasts](https://adrianroselli.com/2020/01/defining-toast-messages.html) | Persistent live-region container (`role=status` for success/info, `role=alert` for errors); don't auto-dismiss errors; pause on hover/focus; clear the query param with `router.replace` after showing. |
| A2 | `global-search.tsx` | Command palette is not a dialog: no `role="dialog"`/`aria-modal`, no focus trap, no focus return to the trigger, no combobox/listbox semantics (`aria-activedescendant`, `aria-selected`), results are `<li onClick>` (not focusable). Mounted in the root layout so it also runs on **/login and /register** (Ctrl+K hijacked, fetches `/api/retrieval` → 401 shown as "No matching…"). Out-of-order responses can overwrite newer results (no `AbortController`). Selecting any result navigates to a generic page, never to the item. ESLint `react-hooks/set-state-in-effect` error. | Use `<dialog>`/Radix Dialog + Combobox pattern; render only when authenticated; abort stale fetches; deep-link (`/dashboard?edit=ID`, `?date=`); show auth/network errors distinctly. |
| A3 | Whole app | **Dark mode is half-implemented.** `:root` swaps `--background/--foreground` under `prefers-color-scheme: dark`, but ~all components hard-code light utilities (`bg-white/70`, `text-stone-900`, `bg-emerald-50`). Only 2 files use `dark:` variants. Body text inherits a light foreground on light cards → low/zero contrast *(verify)*. | Either remove the dark `:root` block and set `color-scheme: light`, or add a semantic token layer (`bg-surface`, `text-ink`) and convert components. |
| A4 | 17 files | `outline-none` appears ~95× on inputs/buttons; `focus-visible`/`focus:ring` exists in only 4 files. Keyboard users lose the focus indicator (WCAG 2.4.7; 2.4.11 in 2.2). | Global `:focus-visible { outline: 2px solid …; outline-offset: 2px }`; use `focus-visible:ring` on every custom control. |
| A5 | Pages | Only **3 files** contain any `aria-*`/`role`. No `<nav>` landmark anywhere; no skip link; headings not audited. | Add `<nav aria-label>`, `<main id>`, skip link, `aria-current="page"` on active links. |
| A6 | Route tree | No `loading.tsx`, `error.tsx`, `not-found.tsx`, or `global-error.tsx` anywhere. Every page is `force-dynamic` + awaits multiple queries, so navigation shows a frozen screen and any DB error shows Next's default error page. | Add `loading.tsx` skeletons per dashboard segment, a branded `error.tsx` with retry, `not-found.tsx`. |

## B. Forms & feedback

* B1 **Server Actions redirect with `?toast=…` on failure** → the form re-renders empty; users lose a long journal entry on a validation/db error. Use `useActionState` and return field errors + previous values. (also a code-quality item)
* B2 Native `window.confirm()` for delete in `AgentTaskControlCenter.tsx:152`; the same destructive actions elsewhere (delete thought, delete task, delete conversation) have **no confirmation or undo**. Use an accessible confirm dialog or a 5-second Undo toast (soft delete).
* B3 `SubmitButton` shows a spinner but has no `aria-busy`/announcement; spinner SVG lacks `aria-hidden`; most forms don't use it (check per page).
* B4 `range-slider.tsx`: label "k = {value}" is visual-only (no `aria-valuetext`/`output`), `outline-none` removes focus ring, hint text `text-[11px] text-stone-400` fails contrast (≈2.7:1 on white).
* B5 Login/register/reset: no `autocomplete` (`username`, `current-password`, `new-password`), no show-password toggle, no inline password rule hint (8 chars), no `autoFocus`/`inputMode`. *(verify per file)*
* B6 Smart Capture and Global Search have no cancel for in-flight requests; errors only via toast.

## C. Visual / readability

* C1 **~105 uses of text ≤ 11px** (`text-[10px]` ×36, `text-[11px]` ×63, `text-[8px]`, `text-[9px]`) plus very wide tracking (`tracking-[0.22em]`) on uppercase labels. Hard to read, fails WCAG 1.4.4/1.4.12 when users scale text. Minimum 12px (0.75rem), use `rem` not `px`.
* C2 Low-contrast greys (`text-stone-400/500` on white/cream, `emerald-800/70`, `opacity-70`) are used for meaningful text (hints, dates, kinds). Run an axe/Lighthouse contrast pass *(verify)*.
* C3 `.glass-card:hover { transform … }` and `scroll-behavior: smooth` ignore `prefers-reduced-motion` (WCAG 2.3.3). Wrap in `@media (prefers-reduced-motion: no-preference)`.
* C4 `backdrop-filter` on many large surfaces is expensive on low-end phones (the app targets PWA/mobile). Limit to the header/modal.
* C5 Global scrollbar styling is WebKit-only and 6 px wide (hard to grab; Firefox unaffected). Prefer `scrollbar-width`/`scrollbar-color`.
* C6 Typography: `--font-body: "Segoe UI", "Trebuchet MS"` — falls back to different faces per OS; no web font loaded. Consider `next/font` for a consistent body + display pair.
* C7 Tap targets: many pill buttons use `px-2 py-1 text-xs` (Toast close ≈ 24×22 px) — borderline for WCAG 2.5.8 (24 px) and below the 44 px mobile guideline.
* C8 Colour is the only differentiator for mood/status in several badges (calendar mood dots, task priorities) — add text/icon.

## D. Structure & consistency

* D1 Huge page components: `worry-module-client.tsx` 1,869 lines, `today/page.tsx` 959, `dashboard/page.tsx` 854, `AgentTaskControlCenter.tsx` 715. Hard to reason about and to make accessible. Split into feature components.
* D2 Month/date helper functions (`formatMonthLabel`, `shiftMonth`, `buildCalendarDays`) are defined inside `dashboard/page.tsx` and duplicated in others — move to `lib/`.
* D3 Each page re-declares its own toast-message dictionary; inconsistent copy ("Daily anchor dropped and locked…").
* D4 Inconsistent design tokens: purple/indigo (search, RAG range slider) vs emerald/stone (rest) vs rose.
* D5 Calendar grid on dashboard: day cells should be buttons/links with accessible names ("Oct 5, 3 entries, mood 7"), not colour dots only *(verify)*.
* D6 `live-rag-context.tsx` skeleton uses `key={i}` (fine for static) but the panel has one `aria-*` and updates while typing without a live region — suggestions appear silently for AT users.

## E. PWA / offline

* E1 `sw.js` caches static assets only; offline navigation shows a generic page, **no offline capture** (writes fail). Add Background Sync queue for new thoughts or clearly say "offline".
* E2 `STATIC_CACHE`/`RUNTIME_CACHE` versions hard-coded `v1` and runtime cache is unbounded (no eviction) → grows forever. Add max-entries.
* E3 `skipWaiting()` + `clients.claim()` with no update prompt can mix old HTML with new JS chunks mid-session.
* E4 `manifest.ts`/icons: only 192/512 PNG; add maskable icon and screenshots for install UI *(verify)*. `themeColor` is a single green; add dark variant.
* E5 Service worker registered only in production (good) but never unregistered on logout — cached shell could expose last page chrome on a shared device; make sure authenticated HTML is never cached (currently navigations are network-first, OK).

## F. Quick wins (≈1 day)

1. Global `:focus-visible` style and delete most `outline-none`.
2. Toast live region + sticky errors.
3. Min font 12 px sweep.
4. `prefers-reduced-motion` block.
5. Hide GlobalSearch when signed out.
6. `loading.tsx` + `error.tsx`.
7. Confirm dialog for deletes.
