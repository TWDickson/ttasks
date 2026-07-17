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

### GP3 — Project filter dropdown `[ ]`

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

### GP5 — Lane-header focus interaction + add-button restructure `[ ]`

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

### GP7 — Split Dependency and Timeline (Gantt) into separate views `[ ]`

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

### GP1 — Mobile: pop-out / full-screen graph `[ ]` 🔎

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

## Next — colour-model workshop `[ ]` ⚖

Opened from Taylor's P7 round-2 review (2026-07-06). Status, area, and label
colours **compete on cards** despite the documented channel hierarchy
(`Scripts/STYLING_NOTES.md`). Wants an in-depth pass, workshop-style like the
C2 layout one (`Scripts/archive/GRAPH_LAYOUT_C2.md`): rig screenshots of the
current state, then **2–3 coherent colour-model variants** for Taylor to pick
from. Present options — don't land a model without the pick.

Grounding: the three colour settings sections (statuses / areas / labels) stay
functionally intact; the CLAUDE.md colour rule (`color-mix` surface tinting,
never hardcoded hex/white on user colours) applies to every variant.

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
