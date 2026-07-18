# TTasks — Obsidian Plugin

A custom Obsidian plugin for task management with kanban, dependency tracking, and mobile-friendly UI. Designed to replace a patchwork of community plugins (QuickAdd, Meta Bind, Dataview) with a single, cohesive experience.

## Status Sources

Use these files as the canonical status references:

- `BACKLOG.md` — the single live backlog (all open items with specs)
- `CLAUDE.md` — current state, priorities, conventions, and latest milestone snapshot
- `ROADMAP.md` — dated progress log and backlog checkpoint by phase/slice
- `Scripts/memory/project_ttasks.md` — synced high-level status note for quick reference from the vault side

When updating project status, prefer updating `CLAUDE.md` first, then add a dated checkpoint to `ROADMAP.md` when the change is milestone-worthy.

## Tech Stack

- **TypeScript** — plugin logic
- **Svelte 4** — UI components
- **esbuild** — bundler (via `esbuild.config.mjs`)
- `npm run dev` — watch mode (outputs `main.js`)
- `npm run build` — production build

## Architecture

- **Plugin owns a configurable folder** — all task/project `.md` files live in one place
- **Data layer is plain frontmatter** — portable, git-friendly, readable without the plugin
- **Plugin renders all UI** — no Meta Bind, no Dataview dependency
- **Graceful degradation** — if plugin is disabled, notes remain readable markdown
- **`cssclasses: [ttask]`** added to every task note — plugin's `styles.css` scopes appearance

## File Format

Tasks stored as `{6hex}-{slug}.md`. The `name` frontmatter field is the human-readable title.

### Frontmatter Schema

```yaml
---
type: task | project
name: "Human readable name"
cssclasses: [ttask]
area: string | null
status: Active | Future | In Progress | Hold | Blocked | Cancelled | Done
priority: High | Medium | Low | None
labels:
  - feature | bug | research | docs | action | <custom>
parent_task: '[[path/without/ext|Name]]' | null
depends_on:
  - '[[path/without/ext|Name]]'
blocks:
  - '[[path/without/ext|Name]]'
blocked_reason: ""
assigned_to: ""
source: ""
start_date: 'YYYY-MM-DD' | null
due_date: 'YYYY-MM-DD' | null
estimated_days: number | null
created: 'YYYY-MM-DD'
completed: 'YYYY-MM-DD' | null
status_changed: 'YYYY-MM-DD' | null
---
```

Body = free-form markdown notes only. Plugin renders all structured UI on top.

### Relationship fields

- `depends_on` — tasks that must finish before this one (forward index)
- `blocks` — reverse index of `depends_on`, auto-maintained by the plugin
- `parent_task` — project this task belongs to
- Wiki-links stored with aliases: `[[path|Name]]` so they display human names in native Obsidian views

## Build Phases

### Phase 1 — Core

- [x] Task store: read/write frontmatter via Obsidian vault API
- [x] Task list view (registered Obsidian leaf)
- [x] Create/edit modal
- [x] Task detail panel

### Phase 2 — Views

- [x] Kanban board by status
- [x] Mobile-optimised layouts
- [x] Search and filter

### Phase 2.5 — Hardening

- [x] ID collision-safe task creation (retry until unique `{6hex}-{slug}.md` path)
- [x] Relationship safeguards on create (`depends_on` dedupe + self/invalid reference guard)
- [x] Configurable categories and task types in plugin settings
- [x] Baseline quality guardrails (lint + store-level tests)

### Phase 3 — Advanced

- [x] Dependency graph (visual, interactive)
- [x] Due date reminders/notifications
- [x] Quick actions (desktop commands + mobile hold menu)

### Phase 4 — Reliability + UX Hardening

- [x] Derived `is_complete` / `is_inbox` fields
- [x] Completion status settings
- [x] Delete with confirm dialog
- [x] `status_changed` field + stale-progress tracking
- [x] Task duplication

### Phase 6 — Data Model + Smart Lists

- [x] `area` replaces `category`
- [x] `labels: string[]` replaces `task_type`
- [x] Shared query engine (`filter` / `sort` / `group` / `limit` / `search`)
- [x] Agenda date buckets moved into shared query grouping
- [x] Persisted custom views / Smart Lists
- [x] Query editor modal with Builder + JSON tabs
- [x] Smart Lists in board rail with add/edit/delete
- [x] Renderer-query coercion for Agenda + Kanban

## Current Priorities

**The single live backlog is `BACKLOG.md`** (consolidated 2026-07-12). Open:

