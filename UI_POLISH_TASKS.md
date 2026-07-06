# TTasks — UI Polish & Settings Overhaul (handoff)

Created: 2026-07-04. Reporter: Taylor. Investigator gathered file:line pointers
so the next agent can go straight to the fix.

**Verification:** most of these are visual. Use the rig — `npm run rig` serves
the real components at localhost:5199 with the actual Obsidian CSS;
`npm run rig:shots` writes a desktop/mobile × dark/light screenshot matrix to
`test-rig/shots/`. Follow CLAUDE.md design-system rules (tokens defined once,
shared primitives in `styles.css`, no hardcoded colors, Lucide icons only).
Run `npm run build` + full test suite before closing each item.

Legend: **[CSS]** style-only · **[UI]** markup + style · **[DESIGN]** needs
judgment/iteration with screenshots · **[CARRY-OVER]** deferred from
BUGFIX_TASKS.md (2026-07-04) and still open.

---

## P1. [DONE] [UI] Kanban collapsed column — title and count on one line

**[DONE 2026-07-04, Batch B]** Label + count wrapped in a `.tt-col-collapsed-run`
span carrying `writing-mode: vertical-rl`, so they flow as one continuous
vertical line; `.tt-count` is wrapped, not forked; chevron stays pinned at the
bottom of the full-height expand button. Verified in `rig:shots` (kanban
desktop dark/light + mobile) — collapsed Future/On Hold columns read as one run.

**Symptom:** In a collapsed kanban column, the title and the count render as
separate stacked segments; they should read as one continuous line.

**Where:** Collapsed header markup `src/components/TaskKanban.svelte:172-187`
(label span, `.tt-count` span, chevron icon as three siblings). Collapsed
styles at `:358-401` — the header is `flex-direction: column` with
`writing-mode: vertical-rl` on both the header (`:373-381`) and the label
(`:383-387`), and `gap: 6px` breaks the flow between label and count.

