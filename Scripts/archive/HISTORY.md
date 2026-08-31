# TTasks — Development History

The dated journal of what shipped and **why decisions went the way they did**.
Consolidated 2026-08-02 from the former `ROADMAP.md`, `CLAUDE.md`'s "Recent
Updates" sections (which had drifted into two parallel journals of the same
events), and the eight closed-sweep files that lived in this directory.

This is history, not a work registry. **Open work lives in `PROJECT.md`.** An
unchecked box quoted here is historical — do not treat it as live.

Full detail for anything summarized here is recoverable from git.

---

## 2026-08-31 — Right-click "Open", and the review-bot sweep

Taylor: *"right click open on a task should open the note in a new tab, not the
side panel."* The context menu's **Open** called `openTaskDetail`, which reveals
the board plus the detail pane — precisely what a left click on the row already
does. So the menu item cost a click and changed nothing. It now calls
`taskStore.openFile` (`getLeaf('tab')`), and the port carrying it is renamed
`openTaskDetail` → `openTaskNote`, because "open" is ambiguous exactly where
this bug lived: TTasks has two of them, and the type name should say which.
Left click is deliberately untouched — the detail pane is the right default for
a row you're triaging.

That prompted a "what else is cheap?" pass over PB-2, and the answer was more
than expected.

### The one that could lose data

`syncCompletionToSource` ticks the checkbox in the note a task was captured
from. It read the whole file, edited one line **in memory**, and wrote the whole
file back. Anything typed into that note between the read and the write was
gone — no conflict, no warning, just an older copy of the file landing on top.
The window is small but the source note is, by construction, a note the user
works in: a daily note, a meeting note.

`vault.process` closes it — Obsidian re-reads under its own lock and hands the
callback the current content. The rewrite moved into a pure `rewriteSource()`
that returns `null` for "no change", which let the same function serve two
callers: a cheap `cachedRead` **pre-check** that decides whether to write at
all, and the `process` callback that re-derives the answer from fresh content.
The pre-check matters because `process` writes whatever it returns — without it,
every status change on a captured task would rewrite its source note, bump
mtime, and re-trigger the scan for nothing.

`vaultSafe.safeModify` turned out to have **no production callers at all**, so
it was deleted rather than left as a flagged wrapper around a call we'd decided
not to make. `VaultLike` no longer declares `modify`, which is what actually
stops this regressing — you can't reach for it by accident.

### Gating the logs without going blind

The console-noise flag is trivially "wrap `plugin.log` in a NODE_ENV check" —
and that would have been a mistake. Roughly **half of the ~40 call sites are
failure reports**: `create failed for…`, `import link failed…`,
`archive move failed…`. Silencing those in production removes the only evidence
a user could paste into a bug report. So `log()` is now dev-gated for
breadcrumbs (scan counts, migration tallies, timings) and a sibling `logError()`
always reports; the failure sites moved over. The `ScanEngine` and
`migrationSettingsSection` paths needed nothing — they already `console.error`
alongside `plugin.log`, which is why the split was safe to make mechanically.

Adding `logError` to the plugin surface broke four test mocks that had `log` and
not `logError` — the exact drift `CLAUDE.md` warns about, caught by the suite
rather than in a vault.

### Two flags that were already fixed

PB-2 listed five `innerHTML` sites and a deprecated `workspace.activeLeaf`.
Both were clean on inspection: `innerHTML` survives only in the Obsidian test
mock, and `TaskBoardView` already uses `getActiveViewOfType` with a comment
explaining why. The audit entry had gone stale — worth noting because a stale
backlog item costs the same to re-investigate as a real one.

### Where sentence case stops

The heading work was mechanical — `setHeading()` in the settings section, four
modals moved off a hand-built `<h2>` banner onto `titleEl`, 'View Type' →
'View type'. But **"Smart List" stays capitalized.** It's a product noun in 26
places, including a setting named "Smart List name" sitting directly under the
modal title. Sentence-casing just the title flagged by the audit would have left
two spellings of the same term three lines apart. Renaming it app-wide is a
product call, not a casing fix.

---

## 2026-08-31 — The bridge described the graph instead of resolving it

Taylor: *"when we share to other LLMs like my work AI it has trouble
understanding the flow."* Same complaint as the 2026-08-24 wording pass, which
had already shortened the instructions by 26% without fixing it — a sign the
problem wasn't length.

It wasn't. The export was teaching two algorithms and expecting the reader to
execute them. `meta.impediments` explained that Blocked/Hold propagate
transitively with Blocked winning; `meta.dates` explained that a task starts the
day after its last dependency ends and runs for `estimated_days`. Both are
accurate descriptions of `computeImpediments` and `resolveTaskDates`. Neither is
something a weak model actually *does*. Copilot reads `status: Active,
due_date: null` and concludes "workable, and missing a date" — wrong twice, and
wrong in the direction that produces confident bad advice.

**The fix is to ship the answers.** `src/integration/taskDerivedState.ts`
materializes both derivations into `ai`-mode exports as `impeded`, `impeded_by`,
`in_cycle`, `scheduled_start` and `scheduled_end`, each placed next to the raw
field it explains and omitted when it doesn't apply.

### Why this doesn't contradict "derived, never written"

