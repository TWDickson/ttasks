# TTasks — Obsidian Plugin

A custom Obsidian plugin for task management with kanban, dependency tracking, and mobile-friendly UI. Designed to replace a patchwork of community plugins (QuickAdd, Meta Bind, Dataview) with a single, cohesive experience.

## Status Sources

Use these files as the canonical status references:

- `BACKLOG.md` — the single live backlog (all open items with specs)
- `CLAUDE.md` — current state, priorities, conventions, and latest milestone snapshot
- `ROADMAP.md` — dated progress log and backlog checkpoint by phase/slice
- `AUDIT_2026-07.md` — full codebase / date-handling / publication-readiness
  audit (2026-07-12). Its open items are indexed in `BACKLOG.md`'s
  `Audit 2026-07` section; the audit itself holds the rationale, code
  references, and the §7 dependency-ordered sequencing plan. **Read it before
  starting any `AR`/`DT`/`MD`/`RP`/`TD`/`PB` item.**
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

**The single live backlog is `BACKLOG.md`** — now **all-horizons** (all-horizons
reconcile 2026-07-19; originally consolidated 2026-07-12; audit fold-in
2026-07-25). It holds every open item: near-term threads (`Now` / `Next` /
`Gated`), longer-range roadmap features (`Later`, migrated from ROADMAP Phase
5–8 + Deferred), *and* the codebase / publication-readiness items from
`AUDIT_2026-07.md` (`Audit 2026-07`). `ROADMAP.md` is now a **dated journal +
historical phase notes only** — not a live registry; don't treat an unchecked
box in its phase sections as open work. Open:

0. ~~**JSON import/export**~~ — **done 2026-07-19.** Full round-trip for the
   work-AI workflow: a **Share / Sync** rail entry + command opens a modal with an
   **Export** tab (mode AI/full + filter by area/project/status/label + include-
   completed, live count, copy/save) and an **Import** tab (paste → preview
   **bulk-edit summary** → apply: matched tasks updated field-by-field, new tasks
   created). Pure modules `taskExportFilter.ts` + `taskImportPlan.ts` (+ existing
   export serializer / import parser). Limits: import doesn't touch relationships
   or note bodies, and only sets/changes fields (never clears from an omitted
   value). Live-Obsidian sign-off owed for the Apply write path (rig can't write
   the vault). Commits `dd28d52` (C1 export) + `c025309` (C2 import).
