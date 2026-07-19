# TTasks Roadmap

This file is a **dated journal of what shipped** plus historical phase notes.
It is *not* the live open-work registry — that is `BACKLOG.md` (all horizons:
`Now` / `Next` / `Gated` / `Later`). The Phase 5–8 spec sections below are kept
for their detail but are historical; an unchecked box there is **not** live work
(it lives in BACKLOG's `Later` if still wanted). See the reconcile note dated
2026-07-19 below.

---

## Docs reconcile — BACKLOG is now all-horizons (2026-07-19)

**Removed the backlog/roadmap coverage seam.** BACKLOG.md previously held only
near-term threads (graph polish, colour, gated items) while the longer-range
Phase 5–8 + Deferred features lived only here — invisible to a "work the
backlog" pass (which is how the Pomodoro ask went unpicked-up). Fix: migrated
every still-open forward-looking feature into a new **`Later`** section of
BACKLOG.md (Phase 7/8, Phase 5 residue, Deferred), so nothing lives only in the
roadmap. This file is demoted to a dated journal + historical phase notes; its
Phase 5–8 sections carry a banner and keep their specs but no longer act as a
competing live list. CLAUDE.md's "single live backlog" description updated to
match. No code change.

## Pomodoro — native, Slice 1 (2026-07-19)

**Opened the Phase 8 Pomodoro feature as a native build** (Taylor's call, over
integrating the community Pomodoro Timer plugin — dependency-free + mobile).
Slice 1 (foundation) landed: pure state machine `src/integration/pomodoro.ts`
(focus→short/long-break cadence, tick, pause/resume, phase advance, `MM:SS`;
Obsidian-free, in the boundary test, 16 tests), `pomodoro_count?` +
`focused_minutes?` on the `Task` type wired through reader + `TaskWriter`, and
`PomodoroSettings` (durations, long-break interval, auto-start) with defaults +
normalize. Slices 2 (service + command wiring) and 3 (detail/status-bar UI +
settings section) tracked in BACKLOG. Build green.

## P2-8 checkpoint — overdue-red softening, badge-only (2026-07-19)

**Closed the last loud overdue offender.** The colour-spine pass had already
softened the overdue *badge* from a solid red slab to a tint; overdue still
painted the **whole task name** `var(--color-red)`, which shouted when several
piled into one column. Chose **badge-only**: dropped the full-name red on both
`.tt-task` (list) and `.tt-kanban-card` (kanban), so the red-tint `Nd overdue`
date badge is the sole overdue signal. The alternative — a red left edge like
kanban's active accent — was rejected because the area-colour spine now owns the
card/row left edge and a red bar would fight it. Removed the now-dead
`is-overdue` class + `overdue`/`isOverdue` computations from both components
(`isTaskOverdue` kept as an exported, tested helper). `TaskRow.svelte` +
`TaskKanban.svelte`. Validation: production build clean; **1261 tests** passing;
verified list + kanban × dark/light in the rig — overdue names now neutral, the
badge carries urgency, the area spine undisturbed. Live-Obsidian sign-off folds
into the visual regression pass.

---

## Colour-model workshop checkpoint — V2 "colour spine" (2026-07-19)

**Colour-model workshop → shipped.** The BACKLOG "Next" thread (status/area/label
colours competing on cards) was run as a pick-one workshop: baseline + three
coherent, rig-rendered variants (V1 single-channel, V2 spine, V3 tuned
hierarchy) presented as a self-contained Artifact
(`Scripts/graph-c2/colour-workshop.html`, left untracked — ~2.3MB of embedded
shots). **Taylor picked V2, the colour spine.** Shipped model: the card/row's
identity colour moves to its **left edge**, keyed to the task's project `area`,
freeing the badge row to stay monochrome. `--tt-area-color` set inline on
`.tt-kanban-card` (real `border-left`) and `.tt-task` (inset `box-shadow`, so row
content stays aligned with the group headings). Area badge → neutral text;
labels → neutral pills (colour dot dropped); **solid overdue/completed date slabs
softened to tints** (the loudest offender — it out-shouted the area it sat
under). Active state wins: card accent `border-left` overrides the spine; the row
suppresses its spine on `.is-active` so the accent inset overlay is the only left
bar. Touched `styles.css`, `TaskKanban.svelte`, `TaskRow.svelte`. Live-Obsidian
sign-off folds into the visual regression pass. Validation: production build
clean; **1261 tests** passing; verified dark/light × desktop/mobile + active
states in the rig.

---

## GP1 checkpoint — fullscreen graph expand modal (2026-07-18)

**GP1 landed (rig-verified; live-iOS sign-off pending).** Research-first task:
the native pop-out API (`moveLeafToPopout`/`openPopoutLeaf`) is desktop-only and
throws on mobile, so the chosen mechanism is a **fullscreen `Modal`** — the one
surface that works on both platforms. New `GraphExpandModal` hosts a second
`TaskGraph` instance edge-to-edge, reusing the board's live stores; opening a
task closes the modal first (the detail drawer would otherwise sit behind it on
mobile). `TaskGraph` gained `onToggleFullscreen`/`isFullscreen`: a top-right
maximize button in both dependency and timeline modes, flipping to a collapse
button inside the modal (single exit; native close X hidden; Esc + phone
back-gesture also close it via `Modal implements HistoryHandler`, new in obsidian
1.13). CSS: centred `min(96vw,1400px)`×90vh on desktop, `100vw/100vh` on
`.is-phone`; 44px coarse-pointer target. Bumped obsidian typings 1.12.3 → 1.13.1.
Touched `GraphExpandModal.ts` (new), `TaskGraph.svelte`, `TaskBoard.svelte`,
`styles.css`. Graph-polish thread now: GP1/GP3/GP4/GP7/GP8 landed; GP5 partly.
Still owed: on-device iOS pass (rig can't render Obsidian's mobile shell).
Validation: production build clean; **1261 tests** passing; rig-verified
edge-to-edge at the full 390×844 viewport.

---

## GP7 checkpoint — split Dependency / Timeline views (2026-07-18)

**GP7 landed.** The single **Graph** rail entry is now two built-in views —
**Dependencies** (`id: graph`, `graphMode: 'dependency'`) and **Timeline**
(`id: timeline`, `graphMode: 'overview'`) — both on `RENDERER_GRAPH`. The in-view
Dependency/Overview toggle is removed; each view is fixed to the `graphMode` in
its `presentation`, rendered through `TaskGraph.svelte`'s `defaultGraphMode` prop.
Switching between the two keeps the same `<TaskGraph>` component (shared
renderer) and updates the mode via the existing reactive prop sync — verified in
the rig for both direct navigation and runtime switch. Per-view state persists
via N2's existing `currentViewId` layout persistence; `graph` kept its id for
back-compat. Touched `viewRegistry.ts` (+ test), `TaskGraph.svelte`, and the rig
(`main.ts`/`shots.mjs`, new `timeline` scene). No PROTOCOL/deep-link change.
Graph-polish thread now: GP3/GP4/GP7/GP8 landed; GP5 partly; GP1 open (research).
Validation: production build clean; **1261 tests** passing; verified in the rig.

---

## Graph polish checkpoint (2026-07-18)

Graph-polish thread progress: **GP3** (project filter), **GP4** (swim-lane
tint), and **GP8** (lane focus: hover spotlight + task-click pin) are landed.
**GP5** is **partly** landed: the `+` add-subshape restructure shipped — the lane
header is one chip with the label body on top and a `+` footer (tap → add a task
to the project). The header **click-to-focus + grow-in-height-on-pin** rev was
tried and **backed out** (Taylor: header click "not that nice… tune later"), so
the header body is a plain label again; lane focus stays on hover + task-click.
Remaining GP5: a nicer header-focus affordance + the full-title grow reveal.
Also open in the thread: **GP7** (split Dependency / Timeline into separate
views) and **GP1** (mobile pop-out, research-first). Validation: production build
clean; **1261 tests** passing; dark/light/mobile verified in the rig.

---

## Docs consolidation (2026-07-12)

All open work now lives in **`BACKLOG.md`** (root) — graph polish GP1/GP3/GP4/
GP5/GP7, the colour-model workshop, and the Taylor-gated items (branch
review/merge, N3 API review, C2-F2, N7 Bases, P2-8, visual regression pass).
The fully-worked planning files moved to `Scripts/archive/`: `AUTOPILOT.md`
(A–I all checked), `UI_POLISH_TASKS.md`, `NATIVE_FEATURES_TASKS.md`,
`GRAPH_POLISH.md` (GP2/GP6 landed), `GRAPH_LAYOUT_C2.md` (V1 Compact +
F1/F4/F5 landed), `CODEBASE_MODAL_DETAIL_EXPLORATION.md`, and
`run-autopilot.fish`. The sections below are history.

---

## Consolidated Status (2026-07-06)

Single source of truth for what's done and what's left across every backlog
file. Supersedes the older per-sweep handoffs — those files are kept as history
with their items marked `[DONE]`. Validation at this checkpoint: full suite
**1241 tests / 109 files** passing; production build clean.
Branch: `feat/ui-polish-autopilot` (never pushed/merged — Taylor reviews).

### Closed sweeps (verified done in-tree)

Fully-closed sweep files are archived under `Scripts/archive/` (historical
record with `[DONE]` markers + root-cause notes); the two with open items stay
in the repo root because the Autopilot queue reads them for live specs.

| Backlog file | Scope | State |
| --- | --- | --- |
| `Scripts/archive/AUDIT_TASKS.md` | Sweep 2 — A1–A6, B1–B3, C1–C6, D1–D7 | ✅ complete |
| `Scripts/archive/DESIGN_AUDIT.md` | P0-1…P0-6, P1-1…P1-6, P2-1…P2-7 | ✅ complete (exceptions below) |
| `Scripts/archive/BUGFIX_TASKS.md` | #1–#8, #10, #12, #13 | ✅ complete (#9/#11 → open, below) |
| `NATIVE_FEATURES_TASKS.md` | N1, N2, N4, N5, N6 | ✅ complete (N3/N7 → open) |
| `UI_POLISH_TASKS.md` | P1, P2, P3, P5, P6 | ✅ complete (P4/P7/C1/C2 → open) |

### Open work — the Autopilot queue is the live backlog

Remaining scope lives in `AUTOPILOT.md`'s batch queue (batches A–E done). The
older identifiers collapse onto these batches — same work, different files:

| Batch | Aliases | Scope | Gate |
| --- | --- | --- | --- |
| **F** ⚖ | UI_POLISH P7 | Settings pane IA/presentation overhaul | autopilot-able |
| **G** | UI_POLISH P4 + C1 = BUGFIX #9 | Graph mobile touch/pinch; zoom-edge detach repro | autopilot + may need live repro |
| **H** | NATIVE N3 | Write `API_DESIGN.md` (design doc only, no `src/` changes) | autopilot-able |
| **I** ⚖ | UI_POLISH C2 = BUGFIX #11 | Graph layout: baseline metrics + 2–3 variant proposals | **present options, Taylor picks** |

### Fenced off — need Taylor (not autopilot-able)

- **N7** (Bases sample `.base` + schema check) — needs the real vault with
  Bases enabled.
- **C2 / #11 final layout** — Batch I produces options; the pick is Taylor's.
- **N3 API surface** — the design doc (Batch H) is written headlessly, but the
  API itself ships only after Taylor's review.
- **DESIGN_AUDIT P2-8** (soften overdue-red) — deliberately not done; a taste
  call flagged for Taylor.
- **Visual regression pass** — dark + light, desktop + phone, per the
  STYLING_NOTES.md mobile-modal checklist (noted pending in DESIGN_AUDIT and
  the bugfix graph items).

---

## Autopilot complete (2026-07-09)

The `AUTOPILOT.md` batch queue (A–I) is fully worked. All boxes checked; branch
`feat/ui-polish-autopilot` never pushed/merged — Taylor reviews.

**Landed this run (Batches F–I):**

- **Batch F** — settings IA/presentation overhaul + round-2 follow-ups
  (collapsible jumpable sections, hide-built-in-views, reminder previews,
  capture-source rewrite, named/recurring holidays, per-area workweek).
- **Batch G** — graph pinch-to-zoom + coarse-pointer touch targets (UI_POLISH
  P4); **zoom-edge detach reproduced and fixed** (C1 / BUGFIX #9 — root cause was
  `.tt-graph-stage { min-width: 100% }` inflating the SVG above scale 1.0).
- **Batch H** — `API_DESIGN.md` public-API design doc (NATIVE N3, doc only);
  Taylor's decisions on the 5 open questions recorded.
- **Batch I** — graph-layout C2 workshop → `GRAPH_LAYOUT_C2.md` (+ shots in
  `Scripts/graph-c2/`). **No layout change landed.**

**Now needing Taylor (gated / not autopilot-able):**

- **C2 variant pick** — the workshop found topology already near-optimal (0
  crossings); footprint is the lever. Recommends **V1 Compact** (−31% canvas,
  66%→77% fit). Landing the pick is a four-constant edit in `TaskGraph.svelte`.
  Algorithmic follow-ups (F1–F4 in the writeup) are greenlight-gated.
- **N3 API** — ships only after Taylor reviews `API_DESIGN.md`.
- **N7** Bases sample — needs the real vault with Bases enabled.
- **DESIGN_AUDIT P2-8** overdue-red softening — deliberate taste call.
- **Visual regression pass** — dark/light × desktop/phone, per STYLING_NOTES.md.

---

## Graph polish thread (opened 2026-07-10)

After the Autopilot A–I queue + C2 layout pick landed, the active thread is
dependency-graph swim-lane polish (5 commits through `8289ca9`). Taylor's
2026-07-10 feedback batch is captured in **`GRAPH_POLISH.md`** as GP1–GP7:

- **GP1** 🔎 mobile pop-out / full-screen graph (needs Obsidian-API research)
- **GP2** ✅ toolbar declutter (dropped noisy count pills) + zoom floated to the
  canvas top-right, clear of the create-task FAB
- **GP3** project filter dropdown (Unassigned = derived special case)
- **GP4** swim-lane project-colour tint (top+bottom → centre gradient)
- **GP5** lane-header tap-to-focus (grow + dim others) + `+` add-button subshape
- **GP6** ✅ chain-highlight click-off bug fixed; hover-highlight retired (now
  click-to-pin only), and the hover "+" gained an off-angle grace window
- **GP7** split Dependency and Timeline (Gantt) into separate views (no toggle)

---

## Progress Notes (2026-07-04)

Worked through `BUGFIX_TASKS.md` (Taylor's 2026-07-04 report), then the
Autopilot batches A–E on `feat/ui-polish-autopilot`. The earlier
`AUDIT_TASKS.md` Sweep 2 (A1–A6, B1–B3, C1–C6, D1–D7) was already implemented
in prior sessions and verified present.

Bugfix report shipped:

- **#3/#4** — Detail pane derives its task from `$tasks` (fixes "Task Not
  Found" on create); `TaskWriter.update` applies an optimistic in-memory patch
  so completion/edits propagate to all views without waiting on a metadata
  rescan.
- **#2** — Selected rows/kanban cards use an accent tint distinct from the
  neutral hover grey, plus a stronger selected+hovered state.
- **#5/#6** — Universal `holidays` list + per-area `areaWorkweek` toggle in
  settings, threaded via `CalendarConfig` through the working-day date math;
  new "Working calendar" settings section. Legacy per-task fields still read.
- **#13** — Per-role colour descriptions for the status/area/label sections.
- **#10** — Native `title=` tooltips on graph controls/nodes replaced with
  `aria-label` (no more OS tooltip during pan/zoom).
- **#12** — Clicking a graph node pins its dependency chain highlight (sticky);
  empty-canvas press or Esc clears it.
- **#8** — Weekend Overview bands strengthened with a theme-aware hatch;
  holidays stay a distinct red.
- **#7** — Detail pane topbar and main-view filter bar share a 44px header
  height so their bottom borders align.

Autopilot batches A–E (native integration + UI polish):

- **Batch A** — UI_POLISH P5 (detail-pane centering) + P6 (detail top/bottom
  actions) + NATIVE N1 (native `addAction` header buttons on all three leaves).
- **Batch B** — UI_POLISH P1 (kanban collapsed one-line header) + P3 (inset
  selected-row highlight).
- **Batch C** — UI_POLISH P2 (conservative list-row visual pass).
- **Batch D** — NATIVE N4 (jump-to-task fuzzy switcher) + N5 (protocol
  `action=jump` + new-task prefill + `PROTOCOL.md`).
- **Batch E** — NATIVE N2 (view state persistence via `getState`/`setState`) +
  N6 (status-bar tooltip/warning/hide-when-zero + click-target setting).

Remaining after Batch E: batches **F–I** (see Consolidated Status above) plus
the Taylor-gated items.

---

## Progress Notes (2026-05-25)

Stream J is now complete (J1-J6). The backlog focus shifts from stream completion to post-J hardening and reliability polish.

### Stream K planning checkpoint

- Added implementation tickets `Scripts/TASK_K1.md`-`Scripts/TASK_K6.md` to cover the next hardening slice:
  - K1: ScanEngine error policy and surfacing contract
  - K2: Deterministic bounded-concurrency full scan
  - K3: Exact completion-sync link matching
  - K4: `TaskWriter.update()` status transition timestamp correctness (`status_changed`)
  - K5: `TaskBoard.svelte` cleanup of `activeViewMode` subscription on destroy
  - K6: `fileScanner.ts` DRY cleanup and parser intent clarification

### Stream J completion

- J1 boundary hardening was already present in-tree (safe vault wrappers, metadata-cache fallback startup, safe localStorage handling) and remained green.
- J2 constants extraction landed and centralized shared timing/renderer/tree limits.
- J3 ReminderService decomposition landed (`reminderRules`, `reminderStorage`, `reminderNoticeBuilder`) with pure tests.
- J4 performance slice landed: `withConcurrencyLimit`, bounded relationship rewrites, and `TaskStore.getByPath` O(1) index adoption.
- J5 DRY slice landed: relationship link-array mutation helper extracted and wired through `TaskWriter`.
- J6 type-safety slice landed: undocumented workspace integrations moved to typed extension interfaces; unsafe casts removed from `main.ts`.
- Follow-on hardening: `useTaskQuery` now wraps `applyQuery` with dev-only `console.time('applyQuery')` / `console.timeEnd('applyQuery')` instrumentation.
- Validation status now: full suite passing at **1114 tests across 98 files**; production build passing.

Stream H is now complete, and Stream I has started with the pure parsing layer landed. The remaining TaskDetail render-level coverage landed, the scoped component suite now runs through a dedicated Vitest config, and the downstream ecosystem-integration parsers now exist as pure modules.

### I5 bulk import completion

- Added `src/integration/importScanner.ts` and shared capture-file resolution helper `src/integration/captureSourceFiles.ts` to collect capturable tasks across all configured sources while excluding native task-folder files.
- Added shared promote workflow `src/integration/promoteTaskToTTasks.ts`; TaskBoard captured Promote button now uses the shared flow.
- Added `src/modals/ImportConfirmModal.ts` with confirmation counts + 5-item preview and promise-based confirm/cancel contract.
- Added Settings -> Advanced -> Migration section (`src/settings/migrationSettingsSection.ts`) with one-shot import action, re-entry guard, sequential promotion loop, and persistent progress notice for large imports.
- Added tests: `src/integration/importScanner.test.ts`, `src/modals/ImportConfirmModal.test.ts`, and boundary checks for new pure integration modules.
- Validation status now: full suite passing at **1060 tests across 92 files**; production build passing.

### H1 completion

- Added `src/components/TaskDetail.component.test.ts` to cover empty state, task vs. project conditional sections, blocked reason visibility, completed-task actions, and active-task switching.
- Added `vitest.components.config.ts` so component tests run under `jsdom` without relying on shell-dependent file globs.
- `npm run test:components` now validates the component slice consistently on Windows.

### I1 foundation

- Added `src/integration/checkboxParser.ts`, `emojiFieldParser.ts`, and `filenameDateParser.ts` with pure-function test coverage.
- Added parser tests for checkbox status extraction, Obsidian Tasks emoji metadata parsing, and filename date inference.
- Extended `architectureBoundaries.test.ts` so the new parsing helpers stay free of Obsidian imports.

### I2 capture source configuration

- Added capture-source settings schema with normalization and defaults (`captureSources`, `captureSourceDefaultMode`, `captureSourceDefaultDefaults`).
- Added capture-source helper module with auto-detection merge and rollover detection (`src/settings/captureSourcesSettings.ts`) plus focused tests.
- Added settings UI section for capture source defaults and per-source editing (`src/settings/captureSourcesSettingsSection.ts`) and wired it into `SettingsTab`.
- Plugin load now auto-detects daily/periodic folders and merges missing sources without overwriting existing user configs.

### I3 scan engine groundwork

- Added `src/integration/types.ts` with the new `ExternalTask` shape and source-location metadata.
- Added pure scanner module `src/integration/fileScanner.ts` with `scanFileForCapturableTasks` and `isInCaptureScope`, plus dedicated tests.
- Added `src/integration/ScanEngine.ts` to orchestrate full scan + file rescans + previous-day surface flow.
- Wired captured task stream into `TaskBoard` query input and added captured/from-yesterday badges in `TaskRow` with source-note open behavior.

### I4 promote + completion sync

- Added `src/integration/promoteTask.ts` and `src/integration/completionSync.ts` with focused TDD coverage.
- Wired captured-row Promote action in list view (`TaskRow`/`TaskList`/`TaskBoard`) to create a real task note and replace the source checkbox text with an unchecked task wikilink.
- Hooked completion/uncompletion sync into `TaskWriter.update()` so tasks with `source` update `[ ]`/`[x]` in their originating source line.
- Extended architecture boundary coverage so I4 integration helpers remain free of Obsidian imports.

### Validation status

- Full suite passing: 1050 tests across 90 files.
- Production build passing.

## Progress Notes (2026-05-22)

Streams D-G are now complete, with E2 keyboard behavior finalized in the board view. Build clean and full suite green (961 tests passing).

### E2 finalization

- Added `src/integration/boardFocus.ts` with pure focus movement logic and TDD coverage in `boardFocus.test.ts`.
- Task board keyboard shortcuts now drive a dedicated focused-task path, separate from active detail state.
- `TaskBoardView` now supports deterministic `next`/`prev` list navigation using visible row paths.
- Escape behavior refined: close detail first, otherwise clear focused task.

### Status checkpoint

- Stream D complete: Kanban card fields + dependency badge, column collapse.
- Stream E complete: multi-select batch ops + in-board keyboard shortcuts.
- Stream F complete: graph lane sidebar headers + accessibility polish.
- Stream G complete: reminder snooze + per-task override.

### Workflow/tooling

- Added dedicated npm scripts for scoped verification without CLI arg pass-through:
  - `npm run test:board`
  - `npm run test:reminders`
  - `npm run test:components`

## Progress Notes (2026-04-29)

Phase 6 Smart Lists slice is now functional and hardened. Build clean, zero TypeScript errors, 379 tests passing.

### Step 7 — Query editor complete

- `src/query/queryEditor.ts` — pure filter/sort/group builder helpers plus raw JSON validation.
- `src/modals/QueryEditorModal.ts` — Builder + JSON tabs, renderer selector, in-modal rename, labels checklist UX, inline field hints, and delete-with-confirm flow.
- `sortScope` added to `QuerySpec` so grouped views can sort globally-first or within each group.
- Modal CSS hardened for width/overflow regressions.

### Step 8 — Smart Lists complete

- Shared view registry now drives built-in + custom views through the same model.
- Board rail groups built-ins and Smart Lists; users can add, edit, rename, and delete Smart Lists.
- Built-in Smart Lists now include Inbox, Today, and Blocked.
- Renderer/query contract is centralized: Agenda forces agenda date buckets, Kanban forces status grouping.
- Query editor now constrains grouping options by renderer and coerces incompatible JSON before save.
- Regression tests cover renderer-query coercion to prevent empty-view bugs from incompatible grouping.

---

## Progress Notes (2026-05-01)

Overview graph UX and performance slice completed. Build clean, tests passing (440).

### Overview timeline improvements

- Overview now scrolls horizontally with a fixed-width timeline canvas.
- Initial camera focus opens near "today" (with context before and after), not at far historical start.
- Added a red/dashed "today" marker in the axis and track body.
- Adaptive timeline tick density for long ranges.

### Readability + interaction polish

- Completed items are clearly muted and marked distinct from active work.
- Title rendering hardened (safer truncation on overview bars and underdefined cards).
- Hover behavior toned down to avoid boundary distortion against date-aligned bars.

### Scale/performance hardening

- Added viewport virtualization for Overview bars and link paths.
- Added lane grouping modes: `project`, `dependency`, `none`.
- Added grouped band/label rendering for clearer long-range scanning.

### Persistence + navigation reliability

- Overview preferences now persist in plugin settings:
  - `overviewGraphGrouping`
  - `overviewGraphShowCompleted`
- Detail pane relationship navigation now resolves short wikilinks via Obsidian metadata cache (`getFirstLinkpathDest`), eliminating "not found" loops for existing linked tasks.

---

## Progress Notes (2026-04-20)

Phase 5 partial. 265 passing tests, zero TypeScript errors, build clean.

### Convert Task to Project

- `TaskStore.convertToProject(path)` — flips `type → project`, clears `task_type` via `processFrontMatter`
- `TaskContextMenuDeps.convertToProject` added; "Convert to Project" menu item appears on tasks only (hidden for projects)
- Wired in both `showTaskContextMenu` and `registerNativeContextMenus` (`addForTask`)
- Tests: `contextMenu.test.ts` updated with new dep, callback assertion, and project-type exclusion case

### Hierarchy utilities (deferred wiring)

- `src/store/taskHierarchy.ts` — three pure utilities: `flattenWithDepth`, `buildVisibleItems`, `getParentPaths`
- 16 new tests covering flat lists, nested depth, orphaned children, cycle breaking, collapse visibility
- `TaskRow.svelte` — `indent`, `expandable`, `expanded`, `onExpand` props added (defaults are no-ops; zero visual change today)
- Views NOT wired yet — status-based grouping splits parents and children into different groups, so per-group hierarchy is ineffective. Deferred to Phase 6 view architecture rework (filter → sort/group → view pipeline).

---

## Progress Notes (2026-04-10)

Phases 3A, 3B, and 3C are complete. Build, lint, and tests all passing (14 tests).

## Progress Notes (2026-04-16)

Recurrence foundation is now implemented and test-hardened.

- Recurrence rule helpers added in `src/store/recurrence.ts` (`daily`, `weekly`, `biweekly`, `monthly`, `yearly`) with `fixed` and `from_completion` schedule modes.
- Month/year advancement now clamps correctly at month-end and leap-year boundaries.
- Completion flow supports recurrence rollover via `TaskStore.completeAndRecur()`.
- Create + detail UI now expose recurrence and recurrence type.
- Regression and edge-case coverage expanded in `src/store/recurrence.test.ts` (table-driven assertions + leap/DST/month-end cases).
- Current test status: 101 passing tests.

## Current State (2026-04-16 Final Pass)

- External settings sync is implemented with full merge and canonical re-save on external changes.
- Legacy swipe settings are fully removed from runtime support (`mobileSwipeEnabled`, left/right swipe actions, swipe layout fields).
- Mobile interaction model is now hold-menu only; row component naming is aligned (`HoldActionTaskRow`).
- Plugin data is in canonical schema shape (`data.json` now includes reminders object and hold-menu quick-action keys only).
- Verification status: full test suite passing (130 tests) and production build passing.

## Current State (2026-04-16 Recurrence + Date Semantics Follow-up)

- Date-only handling is standardized on local calendar semantics across task operations and reminders.
- Recurring completion behavior refined in `TaskStore.completeAndRecur()`.
- Checklist reset supports all Obsidian-native task list forms.
- Validation status: full suite passing (156 tests) and production build passing.

## Current State (2026-04-16 Phase 4A + Code Quality Refactor)

- `is_complete` / `is_inbox` derived boolean fields on every `Task`.
- Settings UI: Completion status and Inbox status dropdowns.
- Delete task with confirm dialog; panel open state decoupled from activeTaskPath.
- Agenda view filters out completed tasks. Kanban always-visible horizontal scrollbar.
- TDD-driven DRY pass: `pathUtils.ts`, `wikiLink.ts`, `constants.ts`, date utility adoption.
- Test suite: 198 passing. Zero TypeScript errors.

---

## Progress Notes (2026-04-16) — Phase 4B Complete

Phase 4B complete. TDD throughout — all features built red→green. 244 passing tests, zero TypeScript errors, build clean.

### status_changed field

- `status_changed: string | null` added to `Task` (excluded from `TaskCreateInput` — store owns it)
- `computeStatusChanged(currentStatus, nextStatus, today)` pure helper in `src/store/statusChanged.ts`
- `resolveStaleDate(statusChanged, startDate)` picks best anchor for stale-in-progress rule
- `TaskStore.update()` writes `status_changed = today` inside `processFrontMatter` when status actually transitions
- `TaskStore.create()` and `buildFrontmatter()` seed it from `created` date
- `completeAndRecur()` does not carry `status_changed` to the new recurrence instance
- `migrateStatusChanged()` backfills existing tasks with `start_date ?? created`
- Command: "Migrate status_changed field (backfill existing tasks)"
- `ReminderService` stale rule uses `resolveStaleDate(task.status_changed, task.start_date)` — graceful fallback for old tasks

### System status protection

- `isSystemStatus(status, completionStatus, inboxStatus): boolean` exported from `settings.ts`
- Both completion AND inbox statuses: remove button disabled, lock tooltip, hard guard in `saveManagedList()`
- Config-driven — protects current pointer values, not hardcoded strings

### Task duplication

- `buildDuplicateInput(task, today, inboxStatus): TaskCreateInput` pure helper in `src/store/taskDuplicate.ts`
- Reset on duplicate: status → inboxStatus, completed → null, created → today, start_date → null, depends_on → [], blocked_reason → ''
- Preserved: name, type, category, priority, task_type, parent_task, due_date, estimated_days, notes, recurrence, recurrence_type, assigned_to, source
- `TaskStore.duplicate(path)` wires the helper into the store
- Right-click menu: "Duplicate" item on all three context menu surfaces (in-view, file-menu, editor-menu)
- Command palette: "Duplicate active task" (only available when a task is selected in the detail panel)
- After duplication: detail panel navigates to the new task, Notice shown

---

## Phase 4B — COMPLETE ✓ (2026-04-16)

### `status_changed` field [ ]
- Add `status_changed?: string` to `types.ts`
- `TaskStore.update()` writes today when `status` changes
- `ReminderService` stale rule uses `status_changed` over `start_date` proxy
- Migration command: set `status_changed = start_date ?? created` on existing tasks
- TDD: pure logic in `statusChanged.ts`, integration in `TaskStore.test.ts`

### Protect system statuses [ ]
- Mark Done and Inbox statuses as system-protected in settings schema
- Settings UI: system statuses shown with lock icon, rename/delete disabled
- Validation in `TaskStore.update()` — cannot set a task to a deleted status
- `resolveCompletionStatus()` / `resolveInboxStatus()` fall back to first non-system status if pointer becomes stale
- TDD: settings resolver tests, guard tests

### Task duplication [ ]
- `TaskStore.duplicate(path)` — clone frontmatter, new `{6hex}-{slug}` ID, clear `completed`, `status_changed`, `created` = today, status reset to inboxStatus
- Command palette: "Duplicate task"
- Context menu item on task rows
- Detail panel "Duplicate" button
- TDD: duplication logic isolated and tested before wiring UI

---

## Phase 5–8 + Deferred — historical planning specs

> ⚠️ **These sections are historical planning notes, not a live list.** The
> live open-work registry is `BACKLOG.md`. Most of Phase 5/6/7 has **shipped**
> (see the dated checkpoints above and CLAUDE.md's phase list); the genuinely
> still-open items were migrated to BACKLOG's `Later` section on 2026-07-19.
> Kept here for the detailed specs only — cross-check BACKLOG before treating
> any unchecked box below as open work.
>
> **Shipped since these were written:** Phase 5 (kanban overhaul, customizable
> card fields, style overhaul, context menu, convert-to-project, hierarchical
> list, open-in-editor title, logbook + auto-archive, settings reorg — *except*
> kanban drag-to-reorder and a card-density toggle, now in BACKLOG `Later`);
> Phase 6 (data model + query/views + Smart Lists) in full; Phase 7 (archive
> infra, `area` field). Still open → BACKLOG `Later`: Phase 7 activity log /
> milestones / icon field / Eisenhower / sections; all of Phase 8; the Deferred
> list.

## Phase 5 — UX Hardening

### Kanban overhaul (broken layout)
- Diagnose and fix column layout regressions
- Card hover contrast fix (currently too dark, text unreadable)
- Drag-to-reorder within a column (priority ordering)
- Stable column widths with proper overflow

### Customizable card display
- User-configurable field set per card (e.g. show start_date, due_date, category, tags)
- Field order configurable
- Compact vs. detailed card density toggle

### Style fixes
- Button text truncation in modals and panels
- Alignment regressions across list/detail/kanban
- List view hover states (too aggressive)
- Consistent Obsidian CSS token usage throughout

### Right-click context menu on task items
- Inline context menu on all row/card types (list, kanban, agenda, graph)
- Actions: open detail, open in editor, duplicate, start, complete, block, defer, delete

### Convert Task to Project (backlog)

- Right-click option: "Convert to Project" — changes `type` frontmatter from `task` to `project`
- Retain all existing fields; `task_type` can be cleared or left as-is
- If the task has a `parent_task`, prompt: keep parent relationship or promote to top-level?
- After conversion, navigate to the task (now project) in detail panel

### Hierarchical list view (sub-task indentation)

- In list view: tasks with a `parent_task` render visually indented under their parent
- Parent row is collapsible; collapsed state persists per-view session
- Same treatment in agenda view: grouped/indented under the parent heading when parent is also due/active
- Orphaned tasks (parent not in current filter results) render flat as today
- Depth limit: cap visual nesting at 2–3 levels to avoid runaway indentation on mobile

### "Open in editor" title fix
- Task editor view title uses `name` frontmatter field, not the raw filename

### Completed task handling + Logbook
- Completed tasks removed from all active views by default
- Dedicated Logbook tab: searchable, filterable archive of Done/Cancelled tasks
- Optional: auto-archive after N days (configurable)

### Settings pane reorganization
- Group settings into collapsible sections: General, Statuses, Categories & Types, Quick Actions, Reminders, Appearance
- Reduce visual noise for first-time setup

---

## Phase 6 — Data Model + Views & Filtering

### ⚠️ Step 0: Data Model Changes (prerequisite for everything below)

Agreed design decisions from 2026-04-24 session. These must land before the filter engine is built.

**Field renames and changes:**

| Field | Before | After | Notes |
| --- | --- | --- | --- |
| `category` | `string \| null` | `area: string \| null` | Renamed — represents "line of work" (Database, General, Work, Home) |
| `task_type` | `string \| null` | `labels: string[]` | Multi-value, user-configurable, pre-seeded with feature/bug/research/docs/action |
| `is_inbox` | derived (`status === inboxStatus`) | derived (`area === null`) | Inbox = unclassified, not a workflow state |
| `status` | includes "Inbox" value | pure workflow only | Inbox removed from status list entirely |
| `inboxStatus` setting | system pointer | removed | No longer needed |

**Rationale:**

- **Area** matches how users think about it: a top-level line of work, equivalent to TickTick lists or Things 3 Areas. Applies to both tasks and projects.
- **Inbox = area is null.** Tasks without an area haven't been triaged yet. Programmatic creates (agents, importers, quick capture) simply omit area — they land in inbox naturally. Triage = assign an area. No boolean flag needed, no ambiguity between "intentionally uncategorized" and "unclassified."
- **Labels** replaces both `task_type` and the planned `tags` field. Cross-cutting, multi-value, user-defined. Pre-seeded with sensible defaults but fully configurable. A task can have multiple labels (e.g. `bug`, `urgent`). Consolidating two label systems into one.
- **Status** is now a pure workflow axis. No special-cased system values.

**Migration command needed:**

- `category` → `area` frontmatter rename on all existing tasks
- `task_type: "value"` → `labels: ["value"]` (null → `[]`)
- Tasks with `status: Inbox` → `status` set to first non-completion status, `area` left null (they become inbox via the new model)
- Remove `inboxStatus` from `data.json` settings

---

### ⚠️ Step 1: Unified Query → View Pipeline

**Rethink the view model before building more views.** Current state couples filter logic, grouping, and render format tightly per-view (list, kanban, graph each have their own wiring). This makes it impossible to mix-and-match filter and view format, and blocks Smart Lists.

Target model:

```text
QuerySpec → useTaskQuery() → View (List | Kanban | Graph | Agenda | Calendar)
```

- **QuerySpec** — serialisable, plain JSON. Contains filter, sort, grouping, limit, limitPerGroup, search. Can be hand-edited for complex logic beyond what the UI builder supports.
- **useTaskQuery()** — shared Svelte store/hook. Takes a QuerySpec, returns sorted/grouped task set. All views consume this; none implement their own query logic.
- **View** — pure renderer. Receives grouped task list, renders it in its format. Swappable without touching query state.

**Why this matters:**

- Smart Lists become trivial: persist a `FilterSpec + SortSpec + GroupSpec` with a name, let user pick any view format
- Hierarchy wiring (deferred from Phase 5) becomes clean: `groupBy: parent` produces the tree structure natively
- Adding a new view type requires only a new renderer component
- Filter UI is written once, shared across all views

### Architecture decision (2026-04-29)

The product goal is **user-defined custom views with their own filters and logic**, not just a fixed set of built-in tabs.

That has one important consequence: **semantic grouping logic cannot live inside individual view components**. If Agenda buckets such as Overdue / Today / This Week only exist in `TaskAgenda.svelte`, users can save filters but not the actual view behavior.

So the query layer needs to evolve from a simple field-based `groupBy` to a richer serialisable grouping model.

---

### Filter Engine — Full Spec (agreed 2026-04-24)

#### `FilterOperator`

| Operator | Applies to | Notes |
| --- | --- | --- |
| `is` / `is_not` | string, boolean fields | Exact match |
| `contains` / `not_contains` | string arrays (labels, depends_on, blocks) | Single value membership |
| `contains_any` / `contains_all` | string arrays | Multi-value: any-of vs all-of |
| `before` / `after` | date fields | Value: `YYYY-MM-DD`, or relative: `'today'`, `'+7d'`, `'-3d'` |
| `within_days` | date fields | Value: integer N — date falls within next N days from today |
| `is_null` / `is_not_null` | any nullable field | Presence check; no value needed |

#### `FilterField`

```text
area | status | priority | labels | type
due_date | due_time | start_date | created
is_complete | is_inbox
parent_task | depends_on | blocks
assigned_to
```

**Relationship field operators:**

- `parent_task` — `is`, `is_not`, `is_null` (no parent), `is_not_null` (has parent)
- `depends_on` — `contains` (depends on task X), `is_null` (no deps), `is_not_null` (has deps)
- `blocks` — `contains`, `is_null`, `is_not_null`

**Known gap:** transitive/recursive queries ("all tasks under project X, including nested") are not supported by the flat filter engine. Requires the hierarchy utility (`taskHierarchy.ts`) wired separately.

#### `FilterGroup` — AND/OR nesting

```typescript
type FilterCondition = {
  field: FilterField
  operator: FilterOperator
  value?: string | number | boolean | string[]
}

type FilterGroup = {
  logic: 'and' | 'or'
  conditions: Array<FilterCondition | FilterGroup>  // recursive, unlimited depth
}

type FilterSpec = FilterGroup  // root is always a group
```

**UI:** filter builder caps nesting at 3 levels for usability. For deeper logic, `QuerySpec` is plain JSON and can be hand-edited directly.

#### `SortSpec`

```typescript
type SortField = 'name' | 'due_date' | 'due_time' | 'start_date' | 'created'
              | 'priority' | 'status' | 'area' | 'type'

type SortSpec = Array<{ field: SortField; direction: 'asc' | 'desc' }>
// Multiple entries = primary, secondary, tertiary sort
```

**Priority sort order:** High → Medium → Low → None (not alphabetical).

#### `GroupSpec`

```typescript
type GroupSpec =
  | { kind: 'none' }
  | {
      kind: 'field'
      field: 'status' | 'area' | 'priority' | 'type' | 'due_date' | 'parent_task'
    }
  | {
      kind: 'date_buckets'
      field: 'due_date'
      preset: 'agenda'
    }
```

This keeps grouping serialisable for settings/Smart Lists while allowing semantic presets such as Agenda buckets.

#### `QuerySpec` — the full query object

```typescript
type QuerySpec = {
  filter: FilterSpec       // condition tree
  sort: SortSpec           // ordered sort keys
  group: GroupSpec         // optional grouping strategy
  limit?: number           // cap total results after sort
  limitPerGroup?: number   // cap per group after sort (e.g. top 1 per area)
  search?: string          // pre-filter full-text match on name + notes
}
```

`limitPerGroup` + `group: { kind: 'field', field: 'area' }` + `sort: priority asc` = "highest priority task per area" view.

**Smart Lists / Custom Views** are named, persisted `QuerySpec` objects plus a renderer choice. Default views (All, Today, Inbox, Blocked, Agenda) become instances of the same engine:

- **Inbox** — `filter: { field: 'is_inbox', operator: 'is', value: true }`
- **Today** — `filter: { field: 'due_date', operator: 'is', value: 'today' }`
- **Blocked** — `filter: { field: 'status', operator: 'is', value: 'Blocked' }`

#### Implementation order

1. ~~Data model + migration~~ ✓ (Step 0 complete — 2026-04-24)
2. ~~Filter engine~~ ✓ (Step 1 complete — 2026-04-24) — `src/query/types.ts`, `src/query/engine.ts`, 38 tests
3. ~~Query layer~~ ✓ (Step 2 complete — 2026-04-24) — `src/query/useTaskQuery.ts` (`createTaskQuery`), 7 tests. Wired into `TaskBoard` filter bar.
4. **View migration** — complete (2026-04-29). `TaskList`, `TaskKanban`, `TaskAgenda`, and `TaskGraph` now consume grouped query output. List hierarchy wiring landed here.
5. **Query grouping upgrade** — complete (2026-04-29). Field grouping replaced with serialisable `GroupSpec`; semantic Agenda date buckets now live in the shared query engine.
6. **Custom view model** — complete (2026-04-29). `customViews[]` now persists canonical query + renderer + presentation definitions in settings, with legacy `groupBy` translation and invalid-entry cleanup. The board nav and settings screen now both read through a shared view registry, so built-ins and custom shells follow the same model.
7. **Filter / sort / grouping UI** — complete (2026-04-29). `QueryEditorModal` opens from the "Edit query" button on each custom view in settings. Builder tab: filter condition rows (field/operator/value with dynamic input kinds), sort entries, group selector (none/field/agenda buckets), limit/search. JSON tab: raw QuerySpec escape hatch with parse validation. Pure logic helpers in `src/query/queryEditor.ts` (40 tests, 371 total).
8. **Smart Lists / Custom Views** — complete (2026-04-29). Sidebar navigation now separates default built-in views from user Smart Lists, and Smart Lists remain named persisted query + renderer definitions. Default views (Inbox, Today, Blocked, Agenda) are now built-in registry entries in the same model as custom Smart Lists.

---

### Custom sort

### Forecast / Calendar view

- Monthly/weekly calendar grid with tasks overlaid by due date
- Shows scheduling gaps and overload days

### Progress rollup on projects

- Project nodes in list/graph show `X of N tasks complete` as a progress bar
- Blocked and overdue counts surfaced at project level

---

## Phase 7 — Data Model Expansion

### Activity log on tasks
- Timestamped append-only log in task note body (or separate frontmatter array)
- Auto-entries: status changes (uses `status_changed`), creation, completion, recurrence rollover
- Manual entries: user comments from detail panel
- Renders as a timeline in the detail panel

### Areas (explore — may map to top-level category)
- Hierarchy level above projects: Work, Personal, Health, etc.
- Investigate whether this is a separate `area` field or a reserved top-level category value
- If separate: areas appear as section headers in sidebar nav

### Milestones within projects
- A milestone is a zero-effort task with a target date that gates downstream deps
- Renders as a diamond node in the graph view
- Timeline shows milestone markers

### Icon/emoji field for statuses, categories, task types
- Separate `icon` from `label` so compact views (kanban headers, tight badges) can be icon-only
- Interim: emoji embedded in name (e.g. `📥 Inbox`) works everywhere and is easy to migrate
- Implement alongside protecting system statuses

### Eisenhower Matrix view
- 2×2 board: Important × Urgent
- Urgent axis derived from due-date proximity (configurable threshold) or explicit flag
- Important axis from priority field (High/Medium = important)

### Sections within projects
- Sub-grouping inside a project (`Design`, `Dev`, `QA`)
- Lightweight alternative to deep nesting
- Investigate: separate `section` field vs. lightweight parent_task grouping

---

## Phase 8 — Power Features

### Natural language quick capture
- Parse text entry: `Fix auth bug #high due:tomorrow @Project blocking:abc123`
- Available from command palette, status bar, and mobile floating button
- Deferred until after recurrence (now complete) and smart lists (Phase 6)

### Capacity-aware Today planner
- "Evening review" intent: mark tasks as "for today" independent of due date
- Suggests top tasks based on `estimated_days` budget vs. available hours
- Overload guardrails: warns when today's committed work exceeds capacity
- Requires `status_changed` (Phase 4B) for accurate in-progress accounting

### Pomodoro integration
- "Start Pomo on this task" command → links Pomodoro Timer plugin session to task
- On session end: log duration to task note activity log
- Aggregate time-spent visible in detail panel

### Cycles / Sprints (investigate)
- Time-boxed work windows; pull tasks into a cycle, track velocity
- May overlap with Capacity planner — evaluate together

### Obsidian ecosystem compatibility
- Daily note integration: surface today's due/started tasks in the daily note template
- Tasks plugin compatibility: read/render `- [ ]` checkboxes in task notes
- Dataview/Datacore compatibility: ensure frontmatter schema works with community queries
- Templater hooks: expose TTasks API to Templater scripts

### Markdown code block processor (deferred)
- ```` ```ttasks filter: category=Work ```` ``` ` embeds a live task list in any note
- High community value if plugin is published
- Deferred: requires stable filter engine (Phase 6 prerequisite)

---

## Deferred / Investigate Later

- **Evening review modal** — GTD clarify flow; needs capacity planner design first
- **Workload view** — needs multi-user `assigned_to` story
- **Habit tracking** — distinct enough to be its own plugin; revisit after core is stable
- **Asana-style sections** — investigate overlap with Milestones and project sections above
- **CodeMirror embed** — true Live Preview in detail panel; deferred due to mobile keyboard risk
- **Mobile authoring toolbar** — floating row above keyboard; deferred due to WKWebView complexity

---

## Historical Phase Notes

### Phase 3A — Dependency Graph ✓
- Graph board mode, dependency map, cycle detection, Gantt timeline, topological date inference.

### Phase 3B — Reminders ✓
- `ReminderService`: due-today, overdue, lead-time, stale-in-progress. Quiet hours, deduplication.

### Phase 3C — Quick Actions ✓
- Start, complete, block, defer via command palette and mobile hold menu with haptic feedback.

### Phase 2.5 — Hardening ✓
- ID collision-safe create, relationship safeguards, configurable categories/task types, lint + tests.
