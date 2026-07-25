# TTasks — Backlog

The single live backlog for **all open work, every horizon** (consolidated
2026-07-12; all-horizons reconcile 2026-07-19; audit fold-in 2026-07-25).
Everything open lives here — near-term threads up top (`Now` / `Next` /
`Gated`), longer-range roadmap features under `Later`, and the codebase /
publication-readiness items from `AUDIT_2026-07.md` under
`Audit 2026-07`. Closed sweeps and their full histories are under
`Scripts/archive/` (see Cross-refs at the bottom). When an item lands, mark it
`[x]` with a dated one-line note; when a whole thread empties, add a checkpoint
to `ROADMAP.md`.

`ROADMAP.md` is now a **dated journal + historical phase notes only** — it
records what shipped, not what's open. Its Phase 5–8 spec sections are kept for
their detail but are historical: the live open-work registry is *this* file.
Don't treat an unchecked box in ROADMAP's phase sections as live work — it's
tracked here under `Later` if it's still wanted.

Dev workflow: completed, verified work is merged into local `main` as we go (no
review gate while in dev). `main` holds the full Autopilot A–I run + graph polish
(merged 2026-07-17). Remote `origin/main` is a separate/divergent history and is
not pushed to from here unless explicitly asked.

Status legend: `[ ]` open · `[~]` in progress · `[x]` done · ⚖ needs a
taste/UX call from Taylor · 🔎 needs research first.

---

## Done — JSON import / export (Share / Sync) `[x]`

*Requested 2026-07-19 (Taylor): "share my tasks (or a subset) with the work AI,
paste the response back and see a bulk-edit summary." **Delivered 2026-07-19.***

**Share / Sync (C1 export `dd28d52`, C2 import `c025309`).** A rail entry +
`share-sync` command opens `ShareSyncModal` with **Export** and **Import** tabs.
- `[x]` **Filtered export (subset)** — mode toggle (AI/full) + toggle-chip
  filters (area / project / status / label) + include-completed, live "N of M
  selected" count, Copy-to-clipboard or Save-.json-file. Pure
  `taskExportFilter.ts` (`filterTasksForExport`/`collectProjectFacets`/
  `linkTargetPath`, 10 tests). `main.exportTasksToJson` refactored to shared
  `exportTasksToJsonFrom(tasks, mode)`.
- `[x]` **Import → vault + bulk-edit summary** — paste an exported/AI-edited doc,
  Preview the summary, Apply. Pure `taskImportPlan.ts` (`planImport`/
  `changesToPatch`/`summarizeImportPlan`, 9 tests) matches by (type, ci-name):
  new→create, matched-changed→update (field-by-field), identical→unchanged,
  dup-name→ambiguous/skip. `main.applyImportPlan` + `buildCreateInputFromParsed`.
  **Limits (by design):** only set/change (never clear from an omitted value);
  note body is not diffed/imported. ~~relationships (parent/`depends_on`) are
  not diffed/imported~~ — **superseded 2026-07-20 by C3 (`b7f0e78`)**: relationship
  import (add/remove `depends_on`, set/detach `parent`) shipped; see the Now
  batch's AI Import/Export note below.
- **Owed:** live-Obsidian sign-off for the Apply write path (rig can't write the
  vault). Future (deferred, not blocking): an import-from-clipboard command
  surface.

**Historical detail (superseded by the above):**

**Shipped 2026-07-19 (export half + import parser):**
- `[x]` **Pure serializer** `src/integration/taskJsonExport.ts` — versioned doc
  (`schemaVersion`/`generatedAt`/`mode`/`taskCount`/`tasks`); `full` mode
  (ids/paths/reverse-index, links as paths — round-trippable) and `ai` mode
  (links flattened to human names; id/path/blocks + empty fields dropped —
  clean for pasting into an AI). Boundary-tested.
- `[x]` **Export commands** — "Export tasks to JSON (AI-friendly)" and "(full)":
  write a timestamped `.json` at the vault root + copy to clipboard when
  available. **Device/live-Obsidian verification owed** (built + unit-tested,
  not yet run in the app).
- `[x]` **Pure import parser** `src/integration/taskJsonImport.ts` — validates +
  normalizes a document *or* bare array; forgiving (skips bad entries with
  warnings, warns-but-imports on newer `schemaVersion`, accepts
  `parent`/`parent_task`). 12 tests incl. a full-mode round-trip. **Ready to
  wire.**

**Remaining (from that session) — now resolved by C1/C2 above:**
- `[x]` **Import → vault creation** — done via the Share/Sync Import tab
  (`planImport` + `applyImportPlan`). Landed *without* relationship remap
  (parent/`depends_on` not imported — deferred, see limits above).
- `[x]` **Subset export** — done via the Export tab's area/project/status/label
  filters (`filterTasksForExport`).
