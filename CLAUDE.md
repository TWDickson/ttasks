# TTasks — Obsidian Plugin

A custom Obsidian plugin for task management with kanban, dependency tracking,
and mobile-friendly UI. Designed to replace a patchwork of community plugins
(QuickAdd, Meta Bind, Dataview) with a single, cohesive experience.

**This file is conventions and workflow — how to work in this repo.** It is not a
status document.

## Where things live

- **`PROJECT.md`** — the single live doc: current state, every open item across
  all horizons, and the rationale behind them. **Read this before starting work.**
- **`Scripts/archive/HISTORY.md`** — the dated journal of everything shipped and
  why past decisions went the way they did. Read it when you need the reasoning
  behind existing code.
- **`API_DESIGN.md`** — the proposed public API (awaiting Taylor's review).
- **`PROTOCOL.md`** — the `ttasks://` URI handler.
- **`test-rig/README.md`** — the visual rig.

Update `PROJECT.md` when work lands; add a dated entry to `HISTORY.md` when a
thread closes or a decision is worth preserving.

## Tech stack

- **TypeScript** — plugin logic
- **Svelte 4** — UI components
- **esbuild** — bundler (`esbuild.config.mjs`)
- **Node ≥ 22** (`.nvmrc` pins 24, the active LTS; CI runs a 22 + 24 matrix)

| Command | Does |
| --- | --- |
| `npm run dev` | Watch mode. **Does not touch the vault.** |
| `npm run build` | Production build **and the deploy step** — copies `main.js` / `manifest.json` / `styles.css` into the vault. |
| `npm run check` | `lint && build && test` — the full gate, same as CI. |
| `npm run rig` | Visual rig at localhost:5199. |
| `npm run rig:shots` | Desktop/mobile × dark/light screenshot matrix. |
| `npm run rig:sync-css` | Refresh vendored CSS after an Obsidian or theme update. |

A fresh checkout on a machine with no vault needs `npm ci && npm run rig:sync-css`.

## Architecture

- **Plugin owns a configurable folder** — all task/project `.md` files live in one
  place
- **Data layer is plain frontmatter** — portable, git-friendly, readable without
  the plugin
- **Plugin renders all UI** — no Meta Bind, no Dataview dependency
- **Graceful degradation** — if the plugin is disabled, notes remain readable
  markdown
- **`cssclasses: [ttask]`** on every task note — `styles.css` scopes appearance

## File format

Tasks stored as `{6hex}-{slug}.md`. The `name` frontmatter field is the
human-readable title.

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
recurrence_anchor_day: number | null
---
```

Body = free-form markdown notes only. The plugin renders all structured UI on top.

**Relationship fields**

- `depends_on` — tasks that must finish before this one (forward index)
- `blocks` — reverse index of `depends_on`, **auto-maintained; never set by hand**
- `parent_task` — the project this task belongs to
- Wiki-links stored with aliases (`[[path|Name]]`) so they display human names in
  native Obsidian views

## Key conventions

- All vault reads/writes go through `this.app.vault` and `this.app.fileManager`
- Frontmatter mutations always use `app.fileManager.processFrontMatter()` — never
  write raw YAML to an existing file
- Frontmatter is built as a raw string **only** at file-creation time
- Settings accessed via `this.plugin.settings.tasksFolder`
- Dates are **local calendar dates**; `dateUtils.ts` documents the hybrid
  local-date/UTC-arithmetic policy. No bare `new Date()` outside the boundary.

## Architecture rules

**Plugin coupling** — new components must not import `TTasksPlugin` or `TaskStore`
directly. Pass specific callbacks or service references as props. Components that
follow this are testable with `@testing-library/svelte`. *(The ten legacy
components predate this rule and violate it — see AR-1 in `PROJECT.md`.)*

**No Obsidian imports in pure modules** — `src/query/`, `src/utils/`, `src/store/`
helpers, and all `src/integration/` pure modules must stay free of Obsidian
dependencies. Enforced by `src/integration/architectureBoundaries.test.ts`. **When
you create a new pure module, add it to that file's boundary list in the same
commit.**

**Performance** — wrap the `applyQuery()` call in `src/query/useTaskQuery.ts` with
`console.time`/`console.timeEnd` in dev mode. Keeps regressions visible before
they accumulate.

**Mobile testing** — before closing any feature that touches the UI, test the
golden path on iOS or a narrow-viewport browser.

## CSS notes

- The plugin ships `styles.css`, loaded automatically when enabled.
- Selector pattern:
  `.markdown-source-view.ttask .metadata-container { display: none !important; }`
  — `!important` is required; Obsidian's built-in styles have higher specificity.

### Design system

- **Tokens are defined once** at the top of `styles.css` on the plugin roots
  (`.tt-board`, `.tt-create-modal`, …) and inherit. Never redefine
  `--tt-space-*` / `--tt-control-*` inside a component's `<style>` block.
- **Shared primitives live in `styles.css`** as plugin-global classes: `.tt-label`,
  `.tt-divider`, `.tt-field-group`, `.tt-badge` (+variants), `.tt-count`,
  `.tt-group-heading`, `.tt-empty`, and the button system `.tt-btn` /
  `.tt-btn-primary` / `.tt-btn-danger` / `.tt-btn-sm`. Svelte scoped styles carry
  layout only — don't copy these rules into components.
- **Inputs**: background `--background-modifier-form-field`; focus
  `--background-modifier-border-focus`; radius `--tt-control-radius`.
- **Never hardcode white/hex text on user-configured colours** — tint the surface
  (`color-mix(in srgb, <color> 18%, var(--background-primary))`), border at ~60%
  mix, and use the colour itself as text.
- **Never use `var(--interactive-accent-rgb)` bare in a shadow** — it's an
  `r, g, b` triplet; wrap it: `rgba(var(--interactive-accent-rgb), 0.2)`.
- **Icons**: Lucide via `setIcon` (TS) or the `icon` action from `src/utils/icon.ts`
  (Svelte) — no unicode glyph buttons.
- **No JS-injected `<style>` elements** — all CSS belongs in `styles.css`.
  *(Svelte's scoped styles currently compile to injected `<style>` tags, so this
  rule is only honoured for hand-written CSS — see PB-4 in `PROJECT.md`.)*
- **The colour spine** — identity colour lives on the card/row **left edge**, keyed
  to the task's project `area`; badges stay monochrome. A new coloured badge will
  fight this model, so check before adding one.
- **Theme specificity trap** (found via the rig): themes style bare
  `input[type=text]` / `button` (app.css gives buttons a fixed height). Any plugin
  control that deviates — borderless title inputs, multi-line row buttons — needs
  a compound selector (`.tt-modal input.tt-modal-name`) or an explicit
  `height: auto` to survive.

## Product direction

- TickTick parity where expected: reminders, recurrence, quick capture
- TTasks differentiation where it matters: dependency intelligence, blocker
  visibility, realistic daily planning
- Prefer narrow vertical slices with clear acceptance criteria over large
  speculative features

## Dev workflow (git)

Solo dev — no review gate. When a slice is complete **and verified** (build
passing, tests green, visually checked where UI-facing):

1. Commit it on whatever branch you're on.
2. **Merge it into local `main`** — fast-forward when possible. `main` is the
   running integration point; keep it current.
3. **Push to `origin`** — expected, not opt-in (since 2026-07-31): the histories
   are identical, so it's a plain fast-forward, and CI only earns its keep if
   `main` actually reaches the remote.

Leave feature branches in place unless asked to prune. Confirm before genuinely
destructive git ops (hard reset, force-delete, history rewrite), and before
**cutting a release**, which is outward-facing and permanent.

### Cutting a release

```sh
npm version patch      # or minor/major — bumps package.json, runs
                       # version-bump.mjs (manifest.json + versions.json),
                       # commits, and tags BARE semver (no `v` — .npmrc)
git push --follow-tags # pushes the commit and the tag
```

The tag push triggers `.github/workflows/release.yml`, which re-runs `check` and
publishes `main.js` / `manifest.json` / `styles.css` to a GitHub release. It
refuses to build if the tag ≠ `manifest.json` version or `versions.json[tag]` ≠
`minAppVersion`. **Don't hand-edit the version** in `manifest.json` /
`versions.json` — `npm version` is the single entry point.

Releases go to GitHub only. Submitting to `obsidianmd/obsidian-releases` is
deliberately out of scope.