1. **Pomodoro (native)** — *in progress; expanded 2026-07-19.* Phase 8 feature,
   built native (dependency-free, mobile). Now: untethered sessions (no task);
   **CSV session log** (`ttasks-pomodoro-log.csv`, append-only) alongside the
   per-task count/minutes rollup; **"focus until X:XX"** (pure planner fills whole
   cycles + a shortened final focus so nothing runs past the target) via a modal +
   command + detail-pane button; a **dedicated Pomodoro pane** (own right-sidebar
   leaf, big dial); a desktop **status-bar countdown** (timer icon + live MM:SS,
   click-to-toggle, hidden when idle); **log-partial-on-stop** (stopping mid-focus
   logs the elapsed minutes as a partial — adds `focused_minutes` + a CSV row, no
   count bump — gated by a default-on setting). Core Pomodoro slices are complete.
   Live-Obsidian sign-off owed for the CSV write + the two Obsidian modals + the
   pane leaf + the status-bar item (rig can't host Obsidian modals/leaves/bar).
2. **Graph polish thread** — GP5 header-focus interaction re-tune (`+` add
   subshape shipped; click-to-focus/grow backed out). *Done: GP4 lane tint,
   GP3 project filter, GP8 lane focus, GP7 split Dependency/Timeline views,
   GP1 fullscreen expand modal.*
3. ~~**Colour-model workshop**~~ — **done 2026-07-19**: Taylor picked the
   **V2 colour-spine** model (area colour → card/row left edge, monochrome
   badges, softened date tints). Live-Obsidian sign-off folds into the visual
   regression pass.
4. **Mobile fixes (device-unverified)** — tap-to-open double-tap, detail-drawer
   surfacing, and detail-pane-fit fixes landed rig-side 2026-07-19 but **could
   not be confirmed on-device**: Taylor's phone stopped loading fresh plugin
   builds (a deploy/sync-reload blocker, now its own backlog item).
5. **Gated on Taylor** — N3 API review (then implement), C2-F2 whitespace call,
   N7 Bases (live vault), dark/light × desktop/phone visual regression pass.
   *Done: P2-8 overdue softening; branch merge of `feat/ui-polish-autopilot`.*
6. **Audit 2026-07 thread** — *newly tracked 2026-07-25.* The codebase /
   publication-readiness items from `AUDIT_2026-07.md`, which had been sitting
   outside the backlog entirely. Nothing here blocks feature work, but the 🔴
   set blocks any **public release**: no CI (TD-1), no README/LICENSE/release
   scaffolding (PB-1), review-bot flags (PB-2), the `ttask_*` schema prefix +
   sparse writes (MD-1/MD-2), midnight-stale query results (DT-1), and
   semantically-dead `due_time` (DT-2 ⚖). *Done: RP-1/DT-3 recurrence drift;
   DT-4 doc half.* Two ⚖ calls waiting on Taylor: DT-2 (`due_time` real vs.
   display-only) and DT-5 (rolling-7-day vs. calendar "this week").

All prior sweeps are closed (AUDIT Sweep 2, DESIGN_AUDIT P0–P2, BUGFIX #1–13,
NATIVE N1–N6, UI_POLISH P1–P7 + C1 + C2, Autopilot batches A–I, graph GP2/GP6).
Closed sweeps + their full histories live in `Scripts/archive/`:
`AUDIT_TASKS.md`, `BUGFIX_TASKS.md`, `DESIGN_AUDIT.md`, `AUTOPILOT.md`,
`UI_POLISH_TASKS.md`, `NATIVE_FEATURES_TASKS.md`, `GRAPH_POLISH.md`,
`GRAPH_LAYOUT_C2.md`, `CODEBASE_MODAL_DETAIL_EXPLORATION.md`,
`run-autopilot.fish`. Older PRDs (TASK_H*/I*/J*/K*) are vault-side synced
notes.

## Recent Updates (2026-07-31)

- **Dev environment made portable (prep for a server checkout + the BRAT
  handover).** Goal: run this repo on a box with no Obsidian, no vault, and no
  symlink. `src/`, esbuild, vitest and eslint were already clean — the whole
  problem was the visual rig, which hard-failed on any machine but Taylor's.
  - **`test-rig/vendor/` is gitignored but `main.ts` imports it statically**, so
    a fresh clone died at vite resolve time before rendering anything. New
    `vendorCss.mjs` writes a marked empty stub for whichever file is missing and
    the dev server prints a warning — the rig boots, structure and behaviour are
    real, only Obsidian's look is absent (explicitly *not* sign-off-worthy).
  - **CSS now has a git source, not just a local-install one** (Taylor: "vault
    will not be on the server, source these elsewhere like the git repos"):
    `app.css` falls back to `obsidianmd/obsidian-releases`' `obsidian-<v>.asar.gz`
    (latest tag via the API, pinned fallback, gunzip → `@electron/asar
    extract-file`, cached per version in `.cache/`), and the theme falls back to
    `seniblue/Underwater` — the repo the community theme list points at. Both
    paths verified end-to-end: remote sync produced a 635 KB app.css + 122 KB
    theme with no Obsidian visible, then the local path restored Taylor's own
    byte-identical 600 KB/123 KB pair.
  - **New `test-rig/localPaths.mjs`** is the one place that knows machine-local
    paths — vault, asar, theme, browser — each with an env override
    (`TTASKS_VAULT`, `TTASKS_OBSIDIAN_ASAR`, `TTASKS_THEME_CSS`,
    `TTASKS_OBSIDIAN_VERSION`, `TTASKS_THEME_URL`, `CHROME_PATH`). An override
    wins even when the path is missing so typos fail loudly, and **set-but-empty
    means "absent"**, which is how this machine reproduces the server's
    vault-less behaviour. `/__vault.json` now serves `{files: []}` instead of a
    500, and the client's existing fixture fallback takes over.
  - **Browser resolution unified** — `shots.mjs` and the `run-ttasks` skill
    driver had duplicate hardcoded lists (with a "keep in sync" comment) pinned
    to `win64-1656505`; now both import one resolver that scans `.browser/` for
    any build and probes Windows/macOS/**Linux** system paths. Linux launches add
    `--no-sandbox` + `--disable-dev-shm-usage` for containers.
  - **`vite` was undeclared** — `npm run rig` resolved it transitively through
    vitest; now a real devDependency. Added `engines.node >= 20.19` and a
    `rig:browser` script.
  - Setup on a new box is `npm ci && npm run rig:sync-css && npm run rig`.
    `npm run check` green: **1645 tests**, 128 files.
- **`origin/main` is no longer divergent** — it's identical to local `main` (0/0
  as of this date). CLAUDE.md had warned otherwise for months, and that warning
  was the stated blocker on **TD-1 (no CI)**, which is now unblocked. Next up:
  CI running `check`, plus the release scaffolding BRAT needs (`main.js` is
  gitignored, so beta installs require built release assets + `versions.json`).

## Recent Updates (2026-07-25)

- **Recurrence drift fixed (audit RP-1 / DT-3 🔴) + the audit folded into the
  backlog.** A month-end recurring task permanently collapsed onto February's
  day: Jan 31 → Feb 28 → **Mar 28 → Apr 28 …** forever, because each occurrence
  was computed from the previous *already-clamped* date instead of from the
  schedule's anchor day. Verified in `AUDIT_2026-07.md` by execution back on
  2026-07-12; the drift was even **codified as an expected-behaviour test**
  (`advancing repeatedly from Jan 31 drifts to the clamped day`), which is why it
  survived. Fixed by making the anchor explicit and persisted:
  - `advanceDate(date, rule, anchorDay?)` clamps **per-occurrence** instead of
    cumulatively. Omitting the anchor reproduces the old behaviour exactly, so
    every pre-existing test still passes unchanged — including two that encode
    deliberate intent (`Feb 29 monthly → Mar 29`, `Feb 28 yearly stays Feb 28`).
    Those two are also why a **month-end heuristic was rejected**: without a real
    anchor you can't tell "monthly on the 31st, clamped" from "monthly on the
    30th", and guessing month-end mis-fires on a genuine 29th/30th schedule
    (Apr 30 → May 31). Taylor picked the persisted-anchor option.
  - New pure `deriveAnchorDay(dueDate)`, and a new **`recurrence_anchor_day`**
    frontmatter field. Derived whenever `due_date` is written *without* an
    explicit anchor — so a manual reschedule redefines the schedule — and passed
    **explicitly** by `completeAndRecur` and `buildDuplicateInput` so a clamped
    occurrence never re-derives a wrong anchor (that re-derivation *is* the bug).
    Read back through the same native-property-type hardening as feedback #19;
    written only for recurring tasks, so non-recurring notes don't grow a null
    key; kept out of `TASK_FIELD_DEFINITIONS` because it's derived, not
    user-editable. Now: Jan 31 → Feb 28 → **Mar 31** → Apr 30 → May 31, stable
    over a 12-month chain. Tasks predating the field fall back to their due
    date's own day.
  - Also closed the doc half of **DT-4**: the comment claimed
    "T12:00:00 **local**" while the code uses `T12:00:00Z` + UTC accessors
    (behaviour was right, the comment wasn't), and the duplicated
    monthly/yearly days-in-month clamp is now one `daysInMonth` helper.
  - `recurrence.ts`, `completeTask.ts`, `TaskWriter.ts`, `TaskStore.ts`,
    `taskDuplicate.ts`, `types.ts`. **+50 tests, 1616 total**, build green.
    Residuals recorded in BACKLOG: `nextStartDate` is still un-anchored, and the
    anchor isn't in the JSON export surface.
- **`AUDIT_2026-07.md` was an untracked second registry** — it holds 🔴
  pre-publication items (no CI, no README/LICENSE/release scaffolding,
  midnight-stale agenda buckets, semantically-dead `due_time`, the `ttask_*`
  schema prefix, the repeat redesign) that `BACKLOG.md` — the self-described
  "single live backlog for all open work, every horizon" — didn't list at all.
  The repeat redesign that RP-1 was nominally waiting on wasn't scheduled
  anywhere. All open `AR`/`DT`/`MD`/`RP`/`TD`/`PB` items are now indexed in a new
  **`Audit 2026-07`** section of `BACKLOG.md` (with the audit's own priority
  markers), and the audit is listed in this file's **Status Sources**.
- **Lint cleared + a real local gate (audit TD-2).** Lint had been failing with
  **50 `no-mixed-spaces-and-tabs` errors** in `TaskGraph.svelte` /
  `TaskKanban.svelte` / `TaskRow.svelte` — up from 10 in one file at audit time,
  because it ran in neither CI nor the local gate. Every one was the same thing: a
  comment **continuation** line indented with tabs *then* spaces to align the prose
  under the opening delimiter. Cleared them the way `d16350b` already had
  elsewhere — a continuation takes the opening line's tab depth and no spaces —
  which is **comments only**: the diff is exactly 50 insertions / 50 deletions
  with no code, selector, or markup change, and line endings preserved. Added
  **`npm run check`** (`lint && build && test`) so the three gates run as one and
  this can't drift again. Lint clean, check green end-to-end (**1616 tests** + 65
  component tests). Remaining from that audit item's neighbourhood: **TD-1 (no
  CI)** — still open, and the natural home for `check`. It was blocked on the
  `origin`-is-divergent story; that's now resolved (see 2026-07-31), so TD-1 is
  unblocked.

## Recent Updates (2026-07-22, later)

- **Share/Sync: TOON payload, notes policy, graph framing, per-item import
  review.** Started as "can we add TOON?" and became an evaluation first — TOON,
  YAML, NDJSON, CSV/TSV, markdown table and minified JSON all measured against
  Taylor's real 100-task export with a real tokenizer (`o200k_base`; `cl100k`
  tracked within 0.5%). Two findings drove the design. **(1) Note bodies were 62%
  of the export** (24,372 of 39,278 tokens) — a bigger lever than every format
  choice combined. **(2) TOON as-is saves 7%, not the advertised ~40%**, because
  its tabular form needs uniform keys and scalar cells; the 'ai' export prunes
  empty fields and carries `labels`/`depends_on` arrays. Filling the keys but
  keeping arrays measured **-0.5%**. What shipped:
  - **`notesPolicy` (Full / First 200 chars / Omit)** — new segmented control,
    `applyNotesPolicy` in `taskJsonExport`. Non-full policies rewrite `meta.notes`
    and add `meta.notesTruncated`, plus a preamble rule: a truncated body must
    never come back as a replacement or it overwrites the real one with a
    fragment. **Safety, not sizing** — the default `notes` contract invites
    exactly that.
  - **TOON as an export-only payload format** — new pure `taskToonExport.ts`
    (uniform columns, `labels`/`depends_on` joined with ` | `, bodies hoisted to
    a ref-keyed sidecar) over `@toon-format/toon` v4 (zero deps; encoder
    tree-shakes to **6.5 KB**). `meta.format` tells the AI how to read the table
    and to **reply in JSON**. Deliberately export-only: a sparse reply can't be
    tabular (TOON 129 vs minified JSON 103 tokens on a 5-entry reply) and its
    decoder hard-throws on a miscounted `[N]`, a 4-space indent, or an unquoted
    comma — all four tested. CSV/TSV were marginally smaller and rejected: no
    self-description, bespoke parser, can't carry `meta`.
  - **Graph framing** — new `GRAPH_RULE` in every preset + `meta.graph`: the
    export is a dependency graph, not a flat list (nothing is workable until its
    dependencies are done, changes ripple downstream, keep it acyclic).
  - **Per-item import review** — pure `importPlanEntries` / `filterImportPlan` /
    `isEmptyImportPlan` flatten every plan bucket into keyed, rejectable rows.
    The modal lists them grouped by kind: chevron expands in place (field
    before → after; **note bodies rendered as markdown** via `MarkdownRenderer`
    into a `Component` the modal owns, lazily on first open), `×` drops that one
    change and re-strikes the row. Totals *and* category-toggle counts recompute
    from the filtered plan, so what's shown is what will run.
  - **Copy/Save/Apply no longer close the modal**; Apply re-plans against the
    just-written vault. Fixed the hover scrollbar: `.modal-content` had
    `overflow-y: auto` with `overflow-x: visible`, which the browser promotes to
    `auto` — the button hover shadow then spilled a pixel and flashed a
    horizontal bar. Row icon buttons carry `clickable-icon` because app.css
    styles `button:not(.clickable-icon)`, which outranks a single class (the
    theme-specificity trap again).
  - **Measured end-to-end through the shipped code**, full 108-task vault:
    JSON+full **50,821** tokens → TOON+full 43,243 (**-15%**) → JSON+omit 14,775
    (**-71%**) → TOON+omit 6,579 (**-87%**).
  - Touched `taskJsonExport.ts`, `taskToonExport.ts` (new), `sharePreamble.ts`,
    `taskImportPlan.ts`, `ShareSyncModal.ts`, `main.ts`, settings
    `types`/`defaults`, `styles.css`, rig `main.ts` (new `?share=import` scene) +
    `obsidian-shim.ts`. Build green, **1566 tests** (up from 1533); rig-verified
    dark + light. Live-Obsidian sign-off still owed for the real
    `MarkdownRenderer` output and the Apply write path.

## Recent Updates (2026-07-22)

- **Share/Sync export pane reworked (Taylor's 2026-07-22 asks).** Three things
  landed together. (1) **Message presets + packaging** — new pure
  `src/integration/sharePreamble.ts`: five presets (*Review & advise*, *Break
  down into subtasks*, *Plan my week*, *Status catch-up*, *No preamble*) in a
  dropdown over an **editable textarea**, plus a **Copy as** control with three
  formats — **One block** (message + JSON in a ```json fence, one paste), **Two
  fields** (message and JSON as separate copy buttons), and **JSON only**.
  `composeShareOutput` returns the blocks and the modal renders one Copy button
  each, auto-closing only on a single-block copy. Every non-empty preset appends
  the round-trip rule and a **no-new-values rule**, and spells this vault's
  statuses out inline. (2) **Last-used memory** — new `shareSync` settings block
  (mode / format / preset / custom preamble / all four filter facets /
  include-completed) saved on every change; `customPreamble` persists only when
  it differs from the preset's generated text, so an unedited message still picks
  up status changes. (3) **notes + projects on import** — `notes` now imports on
  *updates* too (it already worked on creates while the meta claimed otherwise),
  as its own `ImportPlan.notesChanges` bucket written via `TaskStore.updateNotes`
  with its own destructive-flagged toggle; and a new `meta.projects` finally
  tells the receiving AI that `type: "project"` exists and how to use it
  (behaviour was already there, only undocumented). **Bug fixed on the way:**
  `.tt-share-modal` had no scroll containment — app.css caps `.modal` at ~85vh
  but leaves `.modal-content` `overflow: visible`, so action buttons rendered
  outside the modal box (709px of content in a 680px modal; pre-existing, the
  Import tab already hit it). Fixed with a flex column + `overflow-y: auto;
  min-height: 0`. Build green, **1533 tests**; rig-verified dark + light.

- **Detail sidebar clipping fixed (2026-07-21 feedback).** Reproduced in the rig:
  narrowing the detail leaf to 300px on a 1280px viewport left its content 413px
  wide, and `.tt-detail-view`'s `overflow-x: hidden` silently cut off the rest.
  Three separate "floors at min-content" causes: (1) the field grid's
  two-column → one-column collapse was gated on `@media (max-width: 768px)`,
  which reads the **viewport**, not the resizable pane — so labels rendered one
  character per line on desktop; re-keyed to a **container query** on a new
  `container-type: inline-size` on `.tt-detail`, threshold **360px** measured so
  the default 440px sidebar keeps two columns (old media query kept as a
  pre-container-query fallback). (2) The P5 centering rule
  (`.tt-detail > .tt-field-group { align-items: center }`) left the relationship
  tree at max-content, so one long task name sized the section to 527px — fixed
  with `align-self: stretch` (the override `.tt-parent-task-row` already uses) +
  `min-width: 0` down the tree; the tree chips are `<button>`s inheriting
  app.css's `nowrap` (the **theme-specificity trap**) and now wrap instead of
  forcing the pane wide. (3) `minmax(0, 1fr)` tracks + `min-width: 0` on grid and
  flex items. Rig-swept by leaf width: **zero clipped elements from 220px up**
  (was 31 at 300px), dark + light + mobile clean. `TaskDetail.svelte` +
  `TaskDetailRelationships.svelte`. Build green, **1511 tests**.

- **Frontmatter type-handling audit (feedback #19).** Hardened the whole
  frontmatter → Task boundary (`TaskStore.fileToTask`) against Obsidian's
  **native property types** — retyping a property to Text / List / Number /
  Checkbox in the Properties UI rewrites that field vault-wide, and every
  mismatch was **silent data loss**. Fixed: a Text-typed list (`labels: feature`,
  a bare `depends_on` link, `holiday_dates`) was dropped by an `Array.isArray`
  guard; a List-typed scalar (`area: [Work]` → Inbox, `status: [In Progress]` →
  reset to default, `name: [Ship it]` → empty) failed a `typeof === 'string'`
  check; `type` and `priority` were unchecked `as`-casts (so `type: [project]`
  made a project read as a task everywhere); `pomodoro_count` /
  `focused_minutes` were `typeof === 'number'`-only and `workweek_only` was
  `=== true`-only. Extended the pure `utils/frontmatterValue.ts` with
  `toFrontmatterScalar` / `toFrontmatterStringArray` / `toFrontmatterBoolean` /
  `toFrontmatterStringOrNull` / `toFrontmatterOptionalEnum` + `toFrontmatterEnum`
  (closed-set, exact-then-case-insensitive — a hand-edited `priority: high` now
  resolves instead of falling back), backed by new `TASK_RECORD_TYPES` /
  `REMINDER_OVERRIDES` constants; `resolveWikiLinkPaths` accepts a bare scalar.
  Write side deliberately unchanged. +39 tests (new
  `TaskStore.frontmatterTypes.test.ts` parses real frontmatter shapes through
  `fileToTask`). Build green, **1511 tests**.

- **Graph: add a blocker/parent from a node (feedback #11/#13).** Each task
  node now has a **left-side `+`** (mirror of the existing right-side
  "add dependent" `+`) that spawns a new **blocker/parent** the selected task
  will `depend_on`. Same visibility gate as the right `+` (hover on mouse,
  tap-pin on touch); the new task inherits the node's
  project/area/labels/priority. Implemented via a symmetric
  `initialBlocks?: string[]` option on `CreateTaskModal` — after the blocker is
  created it calls `taskStore.addDependency(target, newTask)` for each target,
  so `blocks` syncs through the canonical write path (no manual `blocks`
  mutation, honoring the "blocks is always derived" convention).
  `TaskGraph.svelte` (`createBlockerTask` + left `+` button) +
  `CreateTaskModal.ts` + 1 modal test. Build green; rig-verified both `+`s
  render symmetric on hover.

## Recent Updates (2026-07-21)

- **Pomodoro backgrounding-drift bug fixed.** See BACKLOG.md's 2026-07-21
  feedback batch for detail — `PomodoroService` now anchors each phase to a
  wall-clock instant instead of counting fixed 1s `setInterval` ticks, so a
  throttled-background countdown catches up to true elapsed time. Commit
  `0964f45`.
- **Agenda date-range filter shipped, then centralized same-day (Taylor:
  "try and centralize this sort of filtering logic and reuse it across
  views").** Two `<input type="date">` controls ("from"/"to") in the filter
  toolbar, on top of the existing date-bucket grouping. New inclusive
  `on_or_after`/`on_or_before` `FilterOperator`s in `query/engine.ts` (kept
  `before`/`after` strictly exclusive — already relied on elsewhere) — also
  wired into the Smart List query editor (`queryEditor.ts` `DATE_OPS` +
  `QueryEditorModal.ts` labels) so Smart Lists get the same inclusive range
  for free. The ad-hoc toolbar-filter logic (Priority/Area/date-range →
  `FilterCondition[]`, plus "any filter active") moved into a new pure,
  tested `src/components/boardFilters.ts` — mirrors the existing
  `boardQuery.ts` pattern (pure module, `TaskBoard.svelte` just calls in).
  Widened the date-range control from Agenda-only to **List + Kanban +
  Agenda** (`supportsDateRangeFilter()`); Graph and Archive/Logbook excluded
  (relationship-first / `completed`-not-`due_date`). Filter state stays
  ephemeral (not persisted to settings), matching `filterPriority`/
  `filterArea`. +4 engine tests + 14 `boardFilters.test.ts` tests;
  rig-verified dark/light on List, Kanban, and Agenda (filter narrows
  results on all three; Graph correctly has no date-range control). Build
  green, **1472 tests** (up from 1454).

## Recent Updates (2026-07-20)

- **Taylor's 2026-07-20 feedback batch — 10 of 22 items triaged and shipped.**
  Worked through the fresh, unscoped batch in `BACKLOG.md`; picked off the
  clearly headless-workable bugs/features, left taste-call (⚖) and
  research-needed (🔎) items open, and flagged one (#14, dependency-picker
  sort) as already implemented pending Taylor's repro.
  - **List views:** Group-by/Sort-by toolbar controls for any list-rendered
    view (new `listGroupOverrideByViewId`/`listSortOverrideByViewId`
    settings + `boardQuery.ts` plumbing) — covers #1 (group by Project), #2
    (more sort fields), and #5 (Today group-by-Status) in one general
    mechanism rather than three special cases. Today's filter gained an OR
    branch for the configured start status (#4), and Agenda's date-bucket
    grouping gained a new `QuerySpec.activeStatusBucket` so an in-progress
    task reads as "today" regardless of due date unless already overdue (#7).
    New pure `src/query/taskReadiness.ts` + `QuerySpec.readyFirst` stable-
    partitions Today so ready-to-work tasks float above blocked ones (#22).
    Rail's Inbox entry gained a `.tt-count` badge, hidden at zero (#3).
  - **Dependency graph:** Independent lane now shown by default (#18); the
    "Ready now" highlight clears when you open the highlighted task (#17); a
    completed dependency's edge now renders in a muted green instead of plain
    gray (#10); the Projects filter popover gained a capture-phase
    document-level click-outside listener as a belt-and-suspenders fix for a
    stacking-context edge case that let it stay open (#9).
  - **Share/Sync (AI import/export):** the importer required a `name` on
    every entry even when a `ref` alone should have been enough to target a
    task — a real bug vs. the AI meta's own instructions — now accepts
    ref-only entries (#20). The AI-mode export's meta now embeds this vault's
    configured statuses/priorities/areas/labels so a replying AI picks from
    real values instead of inventing its own (#21). Also discovered
    `BACKLOG.md`'s "relationships not imported" limit note was stale —
    `depends_on`/`parent` import already shipped in C3 (`b7f0e78`); corrected
    the doc.
  - **Left open:** #6/#8 (Blocked vs Hold semantics + cascade — needs
    Taylor's taste call), #12 (drag connectors — needs interaction research),
    #16 (completed-sort-lower — taste call), #15 (Pomodoro discoverability).
    *Since closed: #11/#13 (add-parent-from-node) and #19 (frontmatter
    type-handling audit), both 2026-07-22.*
  - Touched: `TaskGraph.svelte`, `taskGraph.ts` (+edge/edge-test fixtures),
    `engine.ts`, `query/types.ts`, `query/taskReadiness.ts` (new),
    `viewRegistry.ts`, `boardQuery.ts`, `TaskBoard.svelte`, `TaskRail.svelte`,
    `TaskRailView.ts`, `taskJsonExport.ts`, `taskJsonImport.ts`,
    `taskImportPlan.ts`, `main.ts`, `ShareSyncModal.ts`, settings
    `types`/`defaults`, `test-rig/main.ts`. Build green, **1436 tests**
    (up from 1261). Rig-verified: toolbar controls, Inbox badge, Independent-
    shown-by-default, completed-edge colour (via computed style), and the
    Projects popover click-off fix (open → click elsewhere → closes).

## Recent Updates (2026-07-19)

- **Pomodoro log-partial-on-stop shipped (on `main`).** Closes the last optional
  Pomodoro slice. `PomodoroService.stop()` now logs the whole elapsed focus
  minutes as a **partial** session (new `partial` flag on `CompletedFocus`) before
  clearing, instead of discarding them. Partials add to the task's
  `focused_minutes` and write a CSV row (`note: "partial (stopped)"`) but do
  **not** bump `pomodoro_count` — a stopped session isn't a completed pomodoro.
  Fires only for a focus phase with ≥1 whole minute elapsed (breaks + sub-minute
  focus ignored); gated by a new `logPartialOnStop` setting (default on) with its
  own toggle in the Pomodoro settings group. Reuses the already-present, tested
  pure `elapsedMinutes`. Touched `PomodoroService.ts`, `main.logPomodoroFocus`,
  settings (`types`/`defaults`/`pomodoroSettingsSection`), +5 service tests.
  Build green; all core + optional Pomodoro slices now complete (only the
  live-Obsidian sign-off bundle remains).

- **Pomodoro status-bar countdown shipped (on `main`).** Closes the last core
  Pomodoro slice: a desktop-only status-bar item (`Platform.isMobile` guard, like
  N6) shows a `timer` icon + live `MM:SS` while a session runs, hidden when idle.
  Driven by subscribing to `pomodoroService.session` (already ticks 1/s — no
  second interval); break phases tint green, paused dims to 0.6 (matches the pane
  dial). Click toggles pause/resume; tooltip carries phase · remaining · task ·
  hint. Pure `pomodoroStatusBar.ts` (`pomodoroStatusBarView`, 8 tests, boundary-
  listed); `main.initializePomodoroStatusBar`/`updatePomodoroStatusBar`; CSS
  `.ttasks-pomo-statusbar` (+`.is-break`/`.is-paused`). Rig `?pomostatus=1` scene
  renders all five states — verified dark + light. Build green. Remaining Pomodoro
  work: optional log-partial-on-stop + the live-Obsidian sign-off bundle.

- **JSON import/export shipped — Share/Sync (2 slices, on `main`).** From Taylor's
  note (feed work-isolated AIs, paste back a bulk-edit summary): a **Share / Sync**
  rail entry + `share-sync` command opens `ShareSyncModal` (Export/Import tabs).
  **Export** — mode toggle (AI/full) + toggle-chip filters (area/project/status/
  label) + include-completed, live "N of M" count, copy-to-clipboard or save-file;
  pure `taskExportFilter.ts` (`filterTasksForExport`/`collectProjectFacets`/
  `linkTargetPath`, 10 tests); `main.exportTasksToJson` refactored to shared
  `exportTasksToJsonFrom(tasks, mode)`. **Import** — paste → preview → apply; pure
  `taskImportPlan.ts` (`planImport`/`changesToPatch`/`summarizeImportPlan`, 9
  tests) matches by (type, ci-name): new→create, matched-changed→update,
  identical→unchanged, dup-name→ambiguous/skip; only set/change (never clear),
  relationships + note body untouched; `main.applyImportPlan` +
  `buildCreateInputFromParsed`. Rig gained `?share=1`; export filters + import
  summary rig-verified. Commits `dd28d52` (C1), `c025309` (C2). Apply write-path
  needs live-Obsidian sign-off.

- **Pomodoro expansion (3 slices, on `main`).** From Taylor's notes: (A) Pomodoro
  runs **untethered** — `taskPath`/`taskName` now nullable through the pure timer
  + service; new "Start Pomodoro (no task)" command. Completed focus sessions
  append to a **CSV log** (new pure `pomodoroLog.ts`, RFC-4180; `appendPomodoroLog`
  in main; settings `logEnabled`/`logPath`), and the per-task count/minutes rollup
  is kept. (B-core) **"Focus until a time"** — new pure `pomodoroPlan.ts`
  (`planFocusUntil` + `parseUntilInput`) fills the gap before a target with whole
  Pomodoro cycles; a too-short remainder becomes a shortened final "fill" focus
  landing exactly on the target. Session gained `targetEndMs`/`isFill`; service
  `startUntil` + wall-clock gating (injectable `now()`). `FocusUntilModal` (live
  plan preview) + "Focus until a time…" command + detail-pane button. (B-pane) a
  **dedicated Pomodoro pane** — `PomodoroPane.svelte` (pure: service refs/callbacks
  as props, no plugin import; component-tested) in `PomodoroView.ts`
  (`ttasks-pomodoro`, right sidebar); "Open Pomodoro pane" command. Rig gained a
  `?pomo=idle|active` scene (both states verified). Build green; planner/service/
  log/settings + component tests all pass. Commits `b0110db` (A+B-core), `6f81ab0`
  (B-pane). **Next: JSON import/export (item 0) — Share/Sync sidebar entry +
  filtered export dialog + import→vault + paste-back bulk-edit summary.**

- **Autonomous session (feat/pomodoro branch, merged to main).** Landed, all
  build-green + tests (1298): (1) **Docs reconcile** — removed the backlog/roadmap
  coverage seam; BACKLOG is now the single all-horizons registry (new `Later`
  tier), ROADMAP demoted to a dated journal. (2) **Pomodoro (native)** — Slices
  1–2 (pure state machine + data model + settings + `PomodoroService` + commands,
  25 tests) and most of Slice 3 (detail-pane control, rig-verified; settings
  group); logs count+minutes to frontmatter. Only the status-bar countdown
  remains. (3) **JSON export** shipped (pure serializer full/ai + commands) +
  **import parser** done/tested (18 tests); import→vault creation held for
  runtime verification. (4) **Mobile fixes** (tap-to-open, drawer surfacing,
  detail-pane fit) — rig-verified, **device-unverified** (phone not loading fresh
  builds — a deploy-pipeline blocker, now a backlog item).

- **P2-8 overdue-red softening closed — badge-only.** The colour-spine work had
  already softened the overdue *badge* from a solid slab to a red tint; this
  closes the other half — overdue also painted the **whole task name**
  `var(--color-red)`, which shouted when several piled up in a column. Chose
  **badge-only**: dropped the full-name red on both `.tt-task` (list) and
  `.tt-kanban-card` (kanban), so the red-tint `Nd overdue` date badge is now the
  sole overdue signal. The alternative (a red left edge like kanban's active
  accent) was rejected — the area-colour spine now owns the card/row left edge
  and a red bar would fight it. Removed the now-dead `is-overdue` class +
  `overdue`/`isOverdue` computations from both components (`isTaskOverdue` kept as
  an exported, tested helper). `TaskRow.svelte` + `TaskKanban.svelte`. Build
  green, **1261 tests**, verified list + kanban × dark/light in the rig;
  live-Obsidian sign-off folds into the visual regression pass.

- **GP1 fully closed — live-mobile sign-off passed.** Taylor ran the on-device
  pass: the graph pops out to fullscreen great (pan/zoom/collapse all good). One
  follow-up remains, deferred: on mobile, tapping a node in the popped-out graph
  closes the modal but the **detail drawer opens behind/hidden** instead of
  surfacing. GP1 already closes the modal *before* opening the task, so this is a
  separate failure (likely the detail leaf landing in a collapsed/backgrounded
  mobile sidebar, or a close→open focus race). Tracked in `BACKLOG.md` as
  **GP1-follow: detail drawer opens behind/hidden on mobile**.

- **Colour-model workshop → V2 "colour spine" landed** — the "Next" backlog
  thread (status/area/label colours competing on cards) was worked up as a
  workshop: baseline + 3 rig-rendered variants (V1 single-channel, V2 spine, V3
  tuned-hierarchy) shipped as a self-contained Artifact
  (`Scripts/graph-c2/colour-workshop.html`, ~2.3MB embedded shots, left
  untracked). Taylor picked **V2**. Shipped model: **identity colour moves off
  the badges onto the card/row left edge**, keyed to the task's project `area`,
  so the badge row stays monochrome. `--tt-area-color` is set inline on
  `.tt-kanban-card` (real `border-left`) and `.tt-task` (inset `box-shadow`, so
  row content stays aligned with the group headings rather than shifting 3px).
  Area badge demoted to neutral text (`.tt-badge-cat.tt-badge-tinted`); label
  badges lose their colour dot (neutral pills); **the solid-red overdue slab and
  solid-green completed slab soften to tints** — that date slab was the single
  loudest offender, out-shouting the area it was supposed to sit under. Active
  state still wins: the card's accent `border-left` overrides the area spine, and
  the row suppresses its spine on `.is-active` so the existing accent inset
  overlay is the only left bar. Touched `styles.css`, `TaskKanban.svelte`,
  `TaskRow.svelte`. Build green, **1261 tests**, verified dark/light ×
  desktop/mobile + active row/card states in the rig; live-Obsidian sign-off
  folds into the visual regression pass.

## Recent Updates (2026-07-18)

- **GP1 landed (rig-verified; live-iOS sign-off pending) — fullscreen expand
  modal** — the dependency/timeline graph is near-useless in its cramped in-board
  leaf on phones. Research first: the native pop-out (`moveLeafToPopout`/
  `openPopoutLeaf`) is **desktop-only and throws on mobile**, so it can't serve
  the mobile goal; chosen mechanism is a **fullscreen `Modal`** (works on both
  platforms). New `GraphExpandModal` hosts a second `TaskGraph` instance
  edge-to-edge, reusing the board's live stores (`groups`, `activeTaskPath`);
  opening a task closes the modal first so the detail drawer doesn't sit behind
  it on mobile. `TaskGraph` gained `onToggleFullscreen`/`isFullscreen`: a
  top-right maximize button in **both** dependency + timeline modes that flips to
  a collapse button inside the modal (the single exit — Obsidian's native close X
  is hidden to avoid overlap; Esc + the phone back gesture also close it now that
  `Modal implements HistoryHandler` in obsidian 1.13). CSS: large centred surface
  on desktop (`min(96vw,1400px)` × 90vh), true `100vw/100vh` on `.is-phone`;
  coarse-pointer gets a 44px target. Also **bumped obsidian typings 1.12.3 →
  1.13.1** (was resolving stale under `"latest"`; typecheck clean, no breaking
  changes). Touched `GraphExpandModal.ts` (new), `TaskGraph.svelte`,
  `TaskBoard.svelte`, `styles.css`. Build green, **1261 tests**. Rig-verified button placement
  (both modes, desktop + mobile), open/collapse, and edge-to-edge at the full
  390×844 viewport with `.is-phone` forced; the on-device iOS pass is the one
  thing still owed (rig can't render Obsidian's mobile shell).

- **GP7 landed — Dependency and Timeline are now two separate rail views** — the
  single **Graph** entry split into **Dependencies** (`id: graph`, dependency
  mode, `git-branch-plus`) and **Timeline** (`id: timeline`, overview/Gantt mode,
  `gantt-chart`), both on `RENDERER_GRAPH`. The in-view Dependency/Overview
  toggle is gone; each view is locked to the `graphMode` fixed in its
  `presentation` and rendered via `TaskGraph.svelte`'s `defaultGraphMode` prop.
  Because both use the same renderer, switching rail entries keeps the same
  `<TaskGraph>` instance and just updates the mode through the existing reactive
  prop sync (verified in the rig on both direct-nav and runtime switch). Per-view
  persistence is free — the active view id already rides on N2's `currentViewId`
  `getState`/`setState`, so a reload reopens whichever was last active; `graph`
  kept its id so persisted state + custom graph views resolve unchanged. Touched
  `viewRegistry.ts` (+ test id-order), `TaskGraph.svelte` (toggle markup +
  `.tt-mode-btn`/`.tt-graph-toolbar-row` CSS removed), rig `main.ts`/`shots.mjs`
  (new `timeline` scene + shots). No PROTOCOL change (the URI opens the board, not
  a specific view). Build green, **1261 tests**, verified dark desktop in the rig.

- **GP5 partly landed — `+` add-subshape shipped; header click-to-focus backed
  out** — the dependency-graph lane header is now one chip with the label body on
  top and a **`+` footer** flush to the chip's bottom edge (tap → add a task
  parented to the project), split from the body by a hairline so they read as one
  card. Add-task moved entirely off the header body onto that `+` (≥44px
  coarse-pointer hit area). A first rev made the header body a pin toggle that
  grew the pinned lane in height to reveal its full vertical title (block-flow +
  `height:auto`, since a flex column mis-measures a vertical-writing-mode child's
  block size); Taylor felt the header click "not that nice… come back and tune
  later," so **both the header pin-toggle and the grow were reverted** — the
  header body is a plain, non-interactive label again. Lane focus still comes
  from hover (GP8 spotlight) and clicking a task (tint/dim pin); only the `+` is
  clickable on the chip. Remaining GP5: a header-focus affordance that feels good
  plus the full-title grow reveal (deferred). `TaskGraph.svelte` only; build
  green, 1261 tests, verified dark/light/mobile in the rig.

- **GP8 lane focus landed** — swim-lane tints are now focus-gated (GP4's
  always-on tint became on-demand). A lane's tint shows only while it's active:
  hovered on desktop, or held by interaction (tap/click a task, lane header, or
  a `+` add button). The active lane pops (accent header + full tint, all its
  nodes lit); other lanes recede — dimmed nodes/edges, no tint — **except**
  tasks connected to the active lane's dependency chain, which stay fully in
  focus while their own lane gets a softer tint (the cross-project spillover).
  Hover is transient; click/interaction pins; empty-canvas press or Esc clears.
  All layers (bands, nodes, edges, headers) fade via opacity transitions. Reuses
  `computeTrace`; per-lane state precomputed into a reactive `laneStates` map
  (Svelte won't track `laneFocus` read inside a helper body). Partly covers GP5
  (focus/dim); GP5's grow-lane + `+`-button restructure still open.

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
asked. Note the reason has changed: `origin/main` and local `main` were
divergent histories, but **as of 2026-07-31 they are identical** (0 ahead,
0 behind) — so pushing is now a normal fast-forward, not a history collision.
It stays opt-in because the repo is public, not because it's dangerous.
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
