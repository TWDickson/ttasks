<script lang="ts">
	import { Notice } from 'obsidian';
	import { onDestroy } from 'svelte';
	import type { Readable, Writable } from 'svelte/store';
	import type TTasksPlugin from '../main';
	import type { Task, TaskStatus, TaskPriority } from '../types';
	import type { TaskStore } from '../store/TaskStore';
	import { resolveCompletionStatus } from '../settings';
	import { RECURRENCE_LABELS, RECURRENCE_TYPE_LABELS } from '../store/recurrence';
	import { localDateString } from '../utils/dateUtils';
	import { buildTaskSchedule, resolveProjectedSchedule } from '../store/taskSchedule';
	import { splitHolidayCalendar } from '../settings/holidays';
	import { formatHumanDate } from './taskDateMeta';
	import { isBlockedStatus } from '../schema/fieldVisibility';
	import type { FieldComponentProps } from '../schema/fieldAdapters';
	import { deriveTaskDetailFieldProps } from './taskDetailFieldProps';
	import { resolveLinkedTaskPath } from './taskDetailLinks';
	import { deriveTaskDetailOptionState } from './taskDetailOptions';
	import { createTaskDetailSaveController, normalizeDateValue } from './taskDetailSaveController';
	import { confirmModal } from '../modals/confirmModal';
	import { runArchiveFlow, runDeleteFlow, runMarkCompleteFlow } from './taskDetailActions';
	import { formatRemaining } from '../integration/pomodoro';
	import TextField from './fields/TextField.svelte';
	import SelectField from './fields/SelectField.svelte';
	import DateField from './fields/DateField.svelte';
	import ChipsField from './fields/ChipsField.svelte';
	import WikiLinkField from './fields/WikiLinkField.svelte';
	import NumberField from './fields/NumberField.svelte';
	import TaskDetailRelationships from './TaskDetailRelationships.svelte';
	import TaskDetailNotes from './TaskDetailNotes.svelte';
	import TaskDetailActions from './TaskDetailActions.svelte';
	import { icon } from '../utils/icon';

	export let plugin: TTasksPlugin;
	export let tasks: Readable<Task[]>;
	export let activeTaskPath: Writable<string | null>;
	export let store: TaskStore;

	// ── Derived task ────────────────────────────────────────────────────────────
	// Depend on $tasks so the derivation re-runs when the store parses a
	// just-created/updated file — not only when $activeTaskPath changes.
	// Otherwise a freshly created task shows "Task Not Found" until reselected.
	$: task = $activeTaskPath
		? ($tasks.find((t) => t.path === $activeTaskPath) ?? store.getByPath($activeTaskPath) ?? null)
		: null;

	// ── Pomodoro (native focus timer) ───────────────────────────────────────────
	// TaskDetail already receives `plugin`, so we read the shared session store
	// directly (same pattern as the rest of this component). The control shows a
	// live timer only when *this* task owns the running session.
	const pomodoroSession = plugin.pomodoroService.session;
	$: activePomodoro = $pomodoroSession && task && $pomodoroSession.taskPath === task.path ? $pomodoroSession : null;
	$: pomodoroPhase = activePomodoro
		? (activePomodoro.mode === 'focus' ? 'Focus' : activePomodoro.mode === 'short-break' ? 'Short break' : 'Long break')
		: '';
	function startPomodoro() { if (task) plugin.pomodoroService.start(task.path, task.name); }
	function togglePomodoro() { plugin.pomodoroService.toggle(); }
	function skipPomodoro() { plugin.pomodoroService.skip(); }
	function stopPomodoro() { plugin.pomodoroService.stop(); }

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
	let workweek_only = false;
	let holiday_dates_text = '';
	let blocked_reason = '';
	let recurrence: string | null = null;
	let recurrence_type: string | null = null;
	let formTaskPath: string | null = null;
	let formTaskSnapshotKey: string | null = null;
	let pendingSaves = 0;
	let saving = false;
	const saveController = createTaskDetailSaveController({
		updateTask: async (taskPath, updates) => {
			await store.update(taskPath, updates);
		},
		getActiveTaskPath: () => task?.path ?? null,
		onPendingChange: (pendingCount) => {
			pendingSaves = pendingCount;
		},
	});

	onDestroy(() => {
		saveController.dispose();
	});

	$: saving = pendingSaves > 0;
	$: taskSnapshotKey = task
		? JSON.stringify([
			task.name,
			task.status,
			task.priority,
			task.area,
			task.labels,
			task.parent_task,
			task.due_date,
			task.start_date,
			task.assigned_to,
			task.estimated_days,
			task.workweek_only,
			task.holiday_dates,
			task.blocked_reason,
			task.recurrence,
			task.recurrence_type,
		])
		: null;

	$: if (!task) {
		formTaskPath = null;
		formTaskSnapshotKey = null;
	} else if (task.path !== formTaskPath || (taskSnapshotKey !== formTaskSnapshotKey && !saving)) {
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
		workweek_only = task.workweek_only === true;
		holiday_dates_text = (task.holiday_dates ?? []).join(', ');
		blocked_reason  = task.blocked_reason ?? '';
		recurrence      = task.recurrence ?? null;
		recurrence_type = task.recurrence_type ?? null;
		formTaskPath    = task.path;
		formTaskSnapshotKey = taskSnapshotKey;
	}

	// ── Field handlers ──────────────────────────────────────────────────────────
	function getCompletionStatus(): TaskStatus {
		return resolveCompletionStatus(plugin.settings.statuses, plugin.settings.completionStatus);
	}

	async function markComplete() {
		if (!task) return;
		const completeStatus = getCompletionStatus();
		status = completeStatus;

		await runMarkCompleteFlow({
			task,
			completionStatus: completeStatus,
			today: localDateString(),
			saveImmediate: (updates) => saveController.saveImmediate(updates),
			completeAndRecur: (currentTask) => store.completeAndRecur(currentTask),
			notice: (message) => { new Notice(message); },
		});
	}

	async function confirmDelete() {
		if (!task) return;
		await runDeleteFlow({
			task,
			confirmDelete: (taskName) => confirmModal(plugin.app, {
				title: 'Delete task',
				body: `Are you sure you want to delete "${taskName}"? This cannot be undone.`,
				ctaLabel: 'Delete',
			}),
			setActiveTaskPath: (nextPath) => activeTaskPath.set(nextPath),
			deleteTask: (taskPath) => store.delete(taskPath),
		});
	}

	async function onParentTaskChange() {
		if (!task) return;
		await saveController.runWithPending(async () => {
			await store.updateParentTask(task.path, parent_task_path || null);
		});
	}

	async function onParentTaskFieldChange(nextValue: string | string[]): Promise<void> {
		if (!task || typeof nextValue !== 'string') return;
		parent_task_path = nextValue;
		await onParentTaskChange();
	}

	function saveDueDate(nextValue: string): void {
		due_date = nextValue;
		void saveController.saveImmediate({ due_date: normalizeDateValue(nextValue) });
	}

	function saveStartDate(nextValue: string): void {
		start_date = nextValue;
		void saveController.saveImmediate({ start_date: normalizeDateValue(nextValue) });
	}

	function normalizeEstDays(value: number | null): number | null {
		if (value == null || isNaN(value)) return null;
		return value;
	}

	function onStatusFieldChange(nextValue: string | string[]): void {
		if (typeof nextValue !== 'string' || !task) return;
		const nextStatus = nextValue as TaskStatus;
		status = nextStatus;
		// Route through setStatus so moving to/from the completion status stamps or
		// clears the completion date and recurs (guarded) like the other paths.
		void store.setStatus(task, nextStatus);
	}

	function onNameFieldChange(nextValue: string): void {
		name = nextValue;
		saveController.saveDebounced('name', { name: nextValue });
	}

	function onPriorityFieldChange(nextValue: string | string[]): void {
		if (typeof nextValue !== 'string') return;
		const nextPriority = nextValue as TaskPriority;
		priority = nextPriority;
		void saveController.saveImmediate({ priority: nextPriority });
	}

	function onAreaFieldChange(nextValue: string): void {
		area = nextValue;
		void saveController.saveImmediate({ area: nextValue || null });
	}

	function onLabelsFieldChange(nextValue: string): void {
		selectedLabels = nextValue ? [nextValue] : [];
		void saveController.saveImmediate({ labels: selectedLabels });
	}

	function onDueDateFieldChange(nextValue: string): void {
		saveDueDate(nextValue);
	}

	function onStartDateFieldChange(nextValue: string): void {
		saveStartDate(nextValue);
	}

	function onAssignedToFieldChange(nextValue: string): void {
		assigned_to = nextValue;
		saveController.saveDebounced('assigned_to', { assigned_to: nextValue });
	}

	function onEstimatedDaysFieldChange(nextValue: number | null): void {
		estimated_days = normalizeEstDays(nextValue);
		void saveController.saveImmediate({ estimated_days: estimated_days });
	}

	function onBlockedReasonFieldChange(nextValue: string): void {
		blocked_reason = nextValue;
		saveController.saveDebounced('blocked_reason', { blocked_reason: nextValue });
	}

	function parseHolidayDates(raw: string): string[] {
		const seen = new Set<string>();
		for (const part of raw.split(',')) {
			const trimmed = part.trim();
			if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) continue;
			seen.add(trimmed);
		}
		return [...seen].sort();
	}

	function onWorkweekOnlyToggleChange(event: Event): void {
		const checked = (event.currentTarget as HTMLInputElement).checked;
		workweek_only = checked;
		if (!checked) {
			holiday_dates_text = '';
			void saveController.saveImmediate({ workweek_only: false, holiday_dates: [] });
			return;
		}
		void saveController.saveImmediate({
			workweek_only: true,
			holiday_dates: parseHolidayDates(holiday_dates_text),
		});
	}

	function onHolidayDatesChange(nextValue: string): void {
		holiday_dates_text = nextValue;
		void saveController.saveImmediate({ holiday_dates: parseHolidayDates(nextValue) });
	}

	function onRecurrenceFieldChange(nextValue: string): void {
		recurrence = nextValue || null;
		if (!recurrence) recurrence_type = null;
		void saveController.saveImmediate({ recurrence: recurrence || null, recurrence_type: recurrence_type || null });
	}

	function onRecurrenceTypeFieldChange(nextValue: string): void {
		recurrence_type = nextValue || null;
		void saveController.saveImmediate({ recurrence_type: recurrence_type || null });
	}

	function onReminderOverrideFieldChange(nextValue: string): void {
		const reminderOverride = nextValue === 'urgent' || nextValue === 'mute' ? nextValue : null;
		void saveController.saveImmediate({ reminder_override: reminderOverride });
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

	$: detailHolidayCalendar = splitHolidayCalendar(plugin.settings.holidays);
	$: projectedSchedule = task
		? resolveProjectedSchedule(task, buildTaskSchedule($tasks, {
			calendarConfig: {
				holidays: detailHolidayCalendar.holidays,
				recurringHolidays: detailHolidayCalendar.recurringHolidays,
				areaWorkweek: plugin.settings.areaWorkweek,
			},
		}).get(task.path))
		: null;

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
		if (!task) return;
		await runArchiveFlow({
			task,
			archiveTask: (taskPath) => plugin.archiveService.archiveTask(taskPath),
			setActiveTaskPath: (nextPath) => activeTaskPath.set(nextPath),
		});
	}

	// ── Dependency callbacks (passed to TaskDetailRelationships) ────────────────

	async function addDependency(depPath: string): Promise<void> {
		if (!task) return;
		await saveController.runWithPending(async () => {
			await store.addDependency(task.path, depPath.replace(/\.md$/, ''));
		});
	}

	async function removeDependency(depPath: string): Promise<void> {
		if (!task) return;
		await saveController.runWithPending(async () => {
			await store.removeDependency(task.path, depPath.replace(/\.md$/, ''));
		});
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
					definition={nameFieldProps.definition}
					error={nameFieldProps.error}
					readonly={nameFieldProps.readonly}
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
					definition={statusFieldProps.definition}
					error={statusFieldProps.error}
					readonly={statusFieldProps.readonly}
					value={status}
					options={statusOptions}
					optionColors={statusOptionColors}
					onChange={onStatusFieldChange}
				/>
			{/if}
		</div>

		{#if task.type === 'task'}
			<div class="tt-field-group">
				<span class="tt-label">Project</span>
				<div class="tt-parent-task-row">
					{#if parentTaskFieldProps}
						<WikiLinkField
							definition={parentTaskFieldProps.definition}
							error={parentTaskFieldProps.error}
							readonly={parentTaskFieldProps.readonly}
							context={parentTaskFieldProps.context}
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
						><span use:icon={'arrow-up-right'}></span></button>
					{/if}
				</div>
			</div>
		{/if}

		<!-- Priority chips -->
		<div class="tt-field-group">
			<span class="tt-label">Priority</span>
			{#if priorityFieldProps}
				<ChipsField
					definition={priorityFieldProps.definition}
					error={priorityFieldProps.error}
					readonly={priorityFieldProps.readonly}
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
					definition={areaFieldProps.definition}
					error={areaFieldProps.error}
					readonly={areaFieldProps.readonly}
					value={area}
					options={areaOptions}
					onChange={onAreaFieldChange}
				/>
			{/if}

			{#if task.type === 'task'}
				<label class="tt-label" for="labels">Labels</label>
				{#if labelsFieldProps}
					<SelectField
						definition={labelsFieldProps.definition}
						error={labelsFieldProps.error}
						readonly={labelsFieldProps.readonly}
						value={selectedLabels[0] ?? ''}
						options={labelOptions}
						onChange={onLabelsFieldChange}
					/>
				{/if}
			{/if}

			{#if task.type === 'project'}
				<label class="tt-label" for="tt-workweek-only">Workweek Only</label>
				<div class="tt-checkbox-row">
					<input
						id="tt-workweek-only"
						type="checkbox"
						checked={workweek_only}
						on:change={onWorkweekOnlyToggleChange}
					/>
					<span>Skip weekends in inferred schedule</span>
				</div>

				{#if workweek_only}
					<label class="tt-label" for="holiday_dates">Holiday Dates</label>
					<TextField
						value={holiday_dates_text}
						onChange={onHolidayDatesChange}
						definition={{ name: 'holiday_dates', label: '', type: 'text', placeholder: 'YYYY-MM-DD, YYYY-MM-DD' }}
						error={null}
						readonly={false}
					/>
				{/if}
			{/if}

			<label class="tt-label" for="due_date">Due Date</label>
			{#if dueDateFieldProps}
				<DateField
					definition={dueDateFieldProps.definition}
					error={dueDateFieldProps.error}
					readonly={dueDateFieldProps.readonly}
					value={due_date}
					onChange={onDueDateFieldChange}
				/>
			{/if}

			<label class="tt-label" for="start_date">Start Date</label>
			{#if startDateFieldProps}
				<DateField
					definition={startDateFieldProps.definition}
					error={startDateFieldProps.error}
					readonly={startDateFieldProps.readonly}
					value={start_date}
					onChange={onStartDateFieldChange}
				/>
			{/if}

			{#if projectedSchedule}
				<span class="tt-label tt-label-projected">Projected</span>
				<div class="tt-projected-schedule" title="Inferred from dependencies">
					{formatHumanDate(projectedSchedule.start, localDateString())} – {formatHumanDate(projectedSchedule.end, localDateString())}
					<span class="tt-projected-note">inferred from dependencies</span>
				</div>
			{/if}

			<label class="tt-label" for="assigned_to">Assigned To</label>
			{#if assignedToFieldProps}
				<TextField
					definition={assignedToFieldProps.definition}
					error={assignedToFieldProps.error}
					readonly={assignedToFieldProps.readonly}
					value={assigned_to}
					onChange={onAssignedToFieldChange}
				/>
			{/if}

			<label class="tt-label" for="estimated_days">Est. Days</label>
			{#if estimatedDaysFieldProps}
				<NumberField
					definition={estimatedDaysFieldProps.definition}
					error={estimatedDaysFieldProps.error}
					readonly={estimatedDaysFieldProps.readonly}
					value={estimated_days}
					min={0}
					step={0.5}
					onChange={onEstimatedDaysFieldChange}
				/>
			{/if}

			{#if showBlockedReason}
				<label class="tt-label" for="blocked_reason">Blocked Reason</label>
				{#if blockedReasonFieldProps}
					<TextField
						definition={blockedReasonFieldProps.definition}
						error={blockedReasonFieldProps.error}
						readonly={blockedReasonFieldProps.readonly}
						value={blocked_reason}
						onChange={onBlockedReasonFieldChange}
					/>
				{/if}
			{/if}

			<label class="tt-label" for="recurrence">Repeats</label>
			{#if recurrenceFieldProps}
				<SelectField
					definition={recurrenceFieldProps.definition}
					error={recurrenceFieldProps.error}
					readonly={recurrenceFieldProps.readonly}
					value={recurrence ?? ''}
					options={recurrenceOptions}
					optionLabels={RECURRENCE_LABELS}
					onChange={onRecurrenceFieldChange}
				/>
			{/if}

			{#if recurrence && recurrenceTypeFieldProps}
				<label class="tt-label" for="recurrence_type">Repeat Type</label>
				<SelectField
					definition={recurrenceTypeFieldProps.definition}
					error={recurrenceTypeFieldProps.error}
					readonly={recurrenceTypeFieldProps.readonly}
					value={recurrence_type ?? ''}
					options={recurrenceTypeOptions}
					optionLabels={RECURRENCE_TYPE_LABELS}
					onChange={onRecurrenceTypeFieldChange}
				/>
			{/if}

			<label class="tt-label" for="reminder_override">Reminders</label>
			{#if reminderOverrideFieldProps}
				<SelectField
					definition={reminderOverrideFieldProps.definition}
					error={reminderOverrideFieldProps.error}
					readonly={reminderOverrideFieldProps.readonly}
					value={task.reminder_override ?? ''}
					options={reminderOverrideOptions}
					optionLabels={reminderOverrideLabels}
					onChange={onReminderOverrideFieldChange}
				/>
			{/if}
		</div>

		<div class="tt-pomodoro">
			<div class="tt-pomodoro-head">
				<span class="tt-label">Focus</span>
				{#if (task.pomodoro_count ?? 0) > 0 || (task.focused_minutes ?? 0) > 0}
					<span class="tt-pomodoro-stats">{task.pomodoro_count ?? 0}× · {task.focused_minutes ?? 0}m logged</span>
				{/if}
			</div>
			{#if activePomodoro}
				<div class="tt-pomodoro-active" class:is-break={activePomodoro.mode !== 'focus'}>
					<div class="tt-pomodoro-readout">
						<span class="tt-pomodoro-time">{formatRemaining(activePomodoro)}</span>
						<span class="tt-pomodoro-phase">{pomodoroPhase}{activePomodoro.running ? '' : ' · paused'}</span>
					</div>
					<div class="tt-pomodoro-controls">
						<button type="button" class="tt-btn tt-btn-sm" on:click={togglePomodoro}>
							{activePomodoro.running ? 'Pause' : 'Resume'}
						</button>
						<button type="button" class="tt-btn tt-btn-sm" on:click={skipPomodoro}>Skip</button>
						<button type="button" class="tt-btn tt-btn-sm tt-btn-danger" on:click={stopPomodoro}>Stop</button>
					</div>
				</div>
			{:else}
				<button type="button" class="tt-btn tt-btn-sm tt-pomodoro-start" on:click={startPomodoro}>
					Start focus timer
				</button>
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
		overflow-wrap: break-word;
		word-break: break-word;
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
		display: flex;
		align-items: center;
		justify-content: center;
		min-width: 28px;
		min-height: 28px;
		background: transparent;
		border: 1px solid var(--background-modifier-border);
		border-radius: var(--radius-s, 4px);
		color: var(--text-muted);
		cursor: pointer;
		padding: 2px;
	}

	.tt-parent-task-open:hover {
		color: var(--text-normal);
		border-color: var(--background-modifier-border-focus);
	}

	.tt-checkbox-row {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 0.9rem;
		color: var(--text-normal);
	}

	.tt-saving {
		font-size: 0.75rem;
		color: var(--text-faint);
	}

	/* .tt-label, .tt-divider, .tt-field-group are plugin-global (styles.css). */

	/* Read-only projected schedule inferred from the dependency chain — muted and borderless. */
	.tt-projected-schedule {
		display: flex;
		align-items: baseline;
		gap: 8px;
		font-size: 0.82rem;
		color: var(--text-muted);
	}

	.tt-projected-note {
		font-size: 0.72rem;
		font-style: italic;
		opacity: 0.85;
	}

	.tt-fields {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 8px 12px;
		align-items: center;
	}

	/* On a narrow mobile drawer the label column steals width and squeezes the
	   control until it overflows. Collapse to one column so each label sits on its
	   own row *above* its control (the two-level layout), and let controls stretch
	   full width. Extra top-margin on labels re-groups each label/control pair now
	   that the row gap is gone. */
	@media (max-width: 768px) {
		.tt-fields {
			grid-template-columns: 1fr;
			gap: 0;
			align-items: stretch;
		}
		.tt-fields > .tt-label {
			margin-top: 12px;
		}
		.tt-fields > .tt-label:first-child {
			margin-top: 0;
		}
	}

	/* Pomodoro focus-timer control. Uses the shared .tt-btn primitives; only
	   layout + the running-timer surface live here. */
	.tt-pomodoro {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.tt-pomodoro-head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 8px;
	}

	.tt-pomodoro-stats {
		font-size: 0.78rem;
		color: var(--text-muted);
	}

	.tt-pomodoro-start {
		align-self: flex-start;
	}

	.tt-pomodoro-active {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 8px 12px;
		padding: 10px 12px;
		border-radius: var(--tt-control-radius, 8px);
		/* Tint the surface with the accent (focus) or muted (break) — never a
		   hardcoded colour, per the CLAUDE.md colour rule. */
		background: color-mix(in srgb, var(--interactive-accent) 14%, var(--background-primary));
		border: 1px solid color-mix(in srgb, var(--interactive-accent) 40%, var(--background-primary));
	}

	.tt-pomodoro-active.is-break {
		background: color-mix(in srgb, var(--text-muted) 12%, var(--background-primary));
		border-color: color-mix(in srgb, var(--text-muted) 32%, var(--background-primary));
	}

	.tt-pomodoro-readout {
		display: flex;
		flex-direction: column;
		line-height: 1.15;
	}

	.tt-pomodoro-time {
		font-size: 1.5rem;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
	}

	.tt-pomodoro-phase {
		font-size: 0.74rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--text-muted);
	}

	.tt-pomodoro-controls {
		display: flex;
		gap: 6px;
	}

	/* Relationship, notes, and action CSS live in their own sub-components. */
</style>
