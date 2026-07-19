# TTasks — Backlog

The single live backlog for **all open work, every horizon** (consolidated
2026-07-12; all-horizons reconcile 2026-07-19). Everything open lives here —
near-term threads up top (`Now` / `Next` / `Gated`) and longer-range roadmap
features under `Later`. Closed sweeps and their full histories are under
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

## Top priority — JSON import / export `[~]`

*Requested 2026-07-19 (Taylor): "share my tasks (or a subset) with the work AI."*

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

**Remaining (next session):**
- `[ ]` **Import → vault creation** — wire the parser to `TaskStore.create`
  behind an **ImportConfirmModal** preview (reuse the I5 bulk-import pattern):
  dedupe, ID-collision-safe, and **relationship remap** (parent/`depends_on`
  given as names or paths → resolve against existing + newly-created tasks by
  name). *Held tonight on purpose — it mutates the live vault and needs runtime
  verification, not a blind autonomous run.*
- `[ ]` **Subset export** — right now export is all-tasks. Add subset via the
  shared query engine (export the current view's / a Smart List's filtered set),
  so "export just these" is one action. Serializer already takes any `Task[]`.
- `[ ]` **Import command surface** — from clipboard and/or a picked `.json`.

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

**Remaining:** the desktop **status-bar countdown** (N6 surface) so the timer is
visible while working elsewhere; optional log-partial-on-stop; live-Obsidian
sign-off for the CSV write + the two Obsidian modals + the pane leaf (rig can't
host Obsidian modals/leaves) — folds into the Visual regression pass.

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

## Cross-refs

- **Closed sweeps + full item histories:** `Scripts/archive/` —
  `AUTOPILOT.md` (the A–I batch queue, all checked), `UI_POLISH_TASKS.md`
  (P1–P7, C1, C2), `NATIVE_FEATURES_TASKS.md` (N1–N6), `GRAPH_POLISH.md`
  (GP1–GP7 originals; GP2/GP6 landed), `GRAPH_LAYOUT_C2.md` (C2 workshop +
  variant decision), plus the older `AUDIT_TASKS.md`, `BUGFIX_TASKS.md`,
  `DESIGN_AUDIT.md`, and `CODEBASE_MODAL_DETAIL_EXPLORATION.md`.
- **Reference docs (live, root):** `API_DESIGN.md` (public API, awaiting
  review), `PROTOCOL.md` (URI handler).
- **Visual rig:** `npm run rig` / `npm run rig:shots` (CLAUDE.md → CSS Notes).
