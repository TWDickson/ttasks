# TTasks on the command line

With Obsidian's command-line interface turned on (Obsidian 1.12.7 installer or
later, **Settings → General → Command line interface**), TTasks adds `ttasks:*`
commands. Obsidian has to be running, and the CLI is desktop-only.

```sh
obsidian ttasks:list due=today
obsidian ttasks:show id=a1b2c3 format=text
obsidian ttasks:export preamble=review --copy
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

These commands only read. Commands that change tasks (create, complete, set a
status) are next (CLI-3). They will write directly, with no confirmation dialog.

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
