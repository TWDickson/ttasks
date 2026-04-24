# TTasks Roadmap

This file is the implementation backlog checkpoint for the current phase plan.

---

## Progress Notes (2026-04-20)

Phase 5 partial. 265 passing tests, zero TypeScript errors, build clean.

### Convert Task to Project

- `TaskStore.convertToProject(path)` — flips `type → project`, clears `task_type` via `processFrontMatter`
- `TaskContextMenuDeps.convertToProject` added; "Convert to Project" menu item appears on tasks only (hidden for projects)
- Wired in both `showTaskContextMenu` and `registerNativeContextMenus` (`addForTask`)
- Tests: `contextMenu.test.ts` updated with new dep, callback assertion, and project-type exclusion case

### Hierarchy utilities (deferred wiring)

- `src/store/taskHierarchy.ts` — three pure utilities: `flattenWithDepth`, `buildVisibleItems`, `getParentPaths`
- 16 new tests covering flat lists, nested depth, orphaned children, cycle breaking, collapse visibility
- `TaskRow.svelte` — `indent`, `expandable`, `expanded`, `onExpand` props added (defaults are no-ops; zero visual change today)
- Views NOT wired yet — status-based grouping splits parents and children into different groups, so per-group hierarchy is ineffective. Deferred to Phase 6 view architecture rework (filter → sort/group → view pipeline).

---

## Progress Notes (2026-04-10)

Phases 3A, 3B, and 3C are complete. Build, lint, and tests all passing (14 tests).

## Progress Notes (2026-04-16)

Recurrence foundation is now implemented and test-hardened.

- Recurrence rule helpers added in `src/store/recurrence.ts` (`daily`, `weekly`, `biweekly`, `monthly`, `yearly`) with `fixed` and `from_completion` schedule modes.
- Month/year advancement now clamps correctly at month-end and leap-year boundaries.
- Completion flow supports recurrence rollover via `TaskStore.completeAndRecur()`.
- Create + detail UI now expose recurrence and recurrence type.
- Regression and edge-case coverage expanded in `src/store/recurrence.test.ts` (table-driven assertions + leap/DST/month-end cases).
- Current test status: 101 passing tests.

## Current State (2026-04-16 Final Pass)

- External settings sync is implemented with full merge and canonical re-save on external changes.
- Legacy swipe settings are fully removed from runtime support (`mobileSwipeEnabled`, left/right swipe actions, swipe layout fields).
- Mobile interaction model is now hold-menu only; row component naming is aligned (`HoldActionTaskRow`).
- Plugin data is in canonical schema shape (`data.json` now includes reminders object and hold-menu quick-action keys only).
- Verification status: full test suite passing (130 tests) and production build passing.

## Current State (2026-04-16 Recurrence + Date Semantics Follow-up)

- Date-only handling is standardized on local calendar semantics across task operations and reminders.
- Recurring completion behavior refined in `TaskStore.completeAndRecur()`.
- Checklist reset supports all Obsidian-native task list forms.
- Validation status: full suite passing (156 tests) and production build passing.

## Current State (2026-04-16 Phase 4A + Code Quality Refactor)

- `is_complete` / `is_inbox` derived boolean fields on every `Task`.
- Settings UI: Completion status and Inbox status dropdowns.
- Delete task with confirm dialog; panel open state decoupled from activeTaskPath.
- Agenda view filters out completed tasks. Kanban always-visible horizontal scrollbar.
- TDD-driven DRY pass: `pathUtils.ts`, `wikiLink.ts`, `constants.ts`, date utility adoption.
- Test suite: 198 passing. Zero TypeScript errors.

---

## Progress Notes (2026-04-16) — Phase 4B Complete

Phase 4B complete. TDD throughout — all features built red→green. 244 passing tests, zero TypeScript errors, build clean.

### status_changed field
- `status_changed: string | null` added to `Task` (excluded from `TaskCreateInput` — store owns it)
- `computeStatusChanged(currentStatus, nextStatus, today)` pure helper in `src/store/statusChanged.ts`
- `resolveStaleDate(statusChanged, startDate)` picks best anchor for stale-in-progress rule
- `TaskStore.update()` writes `status_changed = today` inside `processFrontMatter` when status actually transitions
- `TaskStore.create()` and `buildFrontmatter()` seed it from `created` date
- `completeAndRecur()` does not carry `status_changed` to the new recurrence instance
- `migrateStatusChanged()` backfills existing tasks with `start_date ?? created`
- Command: "Migrate status_changed field (backfill existing tasks)"
- `ReminderService` stale rule uses `resolveStaleDate(task.status_changed, task.start_date)` — graceful fallback for old tasks

