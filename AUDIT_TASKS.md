# Audit Follow-ups — Delegable Tasks

Tasks from the 2026-07-02 code audit that are mechanical enough for a smaller model
(or a spare half-hour). Each is self-contained; none change intended behavior.
Verify each with `npm run build` and `npx vitest run`.

## 1. Fix the ~93 pre-existing lint errors

`npm run lint` reports ~95 problems; only 2 were fixed in the audit. The rest are
mechanical: `@typescript-eslint/no-unused-vars`, `prefer-const`
(`src/store/reminderNoticeBuilder.ts:16`), `no-constant-condition`
(`src/utils/concurrency.ts:11` — use `for (;;)` or a real condition).
Fix them without changing behavior; where a variable is intentionally unused,
prefix with `_` only if the eslint config allows it, otherwise remove.

**Done when:** `npm run lint` exits clean and the full test suite passes.

## 2. Lint coverage for Svelte files

`npx eslint src/components/TaskGraph.svelte` fails with a parsing error — .svelte
files aren't linted at all. Add `eslint-plugin-svelte` + `svelte-eslint-parser`
(Svelte 4 compatible versions), wire into the existing eslint config and the
`lint` npm script. Expect a wave of new findings; fix the mechanical ones,
list any judgement calls at the top of the PR/commit message instead of guessing.

**Done when:** `npm run lint` covers `src/**/*.svelte` and exits clean.

## 3. styles.css token normalization

`styles.css` mixes Obsidian design tokens with hardcoded values. The Query Editor
block (search `tt-qe-`) uses raw `4px`/`6px` radii, while the rest of the file uses
`var(--radius-s, 4px)` / `var(--radius-m, 8px)`. Normalize the `tt-qe-` block to:
- radii → `var(--radius-s, 4px)` (inputs/buttons) and `var(--radius-m, 8px)` (sections/errors)
- one-off paddings → the `--tt-space-*` scale where an exact match exists (leave others alone)

Do **not** change computed pixel values — only swap literals for the token that
resolves to the same value. Visual parity is the acceptance test.

**Done when:** no raw radius/spacing literal remains in the `tt-qe-` block where a
token with the same value exists; before/after screenshots of the Query Editor modal match.

## 4. Move reminder notice inline styles into styles.css

`src/store/reminderNoticeBuilder.ts` styles its action buttons and cursor via
`el.style.cssText` / `el.style.cursor`. Add classes (`tt-reminder-notice`,
`tt-reminder-notice-action`) to `styles.css` carrying the same declarations, and
set classes in the builder instead of inline styles. Keep the DOM structure and
click behavior exactly as-is.

**Done when:** no `.style.` assignments remain in `reminderNoticeBuilder.ts`; notice
renders identically (button spacing, cursor affordance).

## 5. Dedupe timeline min-range logic

`src/store/graph/hybridTimeline.ts` re-implements the "pad the range around today"
rule with its own constants (`OVERVIEW_MIN_PAST_DAYS`/`OVERVIEW_MIN_FUTURE_DAYS`)
while `src/store/graph/graphTimeline.ts` exports `normalizeTimelineRange` with the
same 14/28 values (`MIN_PAST_DAYS`/`MIN_FUTURE_DAYS`). Replace the inline
computation in `buildHybridTimeline` (the `minRangeStart`/`minRangeEnd` block) with
a call to `normalizeTimelineRange`, and delete the duplicate constants.

**Done when:** one source of truth for the 14/28 padding; `graphTimeline` and
`hybridTimeline` tests pass unchanged.

## 6. Hoist duplicated `pathLeaf`

Identical private `pathLeaf` helpers exist in `src/store/graph/taskGraph.ts` and
`src/store/graph/hybridTimeline.ts` (strip folder, `.md`, and the `{6hex}-` prefix).
Move one copy to `src/utils/pathUtils.ts` (exported, with a unit test) and import it
in both places.

**Done when:** single exported implementation, both call sites use it, tests pass.

---

### Not delegated (needs design judgement / visual verification)

- Replace the `transform: translateX(scrollLeft)` scroll-synced lane sidebars in
  `TaskGraph.svelte` with `position: sticky; left: 0` — interacts with the
  dependency view's `scale()` transform; needs hands-on visual testing on desktop
  and mobile before committing.