That rule (backlog #8, 2026-07-25) is about **frontmatter**: a cascaded status
can't be cleanly un-written when the blocker clears, because you'd have to
remember what each task's status *was*. An export has no such problem — it is a
point-in-time projection, regenerated on every copy and discarded after. The
file stays clean; the wire carries the resolved view. The distinction worth
keeping is *persistent store* vs *projection*, not *computed* vs *shipped*.

### What the round trip needed: nothing

`IMPORT_UPDATABLE_FIELDS` is a whitelist and `ParsedImportTask` is a fixed shape,
so a reply echoing `impeded` or `scheduled_start` back was already dropped
silently. The fields are listed in `meta.ignoredOnImport` so the model is told,
but no import code changed. Considered and rejected for now: validating a reply
*against* the graph (flagging "sets Blocked on an already-impeded task", or a
`due_date` earlier than the chain allows) — `taskImportPlan` has no warnings
concept, and that's a bigger slice than the comprehension bug warranted.

### The filtered-export trap

Exports are filtered (`taskExportFilter.ts`) and both call sites passed only the
selection. Impediment and date propagation are properties of the **whole** graph:
a blocker outside the filter still blocks. Deriving over the selection would have
reported stuck tasks as workable — silently, and only for filtered exports. So
`DerivedStateContext.allTasks` is the full store, threaded from
`plugin.taskDerivedStateContext()`. A side benefit fell out: the link resolver
now has the full name map, so a `depends_on` pointing outside the selection
resolves to a real title instead of degrading to its `{6hex}-{slug}` basename —
a standing violation of "never derive a display name from a file path."

### What it costs

Measured on a synthetic 100-task, 20-chain export: **JSON +20% (~2,150 tokens),
TOON +7.5% (~350)**. The columnar form absorbs five mostly-empty columns far
better than pretty-printed JSON absorbs five keys per entry — the clearest
argument yet for TOON on a large vault. The interop prose *grew* ~56 tokens: the
new `DERIVED_RULE` costs more than the trims to `IMPEDIMENT_RULE` and
`DATES_RULE` saved, since both now carry only the write rules ("set Blocked only
on the task actually stuck", "don't fill blank dates in") and no longer teach the
mechanism. Bought knowingly: the instruction budget grew slightly and the
reasoning burden went to zero.

---

## 2026-08-21 — The AI bridge couldn't apply a rename

Reported as "I asked for better titles, the AI replied, and the preview sees
nothing." The reply was well-formed — 16 entries, each `{ref, action: "update",
name}` — and it parsed cleanly. It just diffed to zero changes.

`IMPORT_UPDATABLE_FIELDS` in `taskImportPlan.ts` listed every writable field
"minus name/links/notes". So every entry matched its task by ref, found no
changed field, and fell into `unchangedCount`; `isEmptyImportPlan` was true and
Apply stayed disabled. **A retitle-only reply was structurally unrepresentable**
— which matters because "suggest better titles" is one of the things people most
naturally ask an AI to do with a task list, and the `review` preset invites it.

Fixed by making `name` updatable, but **gated on how the record matched**.
`name` is load-bearing twice over: it's the new title *and* the fallback match
key. On a ref-matched record the ref identifies the task, so a differing name can
only be a new title. On a name-matched record the name *is* the key, and matching
is case-insensitive — so the only difference it can carry is casing, and treating
that as a rename would silently re-case titles off an AI's incidental
capitalisation. Two existing tests caught exactly that when `name` was first
added unguarded (`Apollo` → `apollo`), which is why `diffField` now takes
`matchedByRef` and `matchExisting` returns how it matched.

The AI-facing contract was wrong in the same way, so `meta.rename` now states the
rule the model has to follow: a new title **must** travel with its ref, because
without one there is nothing to match a changed name against and the entry
becomes a create instead.

### Blocked/Hold propagation was never in the contract

Separately, Taylor reported Copilot not understanding that Blocked/Hold travel
downstream. It didn't, because nothing ever told it. `computeImpediments`
(`src/query/taskImpediment.ts`) has had well-specified semantics since
2026-07-25 — Blocked propagates, Hold propagates weaker, Blocked wins where they
meet, and the whole thing is **derived from the graph and never written** — and
none of it appeared in `meta` or the preamble. `meta.graph` covered ordering and
acyclicity only.

Added as `IMPEDIMENT_RULE` (its own preamble paragraph, not buried in
`GRAPH_RULE`) and `meta.impediments`, so it survives the "No preamble" preset.
The "derived, never written" half is the part that needed saying loudest: a model
that *does* grasp propagation will helpfully stamp Blocked down the whole chain,
which is wrong precisely because TTasks computes it.

Also folded `meta.notesTruncated` and `meta.notes` apart. Under a truncating
notes policy they had both carried the full warning, so the payload said "do not
send notes back" three times across two adjacent keys — the sort of repetition
that teaches a skimming model to skip the meta block. `notesTruncated` is now the
terse flag, `notes` the single instruction.

The broader length complaint is left open in `PROJECT.md`: `GRAPH_RULE` ↔
`meta.graph` and `NO_NEW_VALUES_RULE` ↔ `meta.instructions` are duplicated
*deliberately*, documented in `sharePreamble.ts` as "prose is what actually
steers the reply". Undoing a documented tradeoff is Taylor's call.

---

## 2026-08-11 — The dependency chain trace, put back on the nodes

Reported as "we've lost the downstream highlighting on the dependency graph."
The trace had not actually stopped firing — clicking a node still walked the
full chain and recoloured every edge on it (rig-verified: chains of 1–4 edges,
isolated tasks correctly trace nothing). What was gone was the *node* half.

`computeTrace` has always returned `{ nodes, edges }`, but only `.edges` was
ever consumed. The node-level signal came from somewhere else entirely: the lane
spotlight's `is-dim`, which faded every node **off** the chain. When the GP4
tint and GP8 spotlight were torn out on 2026-07-26 at Taylor's request, `is-dim`
went with them — correctly, it was spotlight machinery — and the commit reasoned
that "the trace now reads by its own accent rather than by dimming everything
else." On a dense graph it doesn't. Four recoloured strokes among sixty nodes is
not a highlight, which is why this read as a lost feature rather than a subtler
one.

Fixed by consuming the half that was already being computed and discarded:
`.tt-graph-node.is-traced` from `traceSets.nodes`, with `.is-traced.is-active`
turned up for the clicked origin so the trace still says where it was cast from.
Placed last among the node ring treatments, matching the existing precedence on
`.tt-graph-edge.is-traced` — a pin is a deliberate, transient act and outranks
the resting cycle/ready rings until cleared.

**Nothing dims.** That constraint from 2026-07-26 still holds and the fix
doesn't reach for it: the chain is marked by what it *is*, not by suppressing
what it isn't. Verified dark and light in the rig.

**Superseded the next day (2026-08-12).** Rings alone were not enough, and the
report was precise about why: *"everything else is fully visible and it makes it
more challenging to pick them out."* A project lane in Taylor's vault runs to 18
tasks, so marking 3 leaves 15 competing at full strength. Non-chain nodes now
fade to 0.3 and non-chain edges to 0.14 while a chain is pinned.

This is worth distinguishing from the thing removed on 2026-07-26, because on
paper it looks like the same idea coming back. What Taylor rejected was
**ambient** dimming — it fired on hover and on lane rollover, so the graph
churned as the pointer moved and you couldn't read anything while navigating.
This fires only on a **deliberate pin** and clears on Esc or a click on empty
canvas. Dimmed nodes keep full pointer events, so clicking one re-pins from
there. The distinction that matters is not whether pixels fade, it's whether the
user asked for it.

`toggleHighlightReady` now clears the pin. "Ready now" and a pinned chain are
competing lenses that each dim what the other wants to show; left both on their
opacities multiply and the graph turns to soup. `onNodeClick` already dropped
ready mode when pinning — this is the same trade in the other direction.

---

## 2026-08-07 — Ghost sidebar tabs, and the deferred-view trap behind them (0.1.3)

Reported from the phone: TTasks sidebar buttons showing as Obsidian's
missing-item ghost icons, with a *second*, live TTasks entry appearing beside
them once the plugin loaded.

**Two bugs stacked.** Obsidian persists every sidebar leaf into the workspace
layout and restores it on launch whether or not the owning plugin is loaded, so
with TTasks disabled on a device our leaves come back as dead placeholder tabs.
`registerView` does not retroactively revive them — it only affects leaves
created *after* it runs. That produced the ghosts. Separately, `onLayoutReady`
called `ensureSideLeaf(pomodoro)` on **every** launch, which put a live tab next
to each ghost and also re-added a Pomodoro tab the user had deliberately closed.

The second half was squarely an anti-pattern the API notes for 1.7.2 name in so
many words: *"`onUserEnable` … If your plugin has a custom view, this is a good
place to initialize it rather than recreating the view in `Plugin#onload`."*
The one-shot moved there, which still satisfies #15's discoverability goal
without re-running forever. `views/leafHygiene.ts` handles the cleanup: it
reapplies a ghost's *persisted* view state to rebuild the real view in place,
then collapses each of our types to one leaf, keeping the earliest so the user's
sidebar order survives. Both halves are scoped strictly to view types we own —
another plugin's dead tab isn't ours to touch, and a leaf Obsidian has already
stripped of its type is indistinguishable from an ordinary empty tab.

**The sweep that followed matters more than the original bug.** Asked whether we
contravened the API guidance anywhere else, the answer was four more places, one
of them with teeth:

- `TaskWriter.isFileOpenInEditor` reached through `(leaf.view as any).file.path`.
  Our `minAppVersion` is 1.7.2 — the release that made background tabs deferred —
  so a `DeferredView` with no `.file` is the *common* case, not an edge one. A
  note open in a background tab therefore read as closed, skipping the settle
  delay before `vault.process()` rewrites the whole body, and could drop
  unflushed editor state. `views/openFileLeaves.ts` reads the view state instead.
- `TaskBoardView` gated its shortcuts on the deprecated `workspace.activeLeaf`.
- `QueryEditorModal` had three `innerHTML = '✕'` glyph buttons, against both
  Obsidian's guidance and our own setIcon rule.
- `ScanEngine` left debounce timers armed across unload.

**The lesson worth keeping:** `leaf.view` is the wrong thing to read about a leaf
you did not just open. Since deferred views landed, the *view state* is the only
representation that's populated whether or not the view is loaded — both fixes
here are the same move, and a third instance would look the same.

So it's enforced rather than just written down: `architectureBoundaries.test.ts`
now fails on any `.view as …` cast in shipped source, pointing at
`openFileLeaves.ts`. The cast is the tell — `leaf.view.getViewType()` stays legal
(a DeferredView reports its type honestly), as does handing `leaf.view` to
something that duck-types it, which is why the ban is on the assertion and not on
touching `.view` at all. The guard was checked by reintroducing the old
`TaskWriter` line and confirming it failed by name.

**Also, while in there:** the graph's fullscreen modal drew its own collapse
button pinned top-right, and hid `Modal`'s close button with `display: none` —
except the system button was showing anyway on device, so the two controls sat on
top of each other. `Modal` already provides a close control, so ours is gone
along with the rule hiding the system one, and `TaskGraph`'s `isFullscreen` prop
went with it (nothing could set it true any more). The two `innerHTML = ''`
clears in `CreateTaskModal` and `TaskDetailNotes` became `.empty()`.

Verification is honest about its limits: all of this is unit-tested and rig-green,
but the machine doing the work has no Obsidian and no vault, so the ghost-revival
path and the QueryEditor icons still want an on-device eyeball. Tracked in
`PROJECT.md` under the mobile sweep.

---

## 2026-08-06 — CI covers the rig: type-check + a mount smoke test

Follow-on to the `StatusPolicy` entry, where the rig broke and nothing in the
gate noticed. `test-rig/` was covered by **nothing**: `tsconfig.json` included
only `src/**`, eslint globs only `src/**`, and vitest never touches it. So a
change to the plugin surface could — and did — leave the rig blank while
`npm run check` stayed green.

**Type-check first.** Adding `test-rig/**/*.ts` to `tsconfig.json` surfaced seven
errors, three of them real:

- `openFirstDetail` was declared *inside* the board-mounting `else` branch, so
  the block-scoped declaration (ES modules are strict) was invisible to the
  toolbar handler at module scope. `?detail=1` worked, which is why nobody
  noticed the **"Open detail" button had been throwing a ReferenceError**.
- The rig's `PomodoroService` got a config missing `logPartialOnStop`, so the rig
  silently discarded partial sessions on Stop while the real plugin logs them.
  `getConfig` now reads the rig's own settings blob, so the two can't diverge.
- `scanEngine.tasks` was typed `Writable<Task[]>` where the board wants
  `Readable<ExternalTask[]>`.

`RigSettings` is now typed against the plugin's own `PomodoroSettings`,
`StatusPolicySettings` and `BadgeColorSettings` rather than being opaque.
`**/*.ts` deliberately excludes the `.mts` build tooling.

**But the type-check does not close the gap, and it's worth being exact about
why.** Every mount site casts `plugin as never` — `RigPlugin` cannot structurally
implement `TTasksPlugin`, which extends Obsidian's `Plugin`. Deleting
`statusPolicy` from *both* `RigPlugin` and the mock, exactly as the original bug
looked, leaves `tsc` **completely silent**. Verified, not assumed. The type-check
guards `RigPlugin`'s own contract; it cannot know what the components require.

**So: `npm run rig:smoke`** (`test-rig/smoke.mjs`). Boots the rig headless and
asserts all nine scenes — one per renderer plus detail/modal/pomodoro — reach
`data-rig-ready` with no uncaught exception. Re-running the deletion above:
`tsc` passes, the smoke test fails **8 of 9**. (`pomodoro` survives because it
doesn't mount the board — which is precisely why the scene list covers every
renderer rather than sampling one.)

Only `pageerror` is fatal. Console errors are reported but not fatal: the first
page load 404s on a favicon, and failing a perfect boot over that would have made
the check untrustworthy within a week.

It tolerates stubbed CSS on purpose — `ensureVendorCss` stubs what a machine
can't vendor, and mounting is a JS property, not a visual one. That's what makes
it runnable on CI, where no Obsidian install exists. `rig:shots` still refuses
stubs, correctly.

Kept **out of** `npm run check` so the local loop stays fast and browser-free;
`npm run check:all` is the CI equivalent. CI runs `check` then `rig:smoke`, and
gained `timeout-minutes: 15` — the gate is ~2 minutes, so anything near that is
hung, and the default is six hours.

**Unverified on a runner:** GitHub Actions was in a major outage when this
landed, so `rig:smoke` has not yet executed on CI. It relies on the runner
image's preinstalled Chrome (`browserCandidates()` already lists the Linux paths
and `BROWSER_ARGS` already adds `--no-sandbox`). If it can't find one, the fix is
a `CHROME_PATH` env or a setup-chrome step.

