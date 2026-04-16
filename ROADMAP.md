# TTasks Roadmap

This file is the implementation backlog checkpoint for the current phase plan.

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

## Phase 6 — Views & Filtering

### Custom saved views (Smart Lists)
- Save a filter + sort + groupBy combo with a name and icon
- Complex filter logic: AND/OR, field comparisons, date ranges, tag intersections
- Sidebar navigation to saved views
- Default views (All, Today, Inbox, Blocked) remain but become instances of the same engine

### Custom sort on default views
- Per-view sort: by due date, priority, created, name, status, estimated_days
- Secondary sort key support

### Forecast / Calendar view
- Monthly/weekly calendar grid with tasks overlaid by due date
- Complements and extends the existing DAG timeline direction
- Shows scheduling gaps and overload days

### Progress rollup on projects
- Project nodes in list/graph show `X of N tasks complete` as a progress bar
- Blocked and overdue counts surfaced at project level

### Tags (freeform, multi-value)
- `tags` frontmatter array field (separate from `category`)
- Orthogonal axis: tag tasks `#waiting`, `#quick`, `#deep-work`
- Tag filter in all views; tag cloud in sidebar

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