1. **Graph polish thread** — GP5 header focus + `+` button, GP7 split
   Dependency/Timeline views, GP1 mobile pop-out (🔎 research first).
   *Done: GP4 lane tint, GP3 project filter.*
2. **Colour-model workshop** ⚖ — status/area/label colours compete on cards;
   rig shots + 2–3 variants, Taylor picks
3. **Gated on Taylor** — branch review/merge of `feat/ui-polish-autopilot`,
   N3 API review (then implement), C2-F2 whitespace call, N7 Bases (live
   vault), P2-8 overdue-red softening, dark/light × desktop/phone visual
   regression pass

All prior sweeps are closed (AUDIT Sweep 2, DESIGN_AUDIT P0–P2, BUGFIX #1–13,
NATIVE N1–N6, UI_POLISH P1–P7 + C1 + C2, Autopilot batches A–I, graph GP2/GP6).
Closed sweeps + their full histories live in `Scripts/archive/`:
`AUDIT_TASKS.md`, `BUGFIX_TASKS.md`, `DESIGN_AUDIT.md`, `AUTOPILOT.md`,
`UI_POLISH_TASKS.md`, `NATIVE_FEATURES_TASKS.md`, `GRAPH_POLISH.md`,
`GRAPH_LAYOUT_C2.md`, `CODEBASE_MODAL_DETAIL_EXPLORATION.md`,
`run-autopilot.fish`. Older PRDs (TASK_H*/I*/J*/K*) are vault-side synced
notes.

## Recent Updates (2026-07-18)

- **GP3 project filter landed** — a **Projects** pill in the dependency-graph
  toolbar opens a checkbox popover (all projects, name-sorted, shown only when
  ≥2 exist). Unchecking a project hides its lane + owned nodes/edges; the pill
  reads `N hidden` with a **Show all** reset. Hidden projects are removed
  *before* connectivity is computed (`visibleScopeTasks` feeds
  `resolveConnectedDependencyPaths`), so a satellite that only linked to a
  hidden project drops with it. New `graphHiddenProjects: string[]` setting
  persists the choice across re-render/reload; menu is right-anchored to stay
  on-screen on mobile. Rig fixture gained a second project (**API Platform**)
  so the graph exercises multi-lane + GP3/GP4. Build green; **1261 tests**.

## Recent Updates (2026-07-12)

- **Backlog re-consolidated into `BACKLOG.md`** — one live file for all open
  items; the worked-out queue (`AUTOPILOT.md`), task files (`UI_POLISH_TASKS.md`,
  `NATIVE_FEATURES_TASKS.md`, `GRAPH_POLISH.md`), the C2 workshop
  (`GRAPH_LAYOUT_C2.md`), and the May modal exploration doc moved to
  `Scripts/archive/`.
- **Autopilot A–I complete (2026-07-09)** — Batch G: graph pinch-zoom + touch
  targets, zoom-edge detach fixed (root cause `.tt-graph-stage min-width`);
  Batch H: `API_DESIGN.md` + Taylor's decisions on the 5 open questions;
  Batch I: C2 layout workshop, then Taylor greenlit **V1 Compact + F1/F4/F5**
  (satellite unassigned lanes) which landed.
- **Graph polish thread (2026-07-10)** — GP2 toolbar declutter + floating zoom
  and GP6 chain-highlight click-off fix landed (hover-trace retired,
  click-to-pin only); GP1/GP3/GP4/GP5/GP7 open in `BACKLOG.md`.
- Validation status: production build passing; **test suite: 1259 passing**
  (as of the C2 follow-ups).

## Recent Updates (2026-07-06)

- **Backlog consolidated** — six overlapping status files reconciled into one
  checkpoint in `ROADMAP.md` (Consolidated Status 2026-07-06). All prior sweeps
  closed; live backlog is the `AUTOPILOT.md` batch queue (A–E done, F–I open).
- **Native three-pane workspace** — rail / board / detail now render as
  workspace leaves with native header `addAction` buttons (N1), `getState`/
  `setState` layout persistence (N2), a jump-to-task fuzzy switcher + protocol
  `action=jump`/prefill + `PROTOCOL.md` (N4/N5), and a richer status bar (N6).
- **UI polish (Autopilot A–E)** — detail-pane centering + top/bottom actions
  (P5/P6), kanban collapsed one-line header + inset selected-row highlight
  (P1/P3), conservative list-row visual pass (P2).
- **BUGFIX report (2026-07-04)** — #1–#8, #10, #12, #13 shipped; #9 (graph zoom
  edges) and #11 (graph layout) carried into Batches G and I.
- Validation status: production build passing; **test suite: 1241 passing (109 files)**.

## Recent Updates (2026-05-25)

