<script lang="ts">
	import { onMount } from 'svelte';
	import type { Readable, Writable } from 'svelte/store';
	import type { Task, TaskStatus } from '../types';
	import type TaskStore from '../store/TaskStore';

	export let tasks: Readable<Task[]>;
	export let statuses: string[];
	export let statusColors: Record<string, string>;
	export let categoryColors: Record<string, string>;
	export let taskTypeColors: Record<string, string>;
	export let blockStatus = 'Blocked';
	export let activeTaskPath: Writable<string | null>;
	export let store: TaskStore;
	export let onOpen: (path: string) => void;

	type Column = { id: TaskStatus; label: string; accent?: string };

	let activeColumn: TaskStatus = statuses?.[0] ?? 'Active';
	let draggingPath: string | null = null;
	let dragOverCol: TaskStatus | null = null;

	$: statusAccents = statusColors ?? {};
	$: COLUMNS = (statuses ?? []).map((status) => ({
		id: status,
		label: status === 'Hold' ? 'On Hold' : status,
		accent: statusAccents[status],
	}));

	$: if (!COLUMNS.some(col => col.id === activeColumn)) {
		activeColumn = COLUMNS[0]?.id ?? 'Active';
	}

	const PRIORITY_COLORS: Record<string, string> = {
		High:   'var(--color-red)',
		Medium: 'var(--color-orange)',
		Low:    'var(--color-blue)',
		None:   'var(--text-faint)',
	};

	$: tasksByStatus = groupByStatus($tasks);

	function groupByStatus(all: Task[]): Map<TaskStatus, Task[]> {
		const map = new Map<TaskStatus, Task[]>();
		for (const col of COLUMNS) map.set(col.id, []);
		for (const task of all) {
			if (task.type === 'project') continue;
			const col = map.get(task.status);
			if (col) col.push(task);
		}
		return map;
	}

	let cachedToday = new Date().toISOString().slice(0, 10);

	onMount(() => {
		const scheduleRefresh = () => {
			const now = new Date();
			const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
			const ms = tomorrow.getTime() - now.getTime() + 100;
			return window.setTimeout(() => {
				cachedToday = new Date().toISOString().slice(0, 10);
				midnightTimer = scheduleRefresh();
			}, ms);
		};
		let midnightTimer = scheduleRefresh();
		return () => window.clearTimeout(midnightTimer);
	});

	function isOverdue(due: string | null): boolean {
		if (!due) return false;
		return due < cachedToday;
	}

	function relativeDate(due: string): string {
		const t = cachedToday;
		if (due === t) return 'Today';
		const diff = Math.round((new Date(due + 'T00:00:00').getTime() - new Date(t + 'T00:00:00').getTime()) / 86400000);
		if (diff === 1) return 'Tomorrow';
		if (diff === -1) return 'Yesterday';
		if (diff < -1) return `${Math.abs(diff)}d overdue`;
		if (diff <= 7) return `In ${diff}d`;
		return due;
	}

	function onDragStart(e: DragEvent, path: string) {
		draggingPath = path;
		e.dataTransfer?.setData('text/plain', path);
		if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
	}

	function onDragOver(e: DragEvent, colId: TaskStatus) {
		e.preventDefault();
		if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
		dragOverCol = colId;
	}

	function onDragLeave(e: DragEvent) {
		// Only clear if leaving the column entirely (not entering a child)
		const rel = e.relatedTarget as HTMLElement | null;
		if (!rel || !(e.currentTarget as HTMLElement).contains(rel)) {
			dragOverCol = null;
		}
	}

	function onDrop(e: DragEvent, colId: TaskStatus) {
		e.preventDefault();
		dragOverCol = null;
		if (!draggingPath) return;
		moveDraggingTaskTo(colId);
	}

	function moveDraggingTaskTo(colId: TaskStatus) {
		if (!draggingPath) return;
		const task = $tasks.find(t => t.path === draggingPath);
		draggingPath = null;
		if (!task || task.status === colId) return;
		store.update(task.path, { status: colId });
	}

	function onCardKeyDown(e: KeyboardEvent, path: string) {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			onOpen(path);
		}
	}

	function onDragEnd() {
		draggingPath = null;
		dragOverCol = null;
	}

	function getBadgeStyle(color: string | undefined): string {
		return color ? `--tt-badge-color:${color};` : '';
	}
</script>

