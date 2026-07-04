# TTasks — Bug Investigation & To-Do (handoff for Opus)

Investigation date: 2026-07-04. Reporter: Taylor. Investigator gathered root-cause
leads with file:line pointers below so the next agent can go straight to the fix.

Legend: **[DONE]** shipped this session · **[ROOT CAUSE]** confirmed in code ·
**[LEAD]** strong hypothesis, verify live · **[DESIGN]** needs a small design pass.

---

## 1. [DONE] ArchiveService.test.ts failing tests

**Symptom:** 2 tests failing in `src/store/ArchiveService.test.ts`
(`returns 0 when no tasks are eligible`, `archives tasks completed more than
threshold days ago`).

**Root cause:** Time-bomb tests. The fixtures hard-code `completed: '2026-05-19'`
and the service reads the *real* system clock via `localDateString()`. On
2026-07-03 that date is exactly 45 days old, and `archiveEligible` uses
`>= thresholdDays` (`src/store/archiveUtils.ts:47`), so the task meant to be
*within* the 45-day window flipped to eligible.

**Fix applied:** Pinned the clock with `vi.useFakeTimers()` /
`vi.setSystemTime(new Date(2026, 5, 15))` in the `archiveEligibleTasks` describe
block. All 9 tests pass; full suite green (1206/1206).

> Follow-up (optional): grep other suites for hard-coded recent dates + real
> `localDateString()`/`new Date()` to find sibling time-bombs before they trip.

---

## 2. [ROOT CAUSE] Weird hover vs selected visual state in list views

**Symptom:** Selecting a row then moving the mouse makes it ambiguous which row
is actually selected — hover and selection look the same.

**Root cause:** Hover and active use the *identical* background token.
`src/components/TaskRow.svelte:187` `.tt-task:hover { background: var(--background-modifier-hover) }`
and `:191` `.tt-task.is-active { background: var(--background-modifier-hover); box-shadow: inset 2px 0 0 accent }`
share the same fill. The only differentiator is the 2px accent bar, which is easy
to miss, and a hovered non-selected row becomes indistinguishable from the
selected one.

