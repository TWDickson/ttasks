<script lang="ts">
	import type { Writable } from 'svelte/store';
	import type TTasksPlugin from '../main';
	import type { Task, TaskStatus, TaskPriority, TaskType } from '../types';
	import type { TaskStore } from '../store/TaskStore';
	import { resolveCompletionStatus } from '../settings';

	export let plugin: TTasksPlugin;
	export let tasks: Writable<Task[]>;
	export let activeTaskPath: Writable<string | null>;
	export let store: TaskStore;

	// ── Derived task ────────────────────────────────────────────────────────────
	$: task = $activeTaskPath
		? ($tasks.find(t => t.path === $activeTaskPath) ?? null)
		: null;

	// ── Local editable state (mirrors task, reset when task changes) ─────────
	let name = '';
	let status: TaskStatus = 'Active';
	let priority: TaskPriority = 'None';
	let category = '';
	let task_type: TaskType | null = null;
	let parent_task_path = '';
	let due_date = '';
	let start_date = '';
	let assigned_to = '';
	let estimated_days: number | null = null;
	let blocked_reason = '';
	let notes = '';
	let formTaskPath: string | null = null;
	let pendingSaves = 0;
	let saving = false;

	type DebounceKey = 'name' | 'assigned_to' | 'blocked_reason' | 'notes';
	const saveTimers: Partial<Record<DebounceKey, ReturnType<typeof setTimeout>>> = {};

	$: saving = pendingSaves > 0;

	$: if (!task) {
		formTaskPath = null;
	} else if (task.path !== formTaskPath) {
		name          = task.name;
		status        = task.status;
		priority      = task.priority;
		category      = task.category ?? '';
		task_type     = task.task_type;
		parent_task_path = task.parent_task ?? '';
		due_date      = task.due_date ?? '';
		start_date    = task.start_date ?? '';
		assigned_to   = task.assigned_to ?? '';
		estimated_days = task.estimated_days;
		blocked_reason = task.blocked_reason ?? '';
		notes         = task.notes ?? '';
		formTaskPath  = task.path;
	}

	// ── Save helpers ────────────────────────────────────────────────────────────
	function beginSave(): void {
		pendingSaves += 1;
	}

	function endSave(): void {
		pendingSaves = Math.max(0, pendingSaves - 1);
	}

	function clearSaveTimer(key: DebounceKey): void {
		const timer = saveTimers[key];
		if (timer) {
			clearTimeout(timer);
			delete saveTimers[key];
		}
	}

	async function saveImmediateForPath(taskPath: string, updates: Partial<Task>) {
		beginSave();
		try {
			await store.update(taskPath, updates);
		} finally {
			endSave();
		}
	}

	async function saveImmediate(updates: Partial<Task>) {
		if (!task) return;
		await saveImmediateForPath(task.path, updates);
	}

	function saveDebounced(key: DebounceKey, updates: Partial<Task>) {
		if (!task) return;
		const taskPath = task.path;
		clearSaveTimer(key);
		saveTimers[key] = setTimeout(() => {
			void saveImmediateForPath(taskPath, updates);
			delete saveTimers[key];
		}, 600);
	}

	function saveNotesDebounced(nextNotes: string) {
		if (!task) return;
		const taskPath = task.path;
		clearSaveTimer('notes');
		saveTimers.notes = setTimeout(async () => {
			beginSave();
			try {
				await store.updateNotes(taskPath, nextNotes);
			} finally {
				endSave();
				delete saveTimers.notes;
			}
		}, 600);
	}

	// ── Field handlers ──────────────────────────────────────────────────────────
	function setStatus(s: TaskStatus) {
		status = s;
		saveImmediate({ status: s });
	}

	function setPriority(p: TaskPriority) {
		priority = p;
		saveImmediate({ priority: p });
	}

	function getCompletionStatus(): TaskStatus {
		return resolveCompletionStatus(plugin.settings.statuses, plugin.settings.completionStatus);
	}

	async function markComplete() {
		if (!task) return;
		const today = new Date().toISOString().slice(0, 10);
		const completeStatus = getCompletionStatus();
		status = completeStatus;
		await saveImmediate({ status: completeStatus, completed: today });
	}

	async function onParentTaskChange() {
		if (!task) return;
		beginSave();
		try {
			await store.updateParentTask(task.path, parent_task_path || null);
		} finally {
			endSave();
		}
	}

	function normalizeDateValue(value: string): string | null {
		if (!value) return null;
		return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
	}

	function todayDateString(): string {
		return new Date().toISOString().slice(0, 10);
	}

	function saveDueDate(nextValue: string): void {
		due_date = nextValue;
		void saveImmediate({ due_date: normalizeDateValue(nextValue) });
	}

	function saveStartDate(nextValue: string): void {
		start_date = nextValue;
		void saveImmediate({ start_date: normalizeDateValue(nextValue) });
	}

	function onDueDateInput(event: Event): void {
		saveDueDate((event.currentTarget as HTMLInputElement).value);
	}

	function onStartDateInput(event: Event): void {
		saveStartDate((event.currentTarget as HTMLInputElement).value);
	}

	function setDueDateToday(): void {
		saveDueDate(todayDateString());
	}

	function setStartDateToday(): void {
		saveStartDate(todayDateString());
	}

	function withCurrentOption(base: string[], current: string | null): string[] {
		if (!current) return base;
		if (base.includes(current)) return base;
		return [...base, current];
	}

	// ── Constants ───────────────────────────────────────────────────────────────
	const PRIORITIES: TaskPriority[] = ['High', 'Medium', 'Low', 'None'];

	$: statusOptions = withCurrentOption(plugin.settings.statuses ?? [], status || null);
	$: completionStatus = getCompletionStatus();
	$: categoryOptions = ['', ...withCurrentOption(plugin.settings.categories ?? [], category || null)];
	$: taskTypeOptions = ['', ...withCurrentOption(plugin.settings.taskTypes ?? [], task_type)];
	$: categoryColors = plugin.settings.categoryColors ?? {};
	$: taskTypeColors = plugin.settings.taskTypeColors ?? {};
	$: statusColors = plugin.settings.statusColors ?? {};
	$: parentProjectOptions = [
		{ value: '', label: '— none —' },
		...$tasks
			.filter(t => t.type === 'project' && t.path !== task?.path)
			.map(t => ({ value: t.path.replace(/\.md$/, ''), label: t.name }))
			.sort((a, b) => a.label.localeCompare(b.label)),
	];

	const PRIORITY_COLORS: Record<TaskPriority, string> = {
		High:   'var(--color-red)',
		Medium: 'var(--color-orange)',
		Low:    'var(--color-blue)',
		None:   'var(--text-faint)',
	};

	function getSelectTintStyle(color: string | undefined): string {
		return color
			? `--tt-select-color:${color};background:color-mix(in srgb, ${color} 10%, var(--background-primary));border-color:color-mix(in srgb, ${color} 42%, var(--background-modifier-border));color:${color};`
			: '';
	}

