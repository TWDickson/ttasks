<script lang="ts">
	import type { Writable } from 'svelte/store';
	import type TTasksPlugin from '../main';
	import type { Task, TaskStatus, TaskPriority, TaskType } from '../types';
	import type { TaskStore } from '../store/TaskStore';

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
	let due_date = '';
	let start_date = '';
	let assigned_to = '';
	let estimated_days: number | null = null;
	let blocked_reason = '';
	let notes = '';
	let saving = false;
	let saveTimer: ReturnType<typeof setTimeout>;

	$: if (task) {
		name          = task.name;
		status        = task.status;
		priority      = task.priority;
		category      = task.category ?? '';
		task_type     = task.task_type;
		due_date      = task.due_date ?? '';
		start_date    = task.start_date ?? '';
		assigned_to   = task.assigned_to ?? '';
		estimated_days = task.estimated_days;
		blocked_reason = task.blocked_reason ?? '';
		notes         = task.notes ?? '';
	}

	// ── Save helpers ────────────────────────────────────────────────────────────
	async function saveImmediate(updates: Partial<Task>) {
		if (!task) return;
		saving = true;
		await store.update(task.path, updates);
		saving = false;
	}

	function saveDebounced(updates: Partial<Task>) {
		clearTimeout(saveTimer);
		saveTimer = setTimeout(() => saveImmediate(updates), 600);
	}

	function saveNotesDebounced(nextNotes: string) {
		clearTimeout(saveTimer);
		saveTimer = setTimeout(async () => {
			if (!task) return;
			saving = true;
			await store.updateNotes(task.path, nextNotes);
			saving = false;
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

	async function markComplete() {
		if (!task) return;
		const today = new Date().toISOString().slice(0, 10);
		status = 'Done';
		await saveImmediate({ status: 'Done', completed: today });
	}

	function withCurrentOption(base: string[], current: string | null): string[] {
		if (!current) return base;
		if (base.includes(current)) return base;
		return [...base, current];
	}

	// ── Constants ───────────────────────────────────────────────────────────────
	const STATUSES: TaskStatus[] = ['Active', 'In Progress', 'Future', 'Hold', 'Blocked', 'Cancelled', 'Done'];
	const PRIORITIES: TaskPriority[] = ['High', 'Medium', 'Low', 'None'];

	$: categoryOptions = ['', ...withCurrentOption(plugin.settings.categories ?? [], category || null)];
	$: taskTypeOptions = ['', ...withCurrentOption(plugin.settings.taskTypes ?? [], task_type)];

	const STATUS_COLORS: Partial<Record<TaskStatus, string>> = {
		'In Progress': 'var(--color-blue)',
		'Blocked':     'var(--color-red)',
		'Done':        'var(--color-green)',
	};

	const PRIORITY_COLORS: Record<TaskPriority, string> = {
		High:   'var(--color-red)',
		Medium: 'var(--color-orange)',
		Low:    'var(--color-blue)',
		None:   'var(--text-faint)',
	};
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
				on:input={() => saveDebounced({ name })}
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
				{#each STATUSES as s}
					<button
						class="tt-chip"
						class:tt-chip-active={status === s}
						style={status === s && STATUS_COLORS[s] ? `background:${STATUS_COLORS[s]};border-color:${STATUS_COLORS[s]}` : ''}
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
				on:change={() => saveImmediate({ category: category || null })}
			>
				{#each categoryOptions as c}
					<option value={c}>{c || '— none —'}</option>
				{/each}
			</select>

			{#if task.type === 'task'}
				<label class="tt-label" for="tt-task-type">Task Type</label>
				<select
					id="tt-task-type"
					bind:value={task_type}
					on:change={() => saveImmediate({ task_type: task_type || null })}
				>
					{#each taskTypeOptions as t}
						<option value={t}>{t || '— none —'}</option>
					{/each}
				</select>
			{/if}

			<label class="tt-label" for="tt-due-date">Due Date</label>
			<input
				id="tt-due-date"
				type="date"
				bind:value={due_date}
				on:change={() => saveImmediate({ due_date: due_date || null })}
			/>

			<label class="tt-label" for="tt-start-date">Start Date</label>
			<input
				id="tt-start-date"
				type="date"
				bind:value={start_date}
				on:change={() => saveImmediate({ start_date: start_date || null })}
			/>

			<label class="tt-label" for="tt-assigned-to">Assigned To</label>
			<input
				id="tt-assigned-to"
				type="text"
				bind:value={assigned_to}
				on:input={() => saveDebounced({ assigned_to })}
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
					on:input={() => saveDebounced({ blocked_reason })}
					placeholder="Why is this blocked?"
				/>
			{/if}
		</div>

		<!-- Relationships -->
		{#if task.parent_task || task.depends_on.length > 0 || task.blocks.length > 0}
			<hr class="tt-divider" />
			<div class="tt-relationships">
				{#if task.parent_task}
					<div class="tt-rel-row">
						<span class="tt-label">Project</span>
						<span class="tt-rel-chip">{task.parent_task.split('/').pop()?.replace(/^[a-f0-9]+-/, '') ?? task.parent_task}</span>
					</div>
				{/if}
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
			{#if status !== 'Done'}
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

	.tt-rel-chip {
		padding: 3px 10px;
		border-radius: 999px;
		border: 1px solid var(--background-modifier-border);
		background: var(--background-secondary);
		color: var(--text-muted);
		font-size: 0.78rem;
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