### System status protection
- `isSystemStatus(status, completionStatus, inboxStatus): boolean` exported from `settings.ts`
- Both completion AND inbox statuses: remove button disabled, lock tooltip, hard guard in `saveManagedList()`
- Config-driven — protects current pointer values, not hardcoded strings

### Task duplication
- `buildDuplicateInput(task, today, inboxStatus): TaskCreateInput` pure helper in `src/store/taskDuplicate.ts`
- Reset on duplicate: status → inboxStatus, completed → null, created → today, start_date → null, depends_on → [], blocked_reason → ''
- Preserved: name, type, category, priority, task_type, parent_task, due_date, estimated_days, notes, recurrence, recurrence_type, assigned_to, source
- `TaskStore.duplicate(path)` wires the helper into the store
- Right-click menu: "Duplicate" item on all three context menu surfaces (in-view, file-menu, editor-menu)
- Command palette: "Duplicate active task" (only available when a task is selected in the detail panel)
- After duplication: detail panel navigates to the new task, Notice shown

---

## Phase 4B — COMPLETE ✓ (2026-04-16)

### `status_changed` field [ ]
- Add `status_changed?: string` to `types.ts`
- `TaskStore.update()` writes today when `status` changes
- `ReminderService` stale rule uses `status_changed` over `start_date` proxy
- Migration command: set `status_changed = start_date ?? created` on existing tasks
- TDD: pure logic in `statusChanged.ts`, integration in `TaskStore.test.ts`

### Protect system statuses [ ]
- Mark Done and Inbox statuses as system-protected in settings schema
- Settings UI: system statuses shown with lock icon, rename/delete disabled
- Validation in `TaskStore.update()` — cannot set a task to a deleted status
- `resolveCompletionStatus()` / `resolveInboxStatus()` fall back to first non-system status if pointer becomes stale
- TDD: settings resolver tests, guard tests

### Task duplication [ ]
- `TaskStore.duplicate(path)` — clone frontmatter, new `{6hex}-{slug}` ID, clear `completed`, `status_changed`, `created` = today, status reset to inboxStatus
- Command palette: "Duplicate task"
- Context menu item on task rows
- Detail panel "Duplicate" button
- TDD: duplication logic isolated and tested before wiring UI

---

## Phase 5 — UX Hardening

### Kanban overhaul (broken layout)
- Diagnose and fix column layout regressions
- Card hover contrast fix (currently too dark, text unreadable)
- Drag-to-reorder within a column (priority ordering)
- Stable column widths with proper overflow

### Customizable card display
- User-configurable field set per card (e.g. show start_date, due_date, category, tags)
- Field order configurable
- Compact vs. detailed card density toggle

### Style fixes
- Button text truncation in modals and panels
- Alignment regressions across list/detail/kanban
- List view hover states (too aggressive)
- Consistent Obsidian CSS token usage throughout

### Right-click context menu on task items
- Inline context menu on all row/card types (list, kanban, agenda, graph)
- Actions: open detail, open in editor, duplicate, start, complete, block, defer, delete

### Convert Task to Project (backlog)

- Right-click option: "Convert to Project" — changes `type` frontmatter from `task` to `project`
- Retain all existing fields; `task_type` can be cleared or left as-is
- If the task has a `parent_task`, prompt: keep parent relationship or promote to top-level?
- After conversion, navigate to the task (now project) in detail panel

### Hierarchical list view (sub-task indentation)

- In list view: tasks with a `parent_task` render visually indented under their parent
- Parent row is collapsible; collapsed state persists per-view session
- Same treatment in agenda view: grouped/indented under the parent heading when parent is also due/active
- Orphaned tasks (parent not in current filter results) render flat as today
- Depth limit: cap visual nesting at 2–3 levels to avoid runaway indentation on mobile

### "Open in editor" title fix
- Task editor view title uses `name` frontmatter field, not the raw filename

### Completed task handling + Logbook
- Completed tasks removed from all active views by default
- Dedicated Logbook tab: searchable, filterable archive of Done/Cancelled tasks
- Optional: auto-archive after N days (configurable)

