# Design & Style Audit (2026-07-02)

> **Status (2026-07-02): IMPLEMENTED** — all P0 items, P1-1 through P1-6, and
> P2-1 (partial: expand/collapse chevrons, open-parent, complete/clear icons;
> relationship ⏸/→ glyphs intentionally kept as semantic text), P2-2, P2-4,
> P2-5, P2-6 are done. P2-3 (empty-state pattern) is partially done via the
> global `.tt-empty` class; kanban/graph keep their dashed-container variants
> deliberately. P2-7 folded into the touched files. P2-8 (overdue softening)
> intentionally NOT done — it's a taste call, ask Taylor first.
> Verified: `npm run build`, `npm run lint`, `npx vitest run` (1206 tests),
> `npm run test:components` (also fixed its broken config import).
> Remaining: visual regression pass on phone + light theme per
> STYLING_NOTES.md checklist.

Comprehensive design/style audit of the TTasks UI: `styles.css`, all Svelte
components, the TS-built modals, and the settings section. Ordered like
AUDIT_TASKS.md: visible bugs first, then design-system unification, then
polish. Each task is self-contained. Verify with `npm run build`,
`npm run lint`, `npx vitest run`, and a visual pass in both a dark and a light
theme unless a task says otherwise.

**What's already good (keep doing this):** token-with-fallback discipline
(`var(--input-radius, var(--radius-m, 8px))`), `color-mix` tinting for badges
and status accents, `rgba(var(--mono-rgb-100), α)` shadows, mobile safe-area +
sticky action rows, kanban keyboard support and hover previews, thin visible
scrollbars. The board/list/kanban layer is in solid shape — most problems below
live in the older `src/components/fields/*` generation and a few one-offs.

---

## P0. Visible bugs

### P0-1. Focus rings in all field components are broken CSS

Every field component uses the pattern:

```css
box-shadow: 0 0 0 2px var(--interactive-accent-rgb, rgba(76, 175, 255, 0.1));
```

Obsidian **defines** `--interactive-accent-rgb` as a bare `r, g, b` triplet, so
this resolves to `box-shadow: 0 0 0 2px 124, 77, 255` — invalid at
computed-value time, and the declaration is dropped. Result: **no focus ring at
all** on any Detail-panel input. The `rgba(76, 175, 255, …)` fallback (a
hardcoded blue unrelated to the theme) only ever applies in environments where
the variable is missing.

