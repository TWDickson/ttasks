# Audit Sweep 2 — Delegable Tasks (2026-07-02)

Second logic/architecture sweep, focused on date handling in dependency chains,
interface consistency across views, and DRY/SOLID cleanups. Supersedes the
previous AUDIT_TASKS.md (all items verified done — lint is clean and covers
`.svelte`, timeline range + `pathLeaf` are deduped).

Each task is self-contained. Verify with `npm run build`, `npm run lint`, and
`npx vitest run` unless a task says otherwise. Tasks are ordered: bugs first,
then the date-unification work, then consistency and cleanup.

---

## A. Behavior bugs (fix first — these are user-visible)

### A1. Built-in "Today" view is always empty — `is` operator never resolves `'today'`

[src/views/viewRegistry.ts:73](src/views/viewRegistry.ts#L73) defines the Today
view as `{ field: 'due_date', operator: 'is', value: 'today' }`, but
`evalCondition` in [src/query/engine.ts:52-57](src/query/engine.ts#L52-L57)
compares `raw === value` literally for `is`/`is_not` — `resolveDate()` is only
called for `before`/`after`/`within_days`. A task due today has
`due_date === '2026-07-02'`, which never equals the string `'today'`.

**Fix:** in `evalCondition`, for `is` and `is_not`, when `value` is a string
matching `/^(today|[+-]\d+d)$/`, pass it through `resolveDate()` before
comparing. Add engine tests: `due_date is 'today'` matches a task due today
(use `vi.setSystemTime`), and `is_not 'today'` excludes it. Also add a test at
the view level if easy (Today view returns the task).

**Done when:** new tests pass; the Today view shows tasks due today.

### A2. Changing status to/from Done via Kanban or the Detail dropdown never touches `completed`

Three UI paths write `{ status }` only:

- Kanban drag-drop and the mobile status `<select>` — [src/components/TaskKanban.svelte:115](src/components/TaskKanban.svelte#L115) and [:266](src/components/TaskKanban.svelte#L266)
- Detail panel Status field — [src/components/TaskDetail.svelte:204](src/components/TaskDetail.svelte#L204)

Meanwhile quick actions ([src/integration/quickActions.ts:50-53](src/integration/quickActions.ts#L50-L53)),
batch complete, and the detail "Mark complete" button all set/clear `completed`
alongside `status`. Result: dragging a card to Done produces a completed task
with no completion date (Logbook buckets it under "No date"; the date badge
shows bare "Completed"), and dragging a Done card back to Active leaves a stale
`completed` date behind.

**Fix (centralize — don't patch each caller):** in `TaskWriter.update`
([src/store/TaskWriter.ts:99](src/store/TaskWriter.ts#L99)), inside the
`processFrontMatter` callback where `computeStatusChanged` already runs, derive
completion: when status transitions **into** the completion status
(`resolveCompletionStatus(...)`) and `updates.completed` is not provided, set
`fm.completed = today`; when it transitions **out of** completion status and
`updates.completed` is not provided, set `fm.completed = null`. Explicit
`updates.completed` always wins. Add a pure helper `computeCompletedOnStatusChange`
next to `computeStatusChanged` in [src/store/statusChanged.ts](src/store/statusChanged.ts)
with unit tests (into-completion sets, out-of-completion clears, no status
change leaves untouched, explicit value wins).

**Done when:** kanban drag to Done stamps today's date; drag out of Done clears
it; existing quickAction/batch/detail tests still pass.

### A3. Recurring tasks only recur from the Detail panel's "Mark complete" button

`runMarkCompleteFlow` ([src/components/taskDetailActions.ts:13](src/components/taskDetailActions.ts#L13))
calls `completeAndRecur`, but completing via quick action (context menu,
command, protocol — [src/main.ts:485-518](src/main.ts#L485-L518)), kanban drag,
detail status dropdown, or batch complete just writes status — the next
instance is never created.

**Fix (decision confirmed 2026-07-02: all completion paths recur, including
checklist-driven):** extract the "complete respecting recurrence" decision into
one shared helper (suggest `src/store/completeTask.ts`: takes task + deps,
returns which operation to run) so the rule lives in one place — do not copy
the `if (task.recurrence)` branch into call sites. Route through it:

1. Quick-action `complete` ([src/main.ts:485-518](src/main.ts#L485-L518)) —
   instead of a bare `taskStore.update`.
2. Kanban drag / mobile select and the Detail status dropdown — after A2 lands,
   where the status update is issued: if the new status is the completion
   status and the task has `recurrence`, go through the helper.
3. Checklist-driven completion (`syncChildrenFromParentChecklist`,
   [src/store/TaskWriter.ts:320](src/store/TaskWriter.ts#L320)) — checked
   recurring children recur like any other completion.

**Idempotence guard (required — this is what makes checklist/drag paths safe):**
before spawning the next instance, the helper must skip the spawn when an
**open** task already exists with the same `name` and the same `recurrence`
rule whose `due_date` is ≥ the computed next due date. This prevents
check→uncheck→re-check in a parent checklist (or kanban drag jitter) from
creating duplicate future instances. Guard lives in the helper, not in callers.

**Done when:** completing a recurring task from context menu, kanban drag,
detail dropdown, and a parent checklist all spawn the next instance exactly
once; unchecking and re-checking a recurring child in a parent checklist does
not create a duplicate; a test covers the helper's decision table including the
guard.

### A4. Built-in "Blocked" view hardcodes the status name `'Blocked'`

[src/views/viewRegistry.ts:95](src/views/viewRegistry.ts#L95) filters
`status is 'Blocked'`, but the rest of the plugin resolves the block status
from `settings.quickActions.blockStatus` (e.g.
[src/components/TaskBoard.svelte:213](src/components/TaskBoard.svelte#L213)).
A user who renames the status gets a permanently empty Blocked view.

**Fix:** `getRegisteredTaskViews(settings)` already receives settings — widen
its parameter to include `quickActions` and substitute the configured block
status into the Blocked view's condition when building the array. Update
`viewRegistry.test.ts`.

**Done when:** with `blockStatus: 'On Hold'` in settings, the Blocked view
filters on `'On Hold'`; default settings behave as before.

### A5. Two "reopen a task" paths disagree

- `TaskWriter.restore` uses `buildRestoreInput()` ([src/store/taskRestore.ts:8](src/store/taskRestore.ts#L8)) which hardcodes `status: 'Active'` — wrong when the user's first configured status has a different name.
- `ArchiveService.restoreTask` ([src/store/ArchiveService.ts:168-176](src/store/ArchiveService.ts#L168-L176)) writes `fm.status = statuses[0]` via raw `processFrontMatter`, bypassing `TaskWriter.update` — so `status_changed` is never stamped and A2's completed-clearing won't apply.

**Fix:** give `buildRestoreInput(firstStatus: string)` a parameter and pass
`plugin.settings.statuses[0] ?? 'Active'` from both callers; change
`ArchiveService.restoreTask` to call `taskStore.update(destPath, buildRestoreInput(...))`
after the file move instead of raw frontmatter writes. Update both test files.

**Done when:** restoring from Logbook and from Archive produce identical
frontmatter (status = first configured status, `completed: null`, fresh
`status_changed`).

### A6. Completed tasks that anchor a dependency chain vanish from the Overview timeline

`resolveTaskDates` deliberately resolves a done task from its `completed` date
so downstream tasks inherit positions
([src/store/graph/taskGraphDates.ts:158-175](src/store/graph/taskGraphDates.ts#L158-L175)).
But `buildHybridTimeline` then filters "defined" bars to tasks with an explicit
start/due date or an estimate
([src/store/graph/hybridTimeline.ts:196-201](src/store/graph/hybridTimeline.ts#L196-L201)),
so a completed task with only a `completed` date is dropped — even when "show
completed" is toggled on. Its dependents still get positioned after it, but the
link at [hybridTimeline.ts:322-336](src/store/graph/hybridTimeline.ts#L322-L336)
silently disappears because `definedByPath.get(anchorPath)` misses. The user
sees floating "underdefined" pills pointing at nothing.

**Fix:** extend the defined-entry filter to also accept tasks whose resolution
is anchored on completion: `entry.task.is_complete && !!inferParseDate(entry.task.completed)`.
(The show/hide-completed toggle already filters upstream in TaskGraph.svelte,
so this only surfaces them when the user asked for them.) Add a
`hybridTimeline` test: chain `done(completed only) → open(no dates)` with
completed shown yields a defined bar for the done task and a link between them.

**Done when:** test passes; toggling "show completed" in the Overview makes
chain anchors appear with their links.

---

## B. Date handling unification (the "dates in dependency chains" pain)

### B1. Collapse the three parallel date-math implementations into one module

Today three date systems coexist and disagree on style and DST-safety:

| Concern | String-based | Date-object-based | Third copy |
| --- | --- | --- | --- |
| today | `localDateString()` (dateUtils.ts) | `startOfToday()` + `formatDateISO()` (graphTimeline.ts) | — |
| add days | `addDaysLocal()` | `addDays()` | — |
| diff days | `daysBetweenLocal()` | `diffDays()` (ms division) | `archiveUtils.daysBetween()` (identical to daysBetweenLocal) |
| parse ISO | — | `inferParseDate()` (taskGraphDates.ts) | `parseIsoDate()` (graphTimeline.ts, private, identical) + bare `new Date(value)` in taskFields.ts validator |
| month labels | `MONTH_ABBR` (taskDateMeta.ts) | `MONTH_LABELS` (graphTimeline.ts) | — |

**Fix (mechanical, no behavior change):**

1. Move the Date-object helpers (`addDays`, `diffDays`, `startOfToday`,
   `formatDateISO`, `isWeekend`, and one ISO parser named `parseIsoDate`) into
   [src/utils/dateUtils.ts](src/utils/dateUtils.ts) beside the string helpers,
   with the existing doc comments explaining which family to use when.
2. Delete `inferParseDate` from taskGraphDates.ts and the private `parseIsoDate`
   from graphTimeline.ts; import the shared one. Keep graphTimeline re-exports
   temporarily if it avoids touching many imports, but the implementation must
   live in dateUtils.
3. Delete `archiveUtils.daysBetween`; use `daysBetweenLocal`.
4. Replace `new Date(value)` in the `dateFormat` validator
   ([src/schema/taskFields.ts:21](src/schema/taskFields.ts#L21)) with the shared
   `parseIsoDate` (also fixes format/parse asymmetry with the rest of the app).
5. Export one `MONTH_ABBR` (suggest from dateUtils) and delete the duplicate.

**Done when:** exactly one implementation of each helper exists, all tests pass,
`grep -rn "MONTH_LABELS\|inferParseDate\|daysBetween(" src` shows only the
canonical definitions and imports.

### B2. Surface resolved dependency-chain dates outside the graph

`resolveTaskDates` computes each task's effective schedule (start/end,
inferred-or-explicit) by propagating through the dependency graph — but the
result is only used to position bars in the Overview timeline and to order
columns in the dependency graph. The Detail panel, list rows, and dependency
node cards all show only raw frontmatter dates, so a task whose start is
implied by its chain looks date-less everywhere except as an unlabeled bar.
This is the direct cause of "figuring out dates in dependency chains is
difficult."

**Fix (presentation decisions confirmed 2026-07-02):**

1. Create `src/store/taskSchedule.ts` exporting
   `buildTaskSchedule(tasks: Task[]): Map<string, ResolvedTaskDate>` — a thin,
   memoized wrapper over `resolveTaskDates` (recompute only when the task array
   identity changes; a `WeakMap<Task[], Map<...>>` cache is enough given the
   store replaces the array on change).
2. **Detail panel — in the Dates section, directly under the Start/Due date
   fields:** a read-only, muted row (no input border, `--text-muted`, small-caps
   label matching existing field labels):
   `Projected · {start} – {end} · inferred from dependencies` using
   `formatHumanDate`. **Display rule** (extract as a pure, tested helper): show
   only when the schedule map has an entry for the task **and** it adds
   information — `isInferred` is true, or the resolved end differs from the
   explicit due date (e.g. end derived from `estimated_days`). Hide when
   explicit start/due fully match the resolution.
3. **Dependency graph cards:** in TaskGraph.svelte the node meta currently
   shows only `Due {date}` when `due_date` is set
   ([src/components/TaskGraph.svelte:500-503](src/components/TaskGraph.svelte#L500-L503)).
   When there is no explicit due date but the schedule map has an entry, show
   `~{end date}` (tilde marks inferred) with `title="Projected from dependencies"`.
4. **List rows — projected-date badge:** build the schedule map once at
   TaskBoard level (from the derived `tasks` store) and pass it down through
   TaskList/TaskAgenda to TaskRow. In `getTaskDateBadge` / TaskRow: when the
   task is incomplete, has **no** `due_date`, and the schedule map has an
   entry, render a `~{formatHumanDate(end)}` badge with a new
   `tt-badge-inferred` style — deliberately weaker than a real due badge
   (muted text, dashed border; visually consistent with the timeline's
   inferred-bar styling), tooltip
   `Projected finish, inferred from dependency chain`. Constraints:
   - **Never** apply overdue (red) styling to an inferred date, even when it
     is in the past — overdue stays reserved for explicit commitments.
   - Agenda bucketing is **unchanged** — these tasks stay in "No Date"; the
     badge is informational only.
5. Have `buildHybridTimeline` and `taskGraph.ts` consume the same
   `buildTaskSchedule` entry point rather than each calling `resolveTaskDates`
   directly, so all views are guaranteed to agree.

**Done when:** a task with no dates of its own, downstream of a dated chain,
shows the same projected dates in the Detail panel Dates section, the
dependency card, the list-row `~` badge, and the timeline bar position — and
never in red. Unit tests cover the memoization, the detail-panel display rule,
and the badge decision (pure helpers, not the Svelte render).

### B3. One midnight-rollover "today" store instead of per-component timers

TaskRow ([src/components/TaskRow.svelte:39-58](src/components/TaskRow.svelte#L39-L58))
and TaskKanban ([src/components/TaskKanban.svelte:59-73](src/components/TaskKanban.svelte#L59-L73))
carry identical copy-pasted midnight `setTimeout` refresh blocks — and every
TaskRow instance runs its own timer. TaskBoard/TaskDetail/TaskGraph snapshot
`localDateString()` / `startOfToday()` once and go stale after midnight.

**Fix:** add `createTodayStore()` in `src/utils/todayStore.ts` — a Svelte
`readable<string>(localDateString(), ...)` that sets one timeout to just past
midnight, updates, and reschedules (reuse the existing 100ms-past-midnight
logic; clean up on last unsubscribe). Instantiate once (plugin or module
scope), consume via `$today` in TaskRow, TaskKanban, and anywhere else that
currently caches today. Delete both inline timer blocks.

**Done when:** no `scheduleRefresh` copies remain; one timer serves all
components; date badges still flip at midnight (unit-test the store with fake
timers).

---

## C. Interface consistency

### C1. Kanban dependency badge counts differ from the Detail panel's numbers

`buildDepCountBadge` ([src/components/kanbanCardFields.ts:14](src/components/kanbanCardFields.ts#L14))
counts every `depends_on`/`blocks` entry — including completed dependencies and
dangling links — and its tooltip says "Blocked by N". The Detail panel's pills
count only **open** dependencies as blocking
([src/components/TaskDetailRelationships.svelte:148](src/components/TaskDetailRelationships.svelte#L148)).
The same task can show "⏸3" on its card and "Blocked by 1 open" in the panel.

**Fix:** pass a `getTaskByPath`-style lookup into `buildDepCountBadge` (or
precompute in TaskKanban from the tasks array) and report
`{ blockedByOpen, blockedByTotal, unblocks }`; display the open count in the
badge, keep totals in the tooltip ("Blocked by 1 open of 3 · Unblocks 2").
Update kanbanCardFields tests.

**Done when:** kanban badge and detail pills agree on the "blocked by" number
for a task with a mix of done/open/missing dependencies.

### C2. Agenda bucket definitions duplicated — unknown buckets silently disappear

The agenda bucket keys/order live in the engine
([src/query/engine.ts:216-218](src/query/engine.ts#L216-L218)) **and** are
copy-pasted into TaskAgenda
([src/components/TaskAgenda.svelte:20-42](src/components/TaskAgenda.svelte#L20-L42)),
where `isDateGroupKey` **drops any group whose key it doesn't recognize** — a
new bucket added in the engine would silently hide those tasks in the UI.

**Fix:** export `AGENDA_BUCKET_ORDER`, plus new `AGENDA_BUCKET_LABELS` and
(optionally) accent-color metadata, from the query layer (or a small
`src/query/agendaBuckets.ts`); import them in TaskAgenda. Render unrecognized
group keys with the raw key as label instead of dropping them.

**Done when:** the constants exist once; deleting TaskAgenda's local copies
compiles; a component test shows an unknown bucket key still renders its tasks.

### C3. Batch delete uses `window.confirm`; single delete uses an Obsidian modal

`batchDelete` in [src/components/TaskBoard.svelte:121-129](src/components/TaskBoard.svelte#L121-L129)
calls the browser-native `confirm()` (blocks the renderer, looks foreign,
questionable on mobile), while TaskDetail builds a proper Obsidian `Modal`
([src/components/TaskDetail.svelte:136-160](src/components/TaskDetail.svelte#L136-L160)).

**Fix:** extract TaskDetail's confirm-modal into
`src/modals/confirmModal.ts` — `confirmModal(app, { title, body, ctaLabel }): Promise<boolean>`
— and use it from both TaskDetail and TaskBoard's `batchDelete` (message:
`Delete N tasks? This cannot be undone.`). `runBatchDelete` already takes
`confirmDelete` as an injected dependency, so only the call site changes.

**Done when:** no `confirm(` remains in components; both flows show the same
modal style; existing batch-action tests pass with the injected fake.

### C4. Priority option list is hardcoded in the filter bar

TaskBoard's priority `<select>` hardcodes High/Medium/Low/None
([src/components/TaskBoard.svelte:422-428](src/components/TaskBoard.svelte#L422-L428));
the engine hardcodes the same list twice more (`PRIORITY_ORDER`,
[src/query/engine.ts:17](src/query/engine.ts#L17), and the grouping order at
[engine.ts:199](src/query/engine.ts#L199)); `PRIORITY_COLORS` keys repeat it in
constants.ts; the schema defines priority options again in taskFields.ts.

**Fix:** export `export const PRIORITIES = ['High', 'Medium', 'Low', 'None'] as const;`
from [src/constants.ts](src/constants.ts) (next to `PRIORITY_COLORS`), derive
`TaskPriority` from it if types allow without churn, and consume it in the
filter bar `{#each}`, both engine spots, and the taskFields options list.

**Done when:** the literal list exists once; adding a hypothetical priority to
the constant flows to the filter dropdown and sort order without other edits.

### C5. Per-view "Show completed" toggle doesn't survive a reload — its siblings do

Kanban column collapse, the logbook renderer mode, and both overview-graph
preferences persist to settings; `showCompletedByViewId`
([src/components/TaskBoard.svelte:134](src/components/TaskBoard.svelte#L134))
is component state that resets whenever the board remounts. Feels arbitrary to
the user.

**Fix:** add `showCompletedByViewId: Record<string, boolean>` to settings
(default `{}`), hydrate on mount, save on toggle — mirror exactly how
`kanbanCollapsedColumns` is handled in TaskKanban. Keep
`defaultCompletedVisibility` as fallback for unset views.

**Done when:** toggling "Show Completed" on a view, closing and reopening the
board, preserves the choice; settings tests updated.

### C6. Area filter options: settings-first, with observed stray values as a safety net

The board's area filter derives its options from live task frontmatter
([src/components/TaskBoard.svelte:139-141](src/components/TaskBoard.svelte#L139-L141))
while the Query Editor uses the curated `settings.areas` list — two different
option sets for the same field. Decision (2026-07-02): **settings is the source
of truth, plus a safety net for stray values** (hand-edited/legacy frontmatter
areas not yet migrated via the ValueMigrationModal).

**Fix:** add a pure helper (suggest `src/settings/managedListUtils.ts`):
`resolveAreaOptions(settingsAreas: string[], observedAreas: string[]): { managed: string[]; unmanaged: string[] }`
— `managed` is `settings.areas` in settings order; `unmanaged` is observed
values not in settings, sorted alphabetically. Consume it in:

1. **Board filter dropdown** — render managed options first, then (only when
   `unmanaged` is non-empty) a disabled `<option>` divider (`──────`) followed
   by the unmanaged values.
2. **Query Editor** — TaskBoard already constructs `QueryEditorModal` with
   `areas: plugin.settings.areas`; pass the same resolved union (managed +
   unmanaged) instead, so a smart list can filter on a stray value too.

**Done when:** with a task whose `area` is not in settings, both the board
filter and the Query Editor offer it below the divider; with clean data, both
show exactly `settings.areas` in settings order. Unit test covers the helper.

---

## D. DRY / architecture cleanups

### D1. TaskDetailRelationships re-implements link resolution that already exists

[src/components/TaskDetailRelationships.svelte:20-48](src/components/TaskDetailRelationships.svelte#L20-L48)
contains private `normalizeTaskPath` / `linkedTask` / `resolveTaskPath` /
`taskLabelFromPath` that duplicate
[src/components/taskDetailLinks.ts](src/components/taskDetailLinks.ts)
(`normalizeTaskPath`, `findLinkedTask`, `resolveLinkedTaskPath`) plus
`pathLeaf` from pathUtils. That's the third `normalizeTaskPath` in the repo
(taskGraph.ts has the wiki-link-aware one).

**Fix:** delete the four local functions; import from `taskDetailLinks` and use
`pathLeaf` for the label fallback (`taskLabelFromPath` becomes
`findLinkedTask(...)?.name ?? pathLeaf(normalized)`). No behavior change —
the suffix-match fallback in `findLinkedTask` is identical to the inline copy.

**Done when:** the component has zero local path-normalization code and renders
identically (component test already covers chips/labels).

### D2. Detail panel builds the entire graph layout to read one boolean

`relationshipLayout = buildTaskGraph(tasks, {})`
([src/components/TaskDetailRelationships.svelte:150](src/components/TaskDetailRelationships.svelte#L150))
runs the full layout pipeline (lanes, columns, crossing optimizer) on every
tasks change, only to check `node.isCycle` for the open task.

**Fix:** extract a `detectDependencyCyclePaths(tasks: Task[]): Set<string>`
helper into the graph module (the Kahn in-degree pass in `resolveTaskDates`
already identifies cycle members — reuse that logic, don't re-derive), export
it, and have the component call it instead of `buildTaskGraph`. Unit-test with
a 2-cycle, a self-loop-filtered case, and an acyclic chain.

**Done when:** TaskDetailRelationships no longer imports `buildTaskGraph`; the
cycle pill still appears for cyclic tasks (existing test or add one).

### D3. `applyQuery` repeats the sort→limit→group pipeline three times

The `group.kind === 'none'` branch and the `sortScope === 'global'` branch in
[src/query/engine.ts:326-361](src/query/engine.ts#L326-L361) are byte-identical,
and the `limitPerGroup` mapping appears three times.

**Fix:** merge the two identical branches into one, and extract a
`capGroups(groups, limitPerGroup, limit)` helper used by both paths. Pure
refactor — the exhaustive engine tests are the safety net; do not change any
observable ordering.

**Done when:** one copy of the global path and one of the per-group capping
remain; all engine tests pass unchanged.

### D4. Move the ~180-line graph sandbox seeder out of TaskStore

`seedGraphTestData` ([src/store/TaskStore.ts:251-472](src/store/TaskStore.ts#L251-L472))
is demo-data authoring living inside the store class (separation of concerns;
it also drags `addDaysLocal` and status-resolution helpers into TaskStore's
imports).

**Fix:** move it to `src/store/graphSandboxSeeder.ts` as
`seedGraphTestData(deps: { create, syncBlocks, load, getAll, ensureFolder, settings, notice })`
and have TaskStore delegate (keep the public method signature so
main.ts/commands don't change). `ensureFolderPathExists` moves with it or into
the shared helper from D5.

**Done when:** TaskStore.ts shrinks by the seeder; the seed command still works
(manual check: run "seed graph sandbox" in a dev vault or cover with the
existing TaskStore tests if they touch it).

### D5. Dedupe `ensureFolder`

`TaskStore.ensureFolderPathExists` ([src/store/TaskStore.ts:572-583](src/store/TaskStore.ts#L572-L583))
and `ArchiveService.ensureFolder` ([src/store/ArchiveService.ts:215-224](src/store/ArchiveService.ts#L215-L224))
are the same loop. Move one copy to [src/utils/vaultSafe.ts](src/utils/vaultSafe.ts)
as `ensureFolderPath(vault, path)` and call it from both.

**Done when:** single implementation, both call sites migrated, a unit test
with a fake vault covers nested creation and already-exists.

### D6. Delete dead `resolveBoardQuery`

`resolveBoardQuery` in [src/components/viewAdapters.ts:32-53](src/components/viewAdapters.ts#L32-L53)
is referenced only by its own tests — TaskBoard switched to
`buildBoardQuery`/viewRegistry. Remove the function, its `BoardQueryConfig`
type (if unused elsewhere), and the corresponding test block.

**Done when:** `grep -rn resolveBoardQuery src` returns nothing; tests pass.

### D7. Dead tail in `ReminderService.check`

`if (dirty) return;` at [src/store/ReminderService.ts:122](src/store/ReminderService.ts#L122)
is a no-op (end of function). Delete it, or if `dirty` was meant to gate a
persistence step that no longer exists, delete the variable too.

**Done when:** `dirty` is either gone or meaningfully used; tests pass.

---

## Resolved decisions (Taylor, 2026-07-02) — context for the implementing model

All previously open decisions are settled and folded into the tasks above:

- **A3** — yes, every completion path triggers recurrence, including
  checklist-driven completion. Condition: the idempotence guard in the shared
  complete-helper is **required**, and it must be prevention (skip the spawn
  when the next instance already exists), not a post-hoc cleanup/dedupe pass.
- **C6** — area options are settings-first everywhere; observed stray
  frontmatter values appear below a divider as a safety net in both the board
  filter and the Query Editor.
- **B2** — the Projected line lives in the Detail panel's Dates section under
  the Start/Due fields; list rows get the muted `~date` inferred badge; agenda
  bucketing stays keyed on explicit due dates; inferred dates are never styled
  as overdue.
