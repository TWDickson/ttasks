# TTasks — Backlog

The single live backlog (consolidated 2026-07-12). Everything open lives here;
closed sweeps and their full histories are under `Scripts/archive/` (see
Cross-refs at the bottom). When an item lands, mark it `[x]` with a dated
one-line note; when this file empties, add a checkpoint to `ROADMAP.md`.

Dev workflow: completed, verified work is merged into local `main` as we go (no
review gate while in dev). `main` holds the full Autopilot A–I run + graph polish
(merged 2026-07-17). Remote `origin/main` is a separate/divergent history and is
not pushed to from here unless explicitly asked.

Status legend: `[ ]` open · `[~]` in progress · `[x]` done · ⚖ needs a
taste/UX call from Taylor · 🔎 needs research first.

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
- `[ ]` **P2-8 overdue-red softening** ⚖ — overdue currently paints the whole
  task name red *and* a solid red badge; with several overdue tasks the views
  shout. Options: keep the badge as the only signal, or a red left edge like
  kanban's active accent. (From `Scripts/archive/DESIGN_AUDIT.md`.)
- `[ ]` **GP1 live-mobile sign-off** — the fullscreen graph modal shipped and is
  rig-verified (edge-to-edge at 390×844 with `.is-phone` forced), but the real
  on-device pass is owed: open Dependencies/Timeline on iOS, tap **maximize**,
  confirm the modal is truly edge-to-edge, pinch-zoom + pan work, and
  collapse/back-gesture/Esc all return. Note any safe-area-inset gotchas.
- `[ ]` **Visual regression pass** — dark/light × desktop/phone sweep per the
  `Scripts/STYLING_NOTES.md` checklist; includes the settings-tab before/after
  from the P7 overhaul (the rig doesn't cover the settings tab — live Obsidian
  check).
- `[ ]` **GP2 residue** (minor ⚖) — Blocked/Cycle count pills now hide at zero;
  if Taylor prefers them always visible it's a two-line revert.

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
