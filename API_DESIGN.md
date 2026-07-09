# TTasks Public API — Design Doc (NATIVE N3)

**Status:** Proposal for Taylor's review. **No code has been written.** This
document specifies a stable, versioned API surface other plugins and scripts
(Templater, QuickAdd, Dataview-JS, community plugins) can consume via:

```js
app.plugins.plugins['ttasks'].api
```

The API is a **curated, frozen façade** over capabilities that already exist on
`TaskStore` (`src/store/TaskStore.ts`) and the shared query engine
(`src/query/`). It is *not* new capability — it is a narrow, guaranteed-stable
contract so consumers don't reach into plugin internals that we reserve the
right to refactor.

---

## 1. Design principles

1. **Façade, not internals.** Consumers must never touch `TaskStore`,
   `TaskWriter`, or Svelte stores directly. Everything they need is on
   `plugin.api`. This lets us keep refactoring the store (as we did in Streams
   H–K) without breaking third parties.
2. **Read returns snapshots, never live references.** Every `Task` handed out
   is a **deep-cloned, deep-frozen** copy. Consumers cannot mutate store state
   by mutating a returned object, and a frozen object throws (in strict mode)
   on accidental writes — a fast failure beats silent corruption.
3. **Writes reuse existing validation.** Write methods are thin wrappers over
   `TaskStore`/`TaskWriter`, so the Phase 2.5 safeguards (ID collision retry,
   `depends_on` dedupe, self/invalid-reference guards, `blocks` auto-sync)
   apply automatically. The API adds no second validation path to maintain.
4. **Additive-only after 1.0.** Once `api.version` hits `1.0.0`, no field is
   removed or repurposed and no signature changes incompatibly within the 1.x
   line. New surface arrives as new optional methods/fields only.
5. **No Obsidian types in the public surface.** The exported `TTasksApi` and
   `Task` type declarations import nothing from `obsidian`, so consumers can
   vendor a `.d.ts` without pulling Obsidian's types.

---

## 2. Versioning

```ts
api.version: string   // semver, e.g. "1.0.0"
```

- **Additive-only policy** for the 1.x line: consumers gate on
  `api.version` with a semver check when they need a method added after 1.0.
- **Stability tiers**, documented per-method below:
  - **Stable** — covered by the additive-only guarantee.
  - **Experimental** — may change or be removed in a minor; grouped under
    `api.experimental.*` so the instability is visible at the call site.
- **Pre-1.0 (0.x):** while the plugin manifest is `0.1.0`, the API ships as
  `0.x` and is explicitly *not yet frozen* — early adopters are told to pin.
  The freeze commitment begins at `1.0.0`.

**Recommended consumer guard:**

```js
const tt = app.plugins.plugins['ttasks'];
if (!tt?.api || !tt.api.version) {
  // TTasks not installed / too old — degrade gracefully
}
```

---

## 3. Read API

All reads are synchronous and return deep-frozen snapshots.

```ts
getAllTasks(): ReadonlyArray<Task>
```
Snapshot of every task and project currently in the store. Wraps
`TaskStore.getAll()` (`TaskStore.ts:58`), cloning + freezing each entry.

```ts
getTask(path: string): Task | undefined
```
Single task by vault path. `.md` extension optional (matching
`TaskStore.getByPath()`, `TaskStore.ts:53`). Returns a frozen clone or
`undefined`.

```ts
queryTasks(query: QuerySpec): TaskGroup[]
```
Runs the **same Smart List query schema** used everywhere in the UI
(`filter` / `sort` / `group` / `limit` / `search`) through
`applyQuery()` (`src/query/engine.ts:363`). Returns grouped results; each
`TaskGroup.tasks` entry is a frozen clone.

`QuerySpec` (from `src/query/types.ts`) is part of the public contract:

```ts
interface QuerySpec {
  filter: FilterSpec;          // nested and/or condition groups
  sort: SortSpec;              // [{ field, direction }]
  sortScope?: 'global' | 'within_groups';
  group: GroupSpec;            // none | field | date_buckets
  limit?: number;
  limitPerGroup?: number;
  search?: string;             // case-insensitive match on name + notes
}
```

A convenience overload accepting a flat filter is a candidate for a later
minor; v1 ships the full `QuerySpec` only to keep one code path.

### Snapshot shape

The public `Task` type is the current `src/types.ts` `Task` **minus internal
churn risk**. The proposal is to expose it verbatim (all fields in
`src/types.ts:5-60`, including derived `is_complete` / `is_inbox`), because
every field is already portable frontmatter or a documented derived flag.
Relationship fields (`depends_on`, `blocks`, `parent_task`) are exposed as the
stored vault paths (without extension), matching the on-disk format.

---

## 4. Subscribe API

```ts
onTasksChanged(cb: (tasks: ReadonlyArray<Task>) => void): () => void
```

Wraps the `TaskStore.tasks` writable (`TaskStore.ts:16`). Fires on any
create/update/delete/rename/external-edit that the store observes. The callback
receives the same frozen-snapshot array shape as `getAllTasks()`.