## 2026-08-06 — Area/label badges are one neutral pill, colour-configured or not

Taylor, on the leftover flagged in the `BadgePalette` entry: *"Lets get rid of
the dead code if it's no longer needed."* Removing it turned up a real defect —
the code wasn't dead, it was **conditionally applying styling that had nothing to
do with the colour it was keyed on**.

`.tt-badge-cat` had no base rule of its own. So an area badge got its appearance
from whether a colour happened to be configured:

| | background | border |
| --- | --- | --- |
| area **with** a colour | `--background-secondary` | `--background-modifier-border` |
| area **without** one | `--background-modifier-border` | `transparent` |

…and neither branch used the colour, because `.tt-badge-cat.tt-badge-tinted`
overrode all three of `.tt-badge-tinted`'s declarations back to neutral. Labels
were the same story one notch quieter: `.tt-badge-type` already set the secondary
background, so only the *border* appeared or vanished with the colour.

Visible in the rig's own fixtures, which is how it was confirmed: `docs` is the
one label with no configured colour, and it rendered as bare text next to
`feature` / `bug` / `research` pills on every other row. Nobody had set out to
style it differently — it just fell through.

Fixed by giving area and label the same pill unconditionally (`.tt-badge-cat,
.tt-badge-type`), and deleting `.tt-badge-tinted`, both compound overrides, and
`.tt-badge-type.tt-badge-tinted::before { content: none }` — which cancelled a
`::before` that no rule anywhere defines. `--tt-badge-color` survives with
exactly one consumer, `.tt-badge-impediment`, which is the only badge that
legitimately reads a configured colour.

The render sites collapse to `<span class="tt-badge tt-badge-cat">{task.area}</span>`.
With no colour to resolve there, `TaskBadge.text` and `.tinted` lost their last
consumers, so the type is now `ResolvedColor { color, style }` — the palette
resolves *colours*, and the only badge that renders one is the impediment.

Rig sweep: list / kanban / agenda change (as intended), graph and the create
modal are byte-identical, both themes, desktop and mobile. This is the first
change in the three-part sweep that *should* move pixels, and it moves exactly
the ones predicted.

**Still open, still a design call:** the three tint recipes disagree —
`.tt-badge-impediment` mixes at 10%/32%/55%, `applyOptionStyle` at 18%/60%,
`applyAreaTint` at 10%/42%. Untouched here because each is a deliberate weight in
its own context, and unifying them is a visual decision, not a cleanup.

## 2026-08-06 — Status pointers resolve to a `StatusPolicy`, not per-site calls

Second half of the same sweep as the entry below, and the deeper of the two.

`completionStatus` and the quick-action start/block/hold names are *pointers*
into the user's `statuses` list, so each can go stale when the list is edited.
The codebase grew a family of resolvers for that — and then called them at the
point of use. `resolveCompletionStatus(this.plugin.settings.statuses, this.plugin.
settings.completionStatus)` appeared **verbatim at eight sites** (TaskWriter ×6,
TaskStore, TaskDetail), and `statuses[0] ?? 'Active'` was hand-inlined at seven
more *despite* `resolveEmergencyStatus` existing for exactly that.

The tell that nobody knew what was authoritative: `main.ts` read
`settings.completionStatus` raw in one place while eight others didn't trust it
enough to skip the resolver. **Both were right and both were unnecessary** —
`normalizeSettingsFromSources` re-resolves every pointer, and it runs on load, on
*every* `saveSettings()`, and on external settings change. The re-resolutions
were idempotent no-ops on an already-resolved value.