### Settings pane reorganization
- Group settings into collapsible sections: General, Statuses, Categories & Types, Quick Actions, Reminders, Appearance
- Reduce visual noise for first-time setup

---

## Phase 6 — Data Model + Views & Filtering

### ⚠️ Step 0: Data Model Changes (prerequisite for everything below)

Agreed design decisions from 2026-04-24 session. These must land before the filter engine is built.

**Field renames and changes:**

| Field | Before | After | Notes |
| --- | --- | --- | --- |
| `category` | `string \| null` | `area: string \| null` | Renamed — represents "line of work" (Database, General, Work, Home) |
| `task_type` | `string \| null` | `labels: string[]` | Multi-value, user-configurable, pre-seeded with feature/bug/research/docs/action |
| `is_inbox` | derived (`status === inboxStatus`) | derived (`area === null`) | Inbox = unclassified, not a workflow state |
| `status` | includes "Inbox" value | pure workflow only | Inbox removed from status list entirely |
| `inboxStatus` setting | system pointer | removed | No longer needed |

**Rationale:**

- **Area** matches how users think about it: a top-level line of work, equivalent to TickTick lists or Things 3 Areas. Applies to both tasks and projects.
- **Inbox = area is null.** Tasks without an area haven't been triaged yet. Programmatic creates (agents, importers, quick capture) simply omit area — they land in inbox naturally. Triage = assign an area. No boolean flag needed, no ambiguity between "intentionally uncategorized" and "unclassified."
- **Labels** replaces both `task_type` and the planned `tags` field. Cross-cutting, multi-value, user-defined. Pre-seeded with sensible defaults but fully configurable. A task can have multiple labels (e.g. `bug`, `urgent`). Consolidating two label systems into one.
- **Status** is now a pure workflow axis. No special-cased system values.

**Migration command needed:**

- `category` → `area` frontmatter rename on all existing tasks
- `task_type: "value"` → `labels: ["value"]` (null → `[]`)
- Tasks with `status: Inbox` → `status` set to first non-completion status, `area` left null (they become inbox via the new model)
- Remove `inboxStatus` from `data.json` settings

---

### ⚠️ Step 1: Unified Query → View Pipeline

**Rethink the view model before building more views.** Current state couples filter logic, grouping, and render format tightly per-view (list, kanban, graph each have their own wiring). This makes it impossible to mix-and-match filter and view format, and blocks Smart Lists.

Target model:

```text
FilterSpec + SortSpec + GroupBySpec → useTaskQuery() → View (List | Kanban | Graph | Agenda | Calendar)
```

- **FilterSpec** — serialisable filter tree: composable AND/OR groups, per-field operators (`is`, `is not`, `contains`, `before`, `after`, `is null`, `is not null`). Supports complex custom logic — users can build arbitrarily nested conditions.
- **SortSpec** — primary + secondary sort key, direction
- **GroupBySpec** — optional group-by field (area, status, priority, due date, parent, label)
- **useTaskQuery()** — shared Svelte store/hook. Takes specs, returns sorted/grouped task set. All views consume this; none implement their own query logic.
- **View** — pure renderer. Receives grouped task list, renders it. Swappable without touching filter/sort state.

**Why this matters:**

- Smart Lists become trivial: persist a `FilterSpec + SortSpec + GroupBySpec` with a name, let user pick any view format
- Hierarchy wiring (deferred from Phase 5) becomes clean: `groupBy: parent` produces the tree structure natively
- Adding a new view type requires only a new renderer component
- Filter UI is written once, shared across all views

**Implementation order:**

1. **Data model + migration** (Step 0 above) — prerequisite
2. **Filter engine** — `FilterSpec`, `SortSpec`, `GroupBySpec` TypeScript types + pure `applyFilter()`, `applySort()`, `applyGroup()` functions. TDD throughout. No UI yet.
3. **Query layer** — `useTaskQuery(filter, sort, groupBy)` Svelte store. Replaces per-view internal logic.
4. **View migration** — swap List, Agenda, Kanban one at a time to consume `useTaskQuery`. Hierarchy wiring lands here.
5. **Filter/sort UI** — toolbar controls, persisted per view. Smart Lists fall out naturally.

---

### Custom saved views (Smart Lists)

- Save a `FilterSpec + SortSpec + GroupBySpec` with a name and icon
- Complex filter logic: AND/OR groups, per-field operators, nested conditions
- Sidebar navigation to saved views
- Default views (All, Today, Inbox, Blocked) become named instances of the same engine — Inbox = `area is null`