- **Stream K scoped** — added architecture hardening tasks `TASK_K1`-`TASK_K6` for scan error policy, deterministic bounded-concurrency scanning, exact completion-sync link matching, status transition timestamp correctness, TaskBoard subscription lifecycle cleanup, and fileScanner DRY cleanup.

- **Stream J COMPLETE** — J1-J6 hardening and refactors are now landed; focus moves to post-J hardening.
- **J4 performance slice landed** — bounded concurrency helper + relationship write batching and TaskStore O(1) `getByPath` index.
- **J5 DRY cleanup landed** — relationship link-array mutations centralized with pure helper + tests.
- **J6 type safety landed** — removed `as any`/`as unknown as` hotspots in `main.ts` with typed extension interfaces.
- **Query profiling guard added** — `useTaskQuery` now wraps `applyQuery` with `console.time('applyQuery')` / `console.timeEnd('applyQuery')` in development mode.
- Validation status: production build passing; **test suite: 1114 passing (98 files)**.

- **Stream H COMPLETE** — H1 component coverage and H2 BoardStateService extraction are now both landed.
- **Scoped component test runner fixed** — `npm run test:components` now uses a dedicated Vitest config instead of a Windows-fragile CLI glob.
- **TaskDetail render coverage added** — component tests now exercise empty state, conditional task/project sections, blocked state, completed actions, and active-task switching.
- **I1 parsing layer landed** — `checkboxParser`, `emojiFieldParser`, and `filenameDateParser` are in `src/integration/` with pure tests and boundary coverage.
- **I2 capture source configuration landed** — settings schema now includes `captureSources`, default capture behavior, lazy auto-detection/merge of daily-periodic folders, rollover detection helper, and a dedicated settings section for source editing.
- **I3 scan foundation landed** — added `ExternalTask` model, pure `fileScanner` (`scanFileForCapturableTasks` + `isInCaptureScope`) with tests, `ScanEngine` orchestration scaffolding, and board/row wiring to surface captured tasks.
- **I4 promote + completion sync landed** — added pure `promoteTask` and `completionSync` helpers with tests, wired captured-row Promote action in list view, and hooked `TaskWriter.update()` so status completion/uncompletion syncs the source checkbox marker.
- **I5 bulk import landed** — added `collectAllCapturableTasks` scanner, shared `promoteTaskToTTasks` workflow, Import Confirm modal, and Settings -> Advanced -> Migration one-shot import with re-entry guard + progress notice.
- Validation status: production build passing; **test suite: 1060 passing (92 files)**.

## Recent Updates (2026-05-22)

- **Streams D-G COMPLETE** — D1/D2, E1/E2, F1, and G1 are now implemented and test-covered.
- **E2 final wiring complete** — list keyboard focus navigation now supports `j`/`k` and arrow navigation with clamped movement and focused task state.
- **Board keyboard internals improved** — focused task state is separate from active detail state to keep navigation behavior predictable.
- **Tooling QoL** — dedicated test scripts added: `npm run test:board`, `npm run test:reminders`, and `npm run test:components` to avoid approval-heavy `npm run test -- ...` workflows.
- Validation status: production build passing; **test suite: 961 passing (82 files)**.

## Recent Updates (2026-05-14)

- **Phase 7 COMPLETE** — Archive infrastructure (ArchiveService, auto-archive, archive view, logbook, migration command).
- Store decomposition: TaskStore 900→596 lines; TaskMigrations, TaskRelationships, TaskWriter extracted.
- Settings split: settings.ts 1869→35-line re-export shim; types/defaults/SettingsTab in `src/settings/`.
- Quick-action pure logic extracted to `integration/quickActions.ts`; view adapter flatten bridge removed.
- TaskDetail.svelte 1381→721 lines; TaskDetailRelationships, TaskDetailNotes, TaskDetailActions extracted.
- Bug fixes: est-days NaN clear, dependency sort (same-project first), "Blocked by"/"Unblocks" verbiage, create-dependent-task context menu.
- Archive: ArchiveService with `archive_history` logbook, archive view in board rail, migration command.
- Validation status: production build passing; **test suite: 553 passing (40 files)**.

## Product Direction Notes

- TickTick parity where expected: reminders, recurrence, quick capture
- TTasks differentiation where it matters: dependency intelligence, blocker visibility, realistic daily planning
- Prefer narrow vertical slices with clear acceptance criteria over large speculative features
- Status behavior still relies on configured status names, but the runtime now exposes derived `is_complete` / `is_inbox` fields and tracks `status_changed` for stale-progress reminders.

## Dev Workflow (git)

