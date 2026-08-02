# TTasks — Development History

The dated journal of what shipped and **why decisions went the way they did**.
Consolidated 2026-08-02 from the former `ROADMAP.md`, `CLAUDE.md`'s "Recent
Updates" sections (which had drifted into two parallel journals of the same
events), and the eight closed-sweep files that lived in this directory.

This is history, not a work registry. **Open work lives in `PROJECT.md`.** An
unchecked box quoted here is historical — do not treat it as live.

Full detail for anything summarized here is recoverable from git.

---

## 2026-08-02 — Docs consolidated; Node moved off EOL runtimes

- **Four live docs became two.** `BACKLOG.md` (1332 lines), `ROADMAP.md` (1032),
  `AUDIT_2026-07.md` (809), and `CLAUDE.md` (959) totalled ~4,100 lines with
  heavy duplication — CLAUDE.md's "Recent Updates" and all of ROADMAP.md were
  **two dated journals of the same events**, with near-identical checkpoint
  dates. Now: **`PROJECT.md`** is the single live doc (status + all open work +
  the audit's rationale), **`CLAUDE.md`** is conventions and workflow only, and
  this file holds the history. The eight closed-sweep files in
  `Scripts/archive/` were folded in below.
- **Node: dropped two end-of-life runtimes.** The CI matrix and the declared
  `engines` floor both pointed at **Node 20, which went EOL 2026-04-30**, and the
  dev box was running **Node 25, EOL 2026-06-01**. Neither receives security
  patches. Verified `npm run check` green on Node 24 (1645 tests) before
  changing anything. Matrix is now **22 + 24** — 22 is the new `engines` floor
  and is supported to 2027-04, 24 is the active LTS. Added `.nvmrc` (24). The
  machine's global Homebrew default was deliberately left alone, since it
  affects unrelated projects.
- **Server checkout verified end-to-end.** Fresh clone on a box with no
  Obsidian, no vault, and no symlink: `localPaths` resolved all three
  machine-local paths to `null`, `rig:sync-css` fell back to git sources
  (`obsidian-releases` 1.13.4 asar → 635 KB `app.css`; `seniblue/Underwater` →
  122 KB theme — byte-identical to the sizes the local path produces), the rig
  booted, and `/__vault.json` degraded to `{files: []}` so the fixture fallback
  took over. Screenshots are the one gap: no browser is installed.

---

## 2026-07-31 — CI + release automation; portable dev environment

**CI and releases landed (closes audit TD-1 🔴; PB-1 down to just the README).**
The stated blocker was gone — `origin/main` was no longer a divergent history —
and Taylor's call was to build it now regardless of whether the phone ends up fed
by Sync or BRAT: *"either way we should be pushing releases while we're in dev
mode."*

- **`ci.yml`** — `npm ci && npm run check` on push to `main`, every PR, and
  manual dispatch, across a Node matrix. The matrix exists so the `engines`
  claim is *verified* rather than merely restated. `concurrency` cancels
  superseded runs. **No CI special-casing was needed** for the vault copy:
  `localPaths.VAULT` resolves to `null` when no candidate path exists, and
  `vaultCopyPlugin` already treats that as a silent no-op.
- **`release.yml`** — fires on a bare semver tag, re-runs `check` (a release
  build is the one that reaches devices), then attaches `main.js` /
  `manifest.json` / `styles.css` via `gh release create --generate-notes`. It
  **fails before building** if the tag ≠ `manifest.json`'s version, or if
  `versions.json[tag]` ≠ `minAppVersion` — the submission checker enforces the
  first and BRAT resolves releases the same way, so a mismatch is caught at the
  cheapest point instead of producing a release nothing can install.
- **Release ergonomics** — `version-bump.mjs` syncs package.json → manifest.json
  → versions.json (2-space + trailing newline, so a bump diffs as one line, not a
  reformat) and rejects anything that isn't bare semver; the `version` npm script
  stages both files into the version commit; `.npmrc`'s `tag-version-prefix=""`
  stops `npm version` minting a `v`-prefixed tag in the first place — belt and
  braces with the workflow's check.
- **Both workflows verified live.** CI green on both matrix legs (~1m10s each;
  `checkout`/`setup-node` bumped v4 → v5 to clear a deprecation annotation).
  Then **`0.1.1` was cut deliberately to exercise the release path** — identical
  plugin code to `0.1.0`, since only CI and docs had changed; the point was to
  find a broken pipeline before needing it. Only the guard's **happy path** is
  CI-proven — deliberately not tested against a mismatched tag, since a broken
  guard would publish a junk release to prove the point.

**Dev environment made portable** (prep for a server checkout + the BRAT
handover). Goal: run this repo on a box with no Obsidian, no vault, no symlink.
`src/`, esbuild, vitest and eslint were already clean — the whole problem was the
visual rig, which hard-failed on any machine but Taylor's.

- **`test-rig/vendor/` is gitignored but was imported statically**, so a fresh
  clone died at vite resolve time before rendering anything. New `vendorCss.mjs`
  writes a marked empty stub for whichever file is missing and warns — the rig
  boots, structure and behaviour are real, only Obsidian's look is absent
  (explicitly *not* sign-off-worthy).
- **CSS now has a git source, not just a local-install one** (Taylor: "vault will
  not be on the server, source these elsewhere like the git repos"): `app.css`
  falls back to `obsidianmd/obsidian-releases`' `obsidian-<v>.asar.gz`, and the
  theme falls back to `seniblue/Underwater`.
- **New `test-rig/localPaths.mjs`** is the one place that knows machine-local
  paths, each with an env override. An override wins even when the path is
  missing **so typos fail loudly**, and **set-but-empty means "absent"**, which
  is how a machine with a vault reproduces the server's vault-less behaviour.
- **Browser resolution unified** — `shots.mjs` and the skill driver had duplicate
  hardcoded lists (with a "keep in sync" comment); now one resolver that scans
  `.browser/` and probes Windows/macOS/**Linux** paths.
- **`vite` was undeclared**, resolving transitively through vitest; now a real
  devDependency.

**The vault install became a real folder, NOT a symlink — do not recreate the
symlink.** `.obsidian/plugins/ttasks` used to symlink to this checkout, which
pointed **Obsidian Sync at the entire repo**: 827 MB `test-rig` + 212 MB
`node_modules` + 9.7 MB `.git`, to deliver a 1.4 MB plugin. That was the
long-standing **mobile deploy blocker** — the phone wasn't failing to load fresh
builds so much as Sync was never finishing, which is why the symptom read as
"*fresh* builds don't arrive" rather than "plugin missing." The 2026-07-19
guesses (plugin-sync disabled, mobile JS cache, app-kill needed) were all wrong.

Replaced with a `vaultCopyPlugin` esbuild `onEnd` hook copying `main.js` /
`manifest.json` / `styles.css` into the vault — deliberately **never
`data.json`**, which is Obsidian's, holds user settings, and syncs between
devices. **`npm run build` is the deliberate "publish to my devices" step;
`npm run dev` no longer touches the vault at all**, because a watch rebuild is a
3.85 MB inline-sourcemap bundle vs 1.37 MB for prod — copying on watch would push
a multi-megabyte Sync upload at every save and land unfinished builds on the
phone mid-edit. There is no live-reload link any more; rebuild to deploy.

**Released `0.1.0` + GPL-3.0 licensed.** First tagged release so BRAT can install
betas. **Not** submitted to the community plugin list — Taylor's line is GitHub
releases yes, `obsidianmd/obsidian-releases` not yet. LICENSE is verbatim GPL-3.0;
Obsidian requires *a* LICENSE but prohibits no type, and all five bundled deps are
MIT/ISC/0BSD, so GPL-compatible.

---

## 2026-07-25 — Recurrence drift fixed; the audit folded into the backlog

**Recurrence drift (audit RP-1 / DT-3 🔴).** A month-end recurring task
permanently collapsed onto February's day: Jan 31 → Feb 28 → **Mar 28 → Apr 28 …**
forever, because each occurrence was computed from the previous *already-clamped*
date instead of from the schedule's anchor day. The drift was even **codified as
an expected-behaviour test**, which is why it survived.

- `advanceDate(date, rule, anchorDay?)` now clamps **per-occurrence** instead of
  cumulatively. Omitting the anchor reproduces the old behaviour exactly, so every
  pre-existing test still passed unchanged — including two encoding deliberate
  intent (`Feb 29 monthly → Mar 29`, `Feb 28 yearly stays Feb 28`).
- Those two tests are also **why a month-end heuristic was rejected**: without a
  real anchor you can't distinguish "monthly on the 31st, clamped" from "monthly
  on the 30th", and guessing month-end mis-fires on a genuine 29th/30th schedule.
  Taylor picked the persisted-anchor option.
- New pure `deriveAnchorDay(dueDate)` and a **`recurrence_anchor_day`**
  frontmatter field, derived whenever `due_date` is written *without* an explicit
  anchor (so a manual reschedule redefines the schedule) and passed **explicitly**
  by `completeAndRecur` and `buildDuplicateInput` so a clamped occurrence never
  re-derives a wrong anchor — that re-derivation *is* the bug. Written only for
  recurring tasks; kept out of `TASK_FIELD_DEFINITIONS` because it's derived, not
  user-editable.
- Result: Jan 31 → Feb 28 → **Mar 31** → Apr 30 → May 31, stable over 12 months.
  Tasks predating the field fall back to their due date's own day. **+50 tests.**

**`AUDIT_2026-07.md` was an untracked second registry.** It held 🔴
pre-publication items that `BACKLOG.md` — the self-described "single live backlog
for all open work, every horizon" — didn't list at all. The repeat redesign that
RP-1 was nominally waiting on wasn't scheduled anywhere. All open items were
indexed into the backlog. *(Both files are now merged into `PROJECT.md`.)*

**Lint cleared + a real local gate (audit TD-2).** Lint had been failing with
**50 `no-mixed-spaces-and-tabs` errors** — up from 10 at audit time, because it
ran in neither CI nor the local gate. Every one was the same thing: a comment
**continuation** line indented with tabs *then* spaces to align prose under the
opening delimiter. Cleared them the way an earlier commit already had — a
continuation takes the opening line's tab depth and no spaces — which is
**comments only**: exactly 50 insertions / 50 deletions, no code, selector, or
markup change. Added **`npm run check`** (`lint && build && test`) so the three
gates run as one and this can't drift again.

---

## 2026-07-22 — Share/Sync payloads, detail-pane clipping, frontmatter types

**Share/Sync: TOON payload, notes policy, graph framing, per-item review.**
Started as "can we add TOON?" and became an evaluation first — TOON, YAML, NDJSON,
CSV/TSV, markdown table and minified JSON all measured against a real 100-task
export with a real tokenizer. Two findings drove the design:

1. **Note bodies were 62% of the export** (24,372 of 39,278 tokens) — a bigger
   lever than every format choice combined.
2. **TOON as-is saves 7%, not the advertised ~40%**, because its tabular form
   needs uniform keys and scalar cells, while the 'ai' export prunes empty fields
   and carries array fields. Filling the keys but keeping arrays measured **-0.5%**.

Shipped: a **`notesPolicy`** control (Full / First 200 chars / Omit) — **safety,
not sizing**, because a truncated body must never come back as a replacement or it
overwrites the real one with a fragment. **TOON as an export-only payload
format** — deliberately export-only, since a sparse reply can't be tabular and its
decoder hard-throws on a miscounted `[N]`, a 4-space indent, or an unquoted comma.
CSV/TSV were marginally smaller and rejected: no self-description, bespoke parser,
can't carry `meta`. **Graph framing** in every preset, telling the AI the export is
a dependency graph, not a flat list. **Per-item import review** — every plan bucket
flattened into keyed, rejectable rows.

Measured end-to-end through the shipped code on a 108-task vault: JSON+full
**50,821** tokens → TOON+full 43,243 (**-15%**) → JSON+omit 14,775 (**-71%**) →
TOON+omit 6,579 (**-87%**).

Earlier the same day: **message presets + packaging** (five presets over an
editable textarea; a **Copy as** control with One block / Two fields / JSON only),
**last-used memory**, and **notes + projects on import** — `notes` already worked
on creates while the meta claimed otherwise; `meta.projects` finally told the
receiving AI that `type: "project"` exists.

**Detail sidebar clipping fixed.** Narrowing the detail leaf to 300 px on a
1280 px viewport left its content 413 px wide, silently cut off by
`overflow-x: hidden`. Three separate "floors at min-content" causes:

1. The field grid's two-column → one-column collapse was gated on
   `@media (max-width: 768px)`, which reads the **viewport**, not the resizable
   pane — so labels rendered one character per line on desktop. Re-keyed to a
   **container query**, threshold **360 px** measured (not guessed) so the default
   440 px sidebar keeps two columns; the old media query kept as a
   pre-container-query fallback.
2. The P5 centering rule left the relationship tree at max-content, so one long
   task name sized the section to 527 px. The tree chips are `<button>`s
   inheriting app.css's `nowrap` — the **theme-specificity trap** — and now wrap.
3. `minmax(0, 1fr)` tracks + `min-width: 0` on grid and flex items.

Rig-swept by leaf width: **zero clipped elements from 220 px up** (was 31 at
300 px).

**Frontmatter type-handling audit.** Hardened the whole frontmatter → Task
boundary against Obsidian's **native property types** — retyping a property in the
Properties UI rewrites that field vault-wide, and every mismatch was **silent data
loss**:

- A Text-typed list (`labels: feature`) was dropped by an `Array.isArray` guard.
- A List-typed scalar (`area: [Work]` → Inbox; `status: [In Progress]` → reset to
  default; `name: [Ship it]` → empty) failed a `typeof === 'string'` check.
- `type` and `priority` were unchecked `as`-casts, so `type: [project]` made a
  project read as a task everywhere.
- Numeric/boolean fields were exact-type-only, so a quoted `"4"` reset a count.

Fixed with new pure coercion helpers including a closed-set
`toFrontmatterEnum` (exact-then-case-insensitive, so a hand-edited
`priority: high` now resolves). The **write side is deliberately unchanged** — the
plugin still writes canonical shapes, and Obsidian re-normalizes on its next
write. **+39 tests.**

**Graph: add a blocker/parent from a node.** Each node gained a **left-side `+`**
mirroring the right-side "add dependent". Implemented via a symmetric
`initialBlocks?: string[]` option — after the blocker is created it calls
`taskStore.addDependency(target, newTask)`, so `blocks` syncs through the
canonical write path, honouring the "blocks is always derived" convention.

---

## 2026-07-21 — Pomodoro drift; centralized filtering

- **Pomodoro backgrounding drift fixed.** `tick()` decremented by a fixed 1 s per
  `setInterval` firing, but browsers throttle intervals in backgrounded windows,
  so the countdown fell behind real time. Every running phase is now anchored to a
  **wall-clock instant** and each tick derives the remainder from `Date.now()`, so
  a starved interval catches up. Pause freezes; resume re-anchors. Note: if the
  machine sleeps through an entire focus phase, the phase is logged and advanced
  on the first wake tick rather than fast-forwarded through multiple phases.
- **Agenda date-range filter, then centralized the same day** (Taylor: *"try and
  centralize this sort of filtering logic and reuse it across views"*). New
  inclusive `on_or_after`/`on_or_before` operators — `before`/`after` were kept
  strictly exclusive because they're already relied on elsewhere with that
  meaning. The ad-hoc toolbar-filter logic moved into a pure, tested
  `boardFilters.ts`, mirroring the existing `boardQuery.ts` pattern. Widened from
  Agenda-only to List + Kanban + Agenda; Graph and Archive/Logbook excluded
  (relationship-first / `completed`-not-`due_date`).

---

## 2026-07-20 — Taylor's feedback batch (10 of 22 triaged and shipped)

Picked off the clearly headless-workable items; left taste-call (⚖) and
research-needed (🔎) items open.

- **List views** — Group-by/Sort-by toolbar controls for any list-rendered view,
  covering three separate asks **in one general mechanism rather than three
  special cases**. Today's filter gained an OR branch for the configured start
  status; Agenda's date-bucket grouping gained `activeStatusBucket` so an
  in-progress task reads as "today" regardless of due date *unless already
  overdue* (that stays the more urgent signal). New pure `taskReadiness.ts`
  stable-partitions Today so ready-to-work tasks float above blocked ones.
- **Dependency graph** — Independent lane shown by default; the "Ready now"
  highlight clears when you open the highlighted task; a completed dependency's
  edge renders muted green (investigation found edges weren't actually
  priority-coloured as reported — the signal was simply missing); the Projects
  popover gained a capture-phase click-outside listener.
- **Share/Sync** — the importer required a `name` on every entry even when a
  `ref` alone should suffice, contradicting the AI meta's own instructions — a
  real bug, now accepts ref-only entries. The AI export's meta now embeds this
  vault's configured statuses/priorities/areas/labels so a replying AI picks real
  values instead of inventing them.
- Also discovered the backlog's "relationships not imported" limit note was
  **stale** — relationship import had already shipped; corrected the doc.

---

## 2026-07-18/19 — Graph polish, colour model, Pomodoro expansion, Share/Sync

**GP1 — fullscreen expand modal.** The graph was near-useless in its cramped
in-board leaf on phones. Research first: the native pop-out
(`moveLeafToPopout`/`openPopoutLeaf`) is **desktop-only and throws on mobile**, so
it can't serve the mobile goal; the chosen mechanism is a **fullscreen `Modal`**,
which works on both. Opening a task closes the modal first so the detail drawer
doesn't sit behind it. Esc and the phone back gesture close it now that
`Modal implements HistoryHandler` in obsidian 1.13. Also bumped obsidian typings
1.12.3 → 1.13.1 (was resolving stale under `"latest"`).

**GP7 — Dependency and Timeline split into two rail views.** The in-view toggle is
gone; each view is locked to its `graphMode`. Because both use the same renderer,
switching rail entries keeps the same component instance and just updates the mode
through the existing reactive prop sync. Per-view persistence was free — the
active view id already rode on N2's `getState`/`setState`.

**GP8 — lane focus.** GP4's always-on swim-lane tint became on-demand: a lane's
tint shows only while active (hovered on desktop, or pinned by interaction). Other
lanes recede — **except** tasks connected to the active lane's dependency chain,
which stay in focus while their own lane gets a softer tint.

**GP5 — partly landed, partly backed out.** The `+` add-subshape shipped. A first
rev made the header body a pin toggle that grew the pinned lane to reveal its full
vertical title (block-flow + `height:auto`, since a flex column mis-measures a
vertical-writing-mode child's block size); Taylor felt it was *"not that nice…
come back and tune later,"* so both the pin-toggle and the grow were reverted.

**GP3 — project filter.** Hidden projects are removed *before* connectivity is
computed, so a satellite that only linked to a hidden project drops with it.

**Colour-model workshop → V2 "colour spine".** Status/area/label colours were
competing on cards. Baseline + 3 rig-rendered variants were shipped as a
self-contained artifact; Taylor picked **V2**. Shipped model: **identity colour
moves off the badges onto the card/row left edge**, keyed to the task's project
`area`, so the badge row stays monochrome. The list row uses an inset `box-shadow`
rather than a real border so row content stays aligned with group headings instead
of shifting 3 px. **The solid-red overdue slab and solid-green completed slab
soften to tints** — that date slab was the single loudest offender, out-shouting
the area it was supposed to sit under.

**P2-8 — overdue red softened, badge-only.** Overdue also painted the **whole task
name** red, which shouted when several piled up in a column. Chose badge-only; the
alternative (a red left edge) was rejected because the area-colour spine now owns
that edge and a red bar would fight it.

**Pomodoro expansion.** Untethered sessions (no task); an RFC-4180 **CSV session
log**; **"focus until X:XX"** via a pure planner that fills whole cycles plus a
shortened final focus so nothing runs past the target; a **dedicated pane**; a
desktop **status-bar countdown** (driven by subscribing to the existing 1/s
session tick — no second interval); and **log-partial-on-stop**, where stopping
mid-focus logs elapsed minutes as a partial that adds to `focused_minutes` and
writes a CSV row but does **not** bump `pomodoro_count` — a stopped session isn't
a completed pomodoro.

**Share/Sync shipped** (JSON import/export). Export: mode toggle + toggle-chip
filters + live count + copy/save. Import: paste → preview → apply, matching by
(type, case-insensitive name), with only set/change semantics — **never clear from
an omitted value**.

**Docs reconcile.** Removed the backlog/roadmap coverage seam; BACKLOG became the
single all-horizons registry with a new `Later` tier, and ROADMAP was demoted to a
dated journal. *(Both since merged into `PROJECT.md` and this file.)*

---

## 2026-07-04 → 2026-07-12 — Bugfixes, Autopilot A–I, native workspace

**Autopilot batches A–I** (an unattended execution queue; each session ran exactly
one batch then stopped, with a driver script starting the next):

- **A** — detail-pane centering + top/bottom actions + native `addAction` header
  buttons on all three leaves.
- **B/C** — kanban collapsed one-line header, inset selected-row highlight, and a
  conservative list-row visual pass.
- **D/E** — jump-to-task fuzzy switcher, protocol `action=jump` + new-task prefill
  + `PROTOCOL.md`, view-state persistence via `getState`/`setState`, and a richer
  status bar.
- **G** — graph pinch-zoom + touch targets; zoom-edge detach fixed (root cause was
  `.tt-graph-stage min-width`).
- **H** — `API_DESIGN.md` + Taylor's decisions on its five open questions.
- **I** — the C2 layout workshop; Taylor greenlit **V1 Compact + F1/F4/F5**
  (satellite unassigned lanes), which landed.

**Bugfix report #1–#13** (Taylor's 2026-07-04 pass): the detail pane now derives
its task from the store (fixing "Task Not Found" on create) and `TaskWriter.update`
applies an optimistic in-memory patch so edits propagate without waiting on a
metadata rescan; selected rows use an accent tint distinct from hover grey; a
universal `holidays` list + per-area workweek toggle threaded through the
working-day math; graph tooltips moved from native `title=` to `aria-label` (no OS
tooltip during pan/zoom); clicking a graph node pins its chain highlight.

**Native three-pane workspace (N1–N6)** — rail / board / detail render as
workspace leaves with native header buttons, layout persistence, a fuzzy switcher,
protocol handling, and a status bar.

---

## 2026-04 → 2026-05 — Foundations (Streams D–K, Phases 1–7)

Condensed; full detail in git.

- **Phases 1–4** — task store over the vault API, list view, create/edit modal,
  detail panel; kanban, mobile layouts, search/filter; ID collision-safe creation,
  relationship safeguards, configurable categories, lint + store tests; dependency
  graph, due-date reminders, quick actions; derived `is_complete`/`is_inbox`,
  delete confirm, `status_changed` + stale-progress tracking, task duplication.
- **Phase 6 — data model + smart lists** — `area` replaced `category`, `labels[]`
  replaced `task_type`, a shared query engine (`filter`/`sort`/`group`/`limit`/
  `search`), agenda date buckets moved into shared grouping, persisted Smart Lists
  with a Builder + JSON query editor.
- **Phase 7 — archive infrastructure** — `ArchiveService`, auto-archive, archive
  view, logbook, migration command.
- **Streams D–G** — kanban card fields + column collapse; multi-select batch ops +
  keyboard shortcuts; graph lane sidebar headers + accessibility; reminder snooze
  + per-task override.
- **Stream H** — component test coverage and `BoardStateService` extraction.
- **Stream I** — the capture/promote pipeline: pure parsers (checkbox, emoji
  fields, filename dates), capture-source configuration with auto-detection, a
  pure `fileScanner` + `ScanEngine`, promote + completion-sync (so completing a
  promoted task updates the `[ ]`/`[x]` in its source line), and one-shot bulk
  import.
- **Stream J** — boundary hardening, constants extraction, `ReminderService`
  decomposition, a performance slice (bounded concurrency + an O(1) `getByPath`
  index), a DRY slice, and type-safety cleanup removing unsafe casts from
  `main.ts`.
- **Major decompositions** — `TaskStore` 900 → 596 lines (extracting
  `TaskMigrations`, `TaskRelationships`, `TaskWriter`); `settings.ts` 1869 → a
  35-line re-export shim; `TaskDetail.svelte` 1381 → 721 lines.

Test-count trajectory: 553 (2026-05-14) → 961 → 1060 → 1114 → 1241 → 1261 →
1436 → 1511 → 1616 → **1645**.

---

## Closed sweeps

These ran as their own task files and are all fully closed. Summarized here;
originals in git.

| Sweep | Scope | Outcome |
| --- | --- | --- |
| **Audit Sweep 2** (2026-07-02) | Date handling in dependency chains, interface consistency across views, DRY/SOLID cleanups (A1–A6, B1–B3, C1–C6, D1–D7) | ✅ complete |
| **Design & Style Audit** (2026-07-02) | P0-1…P0-6, P1-1…P1-6, P2-1…P2-7 — the design-system overhaul that produced the token set and shared primitives | ✅ complete; P2-8 closed 2026-07-19 |
| **Bugfix report** (2026-07-04) | #1–#13 from Taylor's pass | ✅ #1–#8, #10, #12, #13 shipped; #9/#11 carried into Autopilot G and I |
| **UI Polish + Settings overhaul** | P1–P7, C1, C2 | ✅ complete |
| **Native Obsidian integration** | N1–N6 | ✅ complete; N3 (public API) and N7 (Bases) remain gated on Taylor |
| **Autopilot** | The A–I unattended batch queue | ✅ complete 2026-07-09 |
| **Graph Polish** | GP1–GP8 | ✅ GP1/GP2/GP3/GP4/GP6/GP7/GP8 landed; GP5 partly (see `PROJECT.md`) |
| **Graph layout C2 workshop** | Density/layout variant study | ✅ V1 Compact + F1/F4/F5 greenlit and landed; **C2-F2 still open** — pulling source-only nodes rightward changes what a column *means* and can perturb the 0-crossing layout |
| **Modal & detail exploration** (2026-05-19) | Mapped create/edit modal and detail-pane components, fields, and inconsistencies | ✅ fed the UI polish sweep |
