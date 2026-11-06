# TTasks on the command line

With Obsidian's command-line interface turned on (Obsidian 1.12.7 installer or
later, **Settings → General → Command line interface**), TTasks adds `ttasks:*`
commands. Obsidian has to be running, and the CLI is desktop-only.

```sh
obsidian ttasks:list due=today
obsidian ttasks:show id=a1b2c3 format=text
obsidian ttasks:export preamble=review --copy
obsidian ttasks:create name="Call the bank" area=Home due=tomorrow
obsidian ttasks:complete id=a1b2c3
```

Add `vault=<name>` first to pick a vault (`obsidian vault=Notes ttasks:list`).
`--copy` puts any command's output on the clipboard. `obsidian help` lists every
command with its flags.

**Conventions**

- **Output is JSON by default**; `format=text` (and `format=tsv` for `list`) on
  request.
- Tasks come back in the same shape as the Share/Sync AI export: `ref` is the
  task's hash, links are names, and the derived fields (`impeded`,
  `impeded_by`, `scheduled_start`, `scheduled_end`, `in_cycle`) are filled in.
- A task is addressed by its **hash**, the `a1b2c3` at the start of its file
  name, which survives renames. A unique prefix is enough, and a leading `#` is
  fine. `path=` takes its vault path instead.
- Values are matched case-insensitively (`status=hold`), and `a,b` means any
  of them.
- A mistake comes back as output rather than a crash:
  `{"error": "status=Doing is not a configured value", "valid": ["Active", …]}`.
  With `format=text` it's `Error: …` and `Valid: …` lines.

- **Writes happen directly, with no confirmation dialog** — a command typed in
  a terminal is deliberate, and an agent can't click one. Every flag is checked
  before anything is written, so a mistake changes nothing. They take the same
  path as the board: the status-changed and completed dates are stamped, and
  completing a repeating task spawns its next instance.
- **Writes are safe to repeat.** Completing a completed task, or setting the
  status a task already has, does nothing and says `"changed": false`.
- Writes accept only the vault's configured statuses, areas, priorities and
  labels; they never invent a value. `due=` and `start=` take `YYYY-MM-DD`,
  `today` or `tomorrow`.
- If a write fails (a full disk, say), the answer is `{"error": …}` like any
  other mistake.

| Command | Does |
| --- | --- |
| `ttasks:list` / `show` / `export` | Read |
| `ttasks:open` / `new` | Show something in Obsidian; write nothing |
| `ttasks:create` / `complete` / `status` / `depend` | Change tasks |

## `ttasks:list`

Tasks, filtered like the board. Open tasks only, unless `completed=` says
otherwise.

| Flag | Meaning |
| --- | --- |
| `view=<name\|id>` | Start from a Smart List (`Today`, `Blocked`, your own). The other flags narrow it. |
| `status=` / `area=` / `priority=` | Any of these values |
| `label=` | Has any of these labels |
| `project=<hash\|name>` | Tasks in this project, plus the project itself |
| `type=task\|project` | Only one kind |
| `due=today\|overdue\|week\|none\|YYYY-MM-DD` | By due date. A date inferred from the dependency chain counts, as on the board. `week` is the calendar week, following **Week starts on**. |
| `search=<text>` | Name and notes; a hash works too (`#a1b2` for the hash only) |
| `completed=exclude\|include\|only` | Default `exclude`; with `view=`, the Smart List decides |
| `limit=<n>` | At most n tasks |
| `notes=none\|summary\|full` | Note bodies; default `none` |
| `format=json\|text\|tsv` | |

JSON output is `{"count": n, "tasks": [...]}`, sorted by due date and then
priority, or by the Smart List's own sort. `text` prints one line per task:

```
a1b2c3  Active  High  Get quotes  · Home · due 2026-11-06 · in Roof
```

## `ttasks:show`

One task, with its notes. `id=<hash>` or `path=<vault path>`;
`notes=none|summary|full` (default `full`); `format=json|text`. JSON output is
the task plus its `path`.

## `ttasks:export`

The Share/Sync export, the same document the modal copies.

| Flag | Meaning |
| --- | --- |
| `format=json\|toon` | Default `json`. TOON is the denser format, for `mode=ai` only |
| `mode=ai\|full` | `ai` (default) for an assistant; `full` round-trips vault state for import |
| `preamble=<prompt id>` | Put a Share/Sync prompt in front, with the data in a fenced block. A bare `preamble` means `review`. |
| `status=` / `area=` / `label=` / `project=` | The modal's filters |
| `completed=include\|exclude` | Default `include` |
| `completed-within=<days>` | Only completed work from the last n days |
| `notes=full\|summary\|none` | Default `full` |

`obsidian ttasks:export preamble=review --copy` is the terminal equivalent of
opening Share/Sync and pressing Copy.

## `ttasks:open`

`obsidian ttasks:open id=a1b2c3` opens the task in the board and detail pane
(the URI handler's `open`). With no task it opens the board.

## `ttasks:new`

Opens the new-task dialog in Obsidian, prefilled, and writes nothing until you
press Create (the URI handler's `new-task`). Takes the same field flags as
`create`, below, minus `status`, `due-time`, `estimate`, `depends` and
`notes`. Unlike the URI handler, a value that isn't configured is an error
rather than silently dropped.

## `ttasks:create`

Creates a task (or, with `type=project`, a project) and prints it as
`{"created": {…}}`.

| Flag | Meaning |
| --- | --- |
| `name=` | Required |
| `type=task\|project` | Default `task` |
| `area=` | A configured area. Without one the task lands in the inbox |
| `status=` | Default: your first status |
| `priority=` | `High`, `Medium`, `Low` or `None` (default) |
| `label=<a,b>` | Tasks only; projects carry no labels |
| `project=<hash\|name>` | The project it belongs to |
| `start=` / `due=` | `YYYY-MM-DD`, `today` or `tomorrow` |
| `due-time=<HH:MM>` | Needs `due=` |
| `estimate=<days>` | Estimated days of work |
| `depends=<a,b>` | Tasks it waits on, by hash |
| `notes=<text>` | The note body |

## `ttasks:complete`

`obsidian ttasks:complete id=a1b2c3` → `{"completed": {…}, "next": {…} | null,
"changed": true}`. `next` is the new instance a repeating task spawned.

## `ttasks:status`

`obsidian ttasks:status id=a1b2c3 status="In Progress"` → `{"updated": {…},
"changed": true}`. Setting your completion status completes the task, exactly
as `ttasks:complete` does. `reason=<text>` sets why it's blocked, and goes
only with your blocked status:
`obsidian ttasks:status id=a1b2c3 status=Blocked reason="Waiting on HOA"`.

## `ttasks:depend`

`obsidian ttasks:depend id=a1b2c3 on=d4e5f6,778899` makes a1b2c3 wait on both.
Add `remove` to drop them instead. A dependency that would make a loop is
refused, and then none of the list is written. Output:
`{"updated": {…}, "added": [names], "unchanged": [names], "changed": true}`
(`removed` in place of `added` with `remove`).
