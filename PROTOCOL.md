# TTasks URI scheme

TTasks registers the Obsidian protocol action `ttasks`, so external tools
(Shortcuts, Raycast, Alfred, scripts, other apps) can drive it with URLs of
the form:

```
obsidian://ttasks?action=<action>&<params>
```

Add `vault=<vault name>` to target a specific vault (standard Obsidian URI
behavior); omit it to use the most recently open vault. URL-encode all
parameter values (`%20` for spaces, etc.).

Parsing is lenient by design: an unknown `action` falls back to `open-board`,
and unknown or invalid parameters are ignored. No action ever writes to the
vault directly from a URL — creation always goes through the create modal for
confirmation.

## Actions

### `open-board` (default)

Opens the TTasks board (plus rail and detail panes on desktop).

```
obsidian://ttasks
obsidian://ttasks?action=open-board
```

### `open`

Opens a task in the board + detail pane. `path` is required — the vault path
of the task file (`.md` is appended if missing).

```
obsidian://ttasks?action=open&path=Tasks%2Fa1b2c3-fix-roof.md
```

### `jump` (alias: `search`)

Opens the "Jump to task" fuzzy switcher over open tasks. Optional `query=`
pre-fills the search box, so external tools get a "find a task" entry point
without knowing file paths. Selecting a result opens board + detail.

```
obsidian://ttasks?action=jump
obsidian://ttasks?action=jump&query=roof
obsidian://ttasks?action=search&query=roof
```

### `new-task`

Opens the create-task modal. Optional prefill parameters (all validated;
invalid values are silently dropped):

| Param  | Prefills          | Validation                          |
| ------ | ----------------- | ----------------------------------- |
| `name` | Task name         | non-empty string                    |
| `area` | Area              | non-empty string                    |
| `due`  | Due date          | `YYYY-MM-DD` (alias: `due_date`)    |

```
obsidian://ttasks?action=new-task
obsidian://ttasks?action=new-task&name=Fix%20roof&area=Home&due=2026-07-10
```

### `new-project`

Opens the create modal in project mode (no prefill params).

```
obsidian://ttasks?action=new-project
```

### `quick`

Runs a quick action on a task without opening any UI. Requires
`quickAction=` (`start` | `complete` | `block` | `defer`) and `path=`.
`quick-start`, `quick-complete`, `quick-block`, and `quick-defer` work as
shorthand action names.

```
obsidian://ttasks?action=quick&quickAction=complete&path=Tasks%2Fa1b2c3-fix-roof.md
obsidian://ttasks?action=quick-complete&path=Tasks%2Fa1b2c3-fix-roof.md
```

`complete` routes through the shared completion helper, so recurring tasks
spawn their next instance exactly as they would from the UI.

## Implementation notes

- Parsing lives in `src/integration/protocol.ts` (`parseProtocolAction`) —
  a pure module with tests in `protocol.test.ts`. Dispatch wiring is in
  `src/main.ts` (`registerProtocolHandler`).
- The planned public plugin API (see `NATIVE_FEATURES_TASKS.md` N3) should
  keep protocol parity for its UI-opening endpoints.
