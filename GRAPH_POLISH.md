# Graph Polish — backlog (opened 2026-07-10)

Live backlog for the dependency-graph swim-lane polish thread on
`feat/ui-polish-autopilot`. Follows the Autopilot A–I queue and the C2 layout
pick (see `GRAPH_LAYOUT_C2.md`). Source: Taylor feedback, 2026-07-10.

All items target `src/components/TaskGraph.svelte` unless noted. Pure layout
helpers live in `src/store/graph/` (`taskGraph.ts`, `graphPresentation.ts`).

Status legend: `[ ]` open · `[~]` in progress · `[x]` done · ⚖ needs a taste/UX
call from Taylor · 🔎 needs Obsidian-API research first.

---

## GP1 — Mobile: pop-out / full-screen graph 🔎

**Problem.** In its current leaf form the graph is close to useless on mobile —
too little screen. Want a way to "pop out" the graph so it takes (most of) the
screen.

**Direction.** Check the Obsidian docs/API for the right mechanism before
building — options to weigh:
- Open the graph in its own dedicated full-width leaf / workspace tab.
- A full-screen modal ("expand" affordance) that hosts the same component.
- Native "pop-out window" (desktop only — likely N/A on mobile).

**Acceptance.**
- On a narrow viewport there is an obvious control to expand the graph to
  (near) full screen, and to return.
- Pan/zoom/pinch still work in the expanded surface.
- Verify on iOS / narrow-viewport browser per the CLAUDE.md mobile rule.

**Notes.** Research task first; report the chosen mechanism before implementing.

---

## GP2 — Toolbar declutter + floating zoom ⚖ — [x] done 2026-07-10

**Problem.** The summary pills add a lot of visual noise for little value:
Dependency/Overview aside, the **Tasks**, **Links**, **Blocked chains**,
**Cycle nodes**, **Independent** counts don't earn their space. The zoom control
also sits in the toolbar where it competes for attention.

Grounding: mode toggle + zoom at `TaskGraph.svelte:689-708`; summary pills at
`TaskGraph.svelte:710-745` (dependency) and `747-769` (overview).

**Direction.**
- Rethink / cut the count pills. Keep only what's actionable (e.g. the
  **Ready now** and **Independent** toggles are interactive; the raw Tasks/Links
  counts are ambient and probably droppable, or fold into the legend/status
  bar).
- Move the zoom control to **float in a corner of the graph canvas** (overlay on
  the stage, not in the toolbar row).

**Acceptance.**
- Toolbar reads clean; no dead-weight count chips.
- Zoom floats over the graph corner, doesn't block content, works on
  touch + desktop.

**Landed (2026-07-10).** Dropped the **Tasks** and **Links** pills outright.
**Blocked chains** and **Cycle nodes** now render *only when their count > 0*
(they were already alert-styled) — so the problem signal survives but the common
zero-case is clutter-free. **Ready now** / **Independent** toggles kept as-is.
Zoom moved out of the toolbar into a floating pill anchored **top-right** of the
canvas. (First tried bottom-right lifted above the FAB, but that couples to the
FAB's geometry and still collided with Obsidian's real FAB — top-right is the one
corner the create-task FAB never occupies, since it's bottom-right by default /
bottom-left via settings.) Verified desktop + mobile via `npm run rig:shots`
(`graph-dark`, `mobile-graph-dark`). Taste call open: if you'd rather Blocked/Cycle
always show (even at 0), it's a two-line revert.

---

## GP3 — Project filter dropdown

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

---

## GP4 — Swim-lane tinted box (project-colour gradient)

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

---

## GP5 — Lane-header focus interaction + add-button restructure

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

---

## GP6 — Chain-highlight click-off doesn't clear (bug) — [x] fixed 2026-07-10

**Problem.** Click a node → its dependency chain highlights (good). Click off on
empty canvas → the highlight *should* clear but doesn't, until you mouse over
another chain (which re-traces, then decays back to normal).

**Root cause (diagnosed 2026-07-10).** Two trace sources feed the highlight:
`pinnedTracePath` (set by click, `onNodeClick`, `TaskGraph.svelte:525`) and
`hoverTracePath` (set by `mouseenter`, `onNodeHover`, `:514`). `traceSets`
resolves `pinnedTracePath ?? hoverTracePath` (`:508`). Nothing clears
`hoverTracePath` when the pointer moves *off* a node onto empty canvas —
`clearTrace` only fires on the scroll container's `mouseleave` (`:781`). So the
empty-canvas press *does* null the pin (`:420`) but the highlight falls back to a
**stale `hoverTracePath`** (the last node hovered) and stays lit until a
different node's `mouseenter` overwrites it.

**Direction.** On empty-canvas press, clear `hoverTracePath` alongside
`pinnedTracePath` (`:420`); and/or clear hover on node `mouseleave` so the hover
source can't go stale. Small, well-scoped fix.

**Acceptance.**
- Clicking empty canvas immediately removes the highlight (no need to hover
  another chain first).
- Esc still clears a pin; hover-preview tracing still works.
- Verify touch: tap-off behaviour matches.

**Landed (2026-07-10).** Followed up per Taylor: **hover no longer traces the
chain at all** — the highlight is now purely click-to-pin / click-off-to-clear
(`traceSets` reads `pinnedTracePath` only, `TaskGraph.svelte:507`). `hoverTracePath`
is kept for the hover "+" add-dependent button and the task preview tooltip.
Verified by driving the rig: hover → 0 dim (but "+" shows), click → 26 dim,
click-off → 0 dim.

---

## GP7 — Split Dependency and Timeline (Gantt) into separate views

**Problem.** Both live in one graph leaf behind a Dependency/Overview mode toggle
at the top of the toolbar (`graphMode` toggle, `TaskGraph.svelte:692-693`).
Taylor wants them as **two distinct views**, not a toggle inside one.

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

---

## Cross-refs

- Layout constants / metrics workshop: `GRAPH_LAYOUT_C2.md` (F1–F4 algo
  follow-ups are greenlight-gated).
- Visual-regression rig: `npm run rig` / `npm run rig:shots` (see CLAUDE.md CSS
  Notes → Visual test rig).
