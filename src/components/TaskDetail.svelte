<script lang="ts">
	import { Component, MarkdownRenderer, Modal, Notice } from 'obsidian';
	import { onDestroy, onMount } from 'svelte';
	import type { Readable, Writable } from 'svelte/store';
	import type TTasksPlugin from '../main';
	import type { Task, TaskStatus, TaskPriority, TaskType } from '../types';
	import type { TaskStore } from '../store/TaskStore';
	import { resolveCompletionStatus } from '../settings';
	import { buildTaskGraph } from '../store/taskGraph';
	import { RECURRENCE_OPTIONS, RECURRENCE_LABELS, RECURRENCE_TYPES, RECURRENCE_TYPE_LABELS } from '../store/recurrence';
	import { localDateString } from '../utils/dateUtils';

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
	let category = '';
	let task_type: TaskType | null = null;
	let parent_task_path = '';
	let due_date = '';
	let start_date = '';
	let assigned_to = '';
	let estimated_days: number | null = null;
	let blocked_reason = '';
	let notes = '';
	let recurrence: string | null = null;
	let recurrence_type: string | null = null;
	let notesMode: 'preview' | 'edit' = 'preview';
	let formTaskPath: string | null = null;
	let pendingSaves = 0;
	let saving = false;
	let notesPreviewEl: HTMLDivElement | null = null;
	let markdownComponent: Component | null = null;
	let previewFrame: number | null = null;
	let previewRenderSeq = 0;
	let lastPreviewText = '';

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
		blocked_reason  = task.blocked_reason ?? '';
		notes           = task.notes ?? '';
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

	function saveNotesDebounced(nextNotes: string) {
		if (!task) return;
		const taskPath = task.path;
		clearSaveTimer('notes');
		saveTimers.notes = setTimeout(async () => {
			beginSave();
			try {
				const savedNotes = await store.updateNotes(taskPath, nextNotes);
				if (task?.path === taskPath) {
					notes = savedNotes;
				}
			} finally {
				endSave();
				delete saveTimers.notes;
			}
		}, 600);
	}

	async function renderNotesPreview(markdown: string): Promise<void> {
		if (!notesPreviewEl || !markdownComponent || !task) return;
		const renderSeq = ++previewRenderSeq;
		notesPreviewEl.innerHTML = '';
		const sourcePath = task.path;
		await MarkdownRenderer.render(plugin.app, markdown || '_No notes yet._', notesPreviewEl, sourcePath, markdownComponent);
		if (renderSeq !== previewRenderSeq) return;
	}

	function scheduleNotesPreview(markdown: string): void {
		if (previewFrame !== null) {
			cancelAnimationFrame(previewFrame);
			previewFrame = null;
		}
		previewFrame = requestAnimationFrame(() => {
			previewFrame = null;
			if (markdown === lastPreviewText) return;
			lastPreviewText = markdown;
			void renderNotesPreview(markdown);
		});
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

	function normalizeTaskPath(pathLike: string | null | undefined): string | null {
		if (!pathLike) return null;
		const clean = pathLike.trim();
		if (!clean) return null;
		return clean.endsWith('.md') ? clean : `${clean}.md`;
	}

	function linkedTask(pathLike: string | null | undefined): Task | null {
		const normalized = normalizeTaskPath(pathLike);
		if (!normalized) return null;
		return $tasks.find((item) => item.path === normalized) ?? null;
	}

	function taskLabelFromPath(pathLike: string | null | undefined): string {
		const normalized = normalizeTaskPath(pathLike);
		if (!normalized) return 'Unknown';
		const resolved = linkedTask(normalized);
		if (resolved) return resolved.name;
		return normalized.split('/').pop()?.replace(/^[a-f0-9]+-/, '').replace(/\.md$/, '') ?? normalized;
	}

	function openLinkedPath(pathLike: string): void {
		const normalized = normalizeTaskPath(pathLike);
		if (!normalized) return;
		activeTaskPath.set(normalized);
	}

	function showLinkedHoverPreview(event: MouseEvent, pathLike: string): void {
		const normalized = normalizeTaskPath(pathLike);
		if (!normalized) return;
		plugin.triggerTaskHoverPreview(normalized, event);
	}

	$: availableDependencies = task ? $tasks
		.filter(t => t.type === 'task' && t.path !== task.path && !task.depends_on.some(d => normalizeTaskPath(d) === t.path))
		.sort((a, b) => a.name.localeCompare(b.name)) : [];

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

	$: dependencyTasks = task ? task.depends_on.map((dep) => linkedTask(dep)).filter((dep): dep is Task => !!dep) : [];
	$: dependentTasks = task ? task.blocks.map((dep) => linkedTask(dep)).filter((dep): dep is Task => !!dep) : [];
	$: missingDependencies = task ? task.depends_on.filter((dep) => !linkedTask(dep)) : [];
	$: openDependencies = dependencyTasks.filter((dep) => !dep.is_complete);
	$: relationshipLayout = buildTaskGraph($tasks, {});
	$: relationshipNode = task ? relationshipLayout.nodes.find((node) => node.path === task.path) ?? null : null;
	$: relationshipIssues = [
		...(relationshipNode?.isCycle ? ['Cycle detected for this task chain.'] : []),
		...(missingDependencies.length > 0 ? [`${missingDependencies.length} dependency link(s) missing from current task set.`] : []),
		...(openDependencies.length > 0 ? [`Blocked by ${openDependencies.length} unfinished dependency task(s).`] : []),
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

	onMount(() => {
		markdownComponent = new Component();
		markdownComponent.load();
		return () => {
			markdownComponent?.unload();
			markdownComponent = null;
		};
	});

	onDestroy(() => {
		for (const key of Object.keys(saveTimers) as DebounceKey[]) {
			clearSaveTimer(key);
		}
		if (previewFrame !== null) {
			cancelAnimationFrame(previewFrame);
			previewFrame = null;
		}
	});

	$: if (task && notesPreviewEl && markdownComponent) {
		// Reset cache so preview re-renders when switching from edit to preview
		lastPreviewText = '';
		scheduleNotesPreview(notes);
	}

</script>

{#if !task}
	<div class="tt-detail-empty">
		<p>No task selected.</p>
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

		<!-- Relationship health -->
		{#if task.type === 'task'}
			<hr class="tt-divider" />
			<div class="tt-field-group">
				<span class="tt-label">System Fit</span>
				<div class="tt-rel-health">
					<div class="tt-rel-health-metrics">
						<span class="tt-rel-pill">Upstream {task.depends_on.length}</span>
						<span class="tt-rel-pill">Downstream {task.blocks.length}</span>
						{#if openDependencies.length > 0}
							<span class="tt-rel-pill tt-rel-pill-alert">Blocked by {openDependencies.length}</span>
						{/if}
						{#if relationshipNode?.isCycle}
							<span class="tt-rel-pill tt-rel-pill-danger">Cycle</span>
						{/if}
					</div>

					<div class="tt-rel-lanes">
						<div class="tt-rel-lane">
							<div class="tt-rel-heading">Depends On</div>
							{#if task.depends_on.length === 0}
								<div class="tt-rel-empty">None</div>
							{:else}
								<div class="tt-chips">
									{#each task.depends_on as dep}
										<span class="tt-chip-group">
											<button class="tt-chip tt-chip-rel" class:tt-chip-warning={!linkedTask(dep)} class:tt-chip-blocking={!!linkedTask(dep) && !linkedTask(dep)?.is_complete} on:click={() => openLinkedPath(dep)} on:mouseenter={(event) => showLinkedHoverPreview(event, dep)}>
												{taskLabelFromPath(dep)}
											</button>
											<button class="tt-chip-remove" on:click|stopPropagation={() => removeDependency(dep)} aria-label="Remove dependency" title="Remove dependency">&times;</button>
										</span>
									{/each}
								</div>
							{/if}
							{#if availableDependencies.length > 0}
								<select class="tt-dep-add" on:change={(e) => { const v = e.currentTarget.value; if (v) { addDependency(v); e.currentTarget.value = ''; } }}>
									<option value="">+ Add dependency…</option>
									{#each availableDependencies as t}
										<option value={t.path}>{t.name}</option>
									{/each}
								</select>
							{/if}
						</div>

						<div class="tt-rel-center">
							<span class="tt-rel-center-tag">Selected</span>
							<span class="tt-rel-center-name">{task.name}</span>
						</div>

						<div class="tt-rel-lane">
							<div class="tt-rel-heading">Blocks</div>
							{#if task.blocks.length === 0}
								<div class="tt-rel-empty">None</div>
							{:else}
								<div class="tt-chips">
									{#each task.blocks as dep}
										<button class="tt-chip tt-chip-rel" on:click={() => openLinkedPath(dep)} on:mouseenter={(event) => showLinkedHoverPreview(event, dep)}>
											{taskLabelFromPath(dep)}
										</button>
									{/each}
								</div>
							{/if}
						</div>
					</div>

					{#if relationshipIssues.length > 0}
						<div class="tt-rel-issues">
							{#each relationshipIssues as issue}
								<div class="tt-rel-issue">{issue}</div>
							{/each}
						</div>
					{/if}
				</div>
			</div>
		{/if}

		<hr class="tt-divider" />

		<!-- Notes -->
		<div class="tt-field-group">
			<div class="tt-notes-header">
				<span class="tt-label">Notes</span>
				<div class="tt-notes-toggle">
					<button type="button" class="tt-notes-tab" class:is-active={notesMode === 'preview'} on:click={() => notesMode = 'preview'}>Preview</button>
					<button type="button" class="tt-notes-tab" class:is-active={notesMode === 'edit'} on:click={() => notesMode = 'edit'}>Edit</button>
				</div>
			</div>
			{#if notesMode === 'edit'}
				<textarea
					id="tt-notes"
					class="tt-notes"
					bind:value={notes}
					on:input={() => saveNotesDebounced(notes)}
					placeholder="Add notes…"
					rows="8"
				></textarea>
			{:else}
				<!-- svelte-ignore a11y-click-events-have-key-events -->
				<div class="tt-notes-preview" bind:this={notesPreviewEl} on:click={() => notesMode = 'edit'} role="button" tabindex="0"></div>
			{/if}
		</div>

		<hr class="tt-divider" />

		<!-- Actions -->
		<div class="tt-actions">
			{#if !task?.is_complete}
				<button class="tt-btn tt-btn-primary" on:click={markComplete}>
					✓ Mark Complete
				</button>
			{/if}
			<button class="tt-btn" on:click={() => store.openFile(task.path)}>
				Open in editor
			</button>
			<button class="tt-btn tt-btn-danger" on:click={confirmDelete}>
				Delete
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

	.tt-chip-rel {
		font-weight: 400;
		font-size: 0.78rem;
	}

	.tt-chip-warning {
		border-color: color-mix(in srgb, var(--color-orange) 48%, var(--background-modifier-border));
		background: color-mix(in srgb, var(--color-orange) 12%, var(--background-primary));
	}

	.tt-chip-blocking {
		border-color: color-mix(in srgb, var(--color-red) 45%, var(--background-modifier-border));
	}

	.tt-chip-group {
		display: inline-flex;
		align-items: stretch;
		gap: 0;
	}

	.tt-chip-group .tt-chip {
		border-top-right-radius: 0;
		border-bottom-right-radius: 0;
		border-right: none;
	}

	.tt-chip-remove {
		padding: 2px 7px;
		border-radius: 0 999px 999px 0;
		border: var(--input-border-width, var(--border-width, 1px)) solid var(--background-modifier-border);
		border-left: none;
		background: var(--interactive-normal, var(--background-secondary));
		color: var(--text-faint);
		font-size: 0.78rem;
		cursor: pointer;
		line-height: 1;
	}

	.tt-chip-remove:hover {
		background: color-mix(in srgb, var(--color-red) 12%, var(--background-primary));
		color: var(--color-red);
	}

	.tt-dep-add {
		font-size: 0.74rem;
		padding: 3px var(--size-4-2, 8px);
		border-radius: var(--button-radius, var(--radius-m, 8px));
		border: 1px dashed var(--background-modifier-border);
		background: transparent;
		color: var(--text-muted);
		cursor: pointer;
		margin-top: 4px;
	}


	.tt-rel-health {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.tt-rel-health-metrics {
		display: flex;
		gap: 6px;
		flex-wrap: wrap;
	}

	.tt-rel-pill {
		display: inline-flex;
		align-items: center;
		padding: 3px 9px;
		border-radius: 999px;
		border: var(--border-width, 1px) solid var(--background-modifier-border);
		background: var(--interactive-normal, var(--background-secondary));
		color: var(--text-muted);
		font-size: 0.72rem;
		font-weight: 700;
		letter-spacing: 0.02em;
	}

	.tt-rel-pill-alert {
		border-color: color-mix(in srgb, var(--color-orange) 42%, var(--background-modifier-border));
		color: var(--color-orange);
	}

	.tt-rel-pill-danger {
		border-color: color-mix(in srgb, var(--color-red) 42%, var(--background-modifier-border));
		color: var(--color-red);
	}

	.tt-rel-lanes {
		display: grid;
		grid-template-columns: 1fr auto 1fr;
		gap: 10px;
		align-items: start;
	}

	.tt-rel-lane {
		display: flex;
		flex-direction: column;
		gap: 6px;
		min-width: 0;
	}

	.tt-rel-heading {
		font-size: 0.7rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--text-faint);
	}

	.tt-rel-empty {
		font-size: 0.78rem;
		color: var(--text-faint);
	}

	.tt-rel-center {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 2px;
		padding: 6px 10px;
		border: 1px dashed var(--background-modifier-border);
		border-radius: var(--radius-m, 8px);
		min-width: 120px;
		background: var(--background-primary-alt, var(--background-secondary));
	}

	.tt-rel-center-tag {
		font-size: 0.64rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--text-faint);
	}

	.tt-rel-center-name {
		font-size: 0.8rem;
		font-weight: 600;
		text-align: center;
		color: var(--text-normal);
	}

	.tt-rel-issues {
		display: flex;
		flex-direction: column;
		gap: 5px;
	}

	.tt-rel-issue {
		font-size: 0.78rem;
		padding: 6px 8px;
		border-left: 3px solid var(--color-orange);
		border-radius: var(--radius-s, 4px);
		background: color-mix(in srgb, var(--color-orange) 9%, var(--background-primary-alt, var(--background-secondary)));
		color: var(--text-muted);
	}

	.tt-divider {
		border: none;
		border-top: 1px solid var(--background-modifier-border);
		margin: 0;
	}

	.tt-notes-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.tt-notes-toggle {
		display: flex;
		gap: 2px;
		background: var(--background-modifier-border);
		border-radius: calc(var(--button-radius, var(--radius-m, 8px)) - 2px);
		padding: 2px;
	}

	.tt-notes-tab {
		padding: 3px 10px;
		border: none;
		border-radius: var(--radius-s, 4px);
		background: transparent;
		color: var(--text-muted);
		font-size: 0.72rem;
		font-weight: 600;
		cursor: pointer;
	}

	.tt-notes-tab.is-active {
		background: var(--background-primary);
		color: var(--text-normal);
	}

	.tt-notes {
		width: 100%;
		box-sizing: border-box;
		font-size: 0.88rem;
		padding: var(--size-4-2, 8px);
		border-radius: var(--input-radius, var(--radius-m, 8px));
		border: var(--input-border-width, var(--border-width, 1px)) solid var(--background-modifier-border);
		background: var(--background-modifier-form-field);
		color: var(--text-normal);
		resize: vertical;
		font-family: var(--font-text);
		min-height: 160px;
		caret-color: var(--caret-color, var(--interactive-accent));
	}

	.tt-notes:focus {
		outline: none;
		border-color: var(--interactive-accent);
	}

	.tt-notes-preview {
		padding: var(--size-4-3, 12px);
		min-height: 160px;
		border: var(--border-width, 1px) solid var(--background-modifier-border);
		border-radius: var(--input-radius, var(--radius-m, 8px));
		background: var(--background-primary-alt, var(--background-secondary));
		font-size: 0.88rem;
	}

	.tt-actions {
		display: flex;
		gap: var(--size-4-2, 8px);
		flex-wrap: wrap;
	}

	.tt-btn {
		padding: 7px 16px;
		border-radius: var(--button-radius, var(--radius-m, 8px));
		border: var(--border-width, 1px) solid var(--background-modifier-border);
		background: var(--interactive-normal, var(--background-secondary));
		color: var(--text-normal);
		font-size: 0.88rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.12s;
	}

	.tt-btn:hover {
		background: var(--interactive-hover, var(--background-modifier-hover));
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

	.tt-btn-danger {
		color: var(--color-red);
		border-color: color-mix(in srgb, var(--color-red) 35%, var(--background-modifier-border));
		margin-left: auto;
	}

	.tt-btn-danger:hover {
		background: color-mix(in srgb, var(--color-red) 10%, var(--background-primary));
		border-color: color-mix(in srgb, var(--color-red) 60%, var(--background-modifier-border));
	}

	.tt-meta-footer {
		display: flex;
		gap: 16px;
		font-size: 0.72rem;
		color: var(--text-faint);
	}

	@media (max-width: 700px) {
		.tt-rel-lanes {
			grid-template-columns: 1fr;
		}

		.tt-rel-center {
			align-items: flex-start;
			text-align: left;
		}
	}
</style>
