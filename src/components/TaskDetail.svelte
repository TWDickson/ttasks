<script lang="ts">
	import { Modal, Notice } from 'obsidian';
	import type { Readable, Writable } from 'svelte/store';
	import type TTasksPlugin from '../main';
	import type { Task, TaskStatus, TaskPriority } from '../types';
	import type { TaskStore } from '../store/TaskStore';
	import { resolveCompletionStatus } from '../settings';
	import { RECURRENCE_LABELS, RECURRENCE_TYPE_LABELS } from '../store/recurrence';
	import { localDateString } from '../utils/dateUtils';
	import { isBlockedStatus } from '../schema/fieldVisibility';
	import type { FieldComponentProps } from '../schema/fieldAdapters';
	import { deriveTaskDetailFieldProps } from './taskDetailFieldProps';
	import { resolveLinkedTaskPath } from './taskDetailLinks';
	import { deriveTaskDetailOptionState } from './taskDetailOptions';
	import TextField from './fields/TextField.svelte';
	import SelectField from './fields/SelectField.svelte';
	import DateField from './fields/DateField.svelte';
	import ChipsField from './fields/ChipsField.svelte';
	import WikiLinkField from './fields/WikiLinkField.svelte';
	import NumberField from './fields/NumberField.svelte';
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

	async function onParentTaskFieldChange(nextValue: string | string[]): Promise<void> {
		if (!task || typeof nextValue !== 'string') return;
		parent_task_path = nextValue;
		await onParentTaskChange();
	}

	function normalizeDateValue(value: string): string | null {
		if (!value) return null;
		return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
	}

	function saveDueDate(nextValue: string): void {
		due_date = nextValue;
		void saveImmediate({ due_date: normalizeDateValue(nextValue) });
	}

	function saveStartDate(nextValue: string): void {
		start_date = nextValue;
		void saveImmediate({ start_date: normalizeDateValue(nextValue) });
	}

	function normalizeEstDays(value: number | null): number | null {
		if (value == null || isNaN(value)) return null;
		return value;
	}

	function onStatusFieldChange(nextValue: string | string[]): void {
		if (typeof nextValue !== 'string') return;
		const nextStatus = nextValue as TaskStatus;
		status = nextStatus;
		void saveImmediate({ status: nextStatus });
	}

	function onNameFieldChange(nextValue: string): void {
		name = nextValue;
		saveDebounced('name', { name: nextValue });
	}

	function onPriorityFieldChange(nextValue: string | string[]): void {
		if (typeof nextValue !== 'string') return;
		const nextPriority = nextValue as TaskPriority;
		priority = nextPriority;
		void saveImmediate({ priority: nextPriority });
	}

	function onAreaFieldChange(nextValue: string): void {
		area = nextValue;
		void saveImmediate({ area: nextValue || null });
	}

	function onLabelsFieldChange(nextValue: string): void {
		selectedLabels = nextValue ? [nextValue] : [];
		void saveImmediate({ labels: selectedLabels });
	}

	function onDueDateFieldChange(nextValue: string): void {
		saveDueDate(nextValue);
	}

	function onStartDateFieldChange(nextValue: string): void {
		saveStartDate(nextValue);
	}

	function onAssignedToFieldChange(nextValue: string): void {
		assigned_to = nextValue;
		saveDebounced('assigned_to', { assigned_to: nextValue });
	}

	function onEstimatedDaysFieldChange(nextValue: number | null): void {
		estimated_days = normalizeEstDays(nextValue);
		void saveImmediate({ estimated_days: estimated_days });
	}

	function onBlockedReasonFieldChange(nextValue: string): void {
		blocked_reason = nextValue;
		saveDebounced('blocked_reason', { blocked_reason: nextValue });
	}

	function onRecurrenceFieldChange(nextValue: string): void {
		recurrence = nextValue || null;
		if (!recurrence) recurrence_type = null;
		void saveImmediate({ recurrence: recurrence || null, recurrence_type: recurrence_type || null });
	}

	function onRecurrenceTypeFieldChange(nextValue: string): void {
		recurrence_type = nextValue || null;
		void saveImmediate({ recurrence_type: recurrence_type || null });
	}

	function onReminderOverrideFieldChange(nextValue: string): void {
		const reminderOverride = nextValue === 'urgent' || nextValue === 'mute' ? nextValue : null;
		void saveImmediate({ reminder_override: reminderOverride });
	}

	const reminderOverrideLabels: Record<string, string> = {
		urgent: 'Urgent — bypass quiet hours',
		mute: 'Mute — never remind',
	};

	// ── Constants ───────────────────────────────────────────────────────────────
	let priorityOptions: TaskPriority[] = [];
	let statusOptions: string[] = [];
	let areaOptions: string[] = [];
	let labelOptions: string[] = [];
	let recurrenceOptions: string[] = [];
	let recurrenceTypeOptions: string[] = [];
	let reminderOverrideOptions: string[] = [];
	let statusOptionColors: Record<string, string> = {};
	let priorityOptionColors: Record<string, string> = {};
	let nameFieldProps: FieldComponentProps | null = null;
	let statusFieldProps: FieldComponentProps | null = null;
	let priorityFieldProps: FieldComponentProps | null = null;
	let parentTaskFieldProps: FieldComponentProps | null = null;
	let recurrenceFieldProps: FieldComponentProps | null = null;
	let recurrenceTypeFieldProps: FieldComponentProps | null = null;
	let reminderOverrideFieldProps: FieldComponentProps | null = null;
	let estimatedDaysFieldProps: FieldComponentProps | null = null;
	let areaFieldProps: FieldComponentProps | null = null;
	let labelsFieldProps: FieldComponentProps | null = null;
	let dueDateFieldProps: FieldComponentProps | null = null;
	let startDateFieldProps: FieldComponentProps | null = null;
	let assignedToFieldProps: FieldComponentProps | null = null;
	let blockedReasonFieldProps: FieldComponentProps | null = null;

	$: {
		const detailOptions = deriveTaskDetailOptionState({
			settings: plugin.settings,
			status: status || null,
			area: area || null,
			selectedLabel: selectedLabels[0] ?? null,
		});

		priorityOptions = detailOptions.priorityOptions;
		statusOptions = detailOptions.statusOptions;
		areaOptions = detailOptions.areaOptions;
		labelOptions = detailOptions.labelOptions;
		recurrenceOptions = detailOptions.recurrenceOptions;
		recurrenceTypeOptions = detailOptions.recurrenceTypeOptions;
		reminderOverrideOptions = detailOptions.reminderOverrideOptions;
		statusOptionColors = detailOptions.statusOptionColors;
		priorityOptionColors = detailOptions.priorityOptionColors;
	}

	$: {
		const detailFieldProps = deriveTaskDetailFieldProps({
			task,
			allTasks: $tasks,
			settings: plugin.settings,
			blockStatus,
			values: {
				name,
				status,
				priority,
				area,
				labels: selectedLabels,
				parent_task_path,
				due_date,
				start_date,
				assigned_to,
				estimated_days,
				blocked_reason,
				recurrence,
				recurrence_type,
			},
		});

		nameFieldProps = detailFieldProps.nameFieldProps;
		statusFieldProps = detailFieldProps.statusFieldProps;
		priorityFieldProps = detailFieldProps.priorityFieldProps;
		parentTaskFieldProps = detailFieldProps.parentTaskFieldProps;
		recurrenceFieldProps = detailFieldProps.recurrenceFieldProps;
		recurrenceTypeFieldProps = detailFieldProps.recurrenceTypeFieldProps;
		reminderOverrideFieldProps = detailFieldProps.reminderOverrideFieldProps;
		estimatedDaysFieldProps = detailFieldProps.estimatedDaysFieldProps;
		areaFieldProps = detailFieldProps.areaFieldProps;
		labelsFieldProps = detailFieldProps.labelsFieldProps;
		dueDateFieldProps = detailFieldProps.dueDateFieldProps;
		startDateFieldProps = detailFieldProps.startDateFieldProps;
		assignedToFieldProps = detailFieldProps.assignedToFieldProps;
		blockedReasonFieldProps = detailFieldProps.blockedReasonFieldProps;
	}

	$: completionStatus = getCompletionStatus();
	$: blockStatus = plugin.settings.quickActions?.blockStatus ?? 'Blocked';
	$: showBlockedReason = isBlockedStatus(status, blockStatus);
	$: parentProjectTasks = $tasks
		.filter(t => t.type === 'project' && t.path !== task?.path)
		.sort((a, b) => a.name.localeCompare(b.name));

	function openLinkedPath(pathLike: string): void {
		const resolved = resolveLinkedTaskPath(pathLike, $tasks);
		if (!resolved) return;
		activeTaskPath.set(resolved);
	}

	function openParentProject(): void {
		openLinkedPath(parent_task_path);
	}

	function openTaskFromRelationships(path: string): void {
		activeTaskPath.set(path);
	}

	function openTaskInEditor(): void {
		if (!task) return;
		store.openFile(task.path);
	}

	async function archiveTask(): Promise<void> {
		if (!task || !task.is_complete) return;
		await plugin.archiveService.archiveTask(task.path);
		activeTaskPath.set(null);
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
			{#if nameFieldProps}
				<TextField
					{...nameFieldProps}
					value={name}
					onChange={onNameFieldChange}
				/>
			{/if}
			{#if saving}
				<span class="tt-saving">saving…</span>
			{/if}
		</div>

		<!-- Status chips -->
		<div class="tt-field-group">
			<span class="tt-label">Status</span>
			{#if statusFieldProps}
				<ChipsField
					{...statusFieldProps}
					value={status}
					options={statusOptions}
					optionColors={statusOptionColors}
					onChange={onStatusFieldChange}
				/>
			{/if}
		</div>

		<!-- Priority chips -->
		<div class="tt-field-group">
			<span class="tt-label">Priority</span>
			{#if priorityFieldProps}
				<ChipsField
					{...priorityFieldProps}
					value={priority}
					options={priorityOptions}
					optionColors={priorityOptionColors}
					onChange={onPriorityFieldChange}
				/>
			{/if}
		</div>

		<hr class="tt-divider" />

		<!-- Fields grid -->
		<div class="tt-fields">
			<label class="tt-label" for="area">Area</label>
			{#if areaFieldProps}
				<SelectField
					{...areaFieldProps}
					value={area}
					options={areaOptions}
					onChange={onAreaFieldChange}
				/>
			{/if}

			{#if task.type === 'task'}
				<label class="tt-label" for="parent_task">Project</label>
				<div class="tt-parent-task-row">
					{#if parentTaskFieldProps}
						<WikiLinkField
							{...parentTaskFieldProps}
							value={parent_task_path || ''}
							options={parentProjectTasks}
							onChange={onParentTaskFieldChange}
						/>
					{/if}
					{#if parent_task_path}
						<button
							class="tt-parent-task-open"
							title="Open parent project"
							on:click={openParentProject}
							aria-label="Open parent project"
						>↗</button>
					{/if}
				</div>

				<label class="tt-label" for="labels">Labels</label>
				{#if labelsFieldProps}
					<SelectField
						{...labelsFieldProps}
						value={selectedLabels[0] ?? ''}
						options={labelOptions}
						onChange={onLabelsFieldChange}
					/>
				{/if}
			{/if}

			<label class="tt-label" for="due_date">Due Date</label>
			{#if dueDateFieldProps}
				<DateField
					{...dueDateFieldProps}
					value={due_date}
					onChange={onDueDateFieldChange}
				/>
			{/if}

			<label class="tt-label" for="start_date">Start Date</label>
			{#if startDateFieldProps}
				<DateField
					{...startDateFieldProps}
					value={start_date}
					onChange={onStartDateFieldChange}
				/>
			{/if}

			<label class="tt-label" for="tt-assigned-to">Assigned To</label>
			{#if assignedToFieldProps}
				<TextField
					{...assignedToFieldProps}
					value={assigned_to}
					onChange={onAssignedToFieldChange}
				/>
			{/if}

			<label class="tt-label" for="tt-est-days">Est. Days</label>
			{#if estimatedDaysFieldProps}
				<NumberField
					{...estimatedDaysFieldProps}
					value={estimated_days}
					min={0}
					step={0.5}
					onChange={onEstimatedDaysFieldChange}
				/>
			{/if}

			{#if showBlockedReason}
				<label class="tt-label" for="tt-blocked-reason">Blocked Reason</label>
				{#if blockedReasonFieldProps}
					<TextField
						{...blockedReasonFieldProps}
						value={blocked_reason}
						onChange={onBlockedReasonFieldChange}
					/>
				{/if}
			{/if}

			<label class="tt-label" for="tt-recurrence">Repeats</label>
			{#if recurrenceFieldProps}
				<SelectField
					{...recurrenceFieldProps}
					value={recurrence ?? ''}
					options={recurrenceOptions}
					optionLabels={RECURRENCE_LABELS}
					onChange={onRecurrenceFieldChange}
				/>
			{/if}

			{#if recurrence && recurrenceTypeFieldProps}
				<label class="tt-label" for="recurrence_type">Repeat Type</label>
				<SelectField
					{...recurrenceTypeFieldProps}
					value={recurrence_type ?? ''}
					options={recurrenceTypeOptions}
					optionLabels={RECURRENCE_TYPE_LABELS}
					onChange={onRecurrenceTypeFieldChange}
				/>
			{/if}

			<label class="tt-label" for="reminder_override">Reminders</label>
			{#if reminderOverrideFieldProps}
				<SelectField
					{...reminderOverrideFieldProps}
					value={task.reminder_override ?? ''}
					options={reminderOverrideOptions}
					optionLabels={reminderOverrideLabels}
					onChange={onReminderOverrideFieldChange}
				/>
			{/if}
		</div>

	{#if task.type === 'task'}
		<TaskDetailRelationships
				{task}
				tasks={$tasks}
				{plugin}
				onAddDependency={addDependency}
				onRemoveDependency={removeDependency}
				onOpenTask={openTaskFromRelationships}
			/>
		{/if}

		<TaskDetailNotes {task} {plugin} {store} />

		<TaskDetailActions
			{task}
			onMarkComplete={markComplete}
			onOpenInEditor={openTaskInEditor}
			onDelete={confirmDelete}
			onArchive={task.is_complete ? archiveTask : undefined}
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

	:global(.tt-detail-name-row .tt-field) {
		flex: 1;
	}

	:global(.tt-detail-name-row .tt-field label) {
		display: none;
	}

	:global(.tt-detail-name-row .tt-field .tt-field-input) {
		/* Reuse existing title input visuals while rendering through TextField. */
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
		font-family: var(--font-interface);
		box-shadow: none;
	}

	:global(.tt-detail-name-row .tt-field .tt-field-input:focus) {
		outline: none;
		border-bottom-color: var(--interactive-accent);
		box-shadow: none;
	}

	.tt-parent-task-row {
		display: flex;
		align-items: center;
		gap: 6px;
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

	/* Relationship, notes, and action CSS live in their own sub-components. */


	.tt-divider {
		border: none;
		border-top: 1px solid var(--background-modifier-border);
		margin: 0;
	}

</style>
