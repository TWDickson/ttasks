# TTasks Modal & Detail View — Codebase Exploration

**Date:** 2026-05-19  
**Purpose:** Map create/edit modal and task detail pane components, their fields, rendering logic, and inconsistencies.

---

## 1. Create/Edit Task Modal

**File:** [`src/modals/CreateTaskModal.ts`](src/modals/CreateTaskModal.ts)

### Architecture

- **Class:** `CreateTaskModal extends Modal` from Obsidian API
- **Constructor:** Takes `defaultType` ('task' | 'project') and optional `initialDependsOn` array
- **Sections (collapsible on desktop, compact on mobile):**
  - **Basics** — always expanded
  - **Scheduling** — collapsed by default (hidden on mobile quick-create)
  - **Notes** — collapsed by default (hidden on mobile quick-create)
  - **Advanced** — collapsed by default (hidden on mobile quick-create)

### Fields Shown

#### Basics Section
| Field | Type | Notes |
|-------|------|-------|
| **Name** | Text input | Full width, auto-focused, Enter submits |
| **Type** | Segmented buttons | 'Task' or 'Project' — grays out Task Type when Project selected |
| **Priority** | Chips | None / Low / Medium / High — defaults to 'None' |
| **Task Type** | Select dropdown | Rendered from `labelValues` settings; first option blank ('— none —') |

#### Scheduling Section
| Field | Type | Notes |
|-------|------|-------|
| **Start Date** | Date input + buttons | "Today" / "Clear" buttons; disabled if dependencies exist |
| **After Task(s)** | Chips + select dropdown | Rendered in `renderAfterTaskOptions()`; **NO sorting applied** |
| **Due Date** | Date input + buttons | "Today" / "Clear" buttons; mutually exclusive with Est. Days |
| **Est. Days** | Number input (step 0.5) | Disabled if due_date set; validates ≥0 and finite |

#### Notes Section
| Field | Type | Notes |
|-------|------|-------|
| **Notes** | Textarea + live preview | Markdown rendered in preview pane below editor |

#### Advanced Section (Collapsible)
| Field | Type | Notes |
|-------|------|-------|
| **Status** | Chips | Rendered from `settings.statuses`; colored with `statusColors` |
| **Area** | Select dropdown | Rendered from `settings.areas`; first option blank; colored with `areaColors` |
| **Repeats** | Paired selects | First select: recurrence frequency (RECURRENCE_OPTIONS); second (conditional): recurrence type |

### Mobile Quick Create Mode

**Enabled by default on mobile (< 768px width)**

- **Preference stored in localStorage:** `ttasks.mobileQuickCreate` ('0' | '1')
- **Toggle button in modal** to switch between quick and full modes
- **Quick create mode hides:** Task Type, Priority, Scheduling, Notes, Advanced sections
- **Show/hide hint:** First-time users see hint "Quick Create keeps only essentials visible."
  - Hint stored in localStorage: `ttasks.mobileQuickCreateHintDismissed`

### Buttons

- **Cancel** — closes modal without action
- **Create task** / **Create project** — dynamic label based on type toggle; disabled until name is non-empty

### Key Logic

**Start Date ↔ After Task(s) mutual exclusion:**
```js
// If dependencies are added:
startDateInput.disabled = true;
startTodayBtn.disabled = true;

// If start date is set:
this.depends_on = [];
afterTaskSelect.disabled = true;
```

**"After Task(s)" list rendering** (lines 280–288):
```js
const renderAfterTaskOptions = () => {
  afterTaskSelect.empty();
  afterTaskSelect.createEl('option', { text: '+ Add dependency…', value: '' });
  for (const t of allTasks) {
    const path = t.path.replace(/\.md$/, '');
    if (this.depends_on.includes(path)) continue;
    afterTaskSelect.createEl('option', { text: t.name, value: path });
  }
};
```
**⚠️ No sorting applied** — uses store order directly.

---

## 2. Task Detail Pane

**File:** [`src/components/TaskDetail.svelte`](src/components/TaskDetail.svelte)

### Architecture

