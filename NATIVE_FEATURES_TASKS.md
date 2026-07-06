# TTasks — Native Obsidian Integration Tasks (handoff)

Created: 2026-07-04. Approved by Taylor; specced for handoff to another model.

**Ground truth first:** three items in this stream already partially exist —
the `ttasks://` protocol handler (`src/integration/protocol.ts`, registered
`src/main.ts:454-466`), the desktop status bar summary (`src/main.ts:512-528`),
and file/editor/multi-select context menus (`src/main.ts:468-510`). Tasks N5,
N6 extend those; don't re-implement them. `TaskLinkSuggestModal`
(`src/editor/TaskLinkSuggestModal.ts`) is an insert-link suggester, not a
navigator — N4 reuses its pattern.

Conventions: all vault access via `this.app.vault` / `fileManager`; new pure
modules go in `src/integration/` or similar and get added to
`architectureBoundaries.test.ts` in the same commit; `npm run build` + full
suite green before closing each item; UI-touching items get a mobile check.

Legend: **[NEW]** greenfield · **[EXTEND]** builds on existing code ·
**[PLAN-FIRST]** produce a design for Taylor's sign-off before implementing.

---

## N1. [DONE] [NEW] View header actions on the three leaves

**[DONE 2026-07-04, Batch A]** Board: `plus` → CreateTaskModal, `refresh-cw` →
`taskStore.load()`. Rail: `plus` → `addSmartList`. Detail: done in P6 (see
UI_POLISH_TASKS.md) — reactive complete/reopen + open-in-editor. Mobile drawer
rendering not verified live (rig has no leaf chrome); only 1-2 actions per
leaf so crowding is unlikely — check on iOS when convenient.

**What:** Native icon buttons in each leaf's header via `ItemView.addAction()`.

**Where:** `src/views/TaskBoardView.ts`, `TaskDetailView.ts`,
`TaskRailView.ts` — none currently call `addAction` (verified).

**Spec:**

- **Board leaf:** `plus` → open `CreateTaskModal`; `refresh-cw` →
  `taskStore.load()` rescan (useful after external sync).
- **Detail leaf:** `check` → mark complete / reopen depending on
  `task.is_complete`; `pencil` → open in editor. **This is the same work as
  UI_POLISH_TASKS.md P6 part 1** — implement once, there. N1 only adds the
  board/rail actions and cross-references P6.
- **Rail leaf:** `plus` → new Smart List (reuses
  `views/smartListActions.ts`).
- Actions must react to state (detail's complete-icon flips on task change —
  subscribe to `boardState.activeTaskPath` + store; remove/re-add via
  `actionEl.detach()` or toggle a class).
- Mobile: header actions surface in the drawer header — verify they render
  and fit; drop low-value ones on `Platform.isMobile` if crowded.

---

## N2. [DONE] [NEW] View state persistence (`getState`/`setState`)

**[DONE 2026-07-06, Batch E]** `TaskBoardView` now overrides
`getState()`/`setState()` to snapshot/restore `boardState.currentViewId` (the
one id that covers both view mode and Smart List); `setState` guards unknown /
deleted ids via `resolveTaskViewDefinition` and falls back to the default.
`TaskDetailView` snapshots/restores `activeTaskPath`, applied **optimistically**
(store loads async, so the reactive derivation resolves it; a permanently
missing path just shows empty state). Both leaves call
`app.workspace.requestSaveLayout()` when their state store changes, skipping the
initial subscribe emit so merely opening a leaf doesn't churn the layout. State
stays small/serializable (ids and a path only). Duplicate-leaf behaviour: state
lives in the shared `BoardStateService`, so `getState` just snapshots it and
last-restore wins — acceptable per spec.

**What:** Workspace-native persistence so Obsidian's layout restore reopens
the same view mode, Smart List, and selected task after a restart — and saved
workspace layouts round-trip.

**Where:** The three views in `src/views/` (no `getState`/`setState`
overrides today). Runtime state lives in plugin-owned `BoardStateService`
(`src/store/BoardStateService.ts`) — `activeViewMode`, active Smart List,
`activeTaskPath`.

**Spec:**

- `TaskBoardView.getState()` returns `{ viewMode, smartListId, filters? }`;
  `setState(state, result)` applies it to `BoardStateService` (guard against
  unknown/deleted Smart List ids — fall back to default view).
