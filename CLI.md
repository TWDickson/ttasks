# TTasks on the command line

With Obsidian's command-line interface turned on (Obsidian 1.12.7 installer or
later, **Settings → General → Command line interface**), TTasks adds `ttasks:*`
commands. Obsidian has to be running, and the CLI is desktop-only.

```sh
obsidian ttasks:context                      # start here
obsidian ttasks:next
obsidian ttasks:why id=a1b2c3
obsidian ttasks:update id=a1b2c3 estimate=3 dry-run
obsidian ttasks:complete id=a1b2c3
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
| [`create`](#ttaskscreate) / [`update`](#ttasksupdate) / [`complete`](#ttaskscomplete) / [`status`](#ttasksstatus) / [`depend`](#ttasksdepend) | Change tasks |
| [`lint`](#ttaskslint) | Hygiene check; run it after a batch of writes |

## How TTasks schedules work (read this before writing)

TTasks works most dates out itself, and that is what trips up a person or an
agent coming to it cold:

- **Most tasks have no dates on purpose.** A task starts when everything it
  depends on is done, then takes its estimate (`estimated_days`, in working
  days; areas set to skip weekends also skip holidays). `scheduled_start` and
  `scheduled_end` in the output are that computed plan. They appear once
  something in the chain is dated. **A blank due date is not missing data.
  Don't fill it in.**
- **`due=` is for a real external deadline only.** It pins the task to that
  date instead of the computed schedule, and everything downstream follows it.
  To make work take longer, set `estimate=`. To make it wait for other work,
  use `ttasks:depend`. Use `start=` only when work truly can't begin before a
  date.
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
- **Writes that set a date carry `warnings`:** the deadline rule, a date in
  the past, or a deadline the dependency chain can't meet ("the chain finishes
  this task on 2026-11-13, after due 2026-11-10").

## Conventions

- **Output is JSON by default**; `format=text` (and `format=tsv` for `list`) on
  request. Responses carry `today`, the local date everything was computed
  against.
- **Dates** are local calendar dates, `YYYY-MM-DD`. The only words accepted
  are `today`, `tomorrow`, and `none` (to clear). There's deliberately no
  "next friday": it is ambiguous across locales and week starts, and a wrong
  date written quietly is worse than an error. The error tells you today's
  date and weekday so you can work it out.
- Tasks come back in the same shape as the Share/Sync AI export: `ref` is the
  task's hash, and links are names.
- A task is addressed by its **hash**, the `a1b2c3` at the start of its file
  name, which survives renames. A unique prefix is enough, and a leading `#` is
  fine. `path=` takes its vault path instead.
- Values are matched case-insensitively (`status=hold`), and `a,b` means any
  of them. Writes accept only the vault's configured values; they never invent
  one.
- A mistake comes back as output rather than a crash:
  `{"error": "status=Doing is not a configured value", "valid": ["Active", …]}`.
  With `format=text` it's `Error: …` and `Valid: …` lines. A write that fails
  (a full disk, say) answers the same way.
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
`area=`, `project=`, `limit=` (default 10), `format=json|text`. JSON adds
`ready_total` and `waiting_to_start`.

## `ttasks:why`

`obsidian ttasks:why id=a1b2c3`: whether the task can be worked on, and why
not. Its own status (with the blocked reason), what impedes it from upstream,
the unfinished chain it waits on (as a tree, with each task's status and
computed finish), a loop, or a later start. `unblocks` names the open tasks
waiting on it.

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
| `due=today\|overdue\|week\|none\|YYYY-MM-DD` | By due date. **A computed date counts**, as on the board. `week` is the calendar week, following **Week starts on**. |
| `search=<text>` | Name and notes; a hash works too (`#a1b2` for the hash only) |
| `completed=exclude\|include\|only` | Default `exclude`; with `view=`, the Smart List decides |
| `limit=<n>` | At most n tasks |
| `notes=none\|summary\|full` | Note bodies; default `none` |
| `format=json\|text\|tsv` | |

JSON output is `{"today": …, "count": n, "tasks": [...]}`, sorted by due date
and then priority, or by the Smart List's own sort. `text` prints one line per
task:

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

## `ttasks:open`