- **Svelte component** — reactive, auto-saves with debounce (600ms)
- **Props:**
  - `plugin: TTasksPlugin`
  - `tasks: Readable<Task[]>`
  - `activeTaskPath: Writable<string | null>`
  - `store: TaskStore`
- **Lazy sub-components:**
  - `TaskDetailRelationships.svelte` — shown only for `type === 'task'`
  - `TaskDetailNotes.svelte`
  - `TaskDetailActions.svelte`

### Fields Shown

#### Top-level
| Field | Type | Auto-save? | Notes |
|-------|------|-----------|-------|
| **Name** | Editable input | Debounced (600ms) | Large (1.3rem) bold header with underline focus |

#### Status & Priority (chips)
| Field | Type | Auto-save? | Notes |
|-------|------|-----------|-------|
| **Status** | Chips | Immediate | Rendered from `statusOptions`; colored |
| **Priority** | Chips | Immediate | None / Low / Medium / High; colored via `PRIORITY_COLORS` |

#### Field Grid (2-column layout)
| Field | Type | Auto-save? | Notes |
|-------|------|-----------|-------|
| **Area** | Select | Immediate | Colored with `areaColors` |
| **Project** (task only) | Select + open button | Immediate | Parent task dropdown; open button (↗) links to parent |
| **Labels** (task only) | Select | Immediate | Single select from `labelValues`; field label is "Task Type" in modal but "Labels" in detail |
| **Due Date** | Date input + Today btn | Immediate | Mutually exclusive with Est. Days |
| **Start Date** | Date input + Today btn | Immediate | |
| **Assigned To** | Text input | Debounced (600ms) | **Unique to detail view** — not in modal |
| **Est. Days** | Number (0.5 step) | Immediate | Mutually exclusive with Due Date; clears when > 0 values entered |
| **Blocked Reason** | Text input | Debounced (600ms) | **Only shown when `status === blockStatus`** |
| **Repeats** | Paired selects | Immediate | Recurrence + recurrence type (conditional) |
| **Reminders** | Select | Immediate | **Unique to detail view**; options: Default / Urgent (bypass quiet hours) / Mute |

---

## 3. Dependency Rendering & Sorting

### Task Detail Relationships Component

**File:** [`src/components/TaskDetailRelationships.svelte`](src/components/TaskDetailRelationships.svelte)

#### System Fit Section (Header)

Shows health metrics:
```
⏸ Waiting on {task.depends_on.length}
→ Unblocks {task.blocks.length}
[Optional] ⚠️ Blocked by {openDependencies.length} open
[Optional] 🔴 Cycle
```

Relationship tree visualization (upstream "Blocked by" ↑ / downstream "Unblocks" ↓):
- Grouped by depth level
- Max depth: 5 levels
- Max total nodes: 60
- Sorted: Same-project → alphabetical within level
- Visual indicators:
  - `.tt-chip-warning` (orange) — missing task
  - `.tt-chip-blocking` (red) — unfinished blocker

#### "Blocked by" & "Unblocks" Lanes

**Blocked by lane:**
```html
<select class="tt-dep-add" on:change={...}>
  <option value="">+ Add blocker…</option>
  {#each availableDependencies as t}
    <option value={t.path}>{t.name}</option>
  {/each}
</select>
```

**Unblocks lane:** (read-only, no add button)
- Lists all tasks in `task.blocks`
- Clicking opens the task

#### Available Dependencies Calculation (Line 163–165)

```ts
$: availableDependencies = tasks
  .filter((t) => t.type === 'task' && t.path !== task.path && !task.depends_on.some((d) => normalizeTaskPath(d) === t.path))
  .sort((a, b) => sortDependencyFirst(a, b, task.parent_task));
```

**Filters:**
- Type must be 'task' (not 'project')
- Exclude current task
- Exclude already-added dependencies

**Sorting:** Uses `sortDependencyFirst()` from `src/components/dependencySort.ts`

### Dependency Sort Logic

**File:** [`src/components/dependencySort.ts`](src/components/dependencySort.ts)