</script>

{#if !task}
	<div class="tt-detail-empty">
		<p>Select a task to view details.</p>
	</div>
{:else}
	<div class="tt-detail">

		<!-- Name -->
		<div class="tt-detail-name-row">
			<input
				class="tt-detail-name"
				type="text"
				bind:value={name}
				on:input={() => saveDebounced('name', { name })}
				placeholder="Task name"
			/>
			{#if saving}
				<span class="tt-saving">saving…</span>
			{/if}
		</div>

		<!-- Status chips -->
		<div class="tt-field-group">
			<span class="tt-label">Status</span>
			<div class="tt-chips">
				{#each statusOptions as s}
					<button
						class="tt-chip"
						class:tt-chip-active={status === s}
						style={status === s && statusColors[s] ? `background:${statusColors[s]};border-color:${statusColors[s]}` : ''}
						on:click={() => setStatus(s)}
					>{s}</button>
				{/each}
			</div>
		</div>

		<!-- Priority chips -->
		<div class="tt-field-group">
			<span class="tt-label">Priority</span>
			<div class="tt-chips">
				{#each PRIORITIES as p}
					<button
						class="tt-chip"
						class:tt-chip-active={priority === p}
						style={priority === p ? `background:${PRIORITY_COLORS[p]};border-color:${PRIORITY_COLORS[p]};color:var(--text-on-accent)` : ''}
						on:click={() => setPriority(p)}
					>{p}</button>
				{/each}
			</div>
		</div>

		<hr class="tt-divider" />

		<!-- Fields grid -->
		<div class="tt-fields">
			<label class="tt-label" for="tt-category">Category</label>
			<select
				id="tt-category"
				bind:value={category}
				style={getSelectTintStyle(category ? categoryColors[category] : undefined)}
				on:change={() => saveImmediate({ category: category || null })}
			>
				{#each categoryOptions as c}
					<option value={c}>{c || '— none —'}</option>
				{/each}
			</select>

			{#if task.type === 'task'}
				<label class="tt-label" for="tt-parent-task">Project</label>
				<select
					id="tt-parent-task"
					bind:value={parent_task_path}
					on:change={onParentTaskChange}
				>
					{#each parentProjectOptions as opt}
						<option value={opt.value}>{opt.label}</option>
					{/each}
				</select>

				<label class="tt-label" for="tt-task-type">Task Type</label>
				<select
					id="tt-task-type"
					bind:value={task_type}
					style={getSelectTintStyle(task_type ? taskTypeColors[task_type] : undefined)}
					on:change={() => saveImmediate({ task_type: task_type || null })}
				>
					{#each taskTypeOptions as t}
						<option value={t}>{t || '— none —'}</option>
					{/each}
				</select>
			{/if}

			<label class="tt-label" for="tt-due-date">Due Date</label>
			<div class="tt-date-field">
				<input
					id="tt-due-date"
					type="date"
					bind:value={due_date}
					on:input={onDueDateInput}
					on:change={onDueDateInput}
				/>
				<button class="tt-date-today" type="button" on:click={setDueDateToday}>Today</button>
			</div>

			<label class="tt-label" for="tt-start-date">Start Date</label>
			<div class="tt-date-field">
				<input
					id="tt-start-date"
					type="date"
					bind:value={start_date}
					on:input={onStartDateInput}
					on:change={onStartDateInput}
				/>
				<button class="tt-date-today" type="button" on:click={setStartDateToday}>Today</button>
			</div>

			<label class="tt-label" for="tt-assigned-to">Assigned To</label>
			<input
				id="tt-assigned-to"
				type="text"
				bind:value={assigned_to}
				on:input={() => saveDebounced('assigned_to', { assigned_to })}
				placeholder="—"
			/>

			<label class="tt-label" for="tt-est-days">Est. Days</label>
			<input
				id="tt-est-days"
				type="number"
				bind:value={estimated_days}
				min="0"
				step="0.5"
				on:change={() => saveImmediate({ estimated_days })}
				placeholder="—"
			/>

			{#if status === 'Blocked'}
				<label class="tt-label" for="tt-blocked-reason">Blocked Reason</label>
				<input
					id="tt-blocked-reason"
					type="text"
					bind:value={blocked_reason}
					on:input={() => saveDebounced('blocked_reason', { blocked_reason })}
					placeholder="Why is this blocked?"
				/>
			{/if}
		</div>

		<!-- Relationships -->
		{#if task.depends_on.length > 0 || task.blocks.length > 0}
			<hr class="tt-divider" />
			<div class="tt-relationships">
				{#if task.depends_on.length > 0}
					<div class="tt-rel-row">
						<span class="tt-label">Depends on</span>
						<div class="tt-chips">
							{#each task.depends_on as dep}
								<button class="tt-chip tt-chip-rel" on:click={() => activeTaskPath.set(dep + '.md')}>
									{dep.split('/').pop()?.replace(/^[a-f0-9]+-/, '') ?? dep}
								</button>
							{/each}
						</div>
					</div>
				{/if}
				{#if task.blocks.length > 0}
					<div class="tt-rel-row">
						<span class="tt-label">Blocks</span>
						<div class="tt-chips">
							{#each task.blocks as dep}
								<button class="tt-chip tt-chip-rel" on:click={() => activeTaskPath.set(dep + '.md')}>
									{dep.split('/').pop()?.replace(/^[a-f0-9]+-/, '') ?? dep}
								</button>
							{/each}
						</div>
					</div>
				{/if}
			</div>
		{/if}

		<hr class="tt-divider" />

		<!-- Notes -->
		<div class="tt-field-group">
			<label class="tt-label" for="tt-notes">Notes</label>
			<textarea
				id="tt-notes"
				class="tt-notes"
				bind:value={notes}
				on:input={() => saveNotesDebounced(notes)}
				placeholder="Add notes…"
				rows="6"
			></textarea>
		</div>

		<hr class="tt-divider" />

		<!-- Actions -->
		<div class="tt-actions">
			{#if status !== completionStatus}
				<button class="tt-btn tt-btn-primary" on:click={markComplete}>
					✓ Mark Complete
				</button>
			{/if}
			<button class="tt-btn" on:click={() => store.openFile(task.path)}>
				Open in editor
			</button>
		</div>

		<!-- Meta -->
		<div class="tt-meta-footer">
			{#if task.created}<span>Created {task.created}</span>{/if}
			{#if task.completed}<span>Completed {task.completed}</span>{/if}
		</div>

	</div>
{/if}

<style>
	.tt-detail-empty {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 100%;
		color: var(--text-muted);
		font-size: 0.9rem;
	}

	.tt-detail {
		padding: 16px;
		padding-bottom: calc(84px + env(safe-area-inset-bottom, 0px));
		display: flex;
		flex-direction: column;
		gap: 14px;
		max-width: 600px;
	}

	.tt-detail-name-row {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.tt-detail-name {
		flex: 1;
		font-size: 1.3rem;
		font-weight: 600;
		border: none;
		background: transparent;
		color: var(--text-normal);
		padding: 4px 0;
		border-bottom: 2px solid transparent;
		transition: border-color 0.15s;
	}

	.tt-detail-name:focus {
		outline: none;
		border-bottom-color: var(--interactive-accent);
	}

	.tt-saving {
		font-size: 0.75rem;
		color: var(--text-faint);
	}

	.tt-label {
		font-size: 0.72rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--text-muted);
	}

	.tt-field-group {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.tt-fields {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 8px 12px;
		align-items: center;
	}

	.tt-fields input,
	.tt-fields select {
		width: 100%;
		box-sizing: border-box;
		font-size: 0.88rem;
		padding: 5px 8px;
		border-radius: var(--radius-m, 6px);
		border: 1px solid var(--background-modifier-border);
		background: var(--background-primary);
		color: var(--text-normal);
	}

	.tt-date-field {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.tt-date-field input {
		flex: 1;
	}

	.tt-date-today {
		border: 1px solid var(--background-modifier-border);
		background: var(--background-secondary);
		color: var(--text-muted);
		border-radius: var(--radius-s, 5px);
		padding: 6px 10px;
		font-size: 0.78rem;
		font-weight: 600;
		cursor: pointer;
		white-space: nowrap;
	}

	.tt-date-today:hover {
		background: var(--background-modifier-hover);
		color: var(--text-normal);
	}

	.tt-fields input:focus,
	.tt-fields select:focus {
		outline: none;
		border-color: var(--interactive-accent);
	}

	.tt-chips {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}

	.tt-chip {
		padding: 4px 12px;
		border-radius: 999px;
		border: 1.5px solid var(--background-modifier-border);
		background: var(--background-secondary);
		color: var(--text-muted);
		font-size: 0.8rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.12s;
	}

	.tt-chip:hover {
		border-color: var(--text-muted);
		color: var(--text-normal);
	}

	.tt-chip-active {
		background: var(--interactive-accent);
		border-color: var(--interactive-accent);
		color: var(--text-on-accent);
	}

	.tt-chip-rel {
		font-weight: 400;
		font-size: 0.78rem;
	}

	.tt-relationships {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.tt-rel-row {
		display: flex;
		align-items: center;
		gap: 10px;
	}

	.tt-divider {
		border: none;
		border-top: 1px solid var(--background-modifier-border);
		margin: 0;
	}

	.tt-notes {
		width: 100%;
		box-sizing: border-box;
		font-size: 0.88rem;
		padding: 8px;
		border-radius: var(--radius-m, 6px);
		border: 1px solid var(--background-modifier-border);
		background: var(--background-primary);
		color: var(--text-normal);
		resize: vertical;
		font-family: var(--font-text);
	}

	.tt-notes:focus {
		outline: none;
		border-color: var(--interactive-accent);
	}

	.tt-actions {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
	}

	.tt-btn {
		padding: 7px 16px;
		border-radius: var(--radius-m, 6px);
		border: 1px solid var(--background-modifier-border);
		background: var(--background-secondary);
		color: var(--text-normal);
		font-size: 0.88rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.12s;
	}

	.tt-btn:hover {
		background: var(--background-modifier-hover);
	}

	.tt-btn-primary {
		background: var(--interactive-accent);
		border-color: var(--interactive-accent);
		color: var(--text-on-accent);
	}

	.tt-btn-primary:hover {
		background: var(--interactive-accent-hover);
		border-color: var(--interactive-accent-hover);
	}

	.tt-meta-footer {
		display: flex;
		gap: 16px;
		font-size: 0.72rem;
		color: var(--text-faint);
	}
</style>