New pure module `settings/statusPolicy`, read via `TTasksPlugin.statusPolicy`.
The getter caches on settings *identity*, which is self-invalidating because all
three assignments to `this.settings` go through `normalizeSettingsFromSources`
and that returns a fresh object — worth caching because `fileToTask` needs the
policy once per file and a vault load runs it thousands of times.

`hold` is `string | null`, not `''`. That was the one thing to preserve rather
than flatten: `resolveOptionalStatus` deliberately refuses the `valid[0]` fallback
because a vault with no Hold would otherwise resolve `holdStatus` to "Active",
treat every active task as impeded, and cascade a bogus Hold across the whole
graph. Making it a nullable field puts that in the type instead of a comment, and
`ImpedimentStatuses.holdStatus` widened to match. The `blocked ? block : hold`
ternary that appeared twice in `taskImpediment` became `impedingStatusName()`,
which documents why its `?? ''` is unreachable (`ownKind` won't produce a `held`
state unless a Hold status is configured).

The four resolvers are **no longer exported from `src/settings.ts`**. They belong
to normalization; consumers get a policy. `settings.test.ts` imports them from
`./settings/defaults` directly now, and `isSystemStatus` — dead before this work,
superseded by `policy.isSystem` — went with them.

Full gate green (1760 tests). Verified in the rig as byte-identical PNGs across
list/kanban/agenda/graph/detail/modal × desktop/mobile × dark/light; the fixture
set includes the Hold cascade, so `policy.hold` is on the verified path.

**Caught by the rig, not by the tests:** `test-rig/fixtures.ts` builds its own
plugin mock, and it needed `statusPolicy` too — the rig went blank (never reached
`data-rig-ready`) until it got one. The unit-test fakes had the same gap and the
type-checker found those; the rig's mock is untyped, so only running it did.
That's the second harness to teach, and it's now a CLAUDE.md rule.

**Left alone deliberately:** `quickActionsSettingsSection.ts` and
`SettingsTab.ts` still do `statuses.includes(x) ? x : (statuses[0] ?? '')` for
their dropdown display values. Those are at the normalization boundary rather
than in a consumer, the branch is dead given the invariant above, and the
settings tab is the one surface the rig cannot verify — so changing it would be
unverifiable churn.

## 2026-08-06 — Badge colours resolve to a `BadgePalette`, not raw maps

Same shape as the `TaskRef` work below, found by asking where else the codebase
re-derived something it could hold as an object. Taylor: *"are there any parts of
our code where a similar option could drop in?"*

`areaColors` / `labelColors` / `statusColors` are `Record<string, string>` maps in
settings, so the views held the raw maps and looked a colour up at every render —
making "is a colour configured?" a policy each site re-derived, **twice over**,
once for the class and once for the style:

```svelte
class:tt-badge-tinted={!!areaColors?.[task.area]}
style={getBadgeStyle(areaColors?.[task.area])}
```

`getBadgeStyle` was copy-pasted verbatim into `TaskRow` and `TaskKanban` — the TS
version of the shared-looking-class-in-one-component bug. `taskImpediment.ts`
even documented its `color` field as shaped to fit "the components' existing
`getBadgeStyle` helpers", *plural*: the comment named the duplication.

New pure module `utils/badgePalette`. A `TaskBadge` carries `text` / `color` /
`tinted` / `style`, so once you hold one there is no map, no optional chain and
no per-site fallback. `buildBadgePalette(settings)` is built once in `TaskBoard`
and threaded down as **one prop replacing three**, through list, kanban, agenda,
graph, `GraphExpandModal` and `CreateTaskModal` (which had three private getters
of its own). Resolution is memoised per palette, so 500 rows sharing three areas
allocate three badges — and the *same* three objects each render, which keeps
Svelte from seeing churn that isn't there.

`areaSpine()` and `statusAccent()` derive from the same resolution as the badge,
so a spine and its badge can't disagree about whether a colour exists, and the
graph's five `?? 'var(--interactive-accent)'` fallbacks collapse to one place
(`color-mix()` drops the whole declaration on an invalid argument rather than
degrading, so that fallback has to exist — it just doesn't have to exist five
times). `ImpedimentBadge` now carries a ready-to-render `style` instead of a
`color`, which retires the last reason for `getBadgeStyle`.

`priorityColor()` joins `PRIORITY_COLORS` in `constants.ts`: five sites wrote
`PRIORITY_COLORS[p] ?? PRIORITY_COLORS.None`, and since `fileToTask` coerces the
frontmatter value through `PRIORITIES`, that `??` was unreachable at all five — a
fallback nobody could delete because nobody owned the resolution.

One hardening the single resolver earned: lookups are own-property and
string-valued only. These maps are keyed by user frontmatter, so an area named
`constructor` previously resolved through the prototype to a function.

`buildImpedimentBadges` had no test coverage at all, which is why its signature
change broke nothing — added it. Full gate green (1748 tests). Verified in the
rig as **byte-identical PNGs** across list/kanban/agenda/graph × desktop/mobile ×
dark/light: a pure refactor should change no pixels, and it changed none.

**Noted, acted on the same day — see the entry below.** The area/label tint
overrides looked like dead code from here; they were something worse.

## 2026-08-05 — Relationships resolve to `TaskRef`s, not paths

Follow-on to the entry below, from Taylor's question: *"shouldn't the UI always
grab the name from the class for the task?"* Yes — and the model already
guarantees it works. `Task.name` is a non-optional `string`, and
`TaskStore.fileToTask` returns `null` rather than building a `Task` with a blank
`name`. So **any `Task` in hand has a real title**; there was never a naming
question to answer.

The previous fix made the *fallback* honest but left the underlying shape: the
UI held path strings and re-resolved them at every render, so "this link doesn't
resolve" stayed an easily-forgotten null at ~31 call sites.

- New pure module `src/utils/taskRef.ts`. `TaskRef` is
  `{ kind: 'task'; task: Task }` or `{ kind: 'missing'; path; id }` — the
  failure is now a variant the compiler forces each site to handle, not a null
  it can skip. `taskRefName` is the **single** place the missing placeholder
  gets formatted; `taskLabel.ts` is reduced to formatting it.
- **The missing variant is kept, not filtered away.** A link can legitimately
  point outside the current task set (a filtered board, a note moved out of the
  folder). Dropping those would silently under-report what's blocking a task —
  the same failure mode in a new outfit.
- `buildTaskRefIndex` replaces the per-chip `Array.find` scans with an O(1)
  lookup. `byLeaf` buckets are arrays so the short-wikilink fallback
  (`[[abc123-slug]]` from a sibling note) keeps its first-match-wins behaviour,
  and the suffix must land on a folder boundary so `Tasks/a.md` can't claim
  `Other/Tasks/a.md`.
- **Stored link strings are kept alongside the refs** in the two editable lists.
  Removal matches what's actually written in frontmatter, so substituting the
  canonical resolved path could fail to find the entry to delete.
- Fixed a latent staleness bug in passing: the relationship tree closed over
  `tasks`, so Svelte didn't treat it as a dependency of the reactive statements.
  The index is now threaded through as a parameter.
- `taskDetailLinks.ts` is deleted — `findLinkedTask` / `resolveLinkedTaskPath`
  are fully superseded; their contracts moved into `taskRef.test.ts`.
  `resolveTaskLabel` / `resolveTaskLabelFromMap` went with them.
- `describeImpediment` / `buildImpedimentBadges` now take a `TaskRefIndex`
  instead of a parallel `path -> name` map, so the tooltip reads names off real
  `Task` objects.
- `TaskStore.resolveRef` covers store-backed callers that have no task array.

Verified in the rig: the missing-link chip, the multi-level dependency tree, and
the graph all render identically to before.

---

## 2026-08-05 — Bare titles never leak from paths; one title primitive

Taylor: *"in some sections you can see bare task titles or project titles being
exposed — that means something in our model is broken and we're not using the
classes properly."* Two distinct defects, swept across the whole codebase.