**Returns an unsubscribe function.** The doc will state explicitly, with a
worked example, that consumers **must call it in their plugin's `onunload`** —
otherwise the closure leaks after TTasks or the consumer reloads. (Internally
this is just the Svelte `Writable.subscribe` unsubscriber, wrapped so we can
change the underlying store later without changing the contract.)

```js
// in the consumer's onload
this.register(app.plugins.plugins['ttasks'].api.onTasksChanged((tasks) => {
  // Obsidian's this.register() runs the unsubscribe on unload for us
}));
```

---

## 5. Write API

Thin wrappers; all reuse existing validation and `processFrontMatter` write
paths. All are async and resolve after the store reflects the change.

```ts
createTask(input: TaskCreateInput): Promise<Task>
```
Wraps `TaskStore.create()` (`TaskStore.ts:147`). Returns the created task's
frozen snapshot (with its assigned `id` / `slug` / `path`). Reuses the
collision-safe path retry and relationship guards.

```ts
updateTask(path: string, updates: Partial<Task>): Promise<void>
```
Wraps `TaskStore.update()` (`TaskStore.ts:151`). Frozen-input safe — the
wrapper shallow-copies `updates` before handing them on.

```ts
completeTask(path: string): Promise<void>
```
Convenience over `completeAndRecur` / `setStatus`. Resolves the task by path,
then completes it (and spawns the next recurrence if the task recurs), matching
in-app "complete" behavior. Wraps `TaskStore.completeAndRecur()`
(`TaskStore.ts:179`).

```ts
setStatus(path: string, status: string): Promise<void>
```
Wraps `TaskStore.setStatus()` (`TaskStore.ts:183`). **Note:** the store method
currently takes a `Task`, not a path — the API wrapper resolves the path first
and rejects with a clear error if the task is unknown. Status string is
validated against configured statuses; invalid → rejected, no write.

```ts
addDependency(path: string, dependsOnPath: string): Promise<void>
```
Wraps `TaskStore.addDependency()` (`TaskStore.ts:165`). Reuses the dedupe +
self/invalid-reference guards; `blocks` is auto-synced on the other side.

**Write-side error contract:** methods **reject** (never silently no-op) when
the target path is unknown or a value fails validation, with a
`TTasksApiError`-style message prefixed `TTasks API:`. This is friendlier to
`await`-ing consumers than the in-app methods, some of which return `void` and
surface errors as `Notice`s.

---

## 6. UI API

Navigation helpers so external tools can drive the workspace.

```ts
openBoard(): Promise<void>            // wraps plugin.openBoard()      (main.ts:260)
openTask(path: string): Promise<void> // wraps TaskStore.openDetail()  (TaskStore.ts:209)
openCreateModal(prefill?: CreatePrefill): Promise<void> // wraps CreateTaskModal (main.ts:105)
```

`CreatePrefill` mirrors the modal's existing prefill options
(`CreateTaskModal.ts:52` — `name`, `parent_task`, `area`, `labels`,
`priority`, `start_date`, `due_date`). `openCreateModal` **never writes
directly** — it only opens the modal pre-filled, so the user still confirms.

---

## 7. Type distribution

Consumers need `TTasksApi`, `Task`, and the `QuerySpec` family as types they
can vendor. Options, in preference order:

1. **Ship a standalone `types.ts` in the repo** (`api/types.ts`) that
   re-exports `Task`, `TaskCreateInput`, `QuerySpec`, `FilterSpec`, `SortSpec`,
   `GroupSpec`, `TaskGroup`, and `TTasksApi`, with **zero Obsidian imports**,
   and document copy-vendoring it. Lowest overhead; recommended for v1.
2. **Publish a tiny `ttasks-api` npm package** containing only the `.d.ts`.
   Cleanest for TypeScript consumers but adds a release process — defer to
   post-1.0 if there's demand.

The API's own implementation must therefore keep the public `Task` /
`QuerySpec` types free of Obsidian imports (they already are — `src/types.ts`
and `src/query/types.ts` import nothing from `obsidian`; an
`architectureBoundaries.test.ts` entry should lock this in when the API lands).

---

## 8. Protocol (`ttasks://`) parity

The URI handler (`src/integration/protocol.ts`, documented in `PROTOCOL.md`) is
the *path-free, cross-app* sibling of this API. Mapping:

| API method            | Existing protocol action        | Gap                          |
|-----------------------|---------------------------------|------------------------------|
| `openBoard()`         | `action=open-board`             | —                            |
| `openTask(path)`      | `action=open&path=`             | —                            |
| `openCreateModal(p)`  | `action=new-task&name=&area=&due=` | prefill parity is partial |
| find a task           | `action=jump` / `search&query=` | —                            |
| `queryTasks(query)`   | *(none)*                        | **propose `action=search&query=`** as a lightweight text search entry point; full `QuerySpec` over a URL is out of scope |
| write methods         | *(none — by design)*            | URLs never write without the modal |

**Proposed additions (protocol, separate task):**
- `action=search&query=` returning/opening a filtered board — the URL-level
  analog of `queryTasks` for simple text queries.
- **`x-success` callbacks** (Advanced-URI style): after `new-task`, invoke a
  caller-supplied `x-success` URL with the new task's path. Powerful for
  automation chains but adds a callback-security surface — flagged as a
  **later addition**, not v1.