Occurrences (9): [TextField.svelte:78](src/components/fields/TextField.svelte#L78),
[TextAreaField.svelte:82](src/components/fields/TextAreaField.svelte#L82),
[SelectField.svelte:101](src/components/fields/SelectField.svelte#L101),
[DateField.svelte:105](src/components/fields/DateField.svelte#L105) and
[:143](src/components/fields/DateField.svelte#L143),
[NumberField.svelte:106](src/components/fields/NumberField.svelte#L106) and
[:139](src/components/fields/NumberField.svelte#L139),
[WikiLinkField.svelte:218](src/components/fields/WikiLinkField.svelte#L218),
[ChipsField.svelte:145](src/components/fields/ChipsField.svelte#L145).

**Fix:** `box-shadow: 0 0 0 2px rgba(var(--interactive-accent-rgb), 0.2);`
or (simpler, matches the Create modal per STYLING_NOTES.md) drop the shadow and
use `border-color: var(--background-modifier-border-focus)`.

**Done when:** tabbing through Detail-panel fields shows a visible focus ring
in dark and light themes.

### P0-2. Search input has no visible focus state

[TaskBoard.svelte:786](src/components/TaskBoard.svelte#L786) sets
`outline: none` on `.tt-search-input` and nothing restores an affordance —
keyboard users can't tell when the filter-bar search is focused.

**Fix:** add a `:focus-within` style on `.tt-search-wrap` (e.g.
`border-color: var(--background-modifier-border-focus)`).

### P0-3. Hardcoded white text on user-configured colors (contrast bug)

Selected chips and modal buttons paint the user's custom status/priority color
as the background and force white text:

- [ChipsField.svelte:73](src/components/fields/ChipsField.svelte#L73) — `color: white`
- [CreateTaskModal.ts:667](src/modals/CreateTaskModal.ts#L667) and [:674](src/modals/CreateTaskModal.ts#L674) — `btn.style.color = '#fff'`
- [DateField.svelte:137](src/components/fields/DateField.svelte#L137) — hover `color: white` (its twin, NumberField, correctly uses `--text-on-accent` — they've already drifted)

A light status color (yellow, light green) makes the label unreadable, and this
violates the project's own STYLING_NOTES.md rule ("Avoid hard-coded colors for
text on status/accent surfaces").

**Fix:** use the tinted-badge treatment already proven in TaskRow/TaskKanban
(`background: color-mix(in srgb, <color> 18%, var(--background-primary));
border-color: color-mix(… 42% …); color: <color>`) for selected
colored chips, so the color carries the identity and text stays readable. Where
a solid fill is genuinely wanted, use `var(--text-on-accent)` only for the
theme accent, never for arbitrary user colors.

### P0-4. Detail-panel text inputs render in monospace

[TextField.svelte:71](src/components/fields/TextField.svelte#L71) and
[TextAreaField.svelte:73](src/components/fields/TextAreaField.svelte#L73) set
`font-family: var(--font-monospace)`. Every generic text field — Assigned To,
Blocked Reason, Holiday Dates — renders in code font, unlike every other input
in the plugin. (The task-name row only looks right because TaskDetail globally
overrides it back to `--font-interface`,
[TaskDetail.svelte:746](src/components/TaskDetail.svelte#L746).)

**Fix:** remove the monospace declarations (default UI font), keeping monospace
only where content is code-like (the Query Editor JSON area already handles
itself).

### P0-5. Label `for`/input `id` mismatches in the Detail panel

Field components render `id={definition.name}`
([TextField.svelte:31](src/components/fields/TextField.svelte#L31)), but several
TaskDetail labels point at invented ids:
`for="tt-est-days"`, `for="tt-assigned-to"`, `for="tt-recurrence"`,
`for="tt-blocked-reason"`, `for="tt-holiday-dates"`
([TaskDetail.svelte:595-632](src/components/TaskDetail.svelte#L595-L632)).
Clicking those labels focuses nothing, and screen readers announce unlabeled
inputs. (The `for="tt-workweek-only"` checkbox is correctly wired.)

**Fix:** make each label's `for` match the field's `definition.name` (or pass
an explicit id through the definition). Audit all labels in `.tt-fields`.

### P0-6. FAB hover transition animates the wrong property

[TaskBoard.svelte:971](src/components/TaskBoard.svelte#L971) declares
`transition: filter 0.12s` but hover changes `background`
([:974](src/components/TaskBoard.svelte#L974)) — the hover snaps instead of
easing. Change to `transition: background 0.12s`.

---

## P1. Design-system unification (the big win)

The seven `src/components/fields/*.svelte` components are an older styling
generation than everything else. Same panel, two visual languages: the
relationship chips (999px pills, `--interactive-normal` bg, 0.8rem) sit
directly below ChipsField chips (16px radius, `--background-secondary`,
0.875rem). Unifying the fields layer resolves most of the inconsistencies in
one sweep.

### P1-1. Rewrite `fields/*` styles onto the shared token set

Target values (from styles.css / the newer components):

| Property | Old fields value | System value |
| --- | --- | --- |
| Input background | `--background-primary` | `--background-modifier-form-field` |
| Control radius | hardcoded `4px` (buttons `3px`) | `var(--input-radius, var(--radius-m, 8px))` |
| Chip radius | `16px` | `999px` pill |
| Chip bg (unselected) | `--background-secondary` | `var(--interactive-normal, var(--background-secondary))` |
| Field label | `0.875rem` / 500 / normal case | `0.72rem` / 700 / uppercase / `letter-spacing: 0.06em` / `--text-muted` (matches `.tt-label`, `.tt-modal-label`) |
| Font size | `0.875rem` | `0.9rem` inputs / `0.82rem` chips (or `var(--font-ui-small)`) |
| Transitions | `150–200ms` | `0.12s` |
| Focus | accent border + broken shadow | `--background-modifier-border-focus` border (see P0-1) |
| Disabled | `--background-secondary` bg | `opacity: 0.38; cursor: not-allowed` (matches modal) |

Applies to TextField, TextAreaField, SelectField, DateField, NumberField,
ChipsField, WikiLinkField. Check `chipsField.contract.test.ts` and the
component tests for style assertions before/after.

**Done when:** the Detail panel and Create modal look like one product; chips
in ChipsField are visually identical to relationship chips.

### P1-2. Promote shared primitives to `styles.css` instead of scoped copies

Identical rules are copy-pasted across scoped `<style>` blocks and have already
drifted:

- `.tt-label`, `.tt-divider`, `.tt-field-group` — duplicated in
  [TaskDetail.svelte:792](src/components/TaskDetail.svelte#L792),
  [TaskDetailRelationships.svelte:303](src/components/TaskDetailRelationships.svelte#L303),
  [TaskDetailNotes.svelte:118](src/components/TaskDetailNotes.svelte#L118),
  [TaskDetailActions.svelte:36](src/components/TaskDetailActions.svelte#L36)
- `.tt-badge` family — duplicated in
  [TaskRow.svelte:344-390](src/components/TaskRow.svelte#L344-L390) and
  [TaskKanban.svelte:524-560](src/components/TaskKanban.svelte#L524-L560)
  (already drifted: 0.7rem vs 0.68rem)
- `.tt-count` — TaskList, TaskKanban, TaskAgenda, (TaskArchiveView as
  `.tt-archive-group-count`)
- `.tt-group-heading` — TaskList, TaskAgenda, TaskArchiveView

**Fix:** move these to `styles.css` as plugin-global classes (they're already
namespaced `tt-`), delete the scoped copies. Svelte scoped styles remain for
layout-specific rules only.

### P1-3. One spacing-token definition, not four divergent ones

`--tt-space-1` means different things in different roots: `6px` in
[.tt-modal (styles.css:17)](styles.css#L17) and
[.tt-kanban-wrap (TaskKanban.svelte:284)](src/components/TaskKanban.svelte#L284),
but `4px` in [.tt-board (TaskBoard.svelte:623)](src/components/TaskBoard.svelte#L623)
and [.tt-task (TaskRow.svelte:176)](src/components/TaskRow.svelte#L176).
[.tt-query-editor-modal (styles.css:685)](styles.css#L685) carries a comment
apologizing for its own copy.

**Fix:** define the scale once in `styles.css` on a shared root class (e.g.
`.tt-root`, applied to the board container and every modal), pick one meaning
per step, and delete the local redefinitions.

### P1-4. Unify control focus + input tokens in `styles.css` itself

Within styles.css: `.tt-modal-select/.tt-modal-input` focus with
`--background-modifier-border-focus` while `.tt-modal-name`,
`.tt-modal-textarea`, and `.tt-archive-search` focus with
`--interactive-accent`; `.tt-qe-input`/`.tt-qe-json-area` use
`--background-primary` instead of `--background-modifier-form-field`. Pick the
STYLING_NOTES.md convention (`--background-modifier-border-focus`,
`--background-modifier-form-field`) everywhere.

### P1-5. Move settings styles out of a JS-injected `<style>` element

[managedListSettingsSection.ts:38-40](src/settings/managedListSettingsSection.ts#L38-L40)
injects ~200 lines of CSS via `createEl('style')` on every settings render.
Obsidian plugin review guidelines flag JS-injected styles; it also can't be
overridden by user snippets and re-renders repeatedly.

**Fix:** move the block into `styles.css` verbatim; keep the
`--tt-swatch-color`/`--tt-item-color` custom-property hooks (those inline
`style.setProperty` calls are the right pattern and stay).

### P1-6. Consolidate the button zoo

At least nine bespoke button styles exist (`.tt-modal-btn`, `.tt-btn`,
`.tt-batch-btn`, `.tt-archive-restore`, `.tt-qe-cancel`/`.tt-qe-save`/`.tt-qe-delete`,
`.tt-date-btn`, `.tt-number-clear`, `.tt-modal-mini-btn`, `.tt-filter-clear`)
with paddings from `2px 6px` to `8px 18px`, radii 3–8px, and fonts
0.72–0.9rem.

**Fix:** define three global variants in `styles.css` — `tt-btn` (default),
`tt-btn-primary` (accent fill), `tt-btn-danger` (red text/border, red-tint
hover) plus a `tt-btn-sm` size modifier — and re-point call sites. The existing
`.tt-btn` in TaskDetailActions is the right template. Bonus: Query Editor
save/cancel can also just use Obsidian's native `mod-cta` like confirmModal
uses `mod-warning`.

---

## P2. Polish & accessibility

### P2-1. Adopt Lucide icons for the remaining unicode glyphs

The rail/filter bar correctly use `setIcon` (Lucide), but interaction
affordances elsewhere are unicode text: `▾/▸` expand
([TaskRow.svelte:117](src/components/TaskRow.svelte#L117)), `‹/›` kanban
collapse ([TaskKanban.svelte:183](src/components/TaskKanban.svelte#L183)),
`↗` open parent ([TaskDetail.svelte:489](src/components/TaskDetail.svelte#L489)),
`×` chip remove, `✓ Mark Complete` / `✓ Complete` / `✕` in
TaskDetailActions/BatchActionBar, `⏸`/`→` in relationship pills and dep badges.
Lucide equivalents (`chevron-down`, `chevron-right`, `panel-left-close`,
`arrow-up-right`, `x`, `check`, `pause`, `arrow-right`) render crisper, scale
with the theme, and match core Obsidian. Use the existing `icon` action pattern
from TaskBoard.

### P2-2. Rail active states disagree

Built-in views highlight with subtle bg + accent text
([TaskBoard.svelte:706](src/components/TaskBoard.svelte#L706)); smart lists get
a full accent fill ([TaskBoard.svelte:680](src/components/TaskBoard.svelte#L680)).
Two different "selected" languages in one nav. Pick one (the subtle built-in
treatment reads better next to the mobile tabs' underline style).

### P2-3. Standardize empty states

Four styles today: List has text with hint and CTA button (best), Kanban has a
dashed drop target, Agenda/Archive/Detail have bare muted text, Graph has a
dashed rounded box. Extract one `.tt-empty` pattern (muted text, optional hint,
optional CTA, dashed container where it's also a drop target) and reuse.

### P2-4. Complete or drop the ARIA patterns

- [TaskGraph.svelte:386](src/components/TaskGraph.svelte#L386): `role="tablist"`
  whose children are plain buttons — add `role="tab"` + `aria-selected`, or
  drop the tablist role (it's a mode toggle; `aria-pressed` buttons are fine).
- [TaskKanban.svelte:200](src/components/TaskKanban.svelte#L200): `aria-grabbed`
  is deprecated ARIA — remove.
- Priority is color-only (the dot). `title` exists but add an `aria-label` to
  the row/card button including priority, or visually-hidden text.
- Mobile kanban status `<select>`
  ([TaskKanban.svelte:578](src/components/TaskKanban.svelte#L578)) strips
  native appearance with no replacement indicator — it reads as a static badge.
  Add a chevron (background SVG or `::after`) so it's discoverably a control.

### P2-5. Tap-target and hit-area sizes

- `.tt-qe-del` ([styles.css:805](styles.css#L805)) is ~16px tall on mobile.
- `.tt-expand-btn` is 20px wide.
- `.tt-chip-remove` / `.tt-modal-chip-remove` are below 24px.

Give small icon buttons a `min-width/min-height: 28px` (44px effective on
mobile via padding) — Obsidian mobile users hit these with thumbs.

### P2-6. `prefers-reduced-motion`

The detail-panel slide (0.22s transform), modal section expand
(max-height/opacity/translate), and chip transitions have no reduced-motion
guard. Add one global rule in `styles.css`:

```css
@media (prefers-reduced-motion: reduce) {
  .tt-board-detail, .tt-modal-section-body, .tt-modal-section-chevron { transition: none; }
}
```

### P2-7. Type-scale rationalization (opportunistic)

Font sizes in use: 0.62, 0.64, 0.65, 0.66, 0.68, 0.7, 0.72, 0.73, 0.74, 0.75,
0.76, 0.78, 0.8, 0.82, 0.84, 0.85, 0.86, 0.88, 0.9, 0.92, 0.94rem… The Query
Editor already uses Obsidian's `--font-ui-smaller/--font-ui-small` — extend
that (plus a `--tt-font-label: 0.72rem` token for the uppercase labels) and
collapse the near-duplicates (0.72/0.73/0.74 → one value) as files are touched.
Not worth a dedicated sweep; fold into P1-1/P1-2 edits.

### P2-8. Soften the overdue treatment (subjective — confirm first)

Overdue currently turns the entire task name red *and* shows a solid red badge
(list + kanban). With several overdue tasks the views shout. Option: keep the
red badge as the signal and leave the name `--text-normal`, or use a red left
edge like kanban's active accent. Taste call — check before changing.

---

## Suggested order

1. P0-1 → P0-6 (one small PR, pure CSS/markup, immediately visible)
2. P1-1 + P1-4 (fields rewrite; largest visual payoff)
3. P1-2 + P1-3 + P1-6 (dedupe into styles.css; mechanical)
4. P1-5 (settings CSS move)
5. P2-x opportunistically

Regression pass after each phase: dark + light theme, desktop + phone, and the
STYLING_NOTES.md mobile-modal checklist.