- `[ ]` **Import command surface** *(deferred)* — a direct import-from-clipboard
  command (today import is the modal's Import tab).

**Grounding.** Reuse: shared query engine (`src/query/`), `TaskStore.create`
(collision-safe, relationship-safe), `promoteTaskToTTasks`/ImportConfirmModal
(I5 bulk import), the frontmatter schema in CLAUDE.md. Pure serializer + parser
stay Obsidian-free (boundary-tested); only the command/modal/file-IO wrapper
touches Obsidian.

**Acceptance.**
- Export all tasks, and export a filtered subset, to valid JSON. *(all-tasks ✓;
  subset remaining)*
- A "for-AI" mode produces clean, path-free, human-readable JSON. *(✓)*
- Import validates and previews before creating; round-trips the core schema
  losslessly; is ID-collision- and relationship-safe. *(parser ✓; create wiring
  remaining)*

**Direction (proposed — confirm shape with Taylor).**
- **Export.** A pure serializer `tasks → JSON` (stable, documented shape:
  the frontmatter fields + `notes`, relationships as vault paths or names).
  Subset via the existing shared **query engine** (`filter`/`search`) — reuse a
  Smart List / the current view's query so "export this filtered set" is free.
  Surface: a command ("Export tasks to JSON") + a button that copies to
  clipboard and/or writes a `.json` file. Include a compact/`for-AI` mode that
  drops vault-internal noise (paths, `blocks` reverse index) and flattens links
  to human names, so the work AI gets clean, self-contained context.
- **Import.** A pure parser `JSON → TaskCreateInput[]` with validation
  (dedupe, schema-guard, relationship remap), then create via the existing
  `TaskStore.create` path (ID-collision-safe). Confirm-modal preview of what
  will be created (reuse the ImportConfirmModal pattern from I5 bulk import).
- **Round-trip.** Export→import should be lossless for the core schema; make the
  shape stable + versioned (`schemaVersion`) so external tools can rely on it.

**Grounding.** Reuse: shared query engine (`src/query/`), `TaskStore.create`
(collision-safe, relationship-safe), `promoteTaskToTTasks`/ImportConfirmModal
(I5 bulk import), the frontmatter schema in CLAUDE.md. Keep the serializer +
parser as **pure modules** in `src/integration/` (Obsidian-free, boundary-tested)
so they're unit-testable; the command/modal/file-IO wrapper is the only
Obsidian-touching part.

**Acceptance.**
- Export all tasks, and export a filtered subset, to valid JSON.
- A "for-AI" mode produces clean, path-free, human-readable JSON.
- Import validates and previews before creating; round-trips the core schema
  losslessly; is ID-collision- and relationship-safe.

---

## Now — Taylor feedback batch (2026-07-22)

- `[x]` **Share/Sync export pane: message presets, packaging, and memory** —
  *done 2026-07-22.* Taylor: "my work AI takes large text as a single message
  but others would add it as an attachment… I'd like some option to include a
  preamble and then the json in a code fence, or just the configurable preamble
  and then the JSON as two copiable fields… maybe we provide a few default
  options? Also remember last used on this pane, instructions not to create new
  statuses."
  - **Message presets.** New pure `src/integration/sharePreamble.ts` with five
    presets — *Review & advise*, *Break down into subtasks*, *Plan my week*,
    *Status catch-up*, *No preamble* — surfaced as a dropdown plus an **editable
    textarea** (the presets seed the text; what's in the box is what gets
    copied). Every non-empty preset automatically appends the round-trip rule and
    the no-new-values rule, and — when the caller passes `validValues` — spells
    this vault's statuses out inline, on the theory that an AI following prose is
    more reliable than one that has to go find `meta.validValues` in a long doc.
  - **Packaging.** A **Copy as** control with three formats: **One block**
    (message then the JSON in a ```json fence — a single paste, for the work AI),
    **Two fields** (message and JSON as independently copiable buttons, for tools
    that want the data as its own paste), and **JSON only** (the previous
    behaviour). `composeShareOutput` returns the blocks; the modal renders one
    Copy button per block and only auto-closes on a single-block copy (with two
    fields the user still needs the second one). **Save .json file** is unchanged
    and is the attachment path.
  - **Remembered.** New `shareSync` settings block (mode, output format, preset,
    custom preamble, all four filter facets, include-completed) written on every
    change and read in the modal constructor. `customPreamble` is only persisted
    when it differs from the preset's generated text, so an unedited preamble
    still picks up changes to the vault's statuses on the next open.
  - **Bug found + fixed on the way:** `.tt-share-modal` had no scroll
    containment — app.css caps `.modal` at ~85vh but leaves `.modal-content`
    `overflow: visible`, so the action buttons rendered *outside* the modal box
    (measured in the rig: 709px of content in a 680px modal, buttons at y=786
    against a modal bottom of 740). Pre-existing — the Import tab's preview
    already hit it. Fixed with `display: flex; flex-direction: column` on the
    modal + `overflow-y: auto; min-height: 0` on the content (the same
    "flex item floors at content height" trap as the detail-sidebar fix).
  - Rig-verified dark + light: presets render, format switching swaps the copy
    buttons correctly (`Copy message` / `Copy JSON`), and the actions now sit
    inside the modal. Build green, **1533 tests** (up from 1511).
- `[x]` **Share/Sync: notes field on import** — *done 2026-07-22; answered a
  question of Taylor's and found a docs bug.* Status before: a **create** already
  wrote `notes` into the new note's body, but an **update** silently ignored
  them, and both the AI meta (`ignoredOnImport: ['blocks','notes']`) and the
  modal's blurb claimed notes were ignored outright. Now imported on updates too,
  as its own plan bucket (`ImportPlan.notesChanges`) rather than a
  `IMPORT_UPDATABLE_FIELDS` entry — it rewrites the whole markdown body via
  `TaskStore.updateNotes` instead of a frontmatter key, so it needs a separate
  write path. Same never-clear rule as the fields (an omitted/empty `notes` means
  "not specified"), compared trimmed so trailing-newline noise isn't a change.
  Gets its own **destructive-flagged** apply toggle ("Replace note bodies") since
  it overwrites, and a new `meta.notes` tells the AI to send the existing body
  plus its additions rather than only the new part. `applyImportPlan` returns a
  new `renoted` count.
- `[x]` **Share/Sync: does it handle projects?** — *answered + documented
  2026-07-22.* Yes, mechanically: `type: 'project'` exports, parses, matches
  project-to-project by name, creates as a project, and `parent` sets membership.
  But nothing told the receiving AI — `actions.create` said "Add a new task" and
  `type: "project"` was mentioned nowhere. Added a `meta.projects` key explaining
  what a project is, that it's matched the same way, that you create one with
  `action: "create"` + `type: "project"`, and that projects don't nest; also
  updated `actions.create` and the Import tab's blurb. No behaviour change —
  documentation of behaviour that already worked.
- `[ ]` **Share/Sync import: allow importing from notes** 🔎 — still open, see the
  2026-07-21 batch below. (Distinct from the notes *field* item above: this is
  about parsing tasks out of an arbitrary Obsidian note.)

---

## Now — Taylor feedback batch (2026-07-21)

*Raw feedback from Taylor's pass through the app 2026-07-21 — not yet scoped or
researched.*

- `[ ]` **Share/Sync import: allow importing from notes** 🔎 — the Import tab
  currently only accepts a pasted JSON export doc; Taylor wants to import
  from regular Obsidian notes too. Needs scoping before starting: is this
  "paste/point at a note's raw text and parse tasks out of it" (distinct
  from the existing I5 checkbox-scan/promote capture flow, which already
  does something adjacent), or a different shape entirely — clarify with
  Taylor.
- `[ ]` **Status / Priority badges: selected vs. regular hard to distinguish,
  worse in dark mode** ⚖ — likely a colour-spine follow-on (badges went
  monochrome in the V2 colour-spine work, 2026-07-19); needs a taste call on
  how much contrast the selected state should carry, especially in dark
  mode.
- `[x]` **Detail sidebar: content clips inside the frame** — *done 2026-07-22;
  distinct from the mobile detail-pane-fit fix.* Reproduced in the rig by
  narrowing the detail leaf to 300px on a 1280px desktop viewport: the pane's
  content measured **413px against a 299px leaf**, and `.tt-detail-view`'s
  `overflow-x: hidden` silently cut off the excess. Three independent causes,
  all of them "an element floors at its min-content width":
  1. **The field grid never collapsed on desktop.** The two-column →
     one-column collapse was gated on `@media (max-width: 768px)`, which reads
     the **viewport**, not the pane — so a 300px sidebar on a wide screen kept
     `grid-template-columns: auto 1fr`, the `auto` label column shrank to
     min-content (**one character per line** — "A/R/E/A" stacked vertically),
     and the controls overflowed. Re-keyed to a **container query** on a new
     `container-type: inline-size` on `.tt-detail`. Threshold **360px** is
     measured, not guessed: with two columns the label column holds full width
     down to ~360px of container, is squeezed below that, and hits one
     char/line by ~270px — so 360 sits above the squeeze and below the default
     440px sidebar (407px of container), leaving the default pane two-column.
     The old `@media` rule is kept as a fallback for engines without container
     queries (Chromium <105 / iOS <16); both collapse identically.
  2. **The relationship tree was never stretched.** The P5 centering rule
     (`.tt-detail > .tt-field-group { align-items: center }`) leaves an item's
     cross size at max-content, so one long task name in a chip sized the whole
     Dependencies section to 527px. Fixed with `align-self: stretch` +
     `width: 100%` on `.tt-rel-health` — the same override
     `.tt-parent-task-row` already carries in `styles.css` — plus `min-width: 0`
     down the tree columns. The chips themselves are `<button>`s inheriting
     app.css's `nowrap` + fixed height (the **theme-specificity trap** in
     CLAUDE.md); they now wrap (`white-space: normal; height: auto;
     overflow-wrap: anywhere`) so a long name stays fully readable instead of
     being truncated.
  3. **`1fr` tracks and flex items floored at min-content.** `grid-template-
     columns: auto minmax(0, 1fr)` on `.tt-fields`, `min-width: 0` on its
     items and on `.tt-detail-name-row .tt-field`.

  Verified in the rig by sweeping the leaf width: **zero clipped elements from
  220px up** (was 31 at 300px), two-column preserved at the 440px default,
  dark + light + mobile all clean. Below ~200px a single 4px overflow remains —
  under Obsidian's practical sidebar minimum, left alone. Build green, 1511
  tests. Live-Obsidian sign-off folds into the visual regression pass.
- `[x]` **Agenda: date-range filter on selection** — *done 2026-07-21,
  centralized same-day.* Two `<input type="date">` controls ("from" / "to")
  in the filter toolbar, on top of the existing date-bucket grouping (not a
  replacement for it). New inclusive `on_or_after`/`on_or_before`
  `FilterOperator`s in `query/engine.ts` (existing `before`/`after` stay
  strictly exclusive — used elsewhere with that meaning) — also wired into
  `queryEditor.ts` `DATE_OPS` + `QueryEditorModal.ts` labels so Smart Lists
  get the same inclusive-range operators for free.
  **Centralized (same day, per Taylor):** the ad-hoc toolbar-filter logic
  (Priority / Area / date-range → `FilterCondition[]`, plus the
  "any filter active" check) moved out of `TaskBoard.svelte`'s inline
  reactive block into a new pure, tested `src/components/boardFilters.ts`
  (`buildToolbarFilterConditions`/`hasActiveToolbarFilters`/
  `supportsDateRangeFilter`) — same pattern as the existing `boardQuery.ts`
  (group/sort overrides). Widened the date-range control's visibility from
  Agenda-only to **List + Kanban + Agenda** (the renderers where `due_date`
  is a meaningful axis and the toolbar has room); Graph and Archive/Logbook
  stay excluded (relationship-first / `completed`-not-`due_date`,
  respectively) — narrow back to Agenda-only if that turns out to be too
  broad. Toolbar filter state stays ephemeral (`filterDateFrom`/
  `filterDateTo` in `TaskBoard.svelte`, like `filterPriority`/`filterArea` —
  not persisted); `supportsDateRangeFilter(renderer)` gates both visibility
  and whether a leftover date range still applies after switching views. No
  due-date task falls in a range (by design — "no date" tasks are excluded).
  +14 `boardFilters.test.ts` tests (on top of the +4 engine tests); build
  green, **1472 tests**; rig-verified dark/light on List, Kanban, and Agenda
  (filter narrows results correctly on all three; Graph correctly shows no
  date-range control).
- `[x]` **Pomodoro: timer inconsistent when Obsidian is backgrounded** —
  *done 2026-07-21 (commit `0964f45`).* Root cause confirmed:
  `PomodoroService.tick()` decremented `remainingSec` by a fixed 1s per
  `setInterval` firing, but browsers/Electron throttle `setInterval` in
  backgrounded windows, so the countdown fell behind real elapsed time. Fix:
  every running phase is now anchored to a wall-clock instant (new
  `phaseEndsAtMs` on the session) and each tick derives `remainingSec` from
  `Date.now()` vs. that anchor — a starved or long-sleeping interval catches
  up to true elapsed time. Pause freezes the remaining; resume re-anchors from
  it (paused span doesn't count). New pure helpers
  `anchorPhase`/`syncSession` in `src/integration/pomodoro.ts`; the service
  routes every begin/advance/resume through `publishPhase` (anchors) while
  `tick()` reads the anchor. +8 tests (throttle recovery, wake-past-phase-end,
  paused no-accrual, pure helpers); suite 1454 green. **Live-Obsidian /
  on-device sign-off still owed** (rig can't background the real app). Note:
  if the machine sleeps through an entire focus phase, the phase is logged +
  advanced on the first wake tick (wall-clock truth) rather than fast-forwarded
  through multiple phases — acceptable, flagged here in case Taylor wants
  different catch-up semantics.

---

## Now — Taylor feedback batch (2026-07-20)

*Raw feedback from Taylor's pass through the app 2026-07-20 — not yet scoped or
researched; triage/sequence as convenient. Numbers below map 1:1 to Taylor's
original list for traceability.*

### List views — Active / Today / Agenda

- `[x]` **(1, 2, 5) Group-by / Sort-by toolbar controls for list views** —
  *done 2026-07-20.* Any list-rendered view (Active, Today, Inbox, Blocked)
  now has **Group** and **Sort** dropdowns in the filter toolbar, plus a
  direction-toggle button once a sort is chosen. Group options are the full
  `GroupField` set incl. **Project** (`parent_task`, labeled "Project" —
  covers item 1); Sort options are the full `SortField` set (covers item 2 —
  date, name, status, area, priority, etc.), which also gives Today a
  group-by-Status option "for free" (item 5) without a Today-specific
  special case. Per-view override persists in new settings
  `listGroupOverrideByViewId` / `listSortOverrideByViewId`; only applied for
  `renderer === 'list'` so it can't fight Kanban/Agenda's required grouping.
  Pure plumbing in `boardQuery.ts` (`applyListOverrides`), wired in
  `TaskBoard.svelte`. Rig-verified (Group: Due date, Sort: Name + direction
  toggle all render/apply correctly); build green, 1436 tests.
- `[x]` **(3) Inbox count badge** — *done 2026-07-20.* The rail's **Inbox**
  entry shows a `.tt-count` pill (open, non-complete inbox tasks), hidden at
  0. `TaskRailView.ts` derives the count from `taskStore.tasks`;
  `TaskRail.svelte` renders it right-aligned in the button. Rig-verified
  (badge shows "2").
- `[x]` **(4, 7) Today List + Agenda "Today" bucket surface In Progress** —
  *done 2026-07-20.* Today's filter gained a nested OR (`due_date is today` OR
  `status is <configured start status>`), substituted the same way Blocked
  substitutes its status (`applyStartStatus` in `viewRegistry.ts`, mirrors
  `applyBlockStatus`). Agenda's date-bucket grouping gained a new
  `QuerySpec.activeStatusBucket` field: an in-progress task always reads as
  "today" regardless of due date, *unless* it's already overdue (that stays
  the more urgent signal). Pure engine change in `engine.ts`
  (`classifyAgendaBucket`), threaded through `applyGroup`/`applyQuery`;
  `TaskBoard.svelte` carries the field through both the initial query build
  and the reactive filter-rebuild block. New tests in `engine.test.ts` +
  `viewRegistry.test.ts`.
- `[x]` **(22) Today List: order by dependency** — *done 2026-07-20.* New pure
  `src/query/taskReadiness.ts` (`isTaskReady`/`sortReadyFirst`, boundary-listed)
  reuses the graph's "ready now" definition (open + no incomplete `depends_on`,
  resolving wiki-link syntax, unresolved/dangling links don't block). New
  `QuerySpec.readyFirst` flag stable-partitions the final sorted list (ready
  tasks float above blocked ones, existing sort order preserved within each
  side); set on the Today builtin view. Engine change computes readiness
  against the *full* unfiltered task list so an off-screen blocker still
  resolves correctly. Tests in `taskReadiness.test.ts` + `engine.test.ts`.

### Status semantics — Blocked vs Hold

- `[ ]` **(6) Blocked vs Hold verbiage confusion** ⚖ — unclear distinction
  between the two statuses; needs a definition/taste call (what each means,
  when to use which) before any wording changes.
- `[ ]` **(8) Status changes should cascade to dependents** — setting a task to
  Hold/Blocked should propagate to (or at least flag) its downstream
  `depends_on` chain; completing/clearing that status should "reopen" them.
  Design question: auto-change dependent statuses, or just surface a
  warning/badge? Resolve (6)'s definitions first — this depends on them.

### Dependency graph

- `[x]` **(9) Project-filter dropdown doesn't close on click-off** — *done
  2026-07-20.* The fixed full-viewport backdrop button was already there but
  apparently loses the hit-test in some stacking-context edge case; added a
  belt-and-suspenders `document.addEventListener('pointerdown', …, true)`
  (capture phase) in `TaskGraph.svelte` that closes the popover whenever the
  click target isn't inside `.tt-graph-project-filter`, regardless of DOM
  stacking. Rig-verified: open → click elsewhere → closes.
- `[x]` **(10) Completed-item arrows should be green, not priority-coloured** —
  *done 2026-07-20.* Investigated first: edges weren't actually
  priority-coloured in the current code (only `--tt-priority-accent` on the
  node's small dot); a completed source's edge just fell through to plain
  gray. Added the missing signal explicitly: new `TaskGraphEdge.isSourceComplete`
  (`taskGraph.ts`), a `.tt-graph-edge.is-complete` class
  (`color-mix(in srgb, var(--color-green) 65%, transparent)`). Rig-verified via
  computed style.
- `[x]` **(11, 13) Add a parent task from a selected task** — *done
  2026-07-22.* A **left-side `+`** on each task node (mirror of the existing
  right-side "add dependent" `+`) spawns a new **blocker/parent** the selected
  task will `depend_on`. Shown on hover (mouse) / tap-pin (touch), same gate as
  the right `+`; inherits the node's project/area/labels/priority.
  `CreateTaskModal` gained a symmetric `initialBlocks?: string[]` option: after
  the blocker is created it calls `taskStore.addDependency(target, newTask)` for
  each target, so the reverse index (`blocks`) syncs through the canonical write
  path (no manual `blocks` mutation). `TaskGraph.svelte` (`createBlockerTask` +
  the left `+` button) + `CreateTaskModal.ts` + 1 modal test. Build green;
  rig-verified both `+`s render on hover (left/right, symmetric).
- `[ ]` **(12) Drag connectors to create dependency chains** 🔎 — click-and-drag
  a node's connector (left = depends-on, right = blocks) to link it to another
  node; needs interaction-design research (hit targets, drop targets, touch
  equivalent).
- `[ ]` **(16) Vertical sort: rank completed items lower** ⚖ — current order
  reads as priority-based; Taylor's instinct is completed items should just
  sink to the bottom regardless of priority — needs a taste call on the exact
  rule.
- `[x]` **(17) Opening a "Ready Now"-highlighted task should clear the
  highlight** — *done 2026-07-20.* `onNodeClick` (the single choke point for
  both mouse-click and touch-tap opens) now clears `highlightReady` before
  calling `onOpen`. `TaskGraph.svelte`.
- `[x]` **(18) Show the "Independent" (unassigned) lane by default** — *done
  2026-07-20.* Flipped `showIndependentInDependency` default `false → true`;
  the "Independent" pill's hidden-count computation is toggle-independent, so
  it still offers a working "N hidden" toggle back off. `TaskGraph.svelte`.
  Rig-verified: pill reads "Shown" on load.

### Detail view

- `[~]` **(14) Dependency-selection dropdown needs better sorting** —
  *investigated 2026-07-20: appears already fixed, unclear what Taylor is
  still seeing.* The "add blocker" picker in the detail pane
  (`TaskDetailRelationships.svelte`), the create-task modal
  (`CreateTaskModal.ts`), and `WikiLinkField.svelte` all already sort via
  `sortDependencyFirst` (same-project first, then alphabetical) — this looks
  like the exact fix the item asks for, already shipped (2026-05-14 per
  Recent Updates). Needs Taylor's repro steps (which specific picker, what
  ordering was actually observed) before further work — may be a different
  rule entirely (e.g. incomplete-first, or a picker this pass didn't find).
- `[ ]` **(6) Blocked vs Hold verbiage confusion, (8) cascade** — unchanged,
  see Status semantics above (kept here for cross-ref only).

### Pomodoro

- `[ ]` **(15) Pomodoro discoverability** — no obvious way to find the sidebar
  icon or open the Pomodoro pane / ttasks views; needs a clearer entry point
  (ribbon icon, command-palette hint, or onboarding nudge).

### Data model / frontmatter

- `[x]` **(19) Obsidian native-frontmatter type handling** — *done 2026-07-22.*
  Audited the whole frontmatter → Task boundary (`TaskStore.fileToTask`) against
  Obsidian's **native property types**: a user can retype any property to
  Text / List / Number / Checkbox / Date in the Properties UI and Obsidian then
  rewrites that field vault-wide into the chosen shape. Every failure in this
  class was **silent data loss**, not an error. Found and fixed:
  - **List field retyped to Text** — `labels: feature` (a bare scalar) hit an
    `Array.isArray` guard and became `[]`, so the labels vanished from the UI and
    the next write clobbered them. Same for `depends_on` / `blocks` (a
    relationship silently disappeared) and `holiday_dates`.
  - **Scalar field retyped to List** — `area: [Work]` failed a `typeof === 'string'`
    check and became `null`, dropping the task into the Inbox; `status: [In Progress]`
    silently reset to the default status; `name: [Ship it]` was truthy enough to
    pass the presence check but coerced to `''`.
  - **Unchecked casts** — `type` and `priority` were `as`-cast straight out of
    frontmatter with no validation, so `type: [project]` made a project read as a
    task in every `type === 'project'` check, and a junk priority flowed into
    sorting/rendering.
  - **Number/Checkbox drift** — `pomodoro_count` / `focused_minutes` were
    `typeof === 'number'`-only (a quoted `"4"` reset the count to null);
    `workweek_only` was `=== true`-only (a Text-typed `"true"` read as false).

  Fix: extended the existing pure `src/utils/frontmatterValue.ts` with
  `toFrontmatterScalar` (unwrap a List-typed scalar), `toFrontmatterStringArray`
  (wrap a Text-typed list), `toFrontmatterBoolean`, `toFrontmatterStringOrNull`,
  and `toFrontmatterOptionalEnum`/`toFrontmatterEnum` (closed-set validation,
  exact match then case-/whitespace-insensitive — so a hand-edited
  `priority: high` now resolves to `High` instead of falling back). New
  `TASK_RECORD_TYPES` + `REMINDER_OVERRIDES` constants back the enum checks.
  `resolveWikiLinkPaths` now accepts a bare scalar as a one-entry list. +39
  tests (`frontmatterValue.test.ts` + a new `TaskStore.frontmatterTypes.test.ts`
  that parses real frontmatter shapes through `fileToTask`); build green,
  **1511 tests**.

  *Not covered (deliberate):* the **write** side is unchanged — the plugin still
  writes its own canonical shapes via `processFrontMatter`, and a retyped
  property gets re-normalized by Obsidian on its next write anyway. Also
  untouched: Obsidian's "Date & time" type on `due_date` (still reduced to its
  calendar-date portion by `toCalendarDate`, which is the intended behaviour).

### AI Import/Export

- `[x]` **(20) Import guidance was stricter than the tool** — *done
  2026-07-20; confirmed real bug.* `parseTasksJson` required a non-empty
  `name` on every entry, silently dropping (with only a warning) any reply
  that targeted a task by `ref` alone — exactly what the AI meta's
  instructions say is enough. Loosened to require **name OR ref**; added a
  `planImport` guard so a create-fallback with no name (and no matching ref)
  still gets skipped cleanly instead of creating a nameless task.
  `taskJsonImport.ts` + `taskImportPlan.ts`, new tests in both.
- `[x]` **(21) Supply the AI with valid enums** — *done 2026-07-20.*
  `TaskJsonMeta` gained an optional `validValues` block (statuses, priorities,
  areas, labels); `buildTaskJsonDocument`/`serializeTasksToJson` take an
  optional `TaskJsonValidValues` and embed it only when supplied (the static
  `AI_IMPORT_META` singleton is untouched when omitted, so the existing
  reference-equality test still holds). `main.plugin.taskJsonValidValues()`
  builds it from `settings.statuses`/`areas`/`labelValues` + the `PRIORITIES`
  constant; wired into both the export-command path and the Share/Sync
  modal's copy-to-clipboard path. Instructions text updated to tell the AI to
  pick only from `validValues`. `taskJsonExport.ts` + `main.ts` +
  `ShareSyncModal.ts`, new test in `taskJson.test.ts`.

**Note on relationship import (docs correction):** the "Done — JSON
import/export" section above still lists relationship/parent import as
deferred — that's now **stale**. Commit `b7f0e78` ("feat(share): import
relationships, deletes, and reparenting (C3)") already landed `depends_on`
add/remove + `parent`/`remove_parent` round-tripping in `taskImportPlan.ts`
(`linkAdds`/`linkRemovals`/`parentChanges`). Only the note body stays
unimported. Left the historical section text alone (it's a dated log) but
flagging here so nobody re-does this work.

---

## Now — graph polish thread

Source: Taylor feedback 2026-07-10 (GP numbering kept from the archived
`Scripts/archive/GRAPH_POLISH.md`; GP2 + GP6 landed there). All items target
`src/components/TaskGraph.svelte` unless noted. Pure layout helpers live in
`src/store/graph/` (`taskGraph.ts`, `graphPresentation.ts`).

### GP3 — Project filter dropdown `[x]`

*Landed 2026-07-18.* A **Projects** pill in the dependency toolbar opens a
checkbox popover of all projects (name-sorted, shown only when ≥2 projects
exist); unchecking one hides its lane + owned nodes/edges, and the pill shows
`N hidden` / a **Show all** reset. Hidden projects are dropped **before**
connectivity is computed (`visibleScopeTasks` → `resolveConnectedDependencyPaths`),
so a satellite that only linked to a hidden project falls away with it per spec.
Persisted via new `graphHiddenProjects: string[]` setting (survives re-render +
reload). Menu right-anchored so it stays on-screen on mobile. Rig fixture gained
a second project (**API Platform**) so the graph exercises multi-lane + GP3/GP4.
`TaskGraph.svelte` + settings (`types.ts`/`defaults.ts`) + `test-rig/fixtures.ts`.

**Problem.** No way to hide/show individual projects; the graph shows all lanes.

**Direction.** A dropdown (multi-select) to toggle project visibility.
- **Default:** everything visible.
- **Unassigned is a special case:** unassigned/satellite tasks show *when they
  connect to a visible project* (satellites of a hidden project drop with it).
  Don't treat "Unassigned" as a plain toggle target — its visibility is derived
  from the visible projects it links to.

Grounding: lanes are built from `layout.lanes`; satellite/connected-unassigned
logic already exists (`resolveConnectedDependencyPaths`, satellite-lane commit
`04f792d`). Filter should compose with the existing independent-visibility
toggle, not fight it.

**Acceptance.**
- Toggling a project hides its lane + that project's nodes/edges.
- Satellites remain iff still connected to a visible project.
- State persists across view re-renders (consider `getState`/`setState` like N2).

### GP4 — Swim-lane tinted box (project-colour gradient) `[x]`

*Landed 2026-07-17.* Each project lane gets a faint background tint keyed to its
area colour (`laneTint()` → project `area` → `areaColors`), rendered as a
symmetric top/bottom gradient cap (`color-mix(…, transparent)`, theme-aware, no
hardcoded hex). Header chip and tint band share one symmetric-padded box
(`DEPENDENCY_LANE_PAD`) so they stay aligned; bands live in the fit box
(`min-width:100%`) so the tint spans the full canvas width even when the graph is
narrower than the panel, and stays aligned when it's wider and scrolls.
Unassigned/satellite lanes get no tint. `TaskGraph.svelte` + `TaskBoard.svelte`
(new `areaColors` prop).

**Problem.** Lanes read as bare columns; hard to scan which lane is which.

**Direction.** Give each lane a background box tinted to the **project colour**,
as a gradient that **fades toward the centre of the lane from both top and
bottom** (strongest tint at the header/footer edges, transparent mid-lane).

**Acceptance.**
- Lane box tint derives from the project's configured colour.
- Vertical symmetric gradient (top edge → centre, bottom edge → centre).
- Follow the CLAUDE.md colour rule: tint the surface via
  `color-mix(in srgb, <color> N%, var(--background-primary))`; never hardcode
  hex/white on a user colour. Readable in dark + light.

### GP8 — Lane focus (hover spotlight + interaction pin) `[x]`

*Landed 2026-07-18.* Swim-lane tints are now **focus-gated** (GP4's always-on
tint became on-demand): a lane's tint band shows only while it's active — hovered
(desktop) or held by interaction (tap/click a task, header, or the `+`
new-item). The active lane pops (accent header + full tint, all its nodes full);
other lanes recede (dimmed nodes/edges, no tint) **except** tasks connected to
the active lane's dependency chain, which stay in full focus while *their* lane
gets a softer tint — the cross-project spillover Taylor asked for. Focus is
transient on hover and **pinned** by clicking a task / lane header / the add
buttons; an empty-canvas press or Esc clears the pin. Reuses the existing
`computeTrace` chain-walk; per-lane state precomputed into a reactive
`laneStates` map (a plain helper reading `laneFocus` inside its body isn't seen
as a template dependency, so bands/headers wouldn't update on hover). Touch uses
tap-pin (no hover). `TaskGraph.svelte` + rig fixture (added a cross-project
dependency so the spillover is exercised). Verified dark/light/mobile in the rig.

This covers GP5's *focus/dim* intent via a hover+pin mechanism (rather than
header-tap only). GP5's remaining scope below is now just: **grow** the focused
lane to show its full title, and **move click-to-add** off the header tap onto a
dedicated `+` subshape.

### GP5 — Lane-header focus interaction + add-button restructure `[~]`

*Partly landed 2026-07-18.* The **`+` add-button restructure shipped** and is
kept: the lane header is now one chip with the label body on top and a **`+`
footer** flush to the chip's bottom edge (tap → add a task parented to the
project), divided by a hairline so they read as a single card. Add-task moved
entirely off the header body onto that `+`. The `+` footer has a ≥44px
coarse-pointer hit area.

**Click-to-focus on the header body is disabled for now** (Taylor: "not that
nice feeling right now… come back and tune later"). A first rev made the header
body a pin toggle and grew the pinned lane in height to reveal its full vertical
title (block-flow + `height:auto`, since a flex column mis-measures a
vertical-writing-mode child's block size). Both the header pin-toggle and the
grow were **backed out**; the header body is a plain, non-interactive label
again. Lane focus still comes from **hover** (GP8 spotlight) and **clicking a
task** (pins the lane's tint/dim); only the `+` is clickable on the chip.

**Still open (deferred):** a nicer header-focus interaction + the
grow-to-full-title reveal — to be re-tuned later. The full-title reveal on hover
is currently the pre-GP5 marquee. `TaskGraph.svelte` only; build green, 1261
tests, verified dark/light/mobile in the rig.

**Note (2026-07-18).** The focus/dim half is covered by GP8 (hover spotlight +
task-click pin). Remaining GP5: a header-focus affordance that feels good + the
full-title grow reveal.

**Problem.** Two behaviours are currently fused onto the header: it's the
add-task target (`TaskGraph.svelte:551` region) and there's no focus mode.

**Direction.**
- **Tap header → focus that lane**: fade out the other lanes, and **grow the
  focused lane** so its full title is visible (ties into the hover-marquee /
  short-lane work from `8289ca9`, `e3f2720`).
- Because tap is now "focus," **move click-to-add off the header tap** onto a
  dedicated **`+` button at the bottom of each header chip**. Visually it should
  read as **one shape** — the header chip and the plus as a *subshape* of it
  (not a separate floating button).

**Acceptance.**
- Tapping a header focuses/expands its lane and dims the rest; tapping again (or
  elsewhere) clears focus.
- Focused lane shows the full, untruncated title.
- Add-task is a clear `+` affordance at the bottom of the header chip; unified
  shape with the chip.
- Works on touch (coarse-pointer targets ≥ the P4 minimum) and desktop.

### GP7 — Split Dependency and Timeline (Gantt) into separate views `[x]`

*Landed 2026-07-18.* The single **Graph** rail entry is now **two** built-in
views — **Dependencies** (`id: graph`, `graphMode: 'dependency'`,
`git-branch-plus`) and **Timeline** (`id: timeline`, `graphMode: 'overview'`,
`gantt-chart`) — both on `RENDERER_GRAPH`. The in-view Dependency/Overview
toggle is gone; `TaskGraph.svelte` renders whichever mode its view's
`presentation.graphMode` fixes (`defaultGraphMode` prop). Switching rail entries
keeps the same `<TaskGraph>` instance (same renderer) and updates the mode via
the existing reactive prop sync — verified in the rig (direct-nav + runtime
switch both flip modes). Per-view state persists for free: the active view id
already rides on N2's `currentViewId` `getState`/`setState`, so a reload reopens
whichever of the two was last active. `graph` kept its id so persisted
active-view + any custom graph views resolve unchanged. Touched
`viewRegistry.ts` (+ its test id-order assertion), `TaskGraph.svelte` (toggle
markup + `.tt-mode-btn`/`.tt-graph-toolbar-row` CSS removed), rig
`main.ts`/`shots.mjs` (new `timeline` scene + shots). Build green, 1261 tests.
No PROTOCOL/deep-link change — the URI scheme opens the board/tasks, never a
specific view.

**Problem.** Both lived in one graph leaf behind a Dependency/Overview mode
toggle at the top of the toolbar. Taylor wanted them as **two distinct views**,
not a toggle inside one.

**Direction.** Register the dependency graph and the timeline/Gantt (currently
`graphMode === 'overview'`) as separate Obsidian views / rail entries.
- Decide component strategy: split `TaskGraph.svelte` into two components, or
  keep it shared and drive a fixed `mode` prop per leaf (start simple — a fixed
  prop, since the branches already exist).
- Rail: the single **Graph** entry becomes two (e.g. **Dependencies** +
  **Timeline**).
- State persistence: extend the N2 `getState`/`setState` layout persistence so
  each view restores independently.
- Preserve deep-links / `PROTOCOL.md` (`action=jump`, prefill) and the visual
  rig scenes (`?view=graph` → likely `?view=deps` / `?view=timeline`).
- Removes the need for the mode toggle → further toolbar declutter (ties into
  GP2).

**Acceptance.**
- Two separate rail entries, each opening its own leaf; no in-view mode toggle.
- Each view persists its own state across reloads.
- Deep-links and the rig shot matrix updated to the new view ids.

**Notes.** Bigger structural change than GP1–GP6; worth its own PRD-ish pass.
Sequence after the cheap visual items (GP4) unless Taylor wants it prioritised.

### GP1 — Mobile: pop-out / full-screen graph `[x]` (live-mobile sign-off pending)

*Landed 2026-07-18 (rig-verified; live iOS pass still owed).* Research first:
the native pop-out (`moveLeafToPopout`/`openPopoutLeaf`) is **desktop-only and
throws on mobile** ([obsidian.d.ts:6931](node_modules/obsidian/obsidian.d.ts)),
so it can't serve the mobile goal; an in-place `position:fixed` fullscreen fights
Obsidian's header z-index/scroll. Chosen mechanism: a **fullscreen `Modal`** —
the one surface that works on both platforms. New `GraphExpandModal` hosts a
second `TaskGraph` instance edge-to-edge, reusing the board's live stores
(`groups`, `activeTaskPath`); opening a task closes the modal first so the detail
drawer doesn't end up behind it on mobile. `TaskGraph` gained
`onToggleFullscreen`/`isFullscreen`: a top-right maximize button in **both**
dependency and timeline modes that flips to a collapse button inside the modal
(the single exit — Obsidian's native close X is hidden to avoid overlap; Esc +
the phone back gesture also close it now that `Modal implements HistoryHandler`
in obsidian 1.13). CSS: large centred surface on desktop (`min(96vw,1400px)` ×
90vh), true `100vw/100vh` on `.is-phone`; coarse-pointer gets a 44px target.
Also bumped obsidian typings 1.12.3 → 1.13.1 (was resolving stale under
`"latest"`). `GraphExpandModal.ts` (new) + `TaskGraph.svelte` +
`TaskBoard.svelte` + `styles.css`. Build green, 1261 tests.

**Still owed:** the live iOS / real-`.is-phone` pass (the rig can't render
Obsidian's mobile shell — verified edge-to-edge by forcing `.is-phone`, which
measured the modal at the full 390×844 viewport, but final sign-off is on-device
per the CLAUDE.md mobile rule). Tracked in **Gated on Taylor** below.

**Problem.** In its current leaf form the graph is close to useless on mobile —
too little screen. Want a way to "pop out" the graph so it takes (most of) the
screen.

**Acceptance.**
- On a narrow viewport there is an obvious control to expand the graph to
  (near) full screen, and to return. ✓ (maximize/collapse toggle)
- Pan/zoom/pinch still work in the expanded surface. ✓ (fresh instance
  re-inits its gesture handlers; rig-verified, on-device pinch pending)
- Verify on iOS / narrow-viewport browser per the CLAUDE.md mobile rule.
  ⏳ live-mobile sign-off pending.

---

## Next — colour-model workshop `[x]`

*Landed 2026-07-19 — Taylor picked **V2 Colour spine**.* Workshopped like the C2
layout one: baseline + 3 rig-rendered variants (V1 single-channel, V2 spine, V3
tuned hierarchy) shipped as an Artifact
(`Scripts/graph-c2/colour-workshop.html`, untracked); Taylor picked the spine.

**Shipped model.** Identity colour moved off the badges onto the **card/row left
edge**, keyed to the task's project **area** — so the badge row itself stays
monochrome. `--tt-area-color` is set on `.tt-kanban-card` (real `border-left`)
and `.tt-task` (inset `box-shadow`, so row content stays aligned with group
headings). Area badge → neutral text (`.tt-badge-cat.tt-badge-tinted`); labels →
neutral pills (dot dropped); **overdue/completed date slabs softened from solid
fills to tints** (the loudest offender). Active state still wins: the card's
accent `border-left` and the row's accent inset overlay override the spine (row
spine suppressed on `.is-active` to avoid a double bar). Touched `styles.css`,
`TaskKanban.svelte`, `TaskRow.svelte`. Build green, 1261 tests, verified
dark/light × desktop/mobile + active states in the rig.

**Still owed:** live-Obsidian / on-device sign-off (rig-verified only), folded
into the **Visual regression pass** below.

Grounding: the three colour settings sections (statuses / areas / labels) stay
functionally intact; the CLAUDE.md colour rule (`color-mix` surface tinting,
never hardcoded hex/white on user colours) held for the shipped model.

---

## In progress — Pomodoro (native) `[~]`

*Opened 2026-07-19.* Native focus-timer, chosen over integrating the community
Pomodoro Timer plugin (Taylor's call) so it's dependency-free and works on
mobile + desktop. Satisfies the ROADMAP Phase 8 "Pomodoro integration" spec
(was: link an external plugin's session → log duration → show time-spent) with
a self-contained implementation. Data model: **count + minutes** in frontmatter.

**Slice 1 — foundation `[x]` (2026-07-19).** Pure state machine
`src/integration/pomodoro.ts` (focus→short/long-break cadence, tick/remaining,
pause/resume, phase advance, `MM:SS` format) — Obsidian-free, in the boundary
test, **16 unit tests**. `pomodoro_count?` + `focused_minutes?` added to the
`Task` type (optional; reader defaults missing→null), wired through the
TaskStore reader and `TaskWriter` update field-list. New `PomodoroSettings`
(focus/short/long minutes, long-break interval, auto-start-next) on
`TTasksSettings` with defaults + normalize. Build green.

**Slice 2 — service + wiring `[ ]`.** A `PomodoroService` owning the interval
tick, a reactive session store, frontmatter writes on focus completion
(`count += 1`, `focused_minutes += focusMinutes` via `TaskWriter.update`), and
end-of-phase `Notice`s. Plus a "Start Pomodoro on task" command, a quick action,
and a mobile hold-menu entry (Phase 3 quick-action pattern).

**Slice 3 — UI `[~]`.** *Detail-pane control + settings section landed
2026-07-19.* The detail pane shows a "Start focus timer" button, and — when the
task owns the running session — a live `MM:SS` + phase with Pause/Resume, Skip,
Stop, plus the accumulated `Nx · Nm logged`. Rig-verified idle + active
(accent-tinted running surface, muted on break). A **Pomodoro settings group**
(focus/short/long minutes, long-break interval, auto-start toggle) is wired.
A **Pomodoro settings group** is wired.

**Slice 2 (service) + Slice 3 (detail UI + settings) `[x]` (2026-07-19).**
Both landed; see history above.

**Slice A — untethered + CSV log `[x]` (2026-07-19, `b0110db`).** `taskPath`/
`taskName` now nullable through the pure timer + service; "Start Pomodoro (no
task)" command. New pure `pomodoroLog.ts` (RFC-4180 CSV) + `appendPomodoroLog`
in main: each completed focus appends `ended_at,mode,minutes,task_name,task_path,
note` to `ttasks-pomodoro-log.csv` (header on first use; failures Notice-but-
never-throw). Per-task rollup kept. Settings `logEnabled`/`logPath`. `logFocus`
dep now takes a `CompletedFocus` object and logs the phase's *actual* minutes.

**Slice B-core — focus until a time `[x]` (2026-07-19, `b0110db`).** New pure
`pomodoroPlan.ts` (`planFocusUntil` + `parseUntilInput` "10:30"|"90" +
`fillFocusMinutes`): fills the gap before a target with whole cycles; too-short
remainder → a shortened final "fill" focus landing exactly on target. Session
gained `targetEndMs`/`isFill`; service `startUntil` + `handleUntilBoundary` gate
on wall-clock (injectable `now()`). `FocusUntilModal` (live plan preview),
"Focus until a time…" command, detail-pane "Focus until…" button.

**Slice B-pane — dedicated Pomodoro pane `[x]` (2026-07-19, `6f81ab0`).**
`PomodoroPane.svelte` (pure — service refs/callbacks as props, no plugin import;
component-tested) in `PomodoroView.ts` (`ttasks-pomodoro`, right sidebar, icon
`timer`); "Open Pomodoro pane" command. Untethered from here; a task's detail
pane still starts a tethered session. Rig `?pomo=idle|active` scene verified.

**Slice C — desktop status-bar countdown `[x]` (2026-07-19).** A second
status-bar item (desktop only — `Platform.isMobile` guard, like N6) shows a
`timer` icon + live `MM:SS` while a session runs, hidden when idle. Driven by
subscribing to `pomodoroService.session` (already ticks 1/s — no second
interval); break phases tint green and paused dims (0.6), matching the pane
dial. Click toggles pause/resume; the tooltip carries phase · remaining · task ·
the click hint. Pure `pomodoroStatusBar.ts` (`pomodoroStatusBarView`, 8 tests,
in the boundary list); main.ts adds `initializePomodoroStatusBar` +
`updatePomodoroStatusBar`. Rig `?pomostatus=1` scene renders all five states
(focus/break/paused/final/untethered) — verified dark + light. Build green.

**Slice D — log partial session on stop `[x]` (2026-07-19).** Stopping mid-focus
no longer discards the elapsed time: `PomodoroService.stop()` now logs the whole
elapsed focus minutes as a **partial** session (new `partial` flag on
`CompletedFocus`) before clearing. Partials add to the task's `focused_minutes`
and get a CSV row (`note: "partial (stopped)"`) but do **not** bump
`pomodoro_count` — a stopped session isn't a completed pomodoro. Only fires for a
focus phase with ≥1 whole minute elapsed (breaks + sub-minute focus ignored),
gated by a new `logPartialOnStop` setting (default on) with its own toggle in the
Pomodoro settings group. Pure `elapsedMinutes` (already present + tested) does the
math; `PomodoroService.ts` + `main.logPomodoroFocus` + settings
(types/defaults/section) + 5 new service tests. Build green.

**Remaining:** live-Obsidian sign-off for the CSV write + the two Obsidian modals
+ the pane leaf + the status-bar item (rig can't host the real Obsidian status
bar) — folds into the Visual regression pass.

---

## Gated on Taylor (not headless-workable)

- `[x]` **Branch review + merge** — merged `feat/ui-polish-autopilot` (32
  commits: Autopilot A–I + graph polish incl. GP4) into local `main` via
  fast-forward (2026-07-17). Stale branches (`feat/ui-polish-autopilot`,
  `feat/native-workspace-panes`) can be pruned whenever.
- `[ ]` **N3 public API — review then implement** — `API_DESIGN.md` is written
  and Taylor's decisions on the 5 open questions are recorded; implementation
  ships only after his review of the final doc.
- `[ ]` **C2-F2 mid-column whitespace** ⚖ — semantic tradeoff: pulling
  source-only nodes rightward changes what a column *means* and can perturb the
  0-crossing layout. Full analysis in `Scripts/archive/GRAPH_LAYOUT_C2.md`.
- `[ ]` **N7 Bases compatibility** — needs the live vault (`~/Obsidian/Taylor`)
  with Bases enabled. Ship `Scripts/TTasks.base` (views: Active, Due this week,
  By area, project rollup), verify aliased wiki-links / `labels` list / quoted
  date fields resolve in Bases, document in README. **No schema changes**
  without a written proposal first.
- `[x]` **P2-8 overdue-red softening** — *done 2026-07-19.* The badge half was
  already softened to a red tint in the colour-spine work; this closes the other
  offender — the **whole task name painted `var(--color-red)`**. Chose
  **badge-only**: dropped the full-name red on both `.tt-task` (list) and
  `.tt-kanban-card` (kanban); the red-tint `Nd overdue` date badge is now the
  sole overdue signal, so a column of overdue rows no longer shouts. The other
  option (a red left edge) was rejected — the area-colour spine now owns that
  edge and a red bar would fight it. Removed the now-dead `is-overdue` class +
  `overdue`/`isOverdue` computations from both components (`isTaskOverdue` stays
  as an exported, tested helper). `TaskRow.svelte` + `TaskKanban.svelte`. Build
  green, 1261 tests, verified list + kanban × dark/light in the rig; live sign-off
  folds into the **Visual regression pass** below. (From
  `Scripts/archive/DESIGN_AUDIT.md`.)
- `[x]` **GP1 live-mobile sign-off** — *done 2026-07-19.* Taylor ran the
  on-device pass: the graph pops out to fullscreen great. GP1 fully closed.
  (Follow-up: the **detail-drawer issue** below remains, deferred by Taylor.)
- `[~]` **GP1-follow: detail drawer opens behind/hidden on mobile** 🔎 —
  on-device, tapping a node in the popped-out fullscreen graph closes the modal
  but the **detail drawer ends up behind something / off-screen** instead of
  surfacing (rig can't reproduce — no Obsidian mobile shell). **Fix attempted
  2026-07-19 (device-unverified):** (1) `GraphExpandModal` now defers the
  open-task hand-off to a `requestAnimationFrame` *after* `close()`, so the
  modal's history/focus-restore can't land after the drawer reveal; (2)
  `openDetailPane()` reveals the right leaf with `active: Platform.isMobile` so
  the mobile drawer surfaces instead of revealing under the board. Both build
  green; **could not be confirmed on-device** — Taylor's phone was not loading
  fresh plugin builds this session (a separate deploy/sync-reload problem, see
  note below). Verify once builds reach the device. `GraphExpandModal.ts`,
  `main.ts`.
- `[~]` **Graph node: double-tap-to-open on mobile** 🔎 — *found + fix attempted
  2026-07-19 (device-unverified).* Tapping a task node in the graph needed two
  taps to open on iOS. Root cause: the node's hover behaviour (preview + hover
  `+`) makes WKWebView spend the first tap applying the emulated hover and
  withhold the `click`. Fix: on **touch**, open from `pointerup` (fires on the
  first tap regardless), desktop stays on `click`; Android-safe via a 700ms
  ghost-click guard. Also added an 8px press-vs-drag threshold so a stationary
  tap no longer starts a pan / captures the pointer. Same device-load blocker as
  above — verify on-device. `TaskGraph.svelte`.
- `[~]` **Detail pane doesn't fit the mobile drawer** 🔎 — *fix landed in rig
  2026-07-19 (device-unverified).* The detail field grid was `label │ control`
  (two columns), squeezing controls on the narrow drawer. Below 768px it now
  collapses to one column (label stacked above a full-width control), plus
  `overflow-x: hidden` on the detail leaf. **Rig-verified** dark + light at phone
  width; on-device blocked by the same build-load issue. `TaskDetail.svelte`,
  `styles.css`.
- `[ ]` **Deploy pipeline: phone not loading fresh plugin builds** 🔎 —
  *surfaced 2026-07-19.* During the mobile-fix session, verified-correct builds
  (confirmed in the compiled `main.js` + rig) did **not** take effect on Taylor's
  phone even after reload attempts — the old bundle kept rendering. This blocks
  *all* on-device verification. Likely Obsidian Sync not delivering the symlinked
  plugin's `main.js`/`styles.css`, or the mobile app caching the old JS/CSS past
  a plugin toggle. Investigate: confirm Sync is set to sync installed plugins,
  whether it follows the repo symlink, and whether a full app-kill (not just a
  plugin toggle) is required to reload. Until fixed, mobile items above stay
  `[~]` unverifiable.
- `[ ]` **Visual regression pass** — dark/light × desktop/phone sweep per the
  `Scripts/STYLING_NOTES.md` checklist; includes the settings-tab before/after
  from the P7 overhaul (the rig doesn't cover the settings tab — live Obsidian
  check).
- `[ ]` **GP2 residue** (minor ⚖) — Blocked/Cycle count pills now hide at zero;
  if Taylor prefers them always visible it's a two-line revert.

---

## Later — roadmap features (all horizons)

Longer-range features migrated here from `ROADMAP.md`'s Phase 5–8 + Deferred
sections (all-horizons reconcile 2026-07-19), so nothing lives *only* in the
roadmap where a backlog pass can't see it. ROADMAP keeps the detailed specs as
historical notes; this is the live list. Roughly priority-ordered within each
group, not committed.

**Phase 8 — Power features**

- `[~]` **Pomodoro** — in progress; see the *In progress* thread above.
- `[ ]` **Centralized notification + error-handling system, + desktop native
  notifications** 🔎 — *scoped 2026-07-21 (Taylor).* Audit found notification
  firing is **fractured**: 50+ ad-hoc `new Notice(...)` call sites across
  `main.ts`, `ArchiveService.ts`, `TaskWriter.ts`, modals, settings sections,
  and Svelte components, each building its own message inline. The only
  shared helper is `buildReminderNotice` (`src/store/reminderNoticeBuilder.ts`),
  and it's reminder-specific. `PomodoroService` fires through an injected
  `notify` closure that's also just wired to `new Notice` in `main.ts`. **No
  code anywhere uses the native/Electron `Notification` API** — nothing
  surfaces at the OS level when Obsidian is backgrounded/minimized, which is
  presumably the itch behind this ask (related to, but distinct from, the
  Pomodoro backgrounding-drift bug in the 2026-07-21 feedback batch above —
  that one is a timer-math bug in the countdown itself; this item is about
  adding an OS-level notification on top, e.g. so a Pomodoro phase-complete
  still surfaces even if Obsidian isn't the focused window).
  - **Folded in (2026-07-21):** a follow-up audit found the **error/failure
    messaging path is fractured the same way, and worse** — no single
    try/catch → log → notify helper exists. At least four inconsistent
    patterns coexist: `plugin.log()` + `Notice` (`TaskWriter.ts:82-84,158-160`,
    `ArchiveService.ts:57-59,65-67,163-165`), silent `console.warn` with no
    user feedback at all (`ArchiveService.ts:73-75,179-181`), `console.error`
    paired with `Notice` (`CreateTaskModal.ts:788-790`), and three separate *mini*
    shared helpers that each only cover their own local call sites
    (`buildBulkErrorHandler` in `migrationSettingsSection.ts`,
    `scanErrorPolicy.ts`'s `handleScanError` used only by `ScanEngine.ts`/
    `promoteTaskToTTasks.ts`, and a private `logFailure` inside
    `vaultSafe.ts`). Since centralizing `Notice` already means answering "how
    does a call site report a failure," this item now covers both: the
    `NotificationService` below should own success/info/error variants
    (consistent log-then-notify behavior) rather than solving `Notice`
    alone and leaving error-handling to a second pass.
  - **Direction (proposed):** a single `NotificationService` that all current
    `Notice` call sites — and the four error-handling patterns above — route
    through, so message handling + failure logging is one integration point.
    On **desktop**, additionally fire the Web/Electron `Notification` API
    (Obsidian desktop runs in Electron's renderer, so the standard `new
    Notification(...)` Web API should work without touching
    `electron`/`ipcRenderer` directly — confirm during implementation) with a
    click handler that focuses the Obsidian window and navigates to the
    relevant task/pane. On **mobile**, the native `Notification` API isn't
    available in Obsidian's mobile webview — gate behind
    `Platform.isDesktop`/`!Platform.isMobile` (same convention as the
    existing status-bar item, `main.ts` `initializeStatusBar`); mobile stays
    `Notice`-only. New settings toggle (e.g. `nativeNotificationsEnabled`)
    defaulting **off** (triggers a browser permission prompt — should be
    opt-in), settings-tab section following the existing toggle pattern
    (`pomodoroSettingsSection.ts`).
  - **Still needs scoping:** which notification *types* get the native OS
    upgrade (Pomodoro phase-complete and due-date reminders are the two
    obvious candidates; error/CRUD notices stay in-app-only `Notice`, just
    routed through the same service) — confirm with Taylor before
    implementing. Also confirm the click-to-focus mechanism available from
    the renderer (`window.focus()` vs. anything Electron-specific).
- `[ ]` **Minor: `ImportConfirmModal` duplicates `confirmModal.ts`** — found
  during the 2026-07-21 notification audit while scoping the item above.
  `src/modals/confirmModal.ts` is a real shared confirm-dialog helper (used by
  `TaskBoard.svelte`/`TaskDetail.svelte` for delete/batch-delete), but
  `src/modals/ImportConfirmModal.ts` reimplements the same open/cancel/confirm
  shape as its own bespoke `Modal` subclass instead of reusing it. Small,
  low-risk cleanup — fold `ImportConfirmModal` onto `confirmModal()` (or
  extend `confirmModal()` if it needs a custom body) whenever it's convenient,
  not blocking anything.
- `[ ]` **Natural language quick capture** — parse `Fix bug #high due:tomorrow
  @Project blocking:abc123` from palette / status bar / mobile FAB. (Gated on a
  stable filter engine — Phase 6, now done — so unblocked.)
- `[ ]` **Capacity-aware Today planner** — "for today" flag independent of due
  date; suggest top tasks by `estimated_days` vs. available hours; overload
  warning. Uses `status_changed` (present). May overlap Cycles — design together.
- `[ ]` **Cycles / Sprints (investigate)** — time-boxed windows; pull tasks into
  a cycle, track velocity. Evaluate with the Capacity planner.
- `[ ]` **Obsidian ecosystem compatibility** — daily-note integration (surface
  today's due/started), Tasks-plugin `- [ ]` render, Dataview/Datacore schema
  compat, Templater hooks. **Note:** the Templater-hooks / "expose API" piece is
  the same work as the gated **N3 public API** item above — dedupe when N3 lands.
- `[ ]` **Markdown code-block processor** — ```` ```ttasks filter:… ```` embeds
  a live task list in any note. High value if the plugin is ever published.

**Phase 7 — Data-model expansion**

- `[ ]` **Activity log on tasks** — timestamped append-only log in the note body;
  auto-entries for status/creation/completion/recurrence; manual comments;
  renders as a detail-panel timeline. (Pomodoro session logging is a first
  consumer — consider building the shared log here.)
- `[ ]` **Milestones within projects** — zero-effort dated task that gates
  downstream deps; diamond node in the graph; markers on the timeline.
- `[ ]` **Icon/emoji field** for statuses/areas/labels — separate `icon` from
  `label` so compact views can be icon-only (interim: emoji in the name works).
- `[ ]` **Eisenhower Matrix view** — 2×2 Important × Urgent; urgent from
  due-proximity, important from priority.
- `[ ]` **Sections within projects** — sub-grouping (`Design`/`Dev`/`QA`);
  investigate a `section` field vs. lightweight `parent_task` grouping.

**Phase 5 residue — small, still-open**

- `[ ]` **Kanban drag-to-reorder within a column** (priority ordering) — no code
  for it yet; the rest of the Phase 5 kanban overhaul shipped.
- `[ ]` **Card density toggle** (compact vs. detailed) — the per-card *field* set
  shipped (`kanbanCardFields`); a density toggle did not.

**Deferred / investigate later** (parked, needs a design or a precondition)

- `[ ]` **Evening review modal** (GTD clarify) — needs the Capacity planner first.
- `[ ]` **Workload view** — needs a real multi-user `assigned_to` story.
- `[ ]` **Habit tracking** — arguably its own plugin; revisit post-core.
- `[ ]` **CodeMirror embed / true Live Preview in detail** — deferred (mobile
  keyboard risk).
- `[ ]` **Mobile authoring toolbar** — floating row above the keyboard; deferred
  (WKWebView complexity).

---

## Audit 2026-07 — codebase / publication readiness

*Folded into this registry 2026-07-25.* Full analysis, rationale, and code
references live in **`AUDIT_2026-07.md`** (root); this section is the tracked
index so a backlog pass can see the work. Item IDs are the audit's own:
`AR` architecture · `DT` dates · `MD` frontmatter/schema hygiene · `RP` repeat
mechanism · `TD` testing · `PB` publication. Priority markers are the audit's:
🔴 fix before publication · 🟡 should do · 🟢 opportunistic.

The audit's §7 gives a dependency-ordered sequencing plan (Phase 0 hygiene →
Phase 1 publication scaffolding → Phase 2 date hardening → Phase 3 schema
reset + repeat redesign → Phase 4 architecture debt). Two cross-refs into the
rest of this backlog: **AR-2** (TaskGraph decomposition) should land ahead of further
graph work, and **AR-3** (schema descriptor table) should land before **N3**
implementation since it changes how API fields are exposed.

### Dates (DT)

- `[x]` **DT-3 / RP-1 🔴 monthly + yearly recurrence drift** — *done 2026-07-25.*
  A month-end schedule permanently collapsed onto February's day (Jan 31 → Feb 28
  → Mar 28 → Apr 28 …) because each occurrence was computed from the previous
  *already-clamped* date instead of the schedule's anchor day. Fixed by making the
  anchor explicit and persisted: `advanceDate(date, rule, anchorDay?)` clamps
  per-occurrence instead of cumulatively (defaults to the date's own day, so the
  un-anchored behaviour is preserved exactly); new pure `deriveAnchorDay`; new
  `recurrence_anchor_day` frontmatter field, derived whenever `due_date` is written
  *without* an explicit anchor (so a manual reschedule redefines the schedule)
  and carried across recurrence spawns and duplication (so a clamped occurrence
  never re-derives a wrong anchor). Now: Jan 31 → Feb 28 → **Mar 31** → Apr 30 →
  May 31. Tasks predating the field fall back to the due date's own day.
  `recurrence.ts`, `completeTask.ts`, `TaskWriter.ts`, `TaskStore.ts` (reader,
  with the same native-property-type hardening as feedback #19), `taskDuplicate.ts`,
  `types.ts`. +50 tests, build green, **1616 tests**.
  **Residuals:** (a) `nextStartDate` is still un-anchored, so a month-end *start*
  date can drift — smaller blast radius, and the RP redesign unifies it;
  (b) the anchor isn't in the JSON export surface, so a full export→import
  round-trip re-derives it from the (possibly clamped) due date; (c) the field is
  deliberately kept out of `TASK_FIELD_DEFINITIONS` (it's derived, not
  user-editable), and MD-1 will rename it to `ttask_repeat_*` form.
- `[~]` **DT-4 🟡 `recurrence.ts` contradicted the dateUtils contract** —
  *partly done 2026-07-25.* The wrong doc comment (claimed "T12:00:00 **local**"
  while the code uses `T12:00:00Z` + UTC accessors — behaviour was correct, the
  comment wasn't) is fixed, and the duplicated monthly/yearly days-in-month clamp
  is extracted to one `daysInMonth` helper. **Still open:** folding `advanceDate`
  onto `dateUtils` primitives so the module stops carrying its own parse/format
  (planned for the RP redesign).
- `[ ]` **DT-1 🔴 agenda buckets + query results go stale at midnight** — the
  engine calls `localDateString()` internally, and nothing re-runs the query at
  midnight; a board left open overnight shows yesterday's Overdue/Today buckets
  while the row badges (which do subscribe to the `today` store) update — a
  visible inconsistency. Plan: make `applyQuery` take `ctx: { today }`, derive
  `useTaskQuery` from `[tasks, query, today]`, then sweep the remaining
  `startOfToday()`-at-mount surfaces (`TaskGraph`/`hybridTimeline` today-marker,
  `TaskBoard`, `TaskDetail`, `statusSummary`). Also makes the engine tests
  deterministic.
- `[ ]` **DT-2 🔴 `due_time` is stored but semantically dead** ⚖ — persisted,
  written, sortable, offered in the query editor, and consumed by *nothing*:
  overdue logic, agenda bucketing, and all four reminder rules are date-only.
  Needs a decision: **(A, audit's recommendation)** make it real via a
  `due-time-passed` reminder rule (the 5-minute poll already exists; overdue
  *styling* stays date-based), or **(B)** declare it display/sort-only and
  document that. Either way `dateUtils` gains `localTimeString()`.
- `[ ]` **DT-5 🟡 "This week" is a rolling 7 days, not a calendar week** ⚖ — on a
  Friday, "This Week" contains next Thursday. Either rename the buckets
  ("Next 7 days" / "Following week") or implement calendar-week bucketing with a
  week-starts-on setting. Cheap either way (keys/labels are centralized in
  `agendaBuckets.ts`) but bucket names are user-facing semantics — decide before
  publication.
- `[ ]` **DT-6 🟢 consolidation + enforcement** — add `isIsoDateString` and sweep
  the 8 duplicate ISO-date regexes (with AR-5); move `formatHumanDate` next to
  `MONTH_ABBR`; enforce no bare `new Date()` outside the boundary.

### Repeat mechanism (RP) — redesign

- `[ ]` **RP-2 🟡 expressiveness** — no "every N", weekday sets, nth-weekday,
  weekday classes, end conditions, or working-day awareness. Audit §4 specifies
  the target: flat prefixed `ttask_repeat_*` frontmatter keys (**settled with
  Taylor 2026-07-12** — not a human-language DSL, not nested YAML, because nested
  objects are second-class in Obsidian's Properties panel and unreachable from
  Bases), a pure `src/repeat/` engine with a TDD table, and a builder UI.
- `[ ]` **RP-3 🟡 fragile recurrence identity** — the spawn dedupe guard in
  `decideCompletion` matches on task **name**, so renaming a recurring task with
  an open instance breaks the guard and double-spawns. Fixed by construction in
  the redesign (stable series identity).

### Frontmatter / schema hygiene (MD)

- `[ ]` **MD-1 🔴 prefix the schema `ttask_*`** — the plugin's generic property
  names (`type`, `name`, `status`, `priority`, …) pollute the vault-wide property
  suggestion pool and collide with other plugins' conventions.
- `[ ]` **MD-2 🔴 sparse writes** — stop writing null/empty keys on creation;
  every task note currently carries the full key set whether or not it's used.
- `[ ]` **MD-3 🟡 stop persisting `blocks`** — it's a pure reverse index of
  `depends_on` and can be derived at load, which deletes the whole sync machinery
  (and the `sync-blocks` command).
- `[ ]` **MD-4 🟡 one-shot vault migration + dev-command pruning** — a standalone
  `Scripts/migrate-prefixed-schema.mjs` run once with Obsidian closed does the
  MD-1/MD-2/MD-3 + legacy-recurrence conversion, so **zero legacy code ships**
  and the dev-phase migration commands (`migrate-phase6-data-model`,
  `migrate-status-changed`, `migrate-css-classes`) get deleted.
- `[ ]` **MD-5 🟢 property registry cleanup** — hand-edit the vault's
  `types.json` (Obsidian closed) to drop the old generic entries so they stop
  appearing in the suggestion pool; document recommended property types.

### Publication readiness (PB) — blocks any public release

- `[ ]` **PB-1 🔴 missing release scaffolding** — no README, LICENSE,
  `versions.json`, version-bump script, or release workflow.
- `[ ]` **PB-2 🔴 review-bot flags in the code** — the sweep Obsidian's reviewers
  run: `innerHTML`/`setIcon` usage, `activeLeaf` access, `vault.process`,
  `console` gating, the localStorage API, and casing/heading conventions.
- `[ ]` **PB-3 🟡 manifest polish** — description + metadata.
- `[ ]` **PB-4 🟡 Svelte CSS is JS-injected** — contradicts CLAUDE.md's "no
  JS-injected `<style>` elements; all CSS belongs in `styles.css`" rule. Svelte's
  scoped styles compile to runtime-injected `<style>` tags, so the rule is
  currently only honoured for hand-written CSS. Extract at build time.

### Testing posture (TD)

- `[ ]` **TD-1 🔴 no CI** — nothing runs build/test/lint on push; the local gate
  is manual.
- `[ ]` **TD-2 🟡 lint is not in the local gate either** — and it's currently
  **failing: 50 `no-mixed-spaces-and-tabs` errors** across `TaskGraph.svelte`,
  `TaskKanban.svelte`, and `TaskRow.svelte` (was 10 in one file at audit time, so
  this is growing). Add a `check` script that runs build + test + lint together.
- `[ ]` **TD-3 🟡 coverage visibility** — no coverage reporting.
- `[ ]` **TD-4 🟢 component-test debt** — tracks AR-1; fold "add a render test"
  into each component migration.
- `[ ]` **TD-5 🟢 date/time determinism** — tests that depend on the wall clock;
  largely resolved by DT-1's `today` injection.

### Architecture (AR)

- `[ ]` **AR-1 🔴 the component→plugin coupling rule is violated by all ten
  legacy components** — CLAUDE.md says new components must not import
  `TTasksPlugin`/`TaskStore` directly, but every top-level component does (they
  pre-date the rule). Plan: a `BoardContext` of callbacks/service refs, migrated
  component by component, each with a render test (TD-4).
- `[ ]` **AR-2 🟡 `TaskGraph.svelte` is a ~2,125-line god component** — schedule
  ahead of further graph polish work.
- `[ ]` **AR-3 🟡 the Task field schema is defined in four places** — they must be
  updated in lockstep (this session touched three of them to add one field).
  Plan: one descriptor table with `fmKey` / `omitWhenEmpty`, which MD-1/MD-2 and
  N3 both build on.
- `[ ]` **AR-4 🟡 `TaskWriter` mixes four concerns** — extract a
  `ChecklistSyncService`.
- `[ ]` **AR-5 🟢 smaller DRY / correctness items** — incl. the 8 duplicate
  ISO-date regexes (with DT-6).

---

## Cross-refs

- **Closed sweeps + full item histories:** `Scripts/archive/` —
  `AUTOPILOT.md` (the A–I batch queue, all checked), `UI_POLISH_TASKS.md`
  (P1–P7, C1, C2), `NATIVE_FEATURES_TASKS.md` (N1–N6), `GRAPH_POLISH.md`
  (GP1–GP7 originals; GP2/GP6 landed), `GRAPH_LAYOUT_C2.md` (C2 workshop +
  variant decision), plus the older `AUDIT_TASKS.md`, `BUGFIX_TASKS.md`,
  `DESIGN_AUDIT.md`, and `CODEBASE_MODAL_DETAIL_EXPLORATION.md`.
- **Reference docs (live, root):** `API_DESIGN.md` (public API, awaiting
  review), `PROTOCOL.md` (URI handler), `AUDIT_2026-07.md` (full codebase /
  publication audit — its open items are indexed in the `Audit 2026-07`
  section above; read it for rationale and code references before starting
  one).
- **Visual rig:** `npm run rig` / `npm run rig:shots` (CLAUDE.md → CSS Notes).