**Fix:** Give `.is-active` a distinct fill (e.g. a tinted
`--background-modifier-active-hover` or an accent-tinted background using the
project's tinted-color pattern) and keep hover lighter. Ensure
`is-active:hover` is also distinct (selected + hovered = third state). Check the
same pattern in Kanban cards and graph nodes for consistency.

---

## 3. [LEAD] Create New Task → Detail pane shows "Task Not Found" (it exists)

**Symptom:** Right after creating a task, the detail pane says not found even
though the file exists.

**Root cause lead:** The detail's task is derived **non-reactively** w.r.t. the
store. `src/components/TaskDetail.svelte:38`:
```js
$: task = $activeTaskPath ? (store.getByPath($activeTaskPath) ?? null) : null;
```
This only re-runs when `$activeTaskPath` changes — **not** when `$tasks` changes.
`store.getByPath` reads `taskMap`, which is populated asynchronously via the
`metadataCache.on('changed')` → syncQueue → `applyParsedTasks` path
(`src/store/TaskStore.ts:88-105, 112-116`). On create, `activeTaskPath` is set to
the new path *before* the store has parsed the new file, so `getByPath` returns
`undefined`, and because the derivation doesn't depend on `$tasks`, it never
re-evaluates when the file finally lands → "not found" sticks.

**Fix:** Make the derivation depend on `$tasks` so it re-runs when the store
updates, e.g.:
```js
$: task = $activeTaskPath
    ? ($tasks.find(t => t.path === $activeTaskPath) ?? store.getByPath($activeTaskPath) ?? null)
    : null;
```
(`tasks` is already an injected prop, `src/components/TaskDetail.svelte:33`.)
This single change likely also fixes item #4. Verify by creating a task and
confirming the pane populates without a manual reselect.

---

## 4. [LEAD] Mark Complete: detail updates but other views (Active) don't; right-click complete also no-ops

**Symptom:** Completing from the detail pane updates the detail fields but the
Active list view keeps showing the task; right-click → Complete appears to do
nothing; "task seems to not record this."

**Root cause leads (two contributing factors):**

1. **Non-reactive detail derivation** (same as #3). `markComplete`
   (`TaskDetail.svelte:125`) optimistically sets the *local* `status` variable,
   so the pane *looks* updated, but the derived `task` (and thus `is_complete`,
   the Reopen/Archive affordances) never re-reads from the store.

2. **No optimistic store update on write.** `TaskWriter.update`
   (`src/store/TaskWriter.ts:100-149`) writes frontmatter via
   `processFrontMatter` and returns — it does **not** touch the in-memory `tasks`
   writable. Propagation to every view depends entirely on Obsidian firing
   `metadataCache.on('changed')` afterward (`TaskStore.ts:112`). If that event is
   delayed, debounced by the syncQueue, or (in some environments) doesn't fire
   after a `processFrontMatter` no-content-change, the Active view's
   `createTaskQuery` over `$tasks` never recomputes.

   `is_complete` itself is derived, not stored: `TaskStore.ts:337`
   `is_complete: normalizedStatus === completionStatus`, so as long as the write
   lands and the rescan runs, it should flip — pointing the finger at the
   store-refresh timing, not the completion logic (`decideCompletion` in
   `src/store/completeTask.ts` looks correct).

**Suggested fix approach:**
- Add an **optimistic in-memory update** in `TaskWriter.update` /
  `TaskStore.update`: after a successful `processFrontMatter`, merge `updates`
  (and recompute `is_complete`/`status_changed`) into the `tasks` writable
  immediately, instead of waiting for the metadata event. The event-driven
  rescan then just reconciles.
- Verify the syncQueue actually flushes for `processFrontMatter`-only edits
  (`src/store/TaskStoreSyncQueue.ts`) — confirm the `changed` event fires and the
  file is re-parsed.
- Apply #3's reactive-derivation fix so the detail reflects the store truthfully.
- **Repro to confirm:** complete via (a) detail button, (b) right-click Complete
  (`runQuickAction('complete', …)` → `contextMenu.ts:42`), (c) kanban drag. All
  three should drop the task out of the Active view immediately and stamp
  `completed`/`status` in the file.

---

## 5. [ROOT CAUSE] Estimated Days ignores weekends/holidays

**Symptom:** A task's estimated-days projection counts calendar days, not working
days.

**Root cause:** The working-day math exists but is gated per-task on
`workweek_only === true`. `src/store/graph/taskGraphDates.ts:41-48` skips
weekends/holidays only when `calendar.workweekOnly` is true (and
`workweek_only` defaults to `false` — `TaskStore.ts:327`). With the default off,
`estimated_days` is added as raw calendar days (`addDays`). Holidays are likewise
per-task (`holiday_dates`, mostly empty), so they don't apply either.

**Fix:** Tie into #6's model change — resolve "should this task skip
weekends/holidays" from a per-project/area toggle + universal holiday list rather
than requiring each task to opt in. Then estimated-days projection uses working
days by default for work areas.

---

## 6. [DESIGN + data model] Holidays should be universal; keep a per-project weekend/holiday toggle

**Symptom / ask:** Holidays are stored per task; they should be a single
universal list. Whether weekends/holidays are *skipped* should be a per-project
(area) toggle — personal todos allow weekend/holiday scheduling; work items skip
them.

**Current model:**
- Per-task `workweek_only: boolean` + `holiday_dates: string[]`
  (`src/types.ts:37-39`, written in `TaskWriter`/`CreateTaskModal`).
- Graph aggregates holidays via `collectProjectHolidayDates(overviewTasks)`
  (`TaskGraph.svelte:264`); non-working bands built from that
  (`graphTimeline.ts` `buildTimelineNonWorkingBands`).

**Proposed model:**
- Add a **universal `holidays: string[]`** to settings
  (`src/settings/defaults.ts` `DEFAULT_SETTINGS`) with a settings-tab editor
  (reuse the managed-list UI pattern already used for areas/statuses).
- Add a per-area **"skip weekends/holidays"** toggle (e.g.
  `areaWorkweek: Record<string, boolean>` alongside `areaColors`). Resolve a
  task's effective calendar from its area's toggle, falling back to the per-task
  `workweek_only` for tasks with no area.
- Update `buildTaskCalendars`/`taskGraphDates.ts:74-75` and
  `collectProjectHolidayDates` to read the universal holiday set + per-area
  toggle instead of per-task fields.
- Migration: keep reading legacy per-task `holiday_dates`/`workweek_only` so
  existing notes don't break; consider a one-time merge into the universal list.

This item subsumes #5.

---

## 7. [DESIGN] Detail pane & main-view box header lines don't line up

**Symptom:** The header rule/baseline of the detail pane doesn't align with the
main list/board view header.

**Fix:** Pixel-align the two headers — same height, padding, and border-bottom
position. Live CSS pass: inspect the board/list view header vs
`TaskDetail.svelte`'s header block and unify header height + `border-bottom`
offset (likely a padding or min-height mismatch). Best done with the app open.

---

## 8. [DESIGN] Graph Overview — make weekends more visible

**Symptom:** Weekend bands in the overview timeline are too subtle.

**Where:** Non-working bands come from
`buildTimelineNonWorkingBands(rangeStart, rangeEnd, holidayDates)`
(`TaskGraph.svelte:265`, `graphTimeline.ts`). Rendered as `.tt-timeline-*` bands
in `styles.css`.

**Fix:** Increase contrast/opacity of the weekend band fill (and/or add a subtle
hatch) so Sat/Sun read clearly against the working-day background, in both light
and dark themes. Distinguish weekend vs holiday bands visually if both show.

---

## 9. [LEAD] Graph Pan/Zoom — connections break when zooming

**Symptom:** Edges detach from nodes as you zoom.

**Where:** Nodes and the edge `<svg>` are both inside `.tt-graph-stage`, which is
scaled via `transform: scale(${dependencyScale})`
(`TaskGraph.svelte:622`, svg at `:636`). Since they share the scaled coordinate
space and the SVG uses `viewBox="0 0 width height"`, they *should* stay aligned —
so the break is likely one of:
- The arrow `<marker markerUnits="userSpaceOnUse">` (`:638`) not scaling with the
  transform, so arrowheads drift at high zoom.
- The zoom re-anchor `requestAnimationFrame` scroll math
  (`zoomBy`, `:315-324`) causing a transient mismatch, or `edgeYOffsets`/
  `edgePath` recompute lag (`:173-198`, `edgePath` `:293`).
- SVG intrinsic size / rounding when the stage is heavily scaled.

**Fix:** Reproduce at 2×–8× zoom, inspect whether edges or just arrowheads
detach. Likely switch marker to `markerUnits="strokeWidth"` or draw edges in the
same transformed space without a separately-scaled marker; verify `edgePath`
recomputes on scale change.

---

## 10. [ROOT CAUSE] Graph Pan/Zoom — native tooltip is annoying

**Symptom:** A browser tooltip pops up while panning/zooming.

**Root cause:** Native `title=` attributes on graph controls and nodes produce
the OS hover tooltip: `TaskGraph.svelte:531/534/537` (zoom buttons),
`:683` (`title="Projected from dependencies"`), `:693`
(`title="New task blocked by …"`). The browser shows these on hover-hold, which
reads as noise during interaction.

**Fix:** Replace `title=` with `aria-label` (a11y kept) plus a lightweight custom
tooltip component, or drop the `title` on the surfaces where it's intrusive
(zoom buttons already have `aria-label`, so the `title` is redundant there).

---

## 11. [DESIGN — larger] Graph Detail-view layout improvement

**Symptom:** The dependency (detail) graph layout could be better. Explicitly
flagged as a bigger task.

**Where:** Layout produced by `buildTaskGraph` / layout in
`src/store/graph/taskGraph.ts` (lanes, node x/y, edges), rendered
`TaskGraph.svelte:622-686`. Quality metrics already exist
(`computeGraphQualityMetrics`, `:161`).

**Direction (workshop with Taylor):** Tighter lane packing, reduce edge
crossings, better vertical distribution of `edgeYOffsets`, clearer lane headers,
and node sizing. Treat as its own scoped design task; start by capturing current
`computeGraphQualityMetrics` output on a real graph as a baseline.

---

## 12. [DESIGN] Graph chain highlighting — make click "sticky"

**Symptom:** Chain highlight follows *hover* (`onNodeHover` sets `hoverTracePath`,
`TaskGraph.svelte:411`; cleared on `mouseleave`, `:416/619`). Taylor clicks a
node to study its chain, then the highlight shifts as the mouse moves.

**Ask:** Clicking a node should **pin** the traced chain (sticky), and clicking
empty canvas / another node / pressing Esc clears or re-pins it. Hover-trace can
remain as the transient preview when nothing is pinned.

**Fix:** Add `pinnedTracePath` state. `computeTrace` should prefer
`pinnedTracePath ?? hoverTracePath` (`traceSets`, `:405`). On node click
(`onOpen`, currently just opens the task, `:667`) also set/toggle the pin;
clicking canvas or Esc clears it. Note `onOpen` currently opens the detail —
decide whether click = open + pin, or separate the two (e.g. click = pin,
double-click / button = open). Workshop the interaction with Taylor.

---

## 13. [DESIGN] Colour cohesion — three distinct pickers separating status vs area vs label colours

**Symptom / ask:** Settings should present **status colours**, **area colours**,
and **label colours** as three visually distinct picker sections, each with a
per-role explanation.

**Good news — data model already exists:** `statusColors`, `areaColors`,
`labelColors` are all separate maps in settings
(`src/settings/defaults.ts:69/76/78`, normalized at `:682-683`). This is a
**settings-tab UI** task, not a data change.

**Fix:** In the settings tab, render three clearly separated managed-list
sections (the managed-list + colour-swatch UI already exists —
`tt-managed-list-swatch`, `styles.css:1415`), each with a heading + one-line
role description ("Status colours drive the status pill/board columns", "Area
colours tint the area chip", "Label colours tint label chips"). Make them
visually distinct (dividers/section cards) so it's obvious these are independent
palettes.

---

## Suggested order

1. #3 + #4 together (shared reactive-derivation + optimistic-store fix) — highest
   functional impact, likely one small change unblocks both. **Verify live.**
2. #2 hover/selected — quick CSS win.
3. #6 (+#5) holiday model — the one real data-model change; do before graph
   polish since #8 depends on it.
4. #13 colour pickers — self-contained settings UI.
5. Graph batch: #10 (tooltip, quick), #9 (zoom edges), #12 (sticky chain),
   #8 (weekend visibility), then #11 (layout, largest).
6. #7 header alignment — cosmetic, do alongside any detail-pane work.
