<script lang="ts">
	import { Modal, Notice } from 'obsidian';
	import type { Readable, Writable } from 'svelte/store';
	import type TTasksPlugin from '../main';
	import type { Task, TaskStatus, TaskPriority } from '../types';
	import type { TaskStore } from '../store/TaskStore';
	import { resolveCompletionStatus } from '../settings';
	import { RECURRENCE_OPTIONS, RECURRENCE_LABELS, RECURRENCE_TYPES, RECURRENCE_TYPE_LABELS } from '../store/recurrence';
	import { localDateString } from '../utils/dateUtils';
	import { PRIORITY_COLORS } from '../constants';
	import TaskDetailRelationships from './TaskDetailRelationships.svelte';
	import TaskDetailNotes from './TaskDetailNotes.svelte';
	import TaskDetailActions from './TaskDetailActions.svelte';

	export let plugin: TTasksPlugin;
	export let tasks: Readable<Task[]>;
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
	let area = '';
	let selectedLabels: string[] = [];
	let parent_task_path = '';
	let due_date = '';
	let start_date = '';
	let assigned_to = '';
	let estimated_days: number | null = null;
	let blocked_reason = '';
	let recurrence: string | null = null;
	let recurrence_type: string | null = null;
	let formTaskPath: string | null = null;
	let pendingSaves = 0;
	let saving = false;

	type DebounceKey = 'name' | 'assigned_to' | 'blocked_reason';
	const saveTimers: Partial<Record<DebounceKey, ReturnType<typeof setTimeout>>> = {};

	$: saving = pendingSaves > 0;

	$: if (!task) {
		formTaskPath = null;
	} else if (task.path !== formTaskPath) {
		name          = task.name;
		status        = task.status;
		priority      = task.priority;
		area          = task.area ?? '';
		selectedLabels = task.labels;
		parent_task_path = task.parent_task ?? '';
		due_date      = task.due_date ?? '';
		start_date    = task.start_date ?? '';
		assigned_to   = task.assigned_to ?? '';
		estimated_days = task.estimated_days;
		blocked_reason  = task.blocked_reason ?? '';
		recurrence      = task.recurrence ?? null;
		recurrence_type = task.recurrence_type ?? null;
		formTaskPath    = task.path;
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
		const completeStatus = getCompletionStatus();
		status = completeStatus;

		if (task.recurrence) {
			const next = await store.completeAndRecur(task);
			if (next) {
				new Notice(`Completed. Next due ${next.due_date ?? 'TBD'} (${next.name})`);
			}
		} else {
			const today = localDateString();
			await saveImmediate({ status: completeStatus, completed: today });
		}
	}

	async function confirmDelete() {
		if (!task) return;
		const taskName = task.name;
		const taskPath = task.path;

		await new Promise<void>((resolve) => {
			const modal = new Modal(plugin.app);
			modal.titleEl.setText('Delete task');
			modal.contentEl.createEl('p', { text: `Are you sure you want to delete "${taskName}"? This cannot be undone.` });
			const actions = modal.contentEl.createDiv({ cls: 'modal-button-container' });

			actions.createEl('button', { text: 'Cancel' }).addEventListener('click', () => {
				modal.close();
				resolve();
			});

			const confirmBtn = actions.createEl('button', { text: 'Delete', cls: 'mod-warning' });
			confirmBtn.addEventListener('click', async () => {
				modal.close();
				activeTaskPath.set(null);
				await store.delete(taskPath);
				resolve();
			});

			modal.open();
		});
	}

	function onLabelChange(e: Event): void {
		const val = (e.target as HTMLSelectElement).value;
		selectedLabels = val ? [val] : [];
		saveImmediate({ labels: selectedLabels });
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
		return localDateString();
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
	$: blockStatus = plugin.settings.quickActions?.blockStatus ?? 'Blocked';
	$: categoryOptions = ['', ...withCurrentOption(plugin.settings.areas ?? [], area || null)];
	$: taskTypeOptions = ['', ...withCurrentOption(plugin.settings.labelValues ?? [], selectedLabels[0] ?? null)];
	$: areaColors = plugin.settings.areaColors ?? {};
	$: labelColors = plugin.settings.labelColors ?? {};
	$: statusColors = plugin.settings.statusColors ?? {};
	$: parentProjectOptions = [
		{ value: '', label: '— none —' },
		...$tasks
			.filter(t => t.type === 'project' && t.path !== task?.path)
			.map(t => ({ value: t.path.replace(/\.md$/, ''), label: t.name }))
			.sort((a, b) => a.label.localeCompare(b.label)),
	];

	function normalizeTaskPath(pathLike: string | null | undefined): string | null {
		if (!pathLike) return null;
		const clean = pathLike.trim();
		if (!clean) return null;
		return clean.endsWith('.md') ? clean : `${clean}.md`;
	}

	function linkedTask(pathLike: string | null | undefined): Task | null {
		const normalized = normalizeTaskPath(pathLike);
		if (!normalized) return null;
		// Exact match first (full vault path)
		const exact = $tasks.find((item) => item.path === normalized);
		if (exact) return exact;
		// Fallback: match by filename only, for tasks stored without folder prefix
		return $tasks.find((item) => item.path.endsWith('/' + normalized)) ?? null;
	}

	/** Resolve a possibly-short pathLike to the full vault path stored in the task store. */
	function resolveTaskPath(pathLike: string | null | undefined): string | null {
		const normalized = normalizeTaskPath(pathLike);
		if (!normalized) return null;
		const found = linkedTask(normalized);
		return found ? found.path : normalized;
	}

	function taskLabelFromPath(pathLike: string | null | undefined): string {
		const normalized = normalizeTaskPath(pathLike);
		if (!normalized) return 'Unknown';
		const resolved = linkedTask(normalized);
		if (resolved) return resolved.name;
		return normalized.split('/').pop()?.replace(/^[a-f0-9]+-/, '').replace(/\.md$/, '') ?? normalized;
	}

	function openLinkedPath(pathLike: string): void {
		const resolved = resolveTaskPath(pathLike);
		if (!resolved) return;
		activeTaskPath.set(resolved);
	}

	function getSelectTintStyle(color: string | undefined): string {
		return color
			? `--tt-select-color:${color};background:color-mix(in srgb, ${color} 10%, var(--background-primary));border-color:color-mix(in srgb, ${color} 42%, var(--background-modifier-border));color:${color};`
			: '';
	}

	// ── Dependency callbacks (passed to TaskDetailRelationships) ────────────────

	async function addDependency(depPath: string): Promise<void> {
		if (!task) return;
		beginSave();
		try {
			await store.addDependency(task.path, depPath.replace(/\.md$/, ''));
		} finally {
			endSave();
		}
	}

	async function removeDependency(depPath: string): Promise<void> {
		if (!task) return;
		beginSave();
		try {
			await store.removeDependency(task.path, depPath.replace(/\.md$/, ''));
		} finally {
			endSave();
		}
	}

</script>

{#if !task}
	<div class="tt-detail-empty">
		{#if $activeTaskPath}
			<p>Task not found — it may still be loading or is outside the tasks folder.</p>
		{:else}
			<p>No task selected.</p>
		{/if}
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
			<label class="tt-label" for="tt-area">Area</label>
			<select
				id="tt-area"
				bind:value={area}
				style={getSelectTintStyle(area ? areaColors[area] : undefined)}
				on:change={() => saveImmediate({ area: area || null })}
			>
				{#each categoryOptions as c}
					<option value={c}>{c || '— none —'}</option>
				{/each}
			</select>

			{#if task.type === 'task'}
				<label class="tt-label" for="tt-parent-task">Project</label>
				<div class="tt-parent-task-row">
					<select
						id="tt-parent-task"
						bind:value={parent_task_path}
						on:change={onParentTaskChange}
					>
						{#each parentProjectOptions as opt}
							<option value={opt.value}>{opt.label}</option>
						{/each}
					</select>
					{#if parent_task_path}
						<button
							class="tt-parent-task-open"
							title="Open parent project"
							on:click={() => openLinkedPath(parent_task_path)}
							aria-label="Open parent project"
						>↗</button>
					{/if}
				</div>

				<label class="tt-label" for="tt-task-type">Labels</label>
				<select
					id="tt-task-type"
					value={selectedLabels[0] ?? ''}
					style={getSelectTintStyle(selectedLabels[0] ? labelColors[selectedLabels[0]] : undefined)}
					on:change={onLabelChange}
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

			{#if status === blockStatus}
				<label class="tt-label" for="tt-blocked-reason">Blocked Reason</label>
				<input
					id="tt-blocked-reason"
					type="text"
					bind:value={blocked_reason}
					on:input={() => saveDebounced('blocked_reason', { blocked_reason })}
					placeholder="Why is this blocked?"
				/>
			{/if}

			<label class="tt-label" for="tt-recurrence">Repeats</label>
			<div class="tt-recurrence-row">
				<select
					id="tt-recurrence"
					bind:value={recurrence}
					on:change={() => saveImmediate({ recurrence: recurrence || null })}
				>
					<option value="">— never —</option>
					{#each RECURRENCE_OPTIONS as r}
						<option value={r}>{RECURRENCE_LABELS[r]}</option>
					{/each}
				</select>
				{#if recurrence}
					<select
						bind:value={recurrence_type}
						on:change={() => saveImmediate({ recurrence_type: recurrence_type || null })}
						class="tt-recurrence-type"
					>
						{#each RECURRENCE_TYPES as t}
							<option value={t}>{RECURRENCE_TYPE_LABELS[t]}</option>
						{/each}
					</select>
				{/if}
			</div>
		</div>

		{#if task.type === 'task'}
			<TaskDetailRelationships
				{task}
				tasks={$tasks}
				{plugin}
				onAddDependency={addDependency}
				onRemoveDependency={removeDependency}
				onOpenTask={(path) => activeTaskPath.set(path)}
			/>
		{/if}

		<TaskDetailNotes {task} {plugin} {store} />

		<TaskDetailActions
			{task}
			onMarkComplete={markComplete}
			onOpenInEditor={() => store.openFile(task.path)}
			onDelete={confirmDelete}
		/>

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
		padding: var(--size-4-4, 16px);
		padding-bottom: calc(84px + env(safe-area-inset-bottom, 0px));
		display: flex;
		flex-direction: column;
		gap: var(--size-4-3, 12px);
		max-width: 600px;
	}

	.tt-detail-name-row {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.tt-detail-name {
		flex: 1;
		min-width: 0;
		font-size: 1.3rem;
		font-weight: 600;
		border: none;
		background: transparent;
		color: var(--text-normal);
		padding: 4px 0;
		border-bottom: 2px solid transparent;
		transition: border-color 0.15s;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.tt-detail-name:focus {
		outline: none;
		border-bottom-color: var(--interactive-accent);
	}

	.tt-parent-task-row {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.tt-parent-task-row select {
		flex: 1;
		min-width: 0;
	}

	.tt-parent-task-open {
		flex-shrink: 0;
		background: transparent;
		border: 1px solid var(--background-modifier-border);
		border-radius: 4px;
		color: var(--text-muted);
		cursor: pointer;
		font-size: 0.85rem;
		padding: 2px 6px;
		line-height: 1.4;
	}

	.tt-parent-task-open:hover {
		color: var(--text-normal);
		border-color: var(--color-accent);
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
		padding: var(--size-2-3, 6px) var(--size-4-2, 8px);
		min-height: var(--input-height, 38px);
		border-radius: var(--input-radius, var(--radius-m, 8px));
		border: var(--input-border-width, var(--border-width, 1px)) solid var(--background-modifier-border);
		background: var(--background-modifier-form-field);
		color: var(--text-normal);
		caret-color: var(--caret-color, var(--interactive-accent));
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
		border: var(--border-width, 1px) solid var(--background-modifier-border);
		background: var(--interactive-normal, var(--background-secondary));
		color: var(--text-muted);
		border-radius: var(--button-radius, var(--radius-m, 8px));
		padding: var(--size-2-3, 6px) var(--size-4-3, 12px);
		font-size: 0.78rem;
		font-weight: 600;
		cursor: pointer;
		white-space: nowrap;
	}

	.tt-date-today:hover {
		background: var(--interactive-hover, var(--background-modifier-hover));
		color: var(--text-normal);
	}

	.tt-recurrence-row {
		display: flex;
		gap: 8px;
	}

	.tt-recurrence-row select {
		flex: 1;
	}

	.tt-recurrence-type {
		flex: 1.4 !important;
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
		padding: var(--size-4-1, 4px) var(--size-4-3, 12px);
		border-radius: 999px;
		border: var(--input-border-width, var(--border-width, 1px)) solid var(--background-modifier-border);
		background: var(--interactive-normal, var(--background-secondary));
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

	/* Relationship, notes, and action CSS live in their own sub-components. */


	.tt-divider {
		border: none;
		border-top: 1px solid var(--background-modifier-border);
		margin: 0;
	}

</style>