- `TaskDetailView.getState()` returns `{ taskPath }`; `setState` restores
  selection if the task still exists (`taskStore.getByPath`), else empty
  state. Careful with startup ordering: the store loads async — `setState`
  may run before tasks are parsed, so apply the path optimistically and let
  the reactive derivation (shipped in yesterday's #3 fix) resolve it.
- Call `this.app.workspace.requestSaveLayout()` when board state changes
  (debounced — piggyback on existing state-change notifications rather than
  per-keystroke).
- Keep state serializable and small; no Task objects, only paths/ids.
- Test: restart Obsidian with a Smart List + task selected → same view
  restores. Also verify duplicate-leaf behavior (two board leaves shouldn't
  fight — BoardStateService is shared, so decide: shared state is fine,
  `getState` just snapshots it).

---

## N3. [PLAN-FIRST] Public API for other plugins

**What:** A stable, versioned API surface other plugins/scripts (Templater,
QuickAdd, Dataview-JS, community plugins) can consume via
`app.plugins.plugins['ttasks'].api`. **Deliverable for this task is a design
document (`API_DESIGN.md`) for Taylor's review — do not implement yet.**

**Raw material:** nearly everything exists as methods on `TaskStore`
(`src/store/TaskStore.ts:53-259` — `getByPath`, `getAll`, `create`, `update`,
`setStatus`, `completeAndRecur`, `addDependency`, `duplicate`, `openDetail`,
`openFile`, the `tasks` writable) and the shared query engine (`src/query/`).
The API layer is a curated, frozen façade over these — not new capability.

**Design the doc around:**

- **Versioning:** `api.version` (semver string) + additive-only policy;
  document what's stable vs experimental.
- **Read:** `getAllTasks()`, `getTask(path)`, `queryTasks(query)` (reuse the
  Smart List query schema — filter/sort/group/limit/search), all returning
  deep-frozen/cloned `Task` snapshots so consumers can't mutate store state.
- **Subscribe:** `onTasksChanged(cb): () => void` wrapping the `tasks`
  writable (return an unsubscribe; document that it must be called in the
  consumer's `onunload`).
- **Write:** `createTask(input)`, `updateTask(path, updates)`,
  `completeTask(path)`, `setStatus(path, status)`,
  `addDependency(path, depPath)` — thin wrappers that reuse existing
  validation (dedupe/self-reference guards from Phase 2.5).
- **UI:** `openBoard()`, `openTask(path)`, `openCreateModal(prefill?)`.
- **Types:** export a standalone `TTasksApi` + `Task` type declaration
  consumers can vendor (consider publishing a tiny `ttasks-api` .d.ts or a
  documented `types.ts` copy) — no Obsidian type imports in the public
  surface.
- **Protocol parity:** which API actions also deserve `ttasks://` endpoints
  (see N5) — e.g. `action=search&query=`; note Advanced-URI-style
  `x-success` callbacks as a possible later addition.
- **Non-goals:** no bulk/migration endpoints, no settings mutation, no
  archive control in v1.
- Include 3 worked consumer examples: a Templater snippet creating a task
  from a note, a QuickAdd capture, a Dataview-JS listing of `queryTasks`.

---

## N4. [DONE] [NEW] "Jump to task" fuzzy switcher

**[DONE 2026-07-05, Batch D]** `TaskJumpSuggestModal` (`src/editor/`) uses
native FuzzySuggestModal scoring over `name + area + labels` (name first);
priority dot (hidden for None, per P2) + status · area meta row, styles in
`styles.css`. Command `jump-to-task`; selection → `taskStore.openDetail`.
Took the spec's "simplest v1" option: open tasks only (archived never reach
the store; completed excluded — revisit with a ✓-marked variant if Taylor
misses them). Accepts an initial query for N5's `action=jump`. No shared base
extracted from TaskLinkSuggestModal — the two modals share no meaningful
logic (link modal uses custom prefix filtering; this one native fuzzy).

**What:** A command (`TTasks: Jump to task…`) opening a `FuzzySuggestModal`
over task names; selecting a task opens board + detail.

**Where:** Pattern to copy: `src/editor/TaskLinkSuggestModal.ts` (already a
task-picking suggest modal — it inserts a link; this one navigates).
Commands are registered in `src/main.ts:95-188`. Open behavior:
`taskStore.openDetail(path)` (`TaskStore.ts:209`) already reveals the detail
leaf.

**Spec:**

- Search over `name`, secondarily area/labels (FuzzySuggestModal's
  `getItemText` can concatenate; keep name first so it dominates match
  ranking).
- Exclude archived; include completed but ranked/marked (suffix `✓` or
  muted styling via `renderSuggestion`) — or simplest v1: open tasks only,
  matching Taylor's daily flow.
- Show priority dot / status as text in the suggestion row (Lucide via
  `setIcon`, per CSS conventions).
- Consider extracting shared "task suggest" base from
  `TaskLinkSuggestModal` if duplication is real, per DRY conventions —
  but only if it stays simple.
- Mobile: command palette + consider adding to the mobile hold/quick-action
  surface later; not required for v1.

---

## N5. [DONE] [EXTEND] Protocol handler — search/list endpoint + docs

**[DONE 2026-07-05, Batch D]** `action=jump` (+ `search` alias, optional
`query=`) opens the N4 switcher pre-filled. `new-task` now accepts
`name`/`area`/`due` (alias `due_date`; validated `YYYY-MM-DD`, invalid
dropped) passed to `CreateTaskModal` prefill (added `name` to its prefill
options) — never writes without the modal. `parseProtocolAction` stays pure
(added to `architectureBoundaries.test.ts`); `protocol.test.ts` extended
(parse + dispatch for jump/prefill). Docs: new `PROTOCOL.md` (no README
exists) covering every action with example URLs. Reminder check: verified —
`ReminderService` only emits aggregate summary notices (counts, not
per-task); its Open action deep-links board → agenda via
`buildReminderNotice`, so there is no per-task notice to wire to
`openDetail`. If per-task reminder notices land later, give them an Open
action calling `taskStore.openDetail(taskPath)`.

**What:** The `ttasks://` handler exists with `open-board`, `open`,
`new-task`, `new-project`, `quick` (`src/integration/protocol.ts:49-80`).
Extend it and document it.

**Spec:**

- Add `action=jump` (or `search`) with optional `query=` — opens the N4
  fuzzy switcher pre-filled, giving external tools a "find a task" entry
  point without knowing paths.
- Add `action=new-task&name=…&area=…&due=…` prefill params passed through to
  `CreateTaskModal` (currently opens blank — `main.ts:460`). Validate/ignore
  unknown params; never write directly from a URL without the modal.
- Keep `parseProtocolAction` pure + tested (`protocol.test.ts` exists —
  extend it).
- **Docs:** add a "URI scheme" section to the README (or `PROTOCOL.md`)
  listing every action with an example URL — this is the contract external
  tools (and N3's API doc) reference.
- **Reminder integration check:** `ReminderService` notices are click-to-act
  via `buildReminderNotice` — verify each reminder notice deep-links to its
  task (uses `openDetail`, not just the board); wire through if not.

---

## N6. [DONE] [EXTEND] Status bar — richer summary + configurable click

**[DONE 2026-07-06, Batch E]** `buildStatusSummary` (pure) now returns
`dueToday` / `overdue` / `inProgress` / `blocked` counts plus a four-line
`tooltip`; `label` stays urgency-only (overdue + blocked) to keep the bar text
compact. `updateStatusBar` sets the tooltip via `setTooltip`, toggles
`.ttasks-statusbar-warning` (theme `--color-red`) when overdue > 0, and
`.ttasks-statusbar-hidden` when the new hide-when-zero option is on and nothing
is urgent. The inline `style.cursor` is gone — cursor now lives on the
`.ttasks-statusbar` class in `styles.css` (no-JS-styles convention). New
`statusBar` settings (`hideWhenZero` toggle + `clickTarget` = agenda/today/board
dropdown) live in the Views section; the status bar re-renders on
`settingsRevision` so toggling reflects immediately. Click routes through
`activeViewMode` for agenda/today and keeps the current view for board.
`statusSummary.test.ts` + `defaults.test.ts` extended. Desktop-only (unchanged);
not covered by the rig (no leaf/status-bar chrome), so no rig shots.

**What:** Status bar item exists (desktop-only, `src/main.ts:512-528`):
shows `buildStatusSummary` text, click opens board → agenda. Polish it.

**Spec:**

- Tooltip (`setTooltip` from obsidian) with the breakdown: due today /
  overdue / in progress / blocked counts.
- Visual state: when overdue > 0, add a warning class (colour via
  `styles.css`, theme tokens only — e.g. `--color-red` text, no hardcoded
  hex).
- Hide-when-zero option + click-target view (agenda vs board vs today Smart
  List) in settings — one `Setting` in the Views section, don't build a
  config subsystem.
- `buildStatusSummary` is pure (`src/integration/statusSummary.ts`, tests
  alongside) — extend it + its tests rather than formatting in `main.ts`.
- Replace the inline `style.cursor` assignment (`main.ts:516`) with a class
  in `styles.css` per the no-JS-styles convention.

---

## N7. [NEW] Bases compatibility — sample `.base` + schema check

**What:** Obsidian 1.9+ Bases can query TTasks' plain frontmatter directly —
a zero-code graceful-degradation story. Ship a sample base + verify the
schema plays nice.

**Spec:**

- Create `Scripts/TTasks.base` (synced into the vault; confirm final
  location with Taylor — the vault is `~/Obsidian/Taylor` on macOS) with
  views for: Active tasks (filter `status`), Due this week, By area (grouped),
  and a project rollup — filtering on `type`, `status`, `area`, `due_date`,
  `priority`.
- Verify field friction points in a real Bases view: aliased wiki-link
  fields (`parent_task`, `depends_on`) — do they resolve as links?
  `labels` list rendering; date fields as quoted strings (`'YYYY-MM-DD'`) —
  Bases date functions may need real date parsing; document any workarounds.
- Document findings + the sample in README ("Using TTasks data with Bases")
  including what works with the plugin disabled.
- **No schema changes** without flagging to Taylor first — if Bases needs a
  format tweak (e.g. unquoted dates), write it up as a proposal, don't
  migrate.
- This requires a live vault with Bases enabled — flag anything unverifiable
  headlessly.

---

## Suggested order

1. **N4** jump-to-task — small, immediate daily value, and N5 depends on it.
2. **N1** header actions (with P6 from UI_POLISH_TASKS.md) — same pane work.
3. **N2** state persistence — self-contained views work.
4. **N5** protocol extension + docs — after N4 so `action=jump` exists.
5. **N6** status bar polish — quick.
6. **N3** API design doc — anytime; needs Taylor's review before code.
7. **N7** Bases — needs live vault time with Taylor.
