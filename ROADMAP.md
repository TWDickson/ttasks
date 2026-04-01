# TTasks Roadmap

This file is the implementation backlog checkpoint for the current phase plan.

## Phase 2.5 Hardening

Goal: tighten data integrity and reduce regressions before larger Phase 3 features.

1. ID collision-safe create [done]
- Problem: task IDs use random 6-hex prefixes; collisions are rare but possible.
- Scope: retry ID generation until an unused `{6hex}-{slug}.md` path is found.
- Acceptance:
  - Create never overwrites an existing task file.
  - If collisions occur repeatedly, create fails with a clear error.

2. Relationship safeguards on create [done]
- Problem: depends_on can include duplicates or invalid paths.
- Scope: sanitize dependencies at store layer.
- Acceptance:
  - Duplicate dependencies are removed.
  - Invalid or missing dependency targets are ignored.
  - Self references are ignored.

3. Configurable categories and task types [done]
- Problem: category/task type options are hard-coded in UI components.
- Scope: add settings fields and use them in create/detail views.
- Acceptance:
  - Settings allow comma-separated category and task type values.
  - Create modal and detail panel read from settings arrays.
  - Existing data with custom task_type values remains editable.

4. Quality guardrails [done]
- Problem: build exists but lint/tests are minimal.
- Scope: add lint script and initial store-focused tests.
- Acceptance:
  - CI/local workflow includes lint + build.
  - Store has at least baseline tests for create/sanitize helpers.

## Phase 3A Dependency Graph MVP

Goal: ship first differentiator vs TickTick.

- Add Graph mode to board navigation.
- Render tasks as nodes and depends_on as directed edges.
- Color nodes by status/priority.
- Click node to open task detail.
- Highlight cycles and blocked chains.

## Phase 3B Reminders MVP

Goal: reminders that are useful and non-spammy.

- Rules: due today, overdue, stale in-progress.
- Settings: enable/disable rules + quiet hours + lead time.
- Deduplicate reminders by task + rule + day.

## Phase 3C Quick Actions MVP

Goal: speed up common state transitions.

- Desktop commands: start, block, complete, defer one day.
- Mobile swipes (list first): complete, defer.

## Phase 4 (Parity Plus)

- Recurrence.
- Natural language quick capture.
- Capacity-aware Today planner (suggested top tasks, overload guardrails).
