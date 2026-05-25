# TTasks — Obsidian Plugin

A custom Obsidian plugin for task management with kanban, dependency tracking, and mobile-friendly UI. Designed to replace a patchwork of community plugins (QuickAdd, Meta Bind, Dataview) with a single, cohesive experience.

## Status Sources

Use these files as the canonical status references:

- `CLAUDE.md` — current state, priorities, conventions, and latest milestone snapshot
- `ROADMAP.md` — dated progress log and backlog checkpoint by phase/slice
- `Scripts/memory/project_ttasks.md` — synced high-level status note for quick reference from the vault side

When updating project status, prefer updating `CLAUDE.md` first, then add a dated checkpoint to `ROADMAP.md` when the change is milestone-worthy.

## Tech Stack

- **TypeScript** — plugin logic
- **Svelte 4** — UI components
- **esbuild** — bundler (via `esbuild.config.mjs`)
- `npm run dev` — watch mode (outputs `main.js`)
- `npm run build` — production build

## Architecture

- **Plugin owns a configurable folder** — all task/project `.md` files live in one place
- **Data layer is plain frontmatter** — portable, git-friendly, readable without the plugin
- **Plugin renders all UI** — no Meta Bind, no Dataview dependency
- **Graceful degradation** — if plugin is disabled, notes remain readable markdown
- **`cssclasses: [ttask]`** added to every task note — plugin's `styles.css` scopes appearance

## File Format

Tasks stored as `{6hex}-{slug}.md`. The `name` frontmatter field is the human-readable title.

### Frontmatter Schema

```yaml
---
type: task | project
name: "Human readable name"
cssclasses: [ttask]
area: string | null
status: Active | Future | In Progress | Hold | Blocked | Cancelled | Done
priority: High | Medium | Low | None
labels:
  - feature | bug | research | docs | action | <custom>
parent_task: '[[path/without/ext|Name]]' | null
depends_on:
  - '[[path/without/ext|Name]]'
blocks:
  - '[[path/without/ext|Name]]'
blocked_reason: ""
assigned_to: ""
source: ""
start_date: 'YYYY-MM-DD' | null
due_date: 'YYYY-MM-DD' | null
estimated_days: number | null
created: 'YYYY-MM-DD'
completed: 'YYYY-MM-DD' | null
status_changed: 'YYYY-MM-DD' | null
---
```

Body = free-form markdown notes only. Plugin renders all structured UI on top.

### Relationship fields

- `depends_on` — tasks that must finish before this one (forward index)
- `blocks` — reverse index of `depends_on`, auto-maintained by the plugin
- `parent_task` — project this task belongs to
- Wiki-links stored with aliases: `[[path|Name]]` so they display human names in native Obsidian views

## Build Phases

### Phase 1 — Core

- [x] Task store: read/write frontmatter via Obsidian vault API
- [x] Task list view (registered Obsidian leaf)
- [x] Create/edit modal
- [x] Task detail panel

### Phase 2 — Views

- [x] Kanban board by status
- [x] Mobile-optimised layouts
- [x] Search and filter

### Phase 2.5 — Hardening

- [x] ID collision-safe task creation (retry until unique `{6hex}-{slug}.md` path)
- [x] Relationship safeguards on create (`depends_on` dedupe + self/invalid reference guard)
- [x] Configurable categories and task types in plugin settings
- [x] Baseline quality guardrails (lint + store-level tests)

### Phase 3 — Advanced

- [x] Dependency graph (visual, interactive)
- [x] Due date reminders/notifications
- [x] Quick actions (desktop commands + mobile hold menu)

### Phase 4 — Reliability + UX Hardening

- [x] Derived `is_complete` / `is_inbox` fields
- [x] Completion status settings
- [x] Delete with confirm dialog
- [x] `status_changed` field + stale-progress tracking
- [x] Task duplication

### Phase 6 — Data Model + Smart Lists

- [x] `area` replaces `category`
- [x] `labels: string[]` replaces `task_type`
- [x] Shared query engine (`filter` / `sort` / `group` / `limit` / `search`)
- [x] Agenda date buckets moved into shared query grouping
- [x] Persisted custom views / Smart Lists
- [x] Query editor modal with Builder + JSON tabs
- [x] Smart Lists in board rail with add/edit/delete
- [x] Renderer-query coercion for Agenda + Kanban

## Current Priorities

1. **Stream I** — Follow-on board and data-model hardening (I1-I5)
2. **Stream J** — Productivity and quality-of-life slices (J1-J6)
3. **Follow-on hardening** — continue narrowing board/data-model debt after I/J slices land

