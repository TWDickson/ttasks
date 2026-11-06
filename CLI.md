# TTasks on the command line

With Obsidian's command-line interface turned on (Obsidian 1.12.7 installer or
later, **Settings → General → Command line interface**), TTasks adds `ttasks:*`
commands. Obsidian has to be running, and the CLI is desktop-only.

```sh
obsidian ttasks:context                      # start here
obsidian ttasks:next
obsidian ttasks:why id=a1b2c3
obsidian ttasks:update id=a1b2c3 estimated-days=3 dry-run
obsidian ttasks:complete id=a1b2c3,d4e5f6
obsidian ttasks:lint fix
```

Add `vault=<name>` first to pick a vault (`obsidian vault=Notes ttasks:list`).
`--copy` puts any command's output on the clipboard. `obsidian help` lists every
command with its flags.

| Command | Does |
| --- | --- |
| [`context`](#ttaskscontext) | Today's date, this vault's statuses and values, and the scheduling rules. **Call it first.** |
| [`next`](#ttasksnext) / [`why`](#ttaskswhy) | What can be worked on now; what is holding a task up |
| [`list`](#ttaskslist) / [`show`](#ttasksshow) / [`export`](#ttasksexport) | Read |
| [`open`](#ttasksopen) / [`new`](#ttasksnew) | Show something in Obsidian; write nothing |
| [`create`](#ttaskscreate) / [`update`](#ttasksupdate) / [`complete`](#ttaskscomplete) | Change tasks |
| [`lint`](#ttaskslint) | Hygiene check, and `fix` for link form; run it after a batch of writes |

## How TTasks schedules work (read this before writing)

TTasks works most dates out itself, and that is what trips up a person or an
agent coming to it cold:

- **Most tasks have no dates on purpose.** A task starts when everything it
  depends on is done, then takes its estimate (`estimated_days`, in working
  days; areas set to skip weekends also skip holidays). `scheduled_start` and
  `scheduled_end` in the output are that computed plan. They appear once
  something in the chain is dated. **A blank due date is not missing data.
  Don't fill it in.**
- **`due-date=` is for a real external deadline only.** It pins the task to
  that date instead of the computed schedule, and everything downstream follows
  it. To make work take longer, set `estimated-days=`. To make it wait for
  other work, set `add-depends-on=`. Use `start-date=` only when work truly
  can't begin before a date.
- **Blocked, Hold and Future spread downstream.** Set them only on the task
  that is actually stuck. Everything waiting behind it shows `impeded` and
  `impeded_by` by itself, and clears when the blocker does.
- **Computed fields are read-only:** `impeded`, `impeded_by`, `in_cycle`,
  `scheduled_start`, `scheduled_end`, `blocks`.

The CLI shows you these effects instead of expecting you to predict them:

- **Every write reports `impact`:** the other tasks whose computed dates or
  impediment the change moved, each with `from` and `to`.
- **`dry-run` on any write** reports the same result and impact without
  writing anything. Use it before changing dates, estimates, dependencies or
  statuses.
- **`warnings` are for real problems only:** a date in the past, a deadline
  the dependency chain can't meet ("the chain finishes this task on
  2026-11-13, after due 2026-11-10"), a parking status that impedes open work
  downstream, or a block with no reason. The rules above are not repeated on
  every write.

## Conventions

- **One vocabulary.** A flag is named after the output field it sets or
  filters, with `-` for `_`: `due-date=` is `due_date`, `estimated-days=` is
  `estimated_days`, `parent=` is `parent`. List fields take `add-` and `remove-`
  forms (`add-labels=`, `remove-depends-on=`). `none` clears a field.
  `show-notes=` (how much body a read shows) is the one flag that sets nothing.
- **A flag a command doesn't take is an error**, listing the ones it does, so
  a misspelt or old name can't be silently ignored.
- **Output is JSON by default**; `format=text` (and `format=tsv` for `list`) on
  request. Responses carry `today`, the local date everything was computed
  against.
- **Dates** are local calendar dates, `YYYY-MM-DD`. The only words accepted
  are `today`, `tomorrow`, and `none` (to clear). There's deliberately no
  "next friday": it is ambiguous across locales and week starts, and a wrong
  date written quietly is worse than an error. The error tells you today's
  date and weekday so you can work it out.
- Tasks come back in the shape of the Share/Sync AI export, plus `source` and
  `workweek_only` when set: `ref` is the task's hash, and links are names.
- **Every flag that names a task** (`id=`, `parent=`, `depends-on=`, …) takes
  its **hash** (the `a1b2c3` at the start of its file name, which survives
  renames; a unique prefix or a leading `#` is fine), its exact **name** when
  only one task has it, or its vault path. Names aren't unique, so prefer the
  hash. `path=` takes a vault path explicitly.
- Values are matched case-insensitively (`status=hold`), and `a,b` means any
  of them. Writes accept only the vault's configured values; they never invent
  one.
- `completed=exclude|include|only` means the same on every read, and defaults
  to `exclude`.
- **Errors come back as output**, with a `code` to branch on:
  `{"error": "status=Doing is not a configured value", "code": "unknown-value", "valid": ["Active", …]}`.
  With `format=text` it's `Error: …` and `Valid: …` lines.

  | `code` | Means |
  | --- | --- |
  | `bad-argument` | A flag that is malformed, misplaced, missing or unknown |
  | `unknown-value` | A value that isn't configured; `valid` lists them |
  | `not-found` | No task matches the reference |
  | `ambiguous` | Several tasks match; `valid` lists them |
  | `not-a-date` | A date or time that can't be read |
  | `dependency-loop` | A dependency that would make a cycle |
  | `nothing-to-change` | An `update` with no field flags |
  | `unavailable` | The vault hasn't been converted; nothing runs |
  | `write-failed` | A write threw or didn't land. In a batch, the message names what was already written |

- **Writes happen directly, with no confirmation dialog.** Every flag is
  checked before anything is written, so a mistake changes nothing. They take
  the same path as the board: dates are stamped, links are kept, and
  completing a repeating task spawns its next instance.
- **Writes are safe to repeat.** A write that is already true (completing a
  completed task, setting the status it has) does nothing and says
  `"changed": false`.

## `ttasks:context`

Today's date and weekday, the week start, every status with its roles (`new`,
`started`, `done`, `blocked`, `on-hold`, `future`), the configured priorities,
areas (and which skip weekends), labels, the scheduling rules above in words,
and the command list. `format=text` gives the same as prose.

## `ttasks:next`

What can be worked on today: open tasks that aren't impeded, parked
(blocked/hold/future), in a loop, or due to start later. Work already started
comes first, then by due date (or computed finish), then priority.
`area=`, `parent=`, `limit=` (default 10), `format=json|text`. JSON adds
`ready_total` and `waiting_to_start`.

## `ttasks:why`

`obsidian ttasks:why id=a1b2c3`: whether the task can be worked on, and why
not. Its own status (with the blocked reason), what impedes it from upstream,
the unfinished chain it waits on (as a tree, with each task's status and
computed finish), a loop, or a later start. `unblocks` names the open tasks
waiting on it.

## `ttasks:list`

Tasks, filtered like the board.

| Flag | Meaning |
| --- | --- |
| `view=<name\|id>` | Start from a Smart List (`Today`, `Blocked`, your own). The other flags narrow it. |
| `status=` / `area=` / `priority=` | Any of these values |
| `labels=` | Has any of these labels |
| `parent=<hash\|name>` | Tasks in this project, plus the project itself |
| `type=task\|project` | Only one kind |
| `due-date=today\|overdue\|week\|none\|YYYY-MM-DD` | By due date. **A computed date counts**, as on the board. `week` is the calendar week, following **Week starts on**. |
| `search=<text>` | Name and notes; a hash works too (`#a1b2` for the hash only) |
| `completed=exclude\|include\|only` | Default `exclude`; with `view=`, the Smart List decides |
| `limit=<n>` | At most n tasks |
| `show-notes=none\|summary\|full` | Note bodies; default `none` |
| `format=json\|text\|tsv` | |

JSON output is `{"today": …, "count": n, "tasks": [...]}`, sorted by due date
and then priority, or by the Smart List's own sort. `text` prints one line per
task:

```
a1b2c3  Active  High  Get quotes  · Home · due 2026-11-06 · in Roof
```

## `ttasks:show`

One task, with its notes. `id=<hash|name>` or `path=<vault path>`;
`show-notes=none|summary|full` (default `full`); `format=json|text`. JSON output
is the task plus its `path`.

## `ttasks:export`

The Share/Sync export, the same document the modal copies.

| Flag | Meaning |
| --- | --- |
| `format=json\|toon` | Default `json`. TOON is the denser format, for `mode=ai` only |
| `mode=ai\|full` | `ai` (default) for an assistant; `full` round-trips vault state for import |
| `preamble=<prompt id>` | Put a Share/Sync prompt in front, with the data in a fenced block. A bare `preamble` means `review`. |
| `status=` / `area=` / `labels=` / `parent=` | The modal's filters |
| `completed=exclude\|include\|only` | Default `exclude`, as on `list`; `completed-within=` implies `include` |
| `completed-within=<days>` | Only completed work from the last n days |
| `show-notes=full\|summary\|none` | Default `full` |

## `ttasks:open`

`obsidian ttasks:open id=a1b2c3` opens the task in the board and detail pane
(the URI handler's `open`). With no task it opens the board.

## `ttasks:new`

Opens the new-task dialog in Obsidian, prefilled, and writes nothing until you
press Create (the URI handler's `new-task`). Takes `type`, `name`, `area`,
`parent`, `priority`, `labels`, `start-date` and `due-date`. Unlike the URI
handler, a value that isn't configured is an error rather than silently dropped.

## Write output

Every write answers in one shape:

```json
{
  "today": "2026-11-06",
  "dry_run": true,
  "verb": "updated",
  "changed": true,
  "tasks": [
    { "ref": "a1b2c3", "scheduled_end": "2026-11-13", "…": "…", "path": "Tasks/a1b2c3-….md", "changed": true }
  ],
  "warnings": [{ "ref": "a1b2c3", "message": "due 2026-11-01 is in the past (today is 2026-11-06)." }],
  "impact": [
    { "ref": "d4e5f6", "name": "Design", "scheduled_end": { "from": "2026-11-13", "to": "2026-11-16" } },
    { "ref": "778899", "name": "Build", "impeded": { "from": null, "to": "Blocked" } }
  ]
}
```

- `verb` is `created`, `updated` or `completed`. `tasks` always holds the
  task(s) as written, each with its own `changed`, also when there's only one.
- A completion adds `spawned`: the next instance each repeating task created
  (empty when none did). An `update` that sets the completion status does too.
- `dry_run`, `warnings`, `impact` and `links_made_bare` appear only when they
  apply. Impact lists at most 25 tasks, with `impact_more` counting the rest.
- In a dry run, a task that doesn't exist yet (a new task, a repeat's next
  instance) has the ref `new`.
- Each task always carries its `labels`. When the write sets the body
  (`notes=`, `append-notes=`), the task carries the whole new body under
  `notes` too, so a dry run shows exactly what would land.
- `format=text` prints the same as lines.

### Note text

`notes=` and `append-notes=` arrive as one shell argument, so:

- **`\n` is a line break**, `\t` a tab, and `\\` a literal backslash. Any other
  backslash is kept as typed.
- **Task links are written bare**, as `[[id-slug|Name]]`. A folder prefix
  (`[[Tasks/a1b2c3-fix-roof]]`) and a `.md` are dropped, and a link with no
  alias gets the task's name. Only links that resolve to a task (open or
  archived) change; links to other notes and embeds (`![[…]]`) stay as written.
  The reply lists what changed under `links_made_bare`.

## The field flags

`create` and `update` take the same flags. On `update`, the ones marked
*clearable* also take `none`.

| Flag | Sets | Notes |
| --- | --- | --- |
| `name=` | `name` | Renaming keeps links |
| `area=` | `area` | A configured area; without one the task is in the inbox. *Clearable* |
| `status=` | `status` | A configured status. Your completion status completes the task, so a repeat recurs |
| `priority=` | `priority` | `High`, `Medium`, `Low` or `None` |
| `labels=<a,b>` | `labels` | Tasks only. *Clearable*. `update` also takes `add-labels=` / `remove-labels=` |
| `parent=<task>` | `parent` | The project it belongs to. *Clearable* |
| `depends-on=<a,b>` | `depends_on` | Tasks it waits on. A loop is refused. *Clearable*. `update` also takes `add-depends-on=` / `remove-depends-on=`; removing takes the hash of an archived or missing task too, so a dangling link can be cleared |
| `blocked-reason=` | `blocked_reason` | What it waits on; goes with your blocked status. *Clearable* |
| `assigned-to=` | `assigned_to` | *Clearable* |
| `source=` | `source` | Where it came from (a chat, an email). *Clearable* |
| `start-date=` / `due-date=` | `start_date` / `due_date` | Usually leave blank (see above). *Clearable*: `none` hands it back to the schedule |
| `due-time=<HH:MM>` | `due_time` | Needs a due date; clearing the due date clears it. *Clearable* |
| `estimated-days=<days>` | `estimated_days` | Working days of effort. **This, not a date, is how to size work.** *Clearable* |
| `workweek-only=true\|false` | `workweek_only` | Schedule on working days only |
| `recurrence=` | `recurrence` | `daily`, `weekly`, `biweekly`, `monthly`, `yearly` (or "every 2 weeks" and the like). A custom rule is made in Obsidian's repeat builder. *Clearable*: `none` stops the repeat |
| `recurrence-type=` | `recurrence_type` | `fixed` (from the due date, default) or `from_completion` |
| `notes=` | `notes` | The body (see [Note text](#note-text)). `update` also takes `append-notes=` |

Every write also takes `dry-run` and `format=json|text`.

## `ttasks:create`

Creates a task (or, with `type=project`, a project). `name=` is required;
`status=` defaults to your first status. Takes `type=task|project` and every
[field flag](#the-field-flags).

## `ttasks:update`

Changes a task, or several: `id=a1b2c3,d4e5f6` makes the same change to each,
checks all of them before writing any, and reports one combined `impact`. Give
at least one [field flag](#the-field-flags); anything left out stays as it is.
Status and dependency changes are fields like any other:

```sh
obsidian ttasks:update id=a1b2c3 status=Blocked blocked-reason="Waiting on HOA"
obsidian ttasks:update id=a1b2c3 add-depends-on=d4e5f6 dry-run
obsidian ttasks:update id=a1b2c3,d4e5f6 add-labels=action priority=High
```

## `ttasks:complete`

`obsidian ttasks:complete id=a1b2c3` (or `id=a,b,c`): the task(s) under
`tasks`, plus `spawned`, the next instance each repeating task created.
`impact` shows the tasks it frees. The same as `update status=<completion>`.

## `ttasks:lint`

Reports what makes a plan go stale without anything failing. Links resolve
against open **and archived** tasks, so a link to archived work isn't dangling.

Format checks read every note directly in the tasks folder, completed ones and
ones the board refuses included:

| Check | Flags |
| --- | --- |
| `dangling-link` | A frontmatter link (`ttask_parent_task`, `ttask_depends_on`, `ttask_repeat_of`) or body task link to a task that is neither open nor archived |
| `prefixed-link` | A task link with a folder prefix (`[[Planner/Tasks/a1b2c3-…\|Name]]`), in frontmatter or the body. A bare link with no `\|Name` isn't flagged |
| `format-drift` | A filename that isn't `{6hex}-{slug}.md`; `cssclasses` without `ttask`; a missing always-written key; a status, priority, area or label that isn't configured; a date that isn't `YYYY-MM-DD`, a time that isn't `HH:MM`, a number that isn't one; a frontmatter link that isn't an aliased `[[wiki-link]]`; a note with no `ttask_name` (the board skips it) |
| `legacy-keys` | Property names from before the `ttask_` prefix: an old-format note (hidden from the board), or old keys left beside new ones |

Work checks read open tasks only:

| Check | Flags |
| --- | --- |
| `stalled-without-reason` | Your blocked status with no `blocked_reason` |
| `thin-body` | A body with fewer than `min-body=` non-whitespace characters (default 50), on any open task that isn't blocked, on hold or future. `thin-status=<a,b>` checks only those statuses |
| `overdue` | A due date before today |
| `open-under-finished-parent` | An open task whose project is complete or archived |

Each issue has `check`, `ref`, `name`, `path`, `message`, and a `fix` command
where there is one. JSON adds `checked` (notes looked at), `archived` (archived
tasks links can resolve to), `count` and `by_check`.

**`fix`** repairs what is mechanical: a prefixed task link (frontmatter or
body) becomes bare, and a frontmatter link with no alias gets the task's name.
Those issues say `"fix": "ttasks:lint fix"`. The reply lists the repairs under
`fixed` (each with `from` and `to`), and `issues` is what is left, which needs
judgement. `fix dry-run` previews the repairs.

Flags: `check=<a,b>` to run only some checks, `min-body=<chars>`,
`thin-status=<a,b>`, `fix`, `dry-run`, `format=json|text`.