---

## 9. Non-goals (v1)

- **No bulk / migration endpoints.** The Settings → Advanced import and the
  `migrate*` methods stay internal.
- **No settings mutation.** Consumers cannot change `tasksFolder`, statuses,
  areas, capture sources, etc.
- **No archive control.** Archiving/restoring and the archive view are not
  exposed.
- **No direct delete in v1.** `deleteTask` is intentionally omitted from the
  first cut (destructive, and the in-app path has a confirm dialog); revisit
  once the read/write core has proven stable.

---

## 10. Proposed `TTasksApi` shape (for review)

```ts
export interface TTasksApi {
  readonly version: string;

  // Read (sync, frozen snapshots)
  getAllTasks(): ReadonlyArray<Task>;
  getTask(path: string): Task | undefined;
  queryTasks(query: QuerySpec): TaskGroup[];

  // Subscribe
  onTasksChanged(cb: (tasks: ReadonlyArray<Task>) => void): () => void;

  // Write (async, reuse existing validation)
  createTask(input: TaskCreateInput): Promise<Task>;
  updateTask(path: string, updates: Partial<Task>): Promise<void>;
  completeTask(path: string): Promise<void>;
  setStatus(path: string, status: string): Promise<void>;
  addDependency(path: string, dependsOnPath: string): Promise<void>;

  // UI
  openBoard(): Promise<void>;
  openTask(path: string): Promise<void>;
  openCreateModal(prefill?: CreatePrefill): Promise<void>;

  // Reserved for unstable surface
  experimental?: Record<string, unknown>;
}
```

Exposed by assigning `this.api = new TTasksApiImpl(this)` in `TTasksPlugin.onload`
so `app.plugins.plugins['ttasks'].api` resolves once the plugin is ready.

---

## 11. Worked consumer examples

### 11a. Templater — create a task from the current note

```js
<%*
const tt = app.plugins.plugins['ttasks']?.api;
if (!tt) { tR = "TTasks not installed"; }
else {
  const task = await tt.createTask({
    type: 'task',
    name: tp.file.title,
    area: 'Work',
    status: 'Active',
    priority: 'Medium',
    labels: ['action'],
    parent_task: null,
    depends_on: [],
    blocked_reason: '',
    assigned_to: '',
    source: tp.file.path,
    start_date: null,
    due_date: tp.date.now("YYYY-MM-DD", 7),
    due_time: null,
    estimated_days: null,
    created: tp.date.now("YYYY-MM-DD"),
    completed: null,
    recurrence: null,
    recurrence_type: null,
    notes: '',
  });
  tR = `Created [[${task.path}|${task.name}]]`;
}
%>
```
*(Shape mirrors `TaskCreateInput` = `Task` minus `id`/`slug`/`path`/`blocks`/
derived flags/`status_changed`, `src/types.ts:62`.)*

### 11b. QuickAdd — capture, review in the modal

QuickAdd "User Script" that opens the prefilled create modal so the user
confirms area/due before it's written:

```js
module.exports = async (params) => {
  const tt = params.app.plugins.plugins['ttasks']?.api;
  if (!tt) return;
  const name = await params.quickAddApi.inputPrompt("Task name");
  await tt.openCreateModal({ name, area: 'Inbox', labels: ['action'] });
};
```

### 11c. Dataview-JS — list tasks via `queryTasks`

```js
const tt = app.plugins.plugins['ttasks']?.api;
if (!tt) { dv.paragraph("TTasks not installed."); }
else {
  const groups = tt.queryTasks({
    filter: { logic: 'and', conditions: [
      { field: 'status', operator: 'is', value: 'In Progress' },
      { field: 'is_complete', operator: 'is', value: false },
    ]},
    sort: [{ field: 'due_date', direction: 'asc' }],
    group: { kind: 'field', field: 'area' },
    search: '',
  });
  for (const g of groups) {
    dv.header(3, g.key);
    dv.list(g.tasks.map(t => `${t.name} — ${t.due_date ?? 'no due date'}`));
  }
}
```

---

## 12. Open questions for Taylor

1. **Freeze timing.** Ship as `0.x` now (pin-and-pray) or hold the API until we
   commit to `1.0.0`? Recommendation: ship `0.x`, document instability.
2. **`Task` snapshot = full internal type?** Exposing `src/types.ts` verbatim is
   simplest but couples the public shape to internal churn. Alternative: a
   narrower `PublicTask` omitting fields we might change (e.g.
   `reminder_override`). Recommendation: expose full, since every field is
   portable frontmatter.
3. **Deep-freeze cost.** Freezing every snapshot on every `getAllTasks()` for a
   large vault has a cost. Options: freeze lazily / memoize by store version /
   document "treat as readonly" and skip the freeze. Recommendation: memoize the
   frozen array per store revision.
4. **`deleteTask` in v1?** Currently a non-goal. Include with a required
   `{ confirm: true }` flag, or keep out until 1.1?
5. **Type distribution:** in-repo `api/types.ts` (recommended) vs a published
   `ttasks-api` package.