`obsidian ttasks:open id=a1b2c3` opens the task in the board and detail pane
(the URI handler's `open`). With no task it opens the board.

## `ttasks:new`

Opens the new-task dialog in Obsidian, prefilled, and writes nothing until you
press Create (the URI handler's `new-task`). Takes `type`, `name`, `area`,
`project`, `priority`, `label`, `start` and `due`. Unlike the URI handler, a
value that isn't configured is an error rather than silently dropped.

## Write output

Every write answers in one shape:

```json
{
  "today": "2026-11-06",
  "dry_run": true,
  "changed": true,
  "updated": { "ref": "a1b2c3", "scheduled_end": "2026-11-13", "…": "…" },
  "warnings": ["due= pins this task, and everything downstream of it, …"],
  "impact": [
    { "ref": "d4e5f6", "name": "Design", "scheduled_end": { "from": "2026-11-13", "to": "2026-11-16" } },
    { "ref": "778899", "name": "Build", "impeded": { "from": null, "to": "Blocked" } }
  ]
}
```

The task is under `created`, `updated` or `completed`. `dry_run`, `warnings`
and `impact` appear only when they apply. Impact lists at most 25 tasks, with
`impact_more` counting the rest. In a dry run, a task that doesn't exist yet
(a new task, a repeat's next instance) has the ref `new`. `format=text` prints
the same as lines.

The task always carries its `labels`. When the write sets the body (`notes=`,
`append=`), the reply carries the whole new body under `notes` too, so a dry run
shows exactly what would land.

### Note text

`notes=` and `append=` arrive as one shell argument, so:

- **`\n` is a line break**, `\t` a tab, and `\\` a literal backslash. Any other
  backslash is kept as typed.
- **Task links are written bare**, as `[[id-slug|Name]]`. A folder prefix
  (`[[Tasks/a1b2c3-fix-roof]]`) and a `.md` are dropped, and a link with no alias
  gets the task's name. Only links that resolve to a task (open or archived)
  change; links to other notes and embeds (`![[…]]`) stay as written. The reply lists what changed under
  `links_made_bare`.

## `ttasks:create`

Creates a task (or, with `type=project`, a project).

| Flag | Meaning |
| --- | --- |
| `name=` | Required |
| `type=task\|project` | Default `task` |
| `area=` | A configured area. Without one the task lands in the inbox |
| `status=` | Default: your first status |
| `priority=` | `High`, `Medium`, `Low` or `None` (default) |
| `label=<a,b>` | Tasks only; projects carry no labels |
| `project=<hash\|name>` | The project it belongs to |
| `estimate=<days>` | Working days of effort. **This, not a date, is how to size work** |
| `depends=<a,b>` | Tasks it waits on, by hash |
| `start=` / `due=` | Usually leave blank (see above) |
| `due-time=<HH:MM>` | Needs `due=` |
| `notes=<text>` | The note body (see [Note text](#note-text)) |
| `dry-run` | Preview |

## `ttasks:update`

Changes fields on a task. Give at least one; anything left out stays as it is.

| Flag | Meaning |
| --- | --- |
| `name=` | Rename. Links to it follow |
| `area=<area\|none>` | `none` sends it to the inbox |
| `priority=` | |
| `label=<a,b\|none>` | Replace the labels; `add-label=` / `remove-label=` adjust them |
| `project=<hash\|name\|none>` | Move into a project, or out with `none` |
| `estimate=<days\|none>` | Working days of effort |
| `start=` / `due=` `<date\|none>` | `none` unpins it and hands it back to the schedule |
| `due-time=<HH:MM\|none>` | Clearing the due date clears its time too |
| `notes=<text>` | Replace the whole body (see [Note text](#note-text)) |
| `append=<text>` | Add a paragraph to the body, same rules |
| `dry-run` | Preview |

A status change goes through `ttasks:status`, so a completion recurs.

## `ttasks:complete`

`obsidian ttasks:complete id=a1b2c3` → the task under `completed`, plus `next`:
the new instance a repeating task spawned, or `null`. `impact` shows the tasks
it frees.

## `ttasks:status`

`obsidian ttasks:status id=a1b2c3 status="In Progress"`. Setting your
completion status completes the task, exactly as `ttasks:complete` does.
`reason=<text>` says why it's blocked, and goes only with your blocked status:
`obsidian ttasks:status id=a1b2c3 status=Blocked reason="Waiting on HOA"`.
Setting a status that spreads downstream warns you not to restatus the tasks
behind it.

## `ttasks:depend`

`obsidian ttasks:depend id=a1b2c3 on=d4e5f6,778899` makes a1b2c3 wait on both.
Add `remove` to drop them instead. A dependency that would make a loop is
refused, and then none of the list is written. The result adds `added` (or
`removed`) and `unchanged` name lists, and `impact` shows the dates it pushes.
With `remove`, `on=` also takes the hash of a dependency whose task isn't in the
tasks folder (archived, or gone), so a dangling link `ttasks:lint` reports can be
cleared.

## `ttasks:lint`

Read-only. Reports what makes a plan go stale without anything failing. Links
resolve against open **and archived** tasks, so a link to archived work isn't
dangling.

Format checks read every note directly in the tasks folder, completed ones and
ones the board refuses included:

| Check | Flags |
| --- | --- |
| `dangling-link` | A frontmatter link (`ttask_parent_task`, `ttask_depends_on`, `ttask_repeat_of`) or body task link to a task that is neither open nor archived |
| `prefixed-link` | A task link with a folder prefix (`[[Planner/Tasks/a1b2c3-…\|Name]]`), in frontmatter or the body. A bare link with no `\|Name` isn't flagged |
| `format-drift` | A filename that isn't `{6hex}-{slug}.md`; `cssclasses` without `ttask`; a missing always-written key; a status, priority, area or label that isn't configured; a date that isn't `YYYY-MM-DD`, a time that isn't `HH:MM`, a number that isn't one; a link that isn't an aliased `[[wiki-link]]`; a note with no `ttask_name` (the board skips it) |
| `legacy-keys` | Property names from before the `ttask_` prefix: an old-format note (hidden from the board), or old keys left beside new ones |

Work checks read open tasks only:

| Check | Flags |
| --- | --- |
| `stalled-without-reason` | Your blocked status with no `blocked_reason` |
| `thin-body` | A body with fewer than `min-body=` non-whitespace characters (default 50), on any open task that isn't blocked, on hold or future. `thin-status=<a,b>` checks only those statuses (`thin-status=Active` matches `planner.py`) |
| `overdue` | A due date before today |
| `open-under-finished-parent` | An open task whose project is complete or archived |

Each issue has `check`, `ref`, `name`, `path`, `message`, and a `fix` command
where there is one. JSON adds `checked` (notes looked at), `archived` (archived
tasks links can resolve to), `count` and `by_check`. Flags: `check=<a,b>` to
run only some checks, `min-body=<chars>`, `thin-status=<a,b>`, `format=json|text`.