**Fix:** Make the label + count a single inline run in the vertical
writing-mode (e.g. wrap them in one span, or drop the column flex/gap so the
count flows immediately after the title). Keep the count visually lighter
(`.tt-count` is a global primitive — don't fork it, wrap it). Chevron can stay
pinned at one end. Verify collapsed + expanded in the rig at desktop and
mobile widths; collapse state persists via `kanbanCollapsedColumns` so check a
reload too.

---

## P2. [DONE] [DESIGN] List view rows — visual pass

**[DONE 2026-07-05, Batch C]** Conservative pass; three changes landed:

1. **No dot for `None` priority** — the faint grey dot on unprioritized rows
   was pure noise. Hidden via `visibility: hidden` (span stays, so names keep
   a shared left edge across rows). Applied identically to kanban cards for
   consistency.
2. **Mobile dot alignment** — on wrapped two-line names the 8px dot floated
   above the text; it now pins to the first line (`align-items: flex-start` +
   `margin-top: 6px` in the mobile media query), mirroring the kanban-card
   pattern.
3. **Overdue vs selected made explicit** — overdue-red on the name previously
   beat the selected-accent color only by stylesheet order; added an explicit
   higher-specificity rule so the composition survives rule reshuffles.
   Verified hover/selected/selected+hover still read as three states.

**Deliberately not changed** (alternatives considered): badge sizing/weights
— after the 2026-07 design overhaul the shots show badges already clearly
subordinate to names (0.7rem muted pills vs 0.9rem names; area is the loudest
by design per the `styles.css` color-hierarchy comment), so no global
`.tt-badge` edits. Badge order is already consistent (captured → area → date →
labels) and matches kanban. Row `min-height: 36px` sits on the 4px sub-grid
and was left alone — P3 already established the row shouldn't get taller.
Desktop name truncation on badge-heavy rows (visible on the stress fixture)
was left as-is; a `+N` label-overflow badge or a meta-strip max-width were
considered but are bigger swings than this pass warranted — flag if wanted.

**Shots** (gitignored, regenerate with `npm run rig:shots fixtures`): the rig
fixture set now includes a stress row (checkbox + chevron-capable child + 3
labels + overdue) and the shot matrix gained `list-fixtures-*` /
`mobile-list-fixtures-*` cells (desktop+mobile × dark+light) so the stress
row is captured on every future run. Before/after delta in the four cells:
None-dot rows ("Subtask under the stress row", "Water the plants") lose their
grey dots; the mobile stress row's dot sits on the name's first line instead
of hovering above it; everything else pixel-identical.

**Symptom:** List view items "need some visual work" — general polish, not one
specific defect.

**Where:** `src/components/TaskRow.svelte` (whole file; styles `:175-387`).
Rows render: optional checkbox, expand chevron/spacer, priority dot, name,
then a right-aligned meta strip of badges (area, date, inferred date, labels),
plus inline Reopen/Promote buttons. Mobile stacks name over meta (`:366-386`).

**Direction (iterate with screenshots):**
- Establish clearer hierarchy: name is primary; badges currently compete with
  it at similar visual weight. Consider smaller/quieter badges, tighter
  baseline alignment of the meta strip, consistent badge order.
- Row rhythm: check vertical padding/min-height (`:183` `min-height: 36px`)
  against the 8px token grid; rows with many labels get ragged.
- Priority dot (`:342-347`, 8px circle) — check alignment with the name
  baseline and whether `None` priority should render a dot at all.
- Overdue treatment (`:331-333`, red name) — verify it composes with selected
  and hovered states.
- Badges are plugin-global primitives (`.tt-badge` in `styles.css`) — adjust
  there so kanban cards stay consistent, not in component-scoped copies.
- Take before/after `rig:shots` in all four matrix cells; include a row with
  checkbox + chevron + 3 labels + overdue to stress the layout.

---

## P3. [DONE] [CSS] Active (list) view — selected box too big

**[DONE 2026-07-04, Batch B]** The accent tint now paints on an inset
`::before` overlay (`inset: 3px 2px`, `--radius-s`) instead of the full 36px
row slab, so the selected box hugs the content; row min-height/padding
untouched. Hover, selected, and selected+hover remain three distinct states
(14% vs 22% mix on the overlay). Interactive children (checkbox, expand,
reopen/promote) got `position: relative` so the overlay can't paint over
them. Kanban card `is-active` checked for consistency — cards are already
compact bordered boxes, no change needed. Verified in `rig:shots` detail view
(selected row visible).

**Symptom:** The selected-row highlight box in the Active list view is too
big/tall relative to the row content.

**Where:** Selection state lives on the row: `src/components/TaskRow.svelte:193-201`
(`.tt-task.is-active` accent tint + inset bar). Contributing size factors:
`.tt-task` `min-height: 36px` (`:183`), `.tt-task-btn` padding
`var(--tt-space-2) var(--tt-space-3)` (`:258`), and the highlight spanning the
full row including checkbox/chevron gutters (intentional per the comment at
`:176`).

**Fix:** Reproduce in the rig first — confirm whether "too big" is height
(padding/min-height) or the highlight extending wider than the visual content.
Then tighten the box (reduce vertical padding or min-height for the selected
state, or inset the highlight with a small margin + matching radius). Keep the
three-state distinction shipped in yesterday's #2 fix: hover, selected, and
selected+hover must all stay distinguishable. Check kanban card `is-active`
for consistency.

---

## P4. [DESIGN] Dependency graph — mobile friendliness

**Symptom:** The dependency graph is not very mobile friendly.

**Where:** `src/components/TaskGraph.svelte`. Pan uses pointer capture
(`:366`, handlers `:649-652`); zoom is button-driven `dependencyScale` via CSS
`transform: scale()` on `.tt-graph-stage` (`:656`). There is a narrow-viewport
media query at `:1474` but the interaction model is desktop-first.

**Direction:**
- **Pinch-to-zoom** on the graph surface (two-pointer distance → scale, using
  the existing pointer handlers; anchor zoom at the pinch midpoint like
  `zoomBy`'s re-anchor math).
- **Touch targets:** node hit areas, zoom buttons, and the chain-pin
  interaction (shipped yesterday, #12) need ≥44px effective targets on phone.
- Hover-only affordances (hover trace preview, hover popovers) need touch
  equivalents or graceful absence — tap already pins the chain, so audit what
  hover exclusively provides.
- Consider a phone layout preset: smaller node cards, denser lanes, or
  defaulting to a fit-to-width initial scale.
- Test at 375px width in the rig (`rig:shots` mobile cells) **and** on real
  iOS per the CLAUDE.md mobile-testing rule; note gotchas in this file.

**Note:** overlaps carry-over C2 (graph layout). Do the interaction/touch work
here; leave the lane-packing layout redesign to C2.

---

## P5. [DONE] [CSS] Detail sidebar — center status / project / priority controls

**[DONE 2026-07-04, Batch A]** Centered via `.tt-detail > .tt-field-group` rules
in `styles.css` (labels centered with the chips — the label-left variant looked
lopsided at drawer width); create modal and `.tt-fields` grid untouched.
Verified in `rig:shots` desktop + mobile.

**Symptom:** The new detail sidebar leaf feels left-heavy and unbalanced.
Status buttons, project, and priority controls should be centered.

**Where:** `src/components/TaskDetail.svelte` — status chips `:461-475`,
project (parent task) row `:477-502`, priority chips `:504-518`. All are
`.tt-field-group` blocks (global primitive) that left-align by default; chips
come from `ChipsField` (`src/components/fields/`).

**Fix:** Center the chip rows and the project control within the pane width
(labels can stay left or move above-centered — try both, screenshot, pick).
Scope it so the fields grid below the divider (`:520+`) keeps its current
label/value alignment — the ask is only the top block. Since these are shared
primitives, prefer a wrapper class on the detail pane (e.g.
`.tt-detail .tt-field-group`-scoped rule in `styles.css`) over touching
`ChipsField` globally — the create modal uses the same fields and should not
change. Verify in the narrow right-sidebar width AND the mobile drawer.

---

## P6. [DONE] [UI] Detail view — top actions + reordered bottom actions

**[DONE 2026-07-04, Batch A]** Top: native `addAction` check/pencil on
`TaskDetailView` (state via new pure `views/detailHeaderActions.ts` — hidden
with no native task, check flips to Reopen `undo-2` when complete; complete
routes through `runQuickAction('complete')`, reopen through
`taskStore.restore`). Bottom row reordered Open in editor · Mark Complete ·
fixed `--tt-space-4` gap · Delete.

**Ask (two parts):**

1. **Top of the detail pane:** add an "Open in editor" and a "Complete"
   button up top so they're reachable without scrolling.
2. **Bottom action row order:** `Open In Editor` · `Mark Complete` · then a
   slight gap · `Delete`.

**Where:**
- Bottom row: `src/components/TaskDetailActions.svelte:13-31`. Current order
  is Mark Complete (or Archive) → Open in editor → Delete, with Delete pushed
  right via `margin-left: auto` (`:47-49`). Reorder buttons and replace the
  `auto` push with a fixed gap (e.g. `--tt-space-4`) before Delete.
- Top: the detail is hosted by a native leaf, `src/views/TaskDetailView.ts`.
  Preferred approach: use the leaf's **native view header actions** —
  `this.addAction('check', 'Mark complete', …)` and
  `this.addAction('pencil', 'Open in editor', …)` in `onOpen()` — instead of
  building a custom in-pane toolbar. That's free chrome on desktop and mobile
  drawer alike. Callbacks already exist: `markComplete`
  (`TaskDetail.svelte:128`) and the open-in-editor handler wired at `:694-696`
  — they'll need to be lifted/exposed to the view (e.g. via BoardStateService
  or component events) since they currently live inside the Svelte component.
  The complete action should reflect state (task already complete → disabled
  or swapped for Reopen/Archive) — subscribe to `boardState.activeTaskPath` +
  store like the component does.

**Acceptance:** actions work with no task selected (no-op/hidden), state
updates immediately after completing (yesterday's #3/#4 optimistic-update
fixes should make this instant — if not, flag it), and the bottom row reads
Open In Editor · Mark Complete · gap · Delete in both desktop sidebar and
mobile drawer.

---

## P7. [DESIGN] Settings pane overhaul

**Symptom:** Settings have grown section-by-section (12+ sections appended in
sequence) and need a cohesive overhaul.

**Where:** Orchestrator `src/settings/SettingsTab.ts` (241 lines, `display()`
at `:55` renders everything flat into one `containerEl`). Sections live in
`src/settings/*SettingsSection.ts` (managed lists, kanban, views, reminders,
quick actions, working calendar, capture sources, archive, migration).
Managed-list UI pattern: `managedListSettingsSection.ts`;
`.tt-managed-list-*` styles in `styles.css` (~`:1401`).

**Direction:**
- **Follow Obsidian settings conventions:** drop the `h2` "TTasks Settings"
  title (`SettingsTab.ts:58` — plugin settings shouldn't render their own
  page title), use `new Setting(el).setName(…).setHeading()` for section
  headings, sentence-case names, no trailing colons, descriptions via
  `setDesc`.
- **Information architecture:** group into a small number of clearly-headed
  areas, e.g. General (folder, task types) → Statuses & Colours (the three
  distinct colour sections from yesterday's #13 stay intact) → Views & Board
  → Reminders & Quick actions → Working calendar & Holidays → Capture &
  Import → Advanced (archive, migration). Order by how often Taylor touches
  them.
- Consider collapsible sections or a lightweight top "jump to" nav if the
  page stays long; Obsidian core uses plain headings + scrolling, so don't
  over-engineer — visual grouping (dividers, spacing rhythm) may be enough.
- Rationalize per-section rerenders: sections currently take
  `rerender: () => this.display()` which rebuilds the whole pane and loses
  scroll position — preserve scroll on rerender or narrow the rerender scope.
- Keep every existing setting functional; this is an IA/presentation pass,
  not a schema change. Screenshot before/after (the rig doesn't cover the
  settings tab, so verify in Obsidian directly).

---

## C1. [CARRY-OVER] Graph pan/zoom — edges detach when zooming

Deferred from `Scripts/archive/BUGFIX_TASKS.md` #9 — needs live reproduction. Full notes there.
Short version: nodes and edge SVG share the scaled `.tt-graph-stage`, so
suspicion falls on the `markerUnits="userSpaceOnUse"` arrowheads, the zoom
re-anchor rAF scroll math, or `edgeYOffsets`/`edgePath` recompute lag
(`TaskGraph.svelte:293-324, 622-686`). **Repro at 2×–8× zoom in the rig**
(the rig mirrors the three-pane workspace now), determine whether edges or
just arrowheads drift, then fix per the notes. If it can't be reproduced in
the rig, document exact steps tried and hand back to Taylor for a live repro.

---

## C2. [CARRY-OVER] Graph detail-view layout improvement (larger)

Deferred from `Scripts/archive/BUGFIX_TASKS.md` #11 — flagged as a bigger task wanting a design
workshop. Layout comes from `src/store/graph/taskGraph.ts`, rendered at
`TaskGraph.svelte:622-686`; quality metrics already exist
(`computeGraphQualityMetrics`, `:161`).

**Scope for a headless agent:** capture baseline `computeGraphQualityMetrics`
output on a realistic fixture graph, then propose (with rig screenshots) 2–3
layout variants — tighter lane packing, fewer edge crossings, better
`edgeYOffsets` distribution, clearer lane headers. **Do not land a final
layout without Taylor's sign-off** — present options; the mobile-sizing part
belongs to P4.

---

## Suggested order

1. **P6** detail actions (small, high daily value) + **P5** centering — same
   pane, one verification pass.
2. **P1** kanban collapsed line + **P3** selected-box size — two quick CSS
   wins.
3. **P2** list-row visual pass — after P3 so selection state is settled.
4. **P7** settings overhaul — self-contained, biggest single chunk.
5. **P4** graph mobile + **C1** zoom edges — one graph-focused session in
   the rig.
6. **C2** layout variants — produce options, stop for Taylor's pick.