**1. A path was never allowed to become a title.** Every link label resolved as
`task?.name ?? pathLeaf(path)`. `pathLeaf` strips the folder, the `.md`, and the
`{hex}-` prefix, so a dangling link rendered `scrape-the-barnacles` — which
reads exactly like a real title. A broken relationship was therefore
*indistinguishable from a working one*, and the underlying data defect (a
deleted note, a note moved out of the tasks folder) stayed invisible forever.

- New pure module `src/utils/taskLabel.ts`. `resolveTaskLabel` returns
  `{ text, resolved }`; an unresolvable path becomes **`Missing task (a1b2c3)`**.
  We surface the **task id** and nothing else, because the id is the one thing a
  dangling link still genuinely carries — it survives renames, and it's what the
  hash-prefix search shipped earlier today matches on. So the label is
  *actionable*: paste the hash into search to find what happened.
- A filename that doesn't follow `{hex}-{slug}` contributes no id at all
  (`Missing task`), rather than echoing its name back as a pseudo-title.
- A **blank `name:`** field counts as unresolved too — same defect, same signal.
- Fixed at seven UI sites: detail relationships (chips + tree), `WikiLinkField`,
  the graph's hybrid-timeline anchors, both graph lane labels, the impediment
  tooltip, and the create-modal dependency chips. All pair the label with
  `.tt-chip-warning` so a broken link *looks* broken.
- **The writers were corrupting the vault, not just the view.** `TaskWriter` and
  `TaskRelationships` synthesized an alias from the filename and wrote
  `[[path|scrape-the-barnacles]]` into frontmatter, baking a fake title into the
  data where Obsidian's own views would render it. `buildAliasedLink` now takes
  `alias: string | null` and emits a bare `[[path]]` when the name is unknown —
  honestly broken, and repairable later once the target resolves.
- **`pathLeaf` is deleted.** It had zero remaining callers and it was the whole
  footgun; leaving it invites the next recurrence. `pathUtils.ts` carries a note
  pointing at `resolveTaskLabel` in its place.
- Left alone deliberately: `taskJsonExport`'s basename fallback fires for links
  *outside a filtered export* (a scoping boundary, not a broken link) and is part
  of the AI paste-back contract; `fileScanner` / `promoteTaskToTTasks` derive a
  name for external notes that genuinely have none.

**2. There was no shared title primitive — ten components each invented one.**
Every task/project name did carry a class, but *not one of them was defined in
`styles.css`*; all ten lived in component-scoped `<style>` blocks. The result
was five font sizes (0.8/0.82/0.88/0.9/0.92rem), four weights (unset/500/600/700)
and the truncation triad copy-pasted six times — so the same task read
differently depending on which view you looked at it in.

- Added `.tt-title` (+ `.tt-title-sm`, `.tt-title-strong`) and `.tt-truncate` to
  `styles.css` as plugin-global primitives, plus `--tt-font-title{,-sm}` tokens.
  Components now carry layout only, per the design-system rule in `CLAUDE.md`.
- **`.tt-title` deliberately sets no `line-height`.** The first cut set 1.4 and
  grew every list row ~3px; single-line rows are the common case and density
  matters more than the convenience. Wrapping contexts (kanban cards, graph
  nodes, timeline bars) set their own.
- `.tt-chip-warning` was itself only defined inside `TaskDetailRelationships`'s
  scoped styles — the same bug in miniature, and it would have silently no-oped
  in the three other components that now use it. Promoted to `styles.css`.
- The mobile 2-line clamp is written as `.tt-task-name.tt-truncate` so it
  outranks the global primitive on specificity rather than relying on Svelte's
  scoping hash to win by accident.

Rig fixtures gained a permanently-dangling dependency so the broken-link state is
visible in the rig instead of only in tests.

---

## 2026-08-05 — Search by task hash prefix

- **The hash is now a first-class search key.** A task's `{6hex}` filename
  prefix is the only identity it has that survives a rename, and it already
  leaks into share exports and `ttasks://` links — but nothing could find a task
  by it. The search box now matches on it.