```ts
export function sortDependencyFirst(a: Task, b: Task, currentParentTask: string | null): number {
  const aIsSameProject = !!currentParentTask && a.parent_task === currentParentTask;
  const bIsSameProject = !!currentParentTask && b.parent_task === currentParentTask;
  if (aIsSameProject && !bIsSameProject) return -1;
  if (!aIsSameProject && bIsSameProject) return 1;
  return a.name.localeCompare(b.name);
}
```

**Order:**
1. Same-project tasks (where `parent_task === currentParentTask`)
2. All others, alphabetically by name

---

## 4. Key Inconsistencies

### Field Presence

| Feature | Modal | Detail View |
|---------|-------|-------------|
| **Assigned To** | ❌ | ✅ |
| **Reminders override** | ❌ | ✅ |
| **Blocked Reason** | ❌ | ✅ (conditional) |
| **System Fit health pills** | ❌ | ✅ |
| **Relationship tree visualization** | ❌ | ✅ (upstream/downstream) |
| **Project/Parent Task selector** | ❌ | ✅ (for tasks) |

### Field Labels

| Concept | Modal | Detail View |
|---------|-------|-------------|
| Task labels/categories | "Task Type" | "Labels" |
| Repeat configuration | "Repeats" | "Repeats" |
| Area/category | "Area" | "Area" |

### Dependency List Behavior

| Aspect | Modal | Detail View |
|--------|-------|-------------|
| **Sort order** | None (store order) | Same-project first, then alphabetical |
| **List position** | "After Task(s)" select in Scheduling | "Blocked by" select in System Fit section |
| **Unblocks visibility** | ❌ | ✅ (read-only "Unblocks" lane) |

### Mobile Behavior

| Feature | Modal | Detail View |
|---------|-------|-------------|
| **Quick Create mode** | ✅ (hides 70% of form) | ❌ (always full) |
| **Responsive layout** | Yes (collapsible sections) | Always expanded grid |

### Relationship Visualization

| Aspect | Modal | Detail View |
|--------|-------|-------------|
| **Dependency tree** | ❌ | ✅ (shows up to 5 levels) |
| **Missing task warnings** | ❌ | ✅ (orange chip) |
| **Cycle detection** | ❌ | ✅ |
| **Blocking status indicators** | ❌ | ✅ (red chip for unfinished) |

---

## 5. File Reference Summary

### Primary Files

| Component | File Path | Type | Purpose |
|-----------|-----------|------|---------|
| **Create Task Modal** | `src/modals/CreateTaskModal.ts` | TypeScript Class | Create/edit task form with sections, mobile quick-create |
| **Task Detail View** | `src/components/TaskDetail.svelte` | Svelte | Main detail pane with all editable fields |
| **Relationships Component** | `src/components/TaskDetailRelationships.svelte` | Svelte | Dependency tree, health metrics, add/remove blockers |
| **Dependency Sorter** | `src/components/dependencySort.ts` | TypeScript | Comparator for available dependencies list |

### Supporting Components (Lazy-loaded by TaskDetail)

| Component | File Path | Loaded For |
|-----------|-----------|-----------|
| **Notes Editor** | `src/components/TaskDetailNotes.svelte` | All tasks |
| **Quick Actions** | `src/components/TaskDetailActions.svelte` | All tasks |
| **Relationships** | `src/components/TaskDetailRelationships.svelte` | `type === 'task'` only |

---

## 6. Recommendations for Alignment

1. **Modal dependency sorting:** Apply `sortDependencyFirst()` to "After Task(s)" dropdown (currently unsorted)
2. **Field parity:** Consider adding **Assigned To** to modal if it's a create-time field, or hide from detail if it's edit-only
3. **Label consistency:** Standardize "Task Type" (modal) ↔ "Labels" (detail) terminology
4. **Mobile detail view:** Consider mobile-optimized layout for TaskDetail (currently always full width grid)
5. **Relationship visibility in modal:** Show visual preview of dependency impact (blockers count, cycle risk) at create time

---

## Notes

- All frontmatter mutations in detail view use `app.fileManager.processFrontMatter()` for atomic updates
- Modal frontmatter is built as raw string only at creation time (file doesn't exist yet)
- Reactive state in TaskDetail uses Svelte's `$:` (reactive label) to recalculate derived fields
- Mobile quick-create preference persists across sessions via localStorage
