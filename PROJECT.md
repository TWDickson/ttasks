# TTasks — Project Status & Backlog

**The single live document for all open work, every horizon.** Consolidated
2026-08-02 from the former `BACKLOG.md`, `ROADMAP.md`, and `AUDIT_2026-07.md`.

- **This file** — current state, all open work, and the rationale behind it.
- **`CLAUDE.md`** — conventions, architecture rules, and dev workflow (how to
  work in this repo, not what's left to do).
- **`Scripts/archive/HISTORY.md`** — the dated journal of everything shipped,
  plus the closed sweeps. Read it for *why* a past decision went the way it did.
- **`API_DESIGN.md`** / **`PROTOCOL.md`** — reference specs (public API awaiting
  review; the `ttasks://` URI handler).

When an item lands, mark it `[x]` with a dated one-line note, then move the
narrative to `HISTORY.md` once the thread closes.

**Status legend:** `[ ]` open · `[~]` in progress · `[x]` done
**Needs Taylor:** ⚖ a taste/UX call · 🔎 research or scoping first
**Audit priority:** 🔴 blocks public release · 🟡 should do · 🟢 opportunistic

---

## Current state (2026-08-02)

| | |
| --- | --- |
| Version | `0.1.2` (GitHub release; not on the community list — deliberate) |
| Tests | **1731 passing, 131 files** (`npm run check` = lint → build → test) |
| CI | Green on push/PR/dispatch, Node **22 + 24** matrix |
| Release | `npm version patch && git push --follow-tags` |
| Deploy | `npm run build` copies into the vault; `npm run dev` does not |
| Licence | GPL-3.0-or-later |

**Phases 1–4, 6, and 7 are complete.** Core CRUD, kanban, mobile layouts,
search/filter, dependency graph, reminders, quick actions, archive/logbook, the
`area`/`labels` data model, the shared query engine, and Smart Lists all ship.

**Four things gate a public release** — all 🔴 in the Audit section below:
PB-2 (review-bot flags), MD-1/MD-2 (schema prefix + sparse writes), DT-1
(midnight-stale queries), and DT-2 (semantically-dead `due_time`).

**Two ⚖ calls are waiting on Taylor:** DT-2 (`due_time` real vs. display-only —
*decided, see below*) and DT-5 (rolling vs. calendar "this week" — *decided, see
below*). Both now have decisions recorded; they need implementing, not deciding.

---

## Now — active threads

### 1. Mobile on-device sweep

Three fixes landed rig-side on 2026-07-19 but could not be confirmed on-device,
because the phone wasn't receiving fresh builds. **That blocker was root-caused
and fixed on 2026-07-31** (the vault install was a symlink pointing Obsidian Sync
at the whole ~1 GB repo; it's a real folder fed by an esbuild copy hook now). The
fixes are therefore *testable but still unverified* — the outstanding work is a
sweep, not a new fix.

- `[~]` **GP1-follow: detail drawer opens behind/hidden on mobile** 🔎 — tapping a
  node in the popped-out fullscreen graph closes the modal, but the detail drawer
  ends up behind something or off-screen instead of surfacing. The rig can't
  reproduce it (no Obsidian mobile shell). Fix attempted: `GraphExpandModal`
  defers the open-task hand-off to a `requestAnimationFrame` *after* `close()` so
  the modal's history/focus-restore can't land after the drawer reveal, and
  `openDetailPane()` reveals the right leaf with `active: Platform.isMobile`.
- `[~]` **Graph node: double-tap-to-open on mobile** 🔎 — tapping a task node
  needed two taps on iOS. Root cause: the node's hover behaviour (preview + hover
  `+`) makes WKWebView spend the first tap applying emulated hover and withhold
  the `click`. Fix: on touch, open from `pointerup`; desktop stays on `click`;
  Android-safe via a 700 ms ghost-click guard. Also an 8 px press-vs-drag
  threshold so a stationary tap doesn't start a pan.
- `[~]` **Detail pane doesn't fit the mobile drawer** 🔎 — the field grid was
  `label │ control`, squeezing controls on the narrow drawer. Below 768 px it now
  collapses to one column plus `overflow-x: hidden` on the detail leaf.
  Rig-verified dark + light at phone width.

### 2. Pomodoro (native) — core complete, sign-off owed

Built native rather than integrating the community Pomodoro plugin (Taylor's
call), so it's dependency-free and works on mobile. **All core and optional
slices are done:** the pure state machine, service, detail-pane control, settings
group, untethered sessions, RFC-4180 CSV session log, "focus until X:XX"
planning, a dedicated right-sidebar pane, a desktop status-bar countdown, and
log-partial-on-stop.

- `[ ]` **Live-Obsidian sign-off** — the CSV write, the two modals, the pane
  leaf, and the status-bar item. The rig can't host Obsidian modals, leaves, or
  the status bar. Folds into the Visual regression pass.
- `[ ]` **(15) Pomodoro discoverability** — no obvious way to find the sidebar
  icon or open the pane. Needs a clearer entry point: ribbon icon,
  command-palette hint, or an onboarding nudge.

### 3. Status semantics — Blocked vs Hold

- `[~]` **(6) Blocked vs Hold verbiage** — **defined by Taylor 2026-07-25:**
  - **Blocked** — *"I need to escalate something, or something is just impossible
    at the current moment."* An **external impediment**: the work cannot move
    until someone or something outside the task clears it.
  - **Hold** — *"awaiting a confirmation of delegated work, paused due to some
    other priority."* A **deliberate pause**: the work *could* proceed but has
    been consciously set down.

  The distinguishing axis is **can't vs. won't-right-now**, not severity.
  **Remaining:** reflect this in UI wording/tooltips and in the `blocked_reason`
  field's copy, which currently only fits the Blocked case.
- `[ ]` **(8) Cascade to dependents — Slice 2 (UI surfacing).** Slice 1 (engine)
  landed 2026-07-25: pure `src/query/taskImpediment.ts` walks `depends_on`
  transitively and returns `path → { kind, source, causes }`. **Blocked beats
  Hold**, reduced by max rank rather than last-write-wins — which is what makes
  the result order-independent, so a task reachable from both a Blocked and a
  Held upstream resolves the same regardless of traversal order. The cascade is
  **derived, never written** to a dependent (a written status can't be cleanly
  un-written when the blocker clears). Remaining: a badge on the row / kanban
  card / detail pane for `source === 'upstream'` tasks with the causes in the
  tooltip. **Needs a look call first** — the V2 colour-spine model deliberately
  made badges monochrome, so a new coloured badge would fight it.

### 4. Graph polish

- `[~]` **GP5 — lane-header focus interaction** — the `+` add-subshape shipped
  (tap → add a task parented to the project, flush to the chip's bottom edge). A
  first rev made the header body a pin toggle that grew the pinned lane to reveal
  its full vertical title; Taylor felt it was *"not that nice… come back and tune
  later,"* so both the pin-toggle and the grow were **backed out**. Remaining: a
  header-focus affordance that feels good, plus the full-title grow reveal.
- `[ ]` **(12) Drag connectors to create dependency chains** 🔎 — click-and-drag
  a node's connector (left = depends-on, right = blocks) to link it to another
  node. Needs interaction-design research: hit targets, drop targets, touch
  equivalent.
- `[ ]` **(16) Vertical sort: rank completed items lower** ⚖ — current order
  reads as priority-based; Taylor's instinct is that completed items should sink
  regardless of priority. Needs a taste call on the exact rule.
- `[ ]` **GP2 residue** ⚖ (minor) — Blocked/Cycle count pills now hide at zero;
  if Taylor prefers them always visible it's a two-line revert.

### 5. Search

- `[x]` **Search by task hash prefix** — *done 2026-08-05.* Bare hex ≥ 3 chars
  ORs an id-prefix match onto name/notes; `#a1b2` matches the id only. One pure
  module (`src/query/hashSearch.ts`) behind `applyFilter`, so board, Smart Lists,
  archive, the jump switcher, and `ttasks://?action=search` all share it. See
  `HISTORY.md` for the reasoning behind the 3-char floor.
- `[ ]` **The filter-bar search box is too narrow to use** ⚖ — *found 2026-08-05
  while rig-verifying the above; pre-existing, not caused by it.* `.tt-search-wrap`
  is `flex: 1 1 0%` in a bar of fixed-width controls, so it settles at ~135 px on
  a 1040 px bar and shrinks further to ~75 px once "Clear" / "Show Completed"
  appear. On phone width it collapses to the magnifier icon alone. Consequence:
  the placeholder truncates, typed queries scroll out of view, and there's
  nowhere to hint at the `#hash` syntax (it's on a `title` tooltip for now).
  Needs a taste call on the fix — give the search a `min-width` and let the
  selects shrink, move it to its own row, or make it an expanding icon-button on
  narrow viewports.

### 6. Open feedback items

- `[ ]` **Status / Priority badges: selected vs. regular hard to distinguish,
  worse in dark mode** ⚖ — likely a colour-spine follow-on (badges went
  monochrome in the V2 work). Needs a taste call on how much contrast the
  selected state should carry.
- `[~]` **(14) Dependency-selection dropdown needs better sorting** — investigated
  2026-07-20 and it **appears already fixed**. The detail-pane "add blocker"
  picker, the create-task modal, and `WikiLinkField.svelte` all already sort via
  `sortDependencyFirst` (same-project first, then alphabetical). Needs Taylor's
  repro — which picker, what ordering was actually seen — before further work.
- `[ ]` **Share/Sync import: allow importing from notes** 🔎 — the Import tab only
  accepts a pasted JSON export doc; Taylor wants to import from regular Obsidian
  notes. Needs scoping: is this "point at a note's raw text and parse tasks out
  of it" (adjacent to the existing checkbox-scan/promote capture flow), or a
  different shape entirely?
- `[ ]` **Share/Sync: import command surface** *(deferred)* — a direct
  import-from-clipboard command; today import is the modal's Import tab.

---

## Gated on Taylor (not headless-workable)

- `[ ]` **N3 public API — review then implement** — `API_DESIGN.md` is written and
  Taylor's decisions on the five open questions are recorded; implementation
  ships only after his review of the final doc. **Land AR-3 first** if this
  becomes imminent — the schema descriptor table changes how API fields are
  exposed.
- `[ ]` **N7 Bases compatibility** — needs the live vault with Bases enabled.
  Ship `Scripts/TTasks.base` (views: Active, Due this week, By area, project
  rollup), verify aliased wiki-links / `labels` list / quoted date fields resolve,
  document in the README. **No schema changes** without a written proposal first.
- `[ ]` **Visual regression pass** — dark/light × desktop/phone sweep. Includes
  the settings-tab before/after from the P7 overhaul, which the rig doesn't cover.
  The Pomodoro and Share/Sync live sign-offs fold into this.
- `[ ]` **C2-F2 mid-column whitespace** ⚖ — a semantic tradeoff: pulling
  source-only nodes rightward changes what a column *means* and can perturb the
  0-crossing layout. Full analysis in `HISTORY.md` (C2 workshop).

---

## Audit 2026-07 — codebase / publication readiness

Full audit performed 2026-07-12 against the live tree. Item IDs: `AR`
architecture · `DT` dates · `MD` frontmatter/schema hygiene · `RP` repeat
mechanism · `TD` testing · `PB` publication.

**The audit's overall verdict:** the codebase is in genuinely good shape — better
than the typical community plugin. Its strongest assets are the **pure-module
discipline** (`src/query/`, `src/utils/`, `src/integration/` helpers and the store
decision modules are Obsidian-free and enforced by
`architectureBoundaries.test.ts` — the single best architectural decision in the
repo), the **ports pattern** at the plugin boundary keeping `main.ts` thin, the
fact that **every completion path routes through `decideCompletion`**, and a
documented date model. The weaknesses cluster in four places, which is what the
items below track.

### Sequencing (dependency-ordered; each phase independently shippable)

- **Phase 0 — hygiene.** *Done 2026-07-25/31:* lint fixes, CI (TD-1), `check`
  script (TD-2), `.gitattributes`, the DT-4 comment fix.
- **Phase 1 — publication scaffolding.** README (last piece of PB-1) →
  review-bot sweep (PB-2) → manifest description (PB-3). *After this, submission
  is unblocked whenever Taylor decides.*
- **Phase 2 — date hardening.** `isIsoDateString` + dedupe sweep → engine `today`
  injection (DT-1) → `due_time` implementation (DT-2) → this-week semantics
  (DT-5) → `new Date()` boundary enforcement (DT-6).
- **Phase 3 — schema reset + repeat redesign.** AR-3 descriptor table → MD-1/MD-2
  prefix + sparse writes → MD-3 derived `blocks` → `src/repeat/` pure engine →
  integration → **MD-4 one-off migration script** → dev-command pruning → MD-5
  registry cleanup → builder UI.
- **Phase 4 — architecture debt (ongoing, PR-sized).** BoardContext + component
  decoupling (AR-1/TD-4) → TaskGraph decomposition (AR-2, ahead of further graph
  work) → ChecklistSyncService (AR-4) → DRY sweep (AR-5) → Svelte CSS extraction
  (PB-4) → coverage reporting (TD-3).

### Publication readiness (PB) — blocks any public release

- `[x]` **PB-1 🔴 release scaffolding** — *done 2026-08-02.* LICENSE,
  `versions.json`, `version-bump.mjs`, `.npmrc`, the `version` npm script, and
  `release.yml` landed 2026-07-31. **`README.md` landed 2026-08-02** covering what
  it does, install via BRAT, the frontmatter data model, the
  local-calendar-date policy + timezone-travel caveat, a settings overview, and
  dev/rig instructions — with six screenshots from the rig matrix in
  `docs/screenshots/`. Submitting to `obsidianmd/obsidian-releases` stays
  **deliberately out of scope** — GitHub releases only, per Taylor.
- `[ ]` **PB-2 🔴 review-bot flags** — the sweep Obsidian's reviewers run:
  - **`innerHTML` (5 sites)** — `QueryEditorModal` sets `btn.innerHTML = '✕'`
    (3×), which also violates the repo's Lucide-only rule; use `setIcon(btn,
    'x')`. `CreateTaskModal:557` and `TaskDetailNotes.svelte:40` clear with
    `innerHTML = ''`; use `el.empty()`.
  - **`app.workspace.activeLeaf`** (`TaskBoardView.ts:58`) — deprecated. Use
    `getActiveViewOfType(TaskBoardView) === this` or `getMostRecentLeaf()`.
  - **`vault.modify`** (`completionSync.ts:96`, `vaultSafe.ts:46`) — guidelines
    require `Vault.process` for read-modify-write. `completionSync` reads via
    `cachedRead` then modifies — **a real clobber window**, not just a style flag.
  - **Console noise** — `plugin.log` → `console.log` unconditionally, plus
    `TaskStore.ts:278` per-file skip logs. Gate behind the `process.env.NODE_ENV`
    flag `useTaskQuery` already uses. `console.error` for real failures stays.
  - **`localStorage`** — hand-rolled vault namespacing in
    `reminderStorage`/`vaultSafe`; Obsidian provides
    `app.loadLocalStorage()`/`saveLocalStorage()` which namespace per vault
    including mobile. Swap the backing calls inside `vaultSafe`; call sites
    unchanged. Per-device semantics for fired reminders are correct — keep them.
  - **Casing / headings** — UI text must be sentence case (`'Edit Smart List:'`,
    kanban/settings headings). `managedListSettingsSection.ts:46` uses
    `createEl('h3')`; convert to `new Setting(el).setName(...).setHeading()`.
    Modals using `createEl('h2')` should use `this.titleEl.setText(...)`.
- `[ ]` **PB-3 🟡 manifest polish** — `description` contains "plugin for
  Obsidian"; the checker flags both words as redundant. Suggested: *"Task
  management with kanban, dependency tracking, agenda, and a dependency graph —
  stored as plain markdown frontmatter."* Optional `fundingUrl`.
- `[ ]` **PB-4 🟡 Svelte CSS is JS-injected** — `esbuild-svelte` runs with
  `css: 'injected'`, so component styles become runtime `<style>` elements,
  contradicting the "all CSS belongs in `styles.css`" rule. Effect: component CSS
  bypasses `styles.css`, can't be overridden predictably by theme snippets, and
  briefly FOUCs on view open. Switch to `css: 'external'` and concatenate onto
  `styles.css` at build. **Do it before `styles.css` becomes a public API for
  theme authors.** *(2026-08-05: the title system and `.tt-chip-warning` moved
  out of scoped blocks into `styles.css` — see HISTORY. That shrinks what's
  trapped behind the injection, but the mechanism is unchanged and PB-4 stands.)*

*Already publication-clean (PB-5):* no network calls, no telemetry, no
Node/Electron imports in `src`, `isDesktopOnly: false` matches mobile support,
`processFrontMatter` for all frontmatter mutation, no leaf detaching in
`onunload`, intervals/events registered for cleanup, `normalizePath` at vault
boundaries, `seed-graph-test-data` dev-gated out of production.

### Dates (DT)

- `[ ]` **DT-1 🔴 agenda buckets + query results go stale at midnight** — the
  engine calls `localDateString()` internally and nothing re-runs the query at
  midnight, so a board left open overnight shows yesterday's Overdue/Today buckets
  while the row badges (which *do* subscribe to the `today` store) update — a
  visible inconsistency. **Plan:** make `applyQuery` take `ctx: { today }`, derive
  `useTaskQuery` from `[tasks, query, today]`, then sweep the remaining
  `startOfToday()`-at-mount surfaces (`TaskGraph`/`hybridTimeline` today-marker,
  `TaskBoard`, `TaskDetail`, `statusSummary`). Also makes the engine tests
  deterministic.
- `[ ]` **DT-2 🔴 `due_time` is stored but semantically dead** — **decided
  2026-07-25 (Taylor): make it real, reminders only.**
  - **Scope is bigger than the audit stated.** `due_time` is persisted, written,
    sortable, and offered in the query editor but consumed by nothing. It's also
    **not settable** — no entry in `TASK_FIELD_DEFINITIONS`, so no create-modal or
    detail-pane control exists. Today it only arrives via the emoji-capture parser
    or JSON import. So this needs **UI + consumption**, not just consumption.
  - **Reminders only, not overdue.** A new `due-time-passed` rule (due today +
    `due_time` < now + not complete) on the existing 5-minute poll. Overdue
    styling stays **date-based** — a 09:00 task is not overdue-red at 09:01,
    because overdue drives colour across list, kanban, and graph, so a
    time-sensitive overdue would have rows flipping state through the day and a
    morning-heavy schedule going red by lunchtime. **Document the asymmetry
    explicitly** — the reminder fires, the styling doesn't change.
  - `dateUtils` gains the one missing primitive `localTimeString(now): 'HH:MM'`
    so `new Date()` stays out of the pure rules.
  - **Not** a move to datetime-everywhere. `dateUtils.ts` documents the opposite
    as a deliberate choice, and Obsidian's native "Date & time" type on `due_date`
    is deliberately reduced to its calendar-date portion by `toCalendarDate`.
    `due_date` + `due_time` already *are* a local datetime split across two
    fields — this just makes the second one count.
- `[ ]` **DT-5 🟡 "This week" is a rolling 7 days, not a calendar week** —
  **decided 2026-07-25 (Taylor): real calendar weeks, keeping rolling windows
  where they suit.**
  - **Current:** `today+1` → Tomorrow, `≤ today+7` → This Week, `≤ today+14` →
    Next Week. The distortion grows through the week — near-correct on the first
    day, almost entirely *next* week by Friday. The practical cost is that "what's
    left this week?" can't be answered, because the bucket refills from the future
    as the week drains.
  - **Target:** calendar-week bucketing plus a new **week-starts-on** setting
    (Sun/Mon). Matches TickTick/Things.
  - **Rolling stays first-class** (Taylor: *"I do like the idea of having a
    rolling window for some things as well"*). It already exists as the
    `within_days` filter operator; confirm it's discoverable in the query editor
    rather than building a second mechanism.
  - **Second bucket to align:** the Logbook has its own unrelated `this-week`
    (completed within the last 7 days, rolling *backwards*) — same label, opposite
    direction. A look-back window arguably *should* stay rolling, so the likely
    resolution is to keep the behaviour and **rename it "Last 7 Days"**. Decide
    alongside the agenda change so they don't drift again.
- `[~]` **DT-4 🟡 `recurrence.ts` vs. the dateUtils contract** — *partly done
  2026-07-25.* The wrong doc comment and the duplicated days-in-month clamp are
  fixed. **Still open:** folding `advanceDate` onto `dateUtils` primitives so the
  module stops carrying its own parse/format. Planned for the RP redesign.
- `[ ]` **DT-6 🟢 consolidation + enforcement** — add `isIsoDateString` and sweep
  the 8 duplicate ISO-date regexes (with AR-5); move `formatHumanDate` next to
  `MONTH_ABBR`; enforce no bare `new Date()` outside the boundary.

### Repeat mechanism (RP) — redesign

RP-1 (month-end drift) was **fixed 2026-07-25** via a persisted anchor day. The
remaining two items are resolved by the redesign below, which is specified in
full because it's the largest single piece of open work.

- `[ ]` **RP-2 🟡 expressiveness** — no "every N", weekday sets, nth-weekday,
  weekday classes, end conditions, or working-day awareness.
- `[ ]` **RP-3 🟡 fragile recurrence identity** — the spawn dedupe guard in
  `decideCompletion` matches on task **name**, so renaming a recurring task with
  an open instance breaks the guard and double-spawns. Fixed by construction in
  the redesign via stable series identity.

**Storage — flat, prefixed frontmatter keys** (settled with Taylor 2026-07-12;
supersedes an earlier human-DSL proposal). Rationale: a builder must be the
primary entry path anyway, which makes a DSL a lossy round-trip layer with its own
parser to maintain; and nested YAML objects are second-class in Obsidian — the
Properties panel renders them as an uneditable blob and Bases can't reach into
them. Flat scalar/list keys are native everywhere. No legacy compatibility: the
vault is converted by the MD-4 script.

```yaml
# every 2 weeks on Mon/Wed
ttask_repeat_every: 2
ttask_repeat_unit: week
ttask_repeat_weekdays: [mon, wed]

# first working day of the month, 12 times
ttask_repeat_every: 1
ttask_repeat_unit: month
ttask_repeat_nth: 1
ttask_repeat_nth_target: working-day
ttask_repeat_count: 12
```

| Key | Type | Applies to |
| --- | --- | --- |
| `ttask_repeat_every` | number ≥ 1 | all — presence means "repeats" |
| `ttask_repeat_unit` | `day\|week\|month\|year` | all |
| `ttask_repeat_weekdays` | list of `mon…sun` | week |
| `ttask_repeat_monthday` | number or `last` | month; year (with `_month`) |
| `ttask_repeat_month` | 1–12 | year |
| `ttask_repeat_nth` | 1–5 or -1 (last) | month |
| `ttask_repeat_nth_target` | `mon…sun`, `day`, `weekday`, `weekend-day`, `working-day` | month |
| `ttask_repeat_basis` | `completion` (omit = schedule) | all |
| `ttask_repeat_roll` | `next\|previous` (omit = keep) | all |
| `ttask_repeat_until` | YYYY-MM-DD | end condition |
| `ttask_repeat_count` | number (remaining spawns) | end condition |
| `ttask_repeat_of` | wiki-link to the previous instance | spawned instances (RP-3) |

Yearly reuses `_monthday` + `_month` rather than inventing a third date shape.
Typical rules touch 2–4 keys; non-repeating tasks have zero (sparse-write
discipline, MD-2).

**Modules — `src/repeat/`, pure:**

```ts
export interface RepeatRule {
  every: number;                          // ≥ 1
  unit: 'day' | 'week' | 'month' | 'year';
  weekdays?: Weekday[];                   // unit=week
  monthday?: number | 'last';             // unit=month|year; exclusive with nth
  month?: number;                         // unit=year
  nth?: { n: 1 | 2 | 3 | 4 | 5 | -1; target: NthTarget }; // unit=month
  basis?: 'schedule' | 'completion';      // default 'schedule'
  roll?: 'next' | 'previous';             // working-day roll; default keep
  until?: string;                         // YYYY-MM-DD
  count?: number;                         // remaining occurrences
}
export type NthTarget = Weekday | 'day' | 'weekday' | 'weekend-day' | 'working-day';
```

- **`repeat/normalize.ts`** — the read boundary. Gathers `ttask_repeat_*` keys,
  coerces types, enforces invariants. An inconsistent hand-edited combo
  normalizes to `null` **with a warning badge on the task** — never a silent
  guess. There is deliberately no natural-language parser.
- **`repeat/describe.ts`** — `describeRepeat(rule): string` for UI labels.
  Display-only; nothing parses it back.
- **`repeat/next.ts`** — `nextOccurrence(rule, anchor, after, calendar?)`.
  **Anchor-based, never last-occurrence-based**, so monthly `day 31` re-derives
  each month (Jan 31 → Feb 28 → **Mar 31**), fixing RP-1 by construction.
  `working-day`/`weekend-day` targets consult the existing `WorkingCalendar`.
  Holiday-aware recurrence — "first working day of the month" skipping Jan 1 — is
  a genuine differentiator no mainstream task app offers. Returns `null` when
  `until`/`count` is exhausted, so the completion path simply doesn't spawn.

**Settled edge semantics** (encode as a test table): "last weekend" means the
last weekend *day* (Things/Apple semantics); an **nth that doesn't exist** ("5th
Tuesday" in a 4-Tuesday month) **skips the month** rather than clamping, because
clamping reintroduces drift-shaped surprises; leap-day yearly clamps to Feb 28 in
non-leap years; v1 excludes multiple month-days.

**UX — three layers over one model**, all reading/writing the same `RepeatRule`:
contextual presets derived from the due date (Google Calendar style), a custom
builder, and raw YAML editing. The **next-3-occurrences preview** is the
highest-value element — it's how a user verifies "first working day of the month"
does what they meant, and it's nearly free.

**Integration:** `decideCompletion`/`completeAndRecur` call `nextOccurrence`;
spawned instances carry `ttask_repeat_of` and the dedupe guard matches on that
link, not `name`; `count` decrements on spawn; `recurrence.ts` is deleted after
its tests are ported.

### Frontmatter / schema hygiene (MD)

- `[ ]` **MD-1 🔴 prefix the schema `ttask_*`** — the plugin's generic property
  names (`type`, `name`, `status`, `priority`, …) pollute the vault-wide property
  suggestion pool and collide with other plugins' conventions.
- `[ ]` **MD-2 🔴 sparse writes** — stop writing null/empty keys on creation;
  every task note currently carries the full key set whether used or not.
- `[ ]` **MD-3 🟡 stop persisting `blocks`** — it's a pure reverse index of
  `depends_on` and can be derived at load, which deletes the whole sync machinery
  and the `sync-blocks` command.
- `[ ]` **MD-4 🟡 one-shot vault migration + dev-command pruning** — a standalone
  `Scripts/migrate-prefixed-schema.mjs`, run once with Obsidian closed, does
  MD-1/MD-2/MD-3 plus the legacy-recurrence conversion, so **zero legacy code
  ships**. The dev-phase migration commands then get deleted.
- `[ ]` **MD-5 🟢 property registry cleanup** — hand-edit the vault's `types.json`
  (Obsidian closed) to drop the old generic entries; document recommended
  property types.

### Architecture (AR)

- `[ ]` **AR-1 🔴 the component→plugin coupling rule is violated by all ten legacy
  components** — every top-level component imports `TTasksPlugin`/`TaskStore`
  directly; they pre-date the rule. **Plan:** a `BoardContext` of
  callbacks/service refs, migrated component by component, each with a render test
  (TD-4).
- `[ ]` **AR-2 🟡 `TaskGraph.svelte` is a ~2,125-line god component** — schedule
  ahead of further graph polish work.
- `[ ]` **AR-3 🟡 the Task field schema is defined in four places** — they must be
  updated in lockstep. **Plan:** one descriptor table with `fmKey` /
  `omitWhenEmpty`, which MD-1/MD-2 and N3 both build on.
- `[ ]` **AR-4 🟡 `TaskWriter` mixes four concerns** — extract a
  `ChecklistSyncService`.
- `[ ]` **AR-5 🟢 smaller DRY / correctness items** — including the 8 duplicate
  ISO-date regexes (with DT-6).

### Testing posture (TD)

- `[ ]` **TD-3 🟡 coverage visibility** — no coverage reporting.
- `[ ]` **TD-4 🟢 component-test debt** — tracks AR-1; fold "add a render test"
  into each component migration.
- `[ ]` **TD-5 🟢 date/time determinism** — tests that depend on the wall clock;
  largely resolved by DT-1's `today` injection.

---

## Later — roadmap features

Roughly priority-ordered within each group; not committed.

**Power features**

- `[ ]` **Centralized notification + error-handling system, + desktop native
  notifications** 🔎 — *scoped 2026-07-21.* Notification firing is **fractured**:
  50+ ad-hoc `new Notice(...)` call sites, each building its message inline. The
  only shared helper is reminder-specific. **No code anywhere uses the
  native/Electron `Notification` API**, so nothing surfaces at OS level when
  Obsidian is backgrounded — presumably the itch behind the ask.
  - **Folded in:** the error/failure path is fractured the same way and worse —
    no single try/catch → log → notify helper exists. At least four inconsistent
    patterns coexist (`plugin.log()` + `Notice`; silent `console.warn` with no
    user feedback; `console.error` + `Notice`; and three separate mini-helpers
    each covering only their own call sites). Since centralizing `Notice` already
    means answering "how does a call site report a failure," this item covers
    both.
  - **Direction:** one `NotificationService` owning success/info/error variants
    that every call site routes through. On desktop additionally fire the
    Web/Electron `Notification` API with a click handler that focuses the window
    and navigates to the task. On mobile the API isn't available — gate behind
    `Platform.isDesktop`, mobile stays `Notice`-only. New setting defaulting
    **off** (it triggers a permission prompt).
  - **Still needs scoping:** which notification *types* get the native upgrade
    (Pomodoro phase-complete and due-date reminders are the obvious candidates;
    error/CRUD notices stay in-app).
- `[ ]` **Natural language quick capture** — parse `Fix bug #high due:tomorrow
  @Project blocking:abc123` from palette / status bar / mobile FAB. Unblocked
  (was gated on a stable filter engine).
- `[ ]` **Capacity-aware Today planner** — a "for today" flag independent of due
  date; suggest top tasks by `estimated_days` vs. available hours; overload
  warning. May overlap Cycles — design together.
- `[ ]` **Cycles / Sprints (investigate)** — time-boxed windows; pull tasks in,
  track velocity.
- `[ ]` **Obsidian ecosystem compatibility** — daily-note integration,
  Tasks-plugin `- [ ]` render, Dataview/Datacore schema compat, Templater hooks.
  **The Templater-hooks / "expose API" piece is the same work as N3** — dedupe
  when N3 lands.
- `[ ]` **Markdown code-block processor** — ```` ```ttasks filter:… ```` embeds a
  live task list in any note. High value if the plugin is ever published.

**Data-model expansion**

- `[ ]` **Activity log on tasks** — timestamped append-only log in the note body;
  auto-entries for status/creation/completion/recurrence; manual comments;
  renders as a detail-panel timeline. Pomodoro session logging is a first
  consumer — consider building the shared log here.
- `[ ]` **Milestones within projects** — zero-effort dated task that gates
  downstream deps; diamond node in the graph; markers on the timeline.
- `[ ]` **Icon/emoji field** for statuses/areas/labels — separate `icon` from
  `label` so compact views can be icon-only.
- `[ ]` **Eisenhower Matrix view** — 2×2 Important × Urgent; urgent from
  due-proximity, important from priority.
- `[ ]` **Sections within projects** — sub-grouping (`Design`/`Dev`/`QA`);
  investigate a `section` field vs. lightweight `parent_task` grouping.

**Small, still-open**

- `[ ]` **Kanban drag-to-reorder within a column** (priority ordering).
- `[ ]` **Card density toggle** (compact vs. detailed) — the per-card *field* set
  shipped; a density toggle did not.
- `[ ]` **Minor: `ImportConfirmModal` duplicates `confirmModal.ts`** —
  `confirmModal.ts` is a real shared helper, but `ImportConfirmModal`
  reimplements the same open/cancel/confirm shape as its own `Modal` subclass.
  Small, low-risk, not blocking anything.

**Deferred / investigate later** (parked, needs a design or a precondition)

- `[ ]` **Evening review modal** (GTD clarify) — needs the Capacity planner first.
- `[ ]` **Workload view** — needs a real multi-user `assigned_to` story.
- `[ ]` **Habit tracking** — arguably its own plugin; revisit post-core.
- `[ ]` **CodeMirror embed / true Live Preview in detail** — deferred (mobile
  keyboard risk).
- `[ ]` **Mobile authoring toolbar** — floating row above the keyboard; deferred
  (WKWebView complexity).