Still in solo dev — no review gate. When a slice is complete **and verified**
(build passing, tests green, visually checked where UI-facing):

1. Commit it on whatever branch you're on (feature branch or `main`).
2. **Merge it into local `main`** — fast-forward when possible, otherwise a
   normal merge. `main` is the running integration point; keep it current.
3. Leave feature branches in place unless asked to prune; they're cheap.

Do **not** push to `origin` or otherwise touch the remote unless explicitly
asked — `origin/main` is a separate/divergent history from local `main`.
Still confirm before genuinely destructive git ops (hard reset, force-delete,
history rewrite).

## Key Conventions

- All vault reads/writes go through `this.app.vault` and `this.app.fileManager`
- Frontmatter mutations always use `app.fileManager.processFrontMatter()` — never write raw YAML to existing files
- Frontmatter built as a raw string **only** at file creation time
- `blocks` is always derived/synced — never set manually by the user
- Settings accessed via `this.plugin.settings.tasksFolder`

## Architecture Rules

**Plugin coupling** — new components must not import `TTasksPlugin` or `TaskStore` directly. Pass specific callbacks or service references as props. Components that follow this are testable with `@testing-library/svelte`.

**No Obsidian imports in pure modules** — `src/query/`, `src/utils/`, `src/store/` helpers, and all `src/integration/` pure modules must stay free of Obsidian dependencies. This is enforced by `src/integration/architectureBoundaries.test.ts`. When you create a new pure module, add it to that file's boundary list in the same commit.

**Performance** — wrap the `applyQuery()` call in `src/query/useTaskQuery.ts` with `console.time('applyQuery')` / `console.timeEnd('applyQuery')` in dev mode. Keeps regressions visible before they accumulate.

**Mobile testing** — before closing any feature that touches the UI, test the golden path on iOS or a narrow-viewport browser. Note mobile-specific gotchas in the PRD's Gotchas section.

## CSS Notes

- Plugin ships `styles.css` — loaded automatically when plugin is enabled
- Selector pattern: `.markdown-source-view.ttask .metadata-container { display: none !important; }`
- `!important` required — Obsidian's built-in styles have higher specificity
- Mobile modal and token usage conventions are documented in `Scripts/STYLING_NOTES.md` (synced notes)

### Design system (2026-07 overhaul — see Scripts/archive/DESIGN_AUDIT.md)

- **Tokens are defined once** at the top of `styles.css` on the plugin roots
  (`.tt-board`, `.tt-create-modal`, `.tt-query-editor-modal`, …) and inherit.
  Never redefine `--tt-space-*` / `--tt-control-*` inside a component's
  `<style>` block.
- **Shared primitives live in `styles.css`** as plugin-global classes:
  `.tt-label`, `.tt-divider`, `.tt-field-group`, `.tt-badge` (+variants),
  `.tt-count`, `.tt-group-heading`, `.tt-empty`, and the button system
  `.tt-btn` / `.tt-btn-primary` / `.tt-btn-danger` / `.tt-btn-sm`. Svelte
  scoped styles carry layout only — don't copy these rules into components.
- **Inputs**: background `--background-modifier-form-field`; focus
  `--background-modifier-border-focus`; radius `--tt-control-radius`.
- **Never hardcode white/hex text on user-configured colors** — tint the
  surface (`color-mix(in srgb, <color> 18%, var(--background-primary))`),
  border at ~60% mix, and use the color itself as text.
- **Never use `var(--interactive-accent-rgb)` bare in a shadow** — it's an
  `r, g, b` triplet; wrap it: `rgba(var(--interactive-accent-rgb), 0.2)`.
- **Icons**: Lucide via `setIcon` (TS) or the `icon` action from
  `src/utils/icon.ts` (Svelte) — no unicode glyph buttons.
- **No JS-injected `<style>` elements** — all CSS belongs in `styles.css`.
- **Visual test rig** (`test-rig/`, see its README): `npm run rig` serves the
  real components with the actual Obsidian app.css + vault theme at
  localhost:5199; `npm run rig:shots` writes a desktop/mobile × dark/light
  screenshot matrix to `test-rig/shots/`. Use it to verify style changes
  without launching Obsidian. `npm run rig:sync-css` refreshes the vendored
  CSS after an Obsidian or theme update.
- **Theme specificity trap** (found via the rig): themes style bare
  `input[type=text]` / `button` (app.css gives buttons a fixed height). Any
  plugin control that deviates — borderless title inputs, multi-line row
  buttons — needs a compound selector (`.tt-modal input.tt-modal-name`) or an
  explicit `height: auto` to survive.