PRDs: `Scripts/TASK_H1.md`, `Scripts/TASK_H2.md`, `Scripts/TASK_I1.md`-`Scripts/TASK_I5.md`, `Scripts/TASK_J1.md`-`Scripts/TASK_J6.md`

## Recent Updates (2026-05-25)

- **Stream H COMPLETE** — H1 component coverage and H2 BoardStateService extraction are now both landed.
- **Scoped component test runner fixed** — `npm run test:components` now uses a dedicated Vitest config instead of a Windows-fragile CLI glob.
- **TaskDetail render coverage added** — component tests now exercise empty state, conditional task/project sections, blocked state, completed actions, and active-task switching.
- **I1 parsing layer landed** — `checkboxParser`, `emojiFieldParser`, and `filenameDateParser` are in `src/integration/` with pure tests and boundary coverage.
- Validation status: production build passing; **test suite: 1009 passing (86 files)**.

## Recent Updates (2026-05-22)

- **Streams D-G COMPLETE** — D1/D2, E1/E2, F1, and G1 are now implemented and test-covered.
- **E2 final wiring complete** — list keyboard focus navigation now supports `j`/`k` and arrow navigation with clamped movement and focused task state.
- **Board keyboard internals improved** — focused task state is separate from active detail state to keep navigation behavior predictable.
- **Tooling QoL** — dedicated test scripts added: `npm run test:board`, `npm run test:reminders`, and `npm run test:components` to avoid approval-heavy `npm run test -- ...` workflows.
- Validation status: production build passing; **test suite: 961 passing (82 files)**.

## Recent Updates (2026-05-14)

- **Phase 7 COMPLETE** — Archive infrastructure (ArchiveService, auto-archive, archive view, logbook, migration command).
- Store decomposition: TaskStore 900→596 lines; TaskMigrations, TaskRelationships, TaskWriter extracted.
- Settings split: settings.ts 1869→35-line re-export shim; types/defaults/SettingsTab in `src/settings/`.
- Quick-action pure logic extracted to `integration/quickActions.ts`; view adapter flatten bridge removed.
- TaskDetail.svelte 1381→721 lines; TaskDetailRelationships, TaskDetailNotes, TaskDetailActions extracted.
- Bug fixes: est-days NaN clear, dependency sort (same-project first), "Blocked by"/"Unblocks" verbiage, create-dependent-task context menu.
- Archive: ArchiveService with `archive_history` logbook, archive view in board rail, migration command.
- Validation status: production build passing; **test suite: 553 passing (40 files)**.

## Product Direction Notes

- TickTick parity where expected: reminders, recurrence, quick capture
- TTasks differentiation where it matters: dependency intelligence, blocker visibility, realistic daily planning
- Prefer narrow vertical slices with clear acceptance criteria over large speculative features
- Status behavior still relies on configured status names, but the runtime now exposes derived `is_complete` / `is_inbox` fields and tracks `status_changed` for stale-progress reminders.

## Key Conventions

- All vault reads/writes go through `this.app.vault` and `this.app.fileManager`
- Frontmatter mutations always use `app.fileManager.processFrontMatter()` — never write raw YAML to existing files
- Frontmatter built as a raw string **only** at file creation time
- `blocks` is always derived/synced — never set manually by the user
- Settings accessed via `this.plugin.settings.tasksFolder`

## Architecture Rules

**Plugin coupling** — new components must not import `TTasksPlugin` or `TaskStore` directly. Pass specific callbacks or service references as props. Components that follow this are testable with `@testing-library/svelte`.

**No Obsidian imports in pure modules** — `src/query/`, `src/utils/`, `src/store/` helpers, and all `src/integration/` pure modules must stay free of Obsidian dependencies. This is enforced by `src/integration/architectureBoundaries.test.ts`. When you create a new pure module, add it to that file's boundary list in the same commit.

**Performance** — wrap the `applyQuery()` call in `src/query/useTaskQuery.ts` with `console.time('applyQuery')` / `console.timeEnd('applyQuery')` in dev mode. Keeps regressions visible before they accumulate.

**Mobile testing** — before closing any feature that touches the UI, test the golden path on iOS or a narrow-viewport browser. Note mobile-specific gotchas in the PRD's Gotchas section.

## CSS Notes

- Plugin ships `styles.css` — loaded automatically when plugin is enabled
- Selector pattern: `.markdown-source-view.ttask .metadata-container { display: none !important; }`
- `!important` required — Obsidian's built-in styles have higher specificity
- Mobile modal and token usage conventions are documented in `Scripts/STYLING_NOTES.md` (synced notes)