<div class="tt-kanban-wrap">

	<!-- Mobile: status tab strip -->
	<div class="tt-kanban-tabs">
		{#each COLUMNS as col}
			{@const count = (tasksByStatus.get(col.id) ?? []).length}
			<button
				class="tt-kanban-tab"
				class:is-active={activeColumn === col.id}
				style={activeColumn === col.id && col.accent ? `color:${col.accent};border-bottom-color:${col.accent}` : ''}
				on:click={() => activeColumn = col.id}
			>
				{col.label}
				{#if count > 0}<span class="tt-tab-count">{count}</span>{/if}
			</button>
		{/each}
	</div>

	<div class="tt-kanban">
		{#each COLUMNS as col}
			{@const cards = tasksByStatus.get(col.id) ?? []}
			<div
				class="tt-kanban-col"
				class:is-active-col={activeColumn === col.id}
				class:is-drag-over={dragOverCol === col.id}
				role="group"
				aria-label="{col.label} column"
				on:dragover={(e) => onDragOver(e, col.id)}
				on:dragleave={onDragLeave}
				on:drop={(e) => onDrop(e, col.id)}
			>
				<div class="tt-kanban-col-header">
					<span
						class="tt-kanban-col-label"
						style={col.accent ? `color:${col.accent}` : ''}
					>{col.label}</span>
					<span class="tt-count">{cards.length}</span>
				</div>

				<div class="tt-kanban-col-body">
					{#if cards.length === 0}
						<div class="tt-kanban-empty">Drop tasks here</div>
					{:else}
						{#each cards as task (task.path)}
							<div
								class="tt-kanban-card"
								class:is-active={$activeTaskPath === task.path}
								class:is-overdue={isOverdue(task.due_date)}
								class:is-dragging={draggingPath === task.path}
								draggable="true"
								role="button"
								tabindex="0"
								aria-grabbed={draggingPath === task.path}
								on:click={() => onOpen(task.path)}
								on:keydown={(e) => onCardKeyDown(e, task.path)}
								on:dragstart={(e) => onDragStart(e, task.path)}
								on:dragend={onDragEnd}
							>
								<div class="tt-card-top">
									<span
										class="tt-priority-dot"
										style="background:{PRIORITY_COLORS[task.priority] ?? PRIORITY_COLORS.None}"
										title="Priority: {task.priority}"
									></span>
									<span class="tt-card-name">{task.name}</span>
								</div>

								{#if task.status === blockStatus && task.blocked_reason}
									<p class="tt-card-blocked-reason">{task.blocked_reason}</p>
								{/if}

								<div class="tt-card-meta">
									{#if task.category}
										<span class="tt-badge tt-badge-cat" class:tt-badge-tinted={!!categoryColors?.[task.category]} style={getBadgeStyle(categoryColors?.[task.category])}>{task.category}</span>
									{/if}
									{#if task.due_date}
										<span class="tt-badge" class:tt-badge-overdue={isOverdue(task.due_date)} title={task.due_date}>
											{relativeDate(task.due_date)}
										</span>
									{/if}
									{#if task.task_type}
										<span class="tt-badge tt-badge-type" class:tt-badge-tinted={!!taskTypeColors?.[task.task_type]} style={getBadgeStyle(taskTypeColors?.[task.task_type])}>{task.task_type}</span>
									{/if}
									<!-- Mobile-only: inline status change -->
									<select
										class="tt-card-status-select"
										value={task.status}
										on:click|stopPropagation
										on:change|stopPropagation={(e) => {
											const target = e.currentTarget;
											if (target.value !== task.status) {
												store.update(task.path, { status: target.value });
											}
										}}
									>
										{#each statuses as s}
											<option value={s}>{s}</option>
										{/each}
									</select>
								</div>
							</div>
						{/each}
					{/if}
				</div>
			</div>
		{/each}
	</div>

</div>

<style>
	/* ── Wrapper ────────────────────────────────────────────────────────────────── */
	.tt-kanban-wrap {
		display: flex;
		flex-direction: column;
		height: 100%;
		overflow: hidden;
	}

	/* ── Mobile tab strip (hidden on desktop) ───────────────────────────────────── */
	.tt-kanban-tabs {
		display: none;
	}

	/* ── Board ──────────────────────────────────────────────────────────────────── */
	.tt-kanban {
		display: flex;
		gap: 10px;
		padding: 12px;
		height: 100%;
		overflow-x: auto;
		overflow-y: hidden;
		align-items: stretch;
		box-sizing: border-box;
	}

	/* ── Column ─────────────────────────────────────────────────────────────────── */
	.tt-kanban-col {
		width: 240px;
		flex-shrink: 0;
		display: flex;
		flex-direction: column;
		height: 100%;
		min-height: 0;
		max-height: 100%;
		background: var(--background-secondary);
		border-radius: var(--radius-m, 6px);
		overflow: hidden;
		border: 2px solid transparent;
		transition: border-color 0.12s;
	}

	.tt-kanban-col.is-drag-over {
		border-color: var(--interactive-accent);
	}

	.tt-kanban-col-header {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 10px 12px 8px;
		flex-shrink: 0;
		border-bottom: 1px solid var(--background-modifier-border);
	}

	.tt-kanban-col-label {
		font-size: 0.72rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--text-muted);
		flex: 1;
	}

	.tt-count {
		background: var(--background-modifier-border);
		border-radius: 999px;
		padding: 1px 7px;
		font-size: 0.7rem;
		font-weight: 600;
		color: var(--text-muted);
	}

	.tt-kanban-col-body {
		flex: 1;
		overflow-y: auto;
		padding: 8px;
		display: flex;
		flex-direction: column;
		gap: 6px;
		/* Ensure the drop zone is always full-height */
		min-height: 60px;
	}

	.tt-kanban-empty {
		text-align: center;
		padding: 16px 0;
		color: var(--text-faint);
		font-size: 0.82rem;
		border: 1px dashed var(--background-modifier-border);
		border-radius: var(--radius-s, 4px);
	}

	/* ── Card ───────────────────────────────────────────────────────────────────── */
	.tt-kanban-card {
		display: flex;
		flex-direction: column;
		gap: 7px;
		padding: 10px 12px;
		border: none;
		border-radius: var(--radius-m, 6px);
		background: var(--background-primary);
		color: var(--text-normal);
		cursor: grab;
		text-align: left;
		width: 100%;
		box-shadow: 0 1px 3px rgba(var(--mono-rgb-100), 0.08);
		border-left: 3px solid transparent;
		transition: background 0.1s, box-shadow 0.1s, border-left-color 0.1s;
	}

	.tt-kanban-card:hover {
		background: var(--background-modifier-hover);
		box-shadow: 0 2px 6px rgba(var(--mono-rgb-100), 0.12);
	}

	.tt-kanban-card.is-active {
		border-left-color: var(--interactive-accent);
	}

	.tt-kanban-card.is-dragging {
		opacity: 0.4;
		cursor: grabbing;
	}

	.tt-card-top {
		display: flex;
		align-items: flex-start;
		gap: 8px;
	}

	.tt-priority-dot {
		width: 9px;
		height: 9px;
		border-radius: 50%;
		flex-shrink: 0;
		margin-top: 4px;
	}

	.tt-card-name {
		font-size: 0.9rem;
		line-height: 1.4;
		word-break: break-word;
		font-weight: 500;
	}

	.tt-kanban-card.is-active .tt-card-name {
		color: var(--interactive-accent);
	}

	.tt-kanban-card.is-overdue .tt-card-name {
		color: var(--color-red);
	}

	.tt-card-blocked-reason {
		font-size: 0.76rem;
		color: var(--text-muted);
		margin: 0;
		padding-left: 17px;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	/* ── Badges ─────────────────────────────────────────────────────────────────── */
	.tt-card-meta {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
		padding-left: 17px;
	}

	.tt-badge {
		font-size: 0.68rem;
		padding: 2px 6px;
		border-radius: 999px;
		background: var(--background-modifier-border);
		border: 1px solid transparent;
		color: var(--text-muted);
		white-space: nowrap;
	}

	.tt-badge-tinted {
		background: color-mix(in srgb, var(--tt-badge-color) 18%, var(--background-primary));
		border-color: color-mix(in srgb, var(--tt-badge-color) 42%, var(--background-modifier-border));
		color: var(--tt-badge-color);
	}

	.tt-badge-overdue {
		background: var(--color-red);
		color: var(--text-on-accent);
	}

	.tt-badge-type {
		background: var(--background-secondary);
	}

	/* Status select: hidden on desktop, visible on mobile */
	.tt-card-status-select {
		display: none;
	}

	/* ── Mobile ─────────────────────────────────────────────────────────────────── */
	@media (max-width: 768px) {
		.tt-card-status-select {
			display: inline-block;
			font-size: 0.68rem;
			padding: 2px 6px;
			border-radius: 999px;
			border: 1px solid var(--background-modifier-border);
			background: var(--background-secondary);
			color: var(--text-muted);
			cursor: pointer;
			-webkit-appearance: none;
			appearance: none;
		}
		.tt-kanban-tabs {
			display: flex;
			overflow-x: auto;
			flex-shrink: 0;
			border-bottom: 1px solid var(--background-modifier-border);
			background: var(--background-secondary);
			scrollbar-width: none;
		}
		.tt-kanban-tabs::-webkit-scrollbar { display: none; }

		.tt-kanban-tab {
			flex-shrink: 0;
			display: flex;
			align-items: center;
			gap: 5px;
			padding: 10px 14px;
			border: none;
			background: transparent;
			color: var(--text-muted);
			font-size: 0.85rem;
			font-weight: 500;
			cursor: pointer;
			border-bottom: 2px solid transparent;
			white-space: nowrap;
			transition: color 0.1s, border-color 0.1s;
		}
		.tt-kanban-tab.is-active {
			color: var(--interactive-accent);
			border-bottom-color: var(--interactive-accent);
			font-weight: 600;
		}

		.tt-tab-count {
			font-size: 0.72rem;
			background: var(--background-modifier-border);
			border-radius: 999px;
			padding: 1px 6px;
		}

		.tt-kanban {
			padding: 8px;
		}
		.tt-kanban-col {
			display: none;
			width: 100%;
		}
		.tt-kanban-col.is-active-col {
			display: flex;
		}

		/* Touch devices: use pointer cursor, no grab */
		.tt-kanban-card {
			cursor: pointer;
		}
	}
</style>
