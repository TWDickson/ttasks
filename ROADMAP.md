# TTasks Roadmap

This file is the implementation backlog checkpoint for the current phase plan.

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

### Phase 3A — Dependency Graph ✓

- Graph board mode with dependency map and overview timeline (Gantt-like lanes).
- Dependency map: nodes/edges, cycle highlighting (red ring), blocked-chain highlighting (amber dashed).
- Detail panel: relationship health context — upstream/downstream counts, cycle/blocker indicators, quick nav chips.
- Timeline: `resolveTaskDates()` in `taskGraph.ts` uses topological sort (Kahn's) to propagate end dates through full dependency chains. Tasks with no explicit dates but with deps + estimated_days appear at their inferred position. Inferred bars render with dashed border + reduced opacity.
- Cycle detection: tasks in dependency cycles are excluded from the timeline automatically.
- Sandbox seeding command for testing (dev-only, `[GS]` prefix).

### Phase 3B — Reminders ✓

- `ReminderService` polls every 5 minutes via `registerInterval`.
- Rules: due-today, overdue, lead-time (N days before due), stale-in-progress.
- Deduplication: `{path}|{rule}|{YYYY-MM-DD}` keys stored in `localStorage` (vault-namespaced). Per-device — each device fires its own reminders independently, does not sync.
- Clicking a notice opens the board and selects the task in the detail panel.
- Quiet hours: suppresses checks without consuming keys, so reminders fire after the window ends.
- Stale rule uses `start_date` as proxy; tasks without a start date are silently skipped. A future `status_changed` field would make this more reliable.
- 11 settings controls under "Reminders" in the settings tab.

### Phase 3C — Quick Actions ✓

- Start, complete, block, defer via command palette and mobile hold menu.
- Hold menu opens at press position with haptic feedback (`navigator.vibrate(8)`, Android only).
- Swipe gestures abandoned — don't work reliably in the Obsidian context.
- Configurable: start status, block status, defer days, handedness bias, hold timeout.

---

## Phase 2.5 Hardening [done]

1. ID collision-safe create [done]
2. Relationship safeguards on create [done]
3. Configurable categories and task types [done]
4. Quality guardrails — lint + baseline tests [done]

---

## Phase 4 (Parity Plus)

- Recurrence.
- Natural language quick capture.
- Capacity-aware Today planner (suggested top tasks, overload guardrails).
- Explicit status metadata (`is_complete`, later possibly `is_inbox`) so completion/default behavior no longer depends on literal status names.
- `status_changed` date field on tasks — would improve the stale-in-progress reminder rule (currently uses `start_date` as a proxy).
- Dedicated per-item icon/emoji field for statuses, categories, and task types.
  - Separate from the label so compact views (kanban column header, tight badges) can show icon-only while full views show `{icon} {label}`.
  - Interim: emoji embedded in the name (e.g. `📥 Inbox`) works everywhere and is easy to migrate.
  - Consider protecting Done/Inbox as system statuses at the same time.
- Mobile notes authoring toolbar above keyboard (deferred):
  - Floating action row that follows keyboard while editing notes on mobile.
  - Shared actions for create modal and detail view (checklist, heading, link, code, quote).
  - Keep hybrid notes workflow (rendered mode + source edit mode).
- Optional CodeMirror embed for true inline Live Preview parity (deferred):
  - Defer until after current mobile stability/UX hardening due lifecycle complexity and mobile keyboard risk.