- **Two entry forms, because they answer different needs** (Taylor's call).
  A bare all-hex term of **≥ 3 characters** ORs an id-prefix match on top of the
  usual name/notes match, so pasting a hash just works with no syntax to learn.
  A **`#`-prefixed** term (`#a1b2`) matches the id *only*, suppressing name and
  notes — the escape hatch for when a hash also appears in a task's text.
- **The 3-character floor is the whole reason the bare form is usable.** At
  three hex digits a stray collision is ~1 in 4096 per task; at one or two it
  would drag unrelated tasks in on every keystroke. Below the floor a bare term
  stays pure text search — the sigil still works there, since it's explicit.
- **A non-hex `#` term falls back to a literal text search** (`#bug`, and
  Obsidian tags generally), so the sigil never silently eats a query it can't
  serve.
- **One pure module, `src/query/hashSearch.ts`**, owns the grammar; `applyFilter`
  delegates to it, which means the board, Smart Lists, and the protocol's
  `action=search` all inherited the behaviour without individual wiring. The
  archive view — which had its own inline name-only filter — was pointed at the
  same helper.
- **The jump switcher keeps the id out of its fuzzy text on purpose.** Obsidian's
  fuzzy matcher is subsequence-based, so folding six hex characters into
  `getItemText` would let a query like "ace" hit ids it has no business hitting.
  `getSuggestions` resolves hash queries by exact prefix instead and ranks those
  hits above the fuzzy results.
- **Incidental:** `splitTaskBasename`/`taskIdFromPath` moved to `pathUtils` so
  the `{id}-{slug}` split has one definition (`TaskStore` and `ArchiveService`
  had it inline); `ArchivedTaskSummary` gained an `id`.
- **Rig note:** the driver hardcoded port 5199, so a rig left running in another
  worktree silently answers — the first verification pass was reading a different
  branch's code. `TTASKS_RIG_PORT` now overrides it, with `--strictPort` so a
  collision fails loudly instead of drifting to another port.
- Tests 1645 → **1705**.

---

## 2026-08-02 — Docs consolidated; Node moved off EOL runtimes

- **Four live docs became two.** `BACKLOG.md` (1332 lines), `ROADMAP.md` (1032),
  `AUDIT_2026-07.md` (809), and `CLAUDE.md` (959) totalled ~4,100 lines with
  heavy duplication — CLAUDE.md's "Recent Updates" and all of ROADMAP.md were
  **two dated journals of the same events**, with near-identical checkpoint
  dates. Now: **`PROJECT.md`** is the single live doc (status + all open work +
  the audit's rationale), **`CLAUDE.md`** is conventions and workflow only, and
  this file holds the history. The eight closed-sweep files in
  `Scripts/archive/` were folded in below.
- **Node: dropped two end-of-life runtimes.** The CI matrix and the declared
  `engines` floor both pointed at **Node 20, which went EOL 2026-04-30**, and the
  dev box was running **Node 25, EOL 2026-06-01**. Neither receives security
  patches. Verified `npm run check` green on Node 24 (1645 tests) before
  changing anything. Matrix is now **22 + 24** — 22 is the new `engines` floor
  and is supported to 2027-04, 24 is the active LTS. Added `.nvmrc` (24). The
  machine's global Homebrew default was deliberately left alone, since it
  affects unrelated projects.
- **Server checkout verified end-to-end.** Fresh clone on a box with no
  Obsidian, no vault, and no symlink: `localPaths` resolved all three
  machine-local paths to `null`, `rig:sync-css` fell back to git sources
  (`obsidian-releases` 1.13.4 asar → 635 KB `app.css`; `seniblue/Underwater` →
  122 KB theme — byte-identical to the sizes the local path produces), the rig
  booted, and `/__vault.json` degraded to `{files: []}` so the fixture fallback
  took over. Screenshots are the one gap: no browser is installed.

---

## 2026-07-31 — CI + release automation; portable dev environment

**CI and releases landed (closes audit TD-1 🔴; PB-1 down to just the README).**
The stated blocker was gone — `origin/main` was no longer a divergent history —
and Taylor's call was to build it now regardless of whether the phone ends up fed
by Sync or BRAT: *"either way we should be pushing releases while we're in dev
mode."*

- **`ci.yml`** — `npm ci && npm run check` on push to `main`, every PR, and
  manual dispatch, across a Node matrix. The matrix exists so the `engines`
  claim is *verified* rather than merely restated. `concurrency` cancels
  superseded runs. **No CI special-casing was needed** for the vault copy:
  `localPaths.VAULT` resolves to `null` when no candidate path exists, and
  `vaultCopyPlugin` already treats that as a silent no-op.
- **`release.yml`** — fires on a bare semver tag, re-runs `check` (a release
  build is the one that reaches devices), then attaches `main.js` /
  `manifest.json` / `styles.css` via `gh release create --generate-notes`. It
  **fails before building** if the tag ≠ `manifest.json`'s version, or if
  `versions.json[tag]` ≠ `minAppVersion` — the submission checker enforces the
  first and BRAT resolves releases the same way, so a mismatch is caught at the
  cheapest point instead of producing a release nothing can install.
- **Release ergonomics** — `version-bump.mjs` syncs package.json → manifest.json
  → versions.json (2-space + trailing newline, so a bump diffs as one line, not a
  reformat) and rejects anything that isn't bare semver; the `version` npm script
  stages both files into the version commit; `.npmrc`'s `tag-version-prefix=""`
  stops `npm version` minting a `v`-prefixed tag in the first place — belt and
  braces with the workflow's check.
- **Both workflows verified live.** CI green on both matrix legs (~1m10s each;
  `checkout`/`setup-node` bumped v4 → v5 to clear a deprecation annotation).
  Then **`0.1.1` was cut deliberately to exercise the release path** — identical
  plugin code to `0.1.0`, since only CI and docs had changed; the point was to
  find a broken pipeline before needing it. Only the guard's **happy path** is
  CI-proven — deliberately not tested against a mismatched tag, since a broken
  guard would publish a junk release to prove the point.

**Dev environment made portable** (prep for a server checkout + the BRAT
handover). Goal: run this repo on a box with no Obsidian, no vault, no symlink.
`src/`, esbuild, vitest and eslint were already clean — the whole problem was the
visual rig, which hard-failed on any machine but Taylor's.

- **`test-rig/vendor/` is gitignored but was imported statically**, so a fresh
  clone died at vite resolve time before rendering anything. New `vendorCss.mjs`
  writes a marked empty stub for whichever file is missing and warns — the rig
  boots, structure and behaviour are real, only Obsidian's look is absent
  (explicitly *not* sign-off-worthy).
- **CSS now has a git source, not just a local-install one** (Taylor: "vault will
  not be on the server, source these elsewhere like the git repos"): `app.css`
  falls back to `obsidianmd/obsidian-releases`' `obsidian-<v>.asar.gz`, and the
  theme falls back to `seniblue/Underwater`.
- **New `test-rig/localPaths.mjs`** is the one place that knows machine-local
  paths, each with an env override. An override wins even when the path is
  missing **so typos fail loudly**, and **set-but-empty means "absent"**, which
  is how a machine with a vault reproduces the server's vault-less behaviour.
- **Browser resolution unified** — `shots.mjs` and the skill driver had duplicate
  hardcoded lists (with a "keep in sync" comment); now one resolver that scans
  `.browser/` and probes Windows/macOS/**Linux** paths.
- **`vite` was undeclared**, resolving transitively through vitest; now a real
  devDependency.

**The vault install became a real folder, NOT a symlink — do not recreate the
symlink.** `.obsidian/plugins/ttasks` used to symlink to this checkout, which
pointed **Obsidian Sync at the entire repo**: 827 MB `test-rig` + 212 MB
`node_modules` + 9.7 MB `.git`, to deliver a 1.4 MB plugin. That was the
long-standing **mobile deploy blocker** — the phone wasn't failing to load fresh
builds so much as Sync was never finishing, which is why the symptom read as
"*fresh* builds don't arrive" rather than "plugin missing." The 2026-07-19
guesses (plugin-sync disabled, mobile JS cache, app-kill needed) were all wrong.

Replaced with a `vaultCopyPlugin` esbuild `onEnd` hook copying `main.js` /
`manifest.json` / `styles.css` into the vault — deliberately **never
`data.json`**, which is Obsidian's, holds user settings, and syncs between
devices. **`npm run build` is the deliberate "publish to my devices" step;
`npm run dev` no longer touches the vault at all**, because a watch rebuild is a
3.85 MB inline-sourcemap bundle vs 1.37 MB for prod — copying on watch would push
a multi-megabyte Sync upload at every save and land unfinished builds on the
phone mid-edit. There is no live-reload link any more; rebuild to deploy.

**Released `0.1.0` + GPL-3.0 licensed.** First tagged release so BRAT can install
betas. **Not** submitted to the community plugin list — Taylor's line is GitHub
releases yes, `obsidianmd/obsidian-releases` not yet. LICENSE is verbatim GPL-3.0;
Obsidian requires *a* LICENSE but prohibits no type, and all five bundled deps are
MIT/ISC/0BSD, so GPL-compatible.

---

## 2026-07-25 — Recurrence drift fixed; the audit folded into the backlog

**Recurrence drift (audit RP-1 / DT-3 🔴).** A month-end recurring task
permanently collapsed onto February's day: Jan 31 → Feb 28 → **Mar 28 → Apr 28 …**
forever, because each occurrence was computed from the previous *already-clamped*
date instead of from the schedule's anchor day. The drift was even **codified as
an expected-behaviour test**, which is why it survived.

- `advanceDate(date, rule, anchorDay?)` now clamps **per-occurrence** instead of
  cumulatively. Omitting the anchor reproduces the old behaviour exactly, so every
  pre-existing test still passed unchanged — including two encoding deliberate
  intent (`Feb 29 monthly → Mar 29`, `Feb 28 yearly stays Feb 28`).
- Those two tests are also **why a month-end heuristic was rejected**: without a
  real anchor you can't distinguish "monthly on the 31st, clamped" from "monthly
  on the 30th", and guessing month-end mis-fires on a genuine 29th/30th schedule.
  Taylor picked the persisted-anchor option.
- New pure `deriveAnchorDay(dueDate)` and a **`recurrence_anchor_day`**
  frontmatter field, derived whenever `due_date` is written *without* an explicit
  anchor (so a manual reschedule redefines the schedule) and passed **explicitly**
  by `completeAndRecur` and `buildDuplicateInput` so a clamped occurrence never
  re-derives a wrong anchor — that re-derivation *is* the bug. Written only for
  recurring tasks; kept out of `TASK_FIELD_DEFINITIONS` because it's derived, not
  user-editable.
- Result: Jan 31 → Feb 28 → **Mar 31** → Apr 30 → May 31, stable over 12 months.
  Tasks predating the field fall back to their due date's own day. **+50 tests.**

**`AUDIT_2026-07.md` was an untracked second registry.** It held 🔴
pre-publication items that `BACKLOG.md` — the self-described "single live backlog
for all open work, every horizon" — didn't list at all. The repeat redesign that
RP-1 was nominally waiting on wasn't scheduled anywhere. All open items were
indexed into the backlog. *(Both files are now merged into `PROJECT.md`.)*

**Lint cleared + a real local gate (audit TD-2).** Lint had been failing with
**50 `no-mixed-spaces-and-tabs` errors** — up from 10 at audit time, because it
ran in neither CI nor the local gate. Every one was the same thing: a comment
**continuation** line indented with tabs *then* spaces to align prose under the
opening delimiter. Cleared them the way an earlier commit already had — a
continuation takes the opening line's tab depth and no spaces — which is
**comments only**: exactly 50 insertions / 50 deletions, no code, selector, or
markup change. Added **`npm run check`** (`lint && build && test`) so the three
gates run as one and this can't drift again.

---

## 2026-07-22 — Share/Sync payloads, detail-pane clipping, frontmatter types

**Share/Sync: TOON payload, notes policy, graph framing, per-item review.**
Started as "can we add TOON?" and became an evaluation first — TOON, YAML, NDJSON,
CSV/TSV, markdown table and minified JSON all measured against a real 100-task
export with a real tokenizer. Two findings drove the design:

1. **Note bodies were 62% of the export** (24,372 of 39,278 tokens) — a bigger
   lever than every format choice combined.
2. **TOON as-is saves 7%, not the advertised ~40%**, because its tabular form
   needs uniform keys and scalar cells, while the 'ai' export prunes empty fields
   and carries array fields. Filling the keys but keeping arrays measured **-0.5%**.

Shipped: a **`notesPolicy`** control (Full / First 200 chars / Omit) — **safety,
not sizing**, because a truncated body must never come back as a replacement or it
overwrites the real one with a fragment. **TOON as an export-only payload
format** — deliberately export-only, since a sparse reply can't be tabular and its
decoder hard-throws on a miscounted `[N]`, a 4-space indent, or an unquoted comma.
CSV/TSV were marginally smaller and rejected: no self-description, bespoke parser,
can't carry `meta`. **Graph framing** in every preset, telling the AI the export is
a dependency graph, not a flat list. **Per-item import review** — every plan bucket
flattened into keyed, rejectable rows.

Measured end-to-end through the shipped code on a 108-task vault: JSON+full
**50,821** tokens → TOON+full 43,243 (**-15%**) → JSON+omit 14,775 (**-71%**) →
TOON+omit 6,579 (**-87%**).

Earlier the same day: **message presets + packaging** (five presets over an
editable textarea; a **Copy as** control with One block / Two fields / JSON only),
**last-used memory**, and **notes + projects on import** — `notes` already worked
on creates while the meta claimed otherwise; `meta.projects` finally told the
receiving AI that `type: "project"` exists.

**Detail sidebar clipping fixed.** Narrowing the detail leaf to 300 px on a
1280 px viewport left its content 413 px wide, silently cut off by
`overflow-x: hidden`. Three separate "floors at min-content" causes:

1. The field grid's two-column → one-column collapse was gated on
   `@media (max-width: 768px)`, which reads the **viewport**, not the resizable
   pane — so labels rendered one character per line on desktop. Re-keyed to a
   **container query**, threshold **360 px** measured (not guessed) so the default
   440 px sidebar keeps two columns; the old media query kept as a
   pre-container-query fallback.
2. The P5 centering rule left the relationship tree at max-content, so one long
   task name sized the section to 527 px. The tree chips are `<button>`s
   inheriting app.css's `nowrap` — the **theme-specificity trap** — and now wrap.
3. `minmax(0, 1fr)` tracks + `min-width: 0` on grid and flex items.

Rig-swept by leaf width: **zero clipped elements from 220 px up** (was 31 at
300 px).

**Frontmatter type-handling audit.** Hardened the whole frontmatter → Task
boundary against Obsidian's **native property types** — retyping a property in the
Properties UI rewrites that field vault-wide, and every mismatch was **silent data
loss**:

- A Text-typed list (`labels: feature`) was dropped by an `Array.isArray` guard.
- A List-typed scalar (`area: [Work]` → Inbox; `status: [In Progress]` → reset to
  default; `name: [Ship it]` → empty) failed a `typeof === 'string'` check.
- `type` and `priority` were unchecked `as`-casts, so `type: [project]` made a
  project read as a task everywhere.
- Numeric/boolean fields were exact-type-only, so a quoted `"4"` reset a count.

Fixed with new pure coercion helpers including a closed-set
`toFrontmatterEnum` (exact-then-case-insensitive, so a hand-edited
`priority: high` now resolves). The **write side is deliberately unchanged** — the
plugin still writes canonical shapes, and Obsidian re-normalizes on its next
write. **+39 tests.**

**Graph: add a blocker/parent from a node.** Each node gained a **left-side `+`**
mirroring the right-side "add dependent". Implemented via a symmetric
`initialBlocks?: string[]` option — after the blocker is created it calls
`taskStore.addDependency(target, newTask)`, so `blocks` syncs through the
canonical write path, honouring the "blocks is always derived" convention.

---

## 2026-07-21 — Pomodoro drift; centralized filtering

- **Pomodoro backgrounding drift fixed.** `tick()` decremented by a fixed 1 s per
  `setInterval` firing, but browsers throttle intervals in backgrounded windows,
  so the countdown fell behind real time. Every running phase is now anchored to a
  **wall-clock instant** and each tick derives the remainder from `Date.now()`, so
  a starved interval catches up. Pause freezes; resume re-anchors. Note: if the
  machine sleeps through an entire focus phase, the phase is logged and advanced
  on the first wake tick rather than fast-forwarded through multiple phases.
- **Agenda date-range filter, then centralized the same day** (Taylor: *"try and
  centralize this sort of filtering logic and reuse it across views"*). New
  inclusive `on_or_after`/`on_or_before` operators — `before`/`after` were kept
  strictly exclusive because they're already relied on elsewhere with that
  meaning. The ad-hoc toolbar-filter logic moved into a pure, tested
  `boardFilters.ts`, mirroring the existing `boardQuery.ts` pattern. Widened from
  Agenda-only to List + Kanban + Agenda; Graph and Archive/Logbook excluded
  (relationship-first / `completed`-not-`due_date`).

---

## 2026-07-20 — Taylor's feedback batch (10 of 22 triaged and shipped)

Picked off the clearly headless-workable items; left taste-call (⚖) and
research-needed (🔎) items open.

- **List views** — Group-by/Sort-by toolbar controls for any list-rendered view,
  covering three separate asks **in one general mechanism rather than three
  special cases**. Today's filter gained an OR branch for the configured start
  status; Agenda's date-bucket grouping gained `activeStatusBucket` so an
  in-progress task reads as "today" regardless of due date *unless already
  overdue* (that stays the more urgent signal). New pure `taskReadiness.ts`
  stable-partitions Today so ready-to-work tasks float above blocked ones.
- **Dependency graph** — Independent lane shown by default; the "Ready now"
  highlight clears when you open the highlighted task; a completed dependency's
  edge renders muted green (investigation found edges weren't actually
  priority-coloured as reported — the signal was simply missing); the Projects
  popover gained a capture-phase click-outside listener.
- **Share/Sync** — the importer required a `name` on every entry even when a
  `ref` alone should suffice, contradicting the AI meta's own instructions — a
  real bug, now accepts ref-only entries. The AI export's meta now embeds this
  vault's configured statuses/priorities/areas/labels so a replying AI picks real
  values instead of inventing them.
- Also discovered the backlog's "relationships not imported" limit note was
  **stale** — relationship import had already shipped; corrected the doc.

---

## 2026-07-18/19 — Graph polish, colour model, Pomodoro expansion, Share/Sync

**GP1 — fullscreen expand modal.** The graph was near-useless in its cramped
in-board leaf on phones. Research first: the native pop-out
(`moveLeafToPopout`/`openPopoutLeaf`) is **desktop-only and throws on mobile**, so
it can't serve the mobile goal; the chosen mechanism is a **fullscreen `Modal`**,
which works on both. Opening a task closes the modal first so the detail drawer
doesn't sit behind it. Esc and the phone back gesture close it now that
`Modal implements HistoryHandler` in obsidian 1.13. Also bumped obsidian typings
1.12.3 → 1.13.1 (was resolving stale under `"latest"`).

**GP7 — Dependency and Timeline split into two rail views.** The in-view toggle is
gone; each view is locked to its `graphMode`. Because both use the same renderer,
switching rail entries keeps the same component instance and just updates the mode
through the existing reactive prop sync. Per-view persistence was free — the
active view id already rode on N2's `getState`/`setState`.

**GP8 — lane focus.** GP4's always-on swim-lane tint became on-demand: a lane's
tint shows only while active (hovered on desktop, or pinned by interaction). Other
lanes recede — **except** tasks connected to the active lane's dependency chain,
which stay in focus while their own lane gets a softer tint.

**GP5 — partly landed, partly backed out.** The `+` add-subshape shipped. A first
rev made the header body a pin toggle that grew the pinned lane to reveal its full
vertical title (block-flow + `height:auto`, since a flex column mis-measures a
vertical-writing-mode child's block size); Taylor felt it was *"not that nice…
come back and tune later,"* so both the pin-toggle and the grow were reverted.

**GP3 — project filter.** Hidden projects are removed *before* connectivity is
computed, so a satellite that only linked to a hidden project drops with it.

**Colour-model workshop → V2 "colour spine".** Status/area/label colours were
competing on cards. Baseline + 3 rig-rendered variants were shipped as a
self-contained artifact; Taylor picked **V2**. Shipped model: **identity colour
moves off the badges onto the card/row left edge**, keyed to the task's project
`area`, so the badge row stays monochrome. The list row uses an inset `box-shadow`
rather than a real border so row content stays aligned with group headings instead
of shifting 3 px. **The solid-red overdue slab and solid-green completed slab
soften to tints** — that date slab was the single loudest offender, out-shouting
the area it was supposed to sit under.

**P2-8 — overdue red softened, badge-only.** Overdue also painted the **whole task
name** red, which shouted when several piled up in a column. Chose badge-only; the
alternative (a red left edge) was rejected because the area-colour spine now owns
that edge and a red bar would fight it.

**Pomodoro expansion.** Untethered sessions (no task); an RFC-4180 **CSV session
log**; **"focus until X:XX"** via a pure planner that fills whole cycles plus a
shortened final focus so nothing runs past the target; a **dedicated pane**; a
desktop **status-bar countdown** (driven by subscribing to the existing 1/s
session tick — no second interval); and **log-partial-on-stop**, where stopping
mid-focus logs elapsed minutes as a partial that adds to `focused_minutes` and
writes a CSV row but does **not** bump `pomodoro_count` — a stopped session isn't
a completed pomodoro.

**Share/Sync shipped** (JSON import/export). Export: mode toggle + toggle-chip
filters + live count + copy/save. Import: paste → preview → apply, matching by
(type, case-insensitive name), with only set/change semantics — **never clear from
an omitted value**.

**Docs reconcile.** Removed the backlog/roadmap coverage seam; BACKLOG became the
single all-horizons registry with a new `Later` tier, and ROADMAP was demoted to a
dated journal. *(Both since merged into `PROJECT.md` and this file.)*

---

## 2026-07-04 → 2026-07-12 — Bugfixes, Autopilot A–I, native workspace

**Autopilot batches A–I** (an unattended execution queue; each session ran exactly
one batch then stopped, with a driver script starting the next):

- **A** — detail-pane centering + top/bottom actions + native `addAction` header
  buttons on all three leaves.
- **B/C** — kanban collapsed one-line header, inset selected-row highlight, and a
  conservative list-row visual pass.
- **D/E** — jump-to-task fuzzy switcher, protocol `action=jump` + new-task prefill
  + `PROTOCOL.md`, view-state persistence via `getState`/`setState`, and a richer
  status bar.
- **G** — graph pinch-zoom + touch targets; zoom-edge detach fixed (root cause was
  `.tt-graph-stage min-width`).
- **H** — `API_DESIGN.md` + Taylor's decisions on its five open questions.
- **I** — the C2 layout workshop; Taylor greenlit **V1 Compact + F1/F4/F5**
  (satellite unassigned lanes), which landed.

**Bugfix report #1–#13** (Taylor's 2026-07-04 pass): the detail pane now derives
its task from the store (fixing "Task Not Found" on create) and `TaskWriter.update`
applies an optimistic in-memory patch so edits propagate without waiting on a
metadata rescan; selected rows use an accent tint distinct from hover grey; a
universal `holidays` list + per-area workweek toggle threaded through the
working-day math; graph tooltips moved from native `title=` to `aria-label` (no OS
tooltip during pan/zoom); clicking a graph node pins its chain highlight.

**Native three-pane workspace (N1–N6)** — rail / board / detail render as
workspace leaves with native header buttons, layout persistence, a fuzzy switcher,
protocol handling, and a status bar.

---

## 2026-04 → 2026-05 — Foundations (Streams D–K, Phases 1–7)

Condensed; full detail in git.

- **Phases 1–4** — task store over the vault API, list view, create/edit modal,
  detail panel; kanban, mobile layouts, search/filter; ID collision-safe creation,
  relationship safeguards, configurable categories, lint + store tests; dependency
  graph, due-date reminders, quick actions; derived `is_complete`/`is_inbox`,
  delete confirm, `status_changed` + stale-progress tracking, task duplication.
- **Phase 6 — data model + smart lists** — `area` replaced `category`, `labels[]`
  replaced `task_type`, a shared query engine (`filter`/`sort`/`group`/`limit`/
  `search`), agenda date buckets moved into shared grouping, persisted Smart Lists
  with a Builder + JSON query editor.
- **Phase 7 — archive infrastructure** — `ArchiveService`, auto-archive, archive
  view, logbook, migration command.
- **Streams D–G** — kanban card fields + column collapse; multi-select batch ops +
  keyboard shortcuts; graph lane sidebar headers + accessibility; reminder snooze
  + per-task override.
- **Stream H** — component test coverage and `BoardStateService` extraction.
- **Stream I** — the capture/promote pipeline: pure parsers (checkbox, emoji
  fields, filename dates), capture-source configuration with auto-detection, a
  pure `fileScanner` + `ScanEngine`, promote + completion-sync (so completing a
  promoted task updates the `[ ]`/`[x]` in its source line), and one-shot bulk
  import.
- **Stream J** — boundary hardening, constants extraction, `ReminderService`
  decomposition, a performance slice (bounded concurrency + an O(1) `getByPath`
  index), a DRY slice, and type-safety cleanup removing unsafe casts from
  `main.ts`.
- **Major decompositions** — `TaskStore` 900 → 596 lines (extracting
  `TaskMigrations`, `TaskRelationships`, `TaskWriter`); `settings.ts` 1869 → a
  35-line re-export shim; `TaskDetail.svelte` 1381 → 721 lines.

Test-count trajectory: 553 (2026-05-14) → 961 → 1060 → 1114 → 1241 → 1261 →
1436 → 1511 → 1616 → 1645 → **1705**.

---

## Closed sweeps

These ran as their own task files and are all fully closed. Summarized here;
originals in git.

| Sweep | Scope | Outcome |
| --- | --- | --- |
| **Audit Sweep 2** (2026-07-02) | Date handling in dependency chains, interface consistency across views, DRY/SOLID cleanups (A1–A6, B1–B3, C1–C6, D1–D7) | ✅ complete |
| **Design & Style Audit** (2026-07-02) | P0-1…P0-6, P1-1…P1-6, P2-1…P2-7 — the design-system overhaul that produced the token set and shared primitives | ✅ complete; P2-8 closed 2026-07-19 |
| **Bugfix report** (2026-07-04) | #1–#13 from Taylor's pass | ✅ #1–#8, #10, #12, #13 shipped; #9/#11 carried into Autopilot G and I |
| **UI Polish + Settings overhaul** | P1–P7, C1, C2 | ✅ complete |
| **Native Obsidian integration** | N1–N6 | ✅ complete; N3 (public API) and N7 (Bases) remain gated on Taylor |
| **Autopilot** | The A–I unattended batch queue | ✅ complete 2026-07-09 |
| **Graph Polish** | GP1–GP8 | ✅ GP1/GP2/GP3/GP4/GP6/GP7/GP8 landed; GP5 partly (see `PROJECT.md`) |
| **Graph layout C2 workshop** | Density/layout variant study | ✅ V1 Compact + F1/F4/F5 greenlit and landed; **C2-F2 still open** — pulling source-only nodes rightward changes what a column *means* and can perturb the 0-crossing layout |
| **Modal & detail exploration** (2026-05-19) | Mapped create/edit modal and detail-pane components, fields, and inconsistencies | ✅ fed the UI polish sweep |