### Custom sort

- Per-view sort: by due date, priority, created, name, status, estimated_days, area, label
- Secondary sort key support

### Forecast / Calendar view

- Monthly/weekly calendar grid with tasks overlaid by due date
- Shows scheduling gaps and overload days

### Progress rollup on projects

- Project nodes in list/graph show `X of N tasks complete` as a progress bar
- Blocked and overdue counts surfaced at project level

---

## Phase 7 — Data Model Expansion

### Activity log on tasks
- Timestamped append-only log in task note body (or separate frontmatter array)
- Auto-entries: status changes (uses `status_changed`), creation, completion, recurrence rollover
- Manual entries: user comments from detail panel
- Renders as a timeline in the detail panel

### Areas (explore — may map to top-level category)
- Hierarchy level above projects: Work, Personal, Health, etc.
- Investigate whether this is a separate `area` field or a reserved top-level category value
- If separate: areas appear as section headers in sidebar nav

### Milestones within projects
- A milestone is a zero-effort task with a target date that gates downstream deps
- Renders as a diamond node in the graph view
- Timeline shows milestone markers

### Icon/emoji field for statuses, categories, task types
- Separate `icon` from `label` so compact views (kanban headers, tight badges) can be icon-only
- Interim: emoji embedded in name (e.g. `📥 Inbox`) works everywhere and is easy to migrate
- Implement alongside protecting system statuses

### Eisenhower Matrix view
- 2×2 board: Important × Urgent
- Urgent axis derived from due-date proximity (configurable threshold) or explicit flag
- Important axis from priority field (High/Medium = important)

### Sections within projects
- Sub-grouping inside a project (`Design`, `Dev`, `QA`)
- Lightweight alternative to deep nesting
- Investigate: separate `section` field vs. lightweight parent_task grouping

---

## Phase 8 — Power Features

### Natural language quick capture
- Parse text entry: `Fix auth bug #high due:tomorrow @Project blocking:abc123`
- Available from command palette, status bar, and mobile floating button
- Deferred until after recurrence (now complete) and smart lists (Phase 6)

### Capacity-aware Today planner
- "Evening review" intent: mark tasks as "for today" independent of due date
- Suggests top tasks based on `estimated_days` budget vs. available hours
- Overload guardrails: warns when today's committed work exceeds capacity
- Requires `status_changed` (Phase 4B) for accurate in-progress accounting

### Pomodoro integration
- "Start Pomo on this task" command → links Pomodoro Timer plugin session to task
- On session end: log duration to task note activity log
- Aggregate time-spent visible in detail panel

### Cycles / Sprints (investigate)
- Time-boxed work windows; pull tasks into a cycle, track velocity
- May overlap with Capacity planner — evaluate together

### Obsidian ecosystem compatibility
- Daily note integration: surface today's due/started tasks in the daily note template
- Tasks plugin compatibility: read/render `- [ ]` checkboxes in task notes
- Dataview/Datacore compatibility: ensure frontmatter schema works with community queries
- Templater hooks: expose TTasks API to Templater scripts

### Markdown code block processor (deferred)
- ```` ```ttasks filter: category=Work ```` ``` ` embeds a live task list in any note
- High community value if plugin is published
- Deferred: requires stable filter engine (Phase 6 prerequisite)

---

## Deferred / Investigate Later

- **Evening review modal** — GTD clarify flow; needs capacity planner design first
- **Workload view** — needs multi-user `assigned_to` story
- **Habit tracking** — distinct enough to be its own plugin; revisit after core is stable
- **Asana-style sections** — investigate overlap with Milestones and project sections above
- **CodeMirror embed** — true Live Preview in detail panel; deferred due to mobile keyboard risk
- **Mobile authoring toolbar** — floating row above keyboard; deferred due to WKWebView complexity

---

## Historical Phase Notes

### Phase 3A — Dependency Graph ✓
- Graph board mode, dependency map, cycle detection, Gantt timeline, topological date inference.

### Phase 3B — Reminders ✓
- `ReminderService`: due-today, overdue, lead-time, stale-in-progress. Quiet hours, deduplication.

### Phase 3C — Quick Actions ✓
- Start, complete, block, defer via command palette and mobile hold menu with haptic feedback.

### Phase 2.5 — Hardening ✓
- ID collision-safe create, relationship safeguards, configurable categories/task types, lint + tests.
