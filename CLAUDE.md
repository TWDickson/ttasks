# TTasks — Obsidian Plugin

A custom Obsidian plugin for task management with kanban, dependency tracking, and mobile-friendly UI. Designed to replace a patchwork of community plugins (QuickAdd, Meta Bind, Dataview) with a single, cohesive experience.

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
category: string | null
status: Active | Future | In Progress | Hold | Blocked | Cancelled | Done
priority: High | Medium | Low | None
task_type: feature | bug | research | docs | action | null
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

### Phase 2.5 — Hardening (complete)

- [x] ID collision-safe task creation (retry until unique `{6hex}-{slug}.md` path)
- [x] Relationship safeguards on create (`depends_on` dedupe + self/invalid reference guard)
- [x] Configurable categories and task types in plugin settings
- [x] Baseline quality guardrails (lint + store-level tests)

### Phase 3 — Advanced

- [ ] Dependency graph (visual, interactive)
- [ ] Due date reminders/notifications
- [ ] Quick actions (swipe mobile, hotkeys desktop)

## Current Priorities

1. Phase 2.5 hardening slice to protect data integrity and reduce regressions
2. Phase 3A dependency graph MVP (core differentiator vs TickTick)
3. Phase 3B reminders MVP (due/overdue/stale-in-progress)
4. Phase 3C quick actions (desktop commands first, then mobile swipe)

## Product Direction Notes

- TickTick parity where expected: reminders, recurrence, quick capture
- TTasks differentiation where it matters: dependency intelligence, blocker visibility, realistic daily planning
- Prefer narrow vertical slices with clear acceptance criteria over large speculative features

## Key Conventions

- All vault reads/writes go through `this.app.vault` and `this.app.fileManager`
- Frontmatter mutations always use `app.fileManager.processFrontMatter()` — never write raw YAML to existing files
- Frontmatter built as a raw string **only** at file creation time
- `blocks` is always derived/synced — never set manually by the user
- Settings accessed via `this.plugin.settings.tasksFolder`

## CSS Notes

- Plugin ships `styles.css` — loaded automatically when plugin is enabled
- Selector pattern: `.markdown-source-view.ttask .metadata-container { display: none !important; }`
- `!important` required — Obsidian's built-in styles have higher specificity
- Mobile modal and token usage conventions are documented in `Scripts/STYLING_NOTES.md` (synced notes)
