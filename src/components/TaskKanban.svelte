<script lang="ts">
	import type { Writable } from 'svelte/store';
	import type { Task, TaskStatus } from '../types';
	import type TaskStore from '../store/TaskStore';

	export let tasks: Writable<Task[]>;
	export let activeTaskPath: Writable<string | null>;
	export let store: TaskStore;
	export let onOpen: (path: string) => void;

	type Column = { id: TaskStatus; label: string; accent?: string };

	let activeColumn: TaskStatus = 'In Progress';
	let draggingPath: string | null = null;
	let dragOverCol: TaskStatus | null = null;

	const COLUMNS: Column[] = [
		{ id: 'In Progress', label: 'In Progress', accent: 'var(--color-blue)' },
		{ id: 'Active',      label: 'Active' },
		{ id: 'Future',      label: 'Future' },
		{ id: 'Blocked',     label: 'Blocked',     accent: 'var(--color-red)' },
		{ id: 'Hold',        label: 'On Hold' },
		{ id: 'Done',        label: 'Done',         accent: 'var(--color-green)' },
	];

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

	function isOverdue(due: string | null): boolean {
		if (!due) return false;
		return due < new Date().toISOString().slice(0, 10);
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
		const task = $tasks.find(t => t.path === draggingPath);
		draggingPath = null;
		if (!task || task.status === colId) return;
		store.update(task.path, { status: colId });
	}

	function onDragEnd() {
		draggingPath = null;
		dragOverCol = null;
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
							<!-- svelte-ignore a11y-no-static-element-interactions -->
							<div
								class="tt-kanban-card"
								class:is-active={$activeTaskPath === task.path}
								class:is-overdue={isOverdue(task.due_date)}
								class:is-dragging={draggingPath === task.path}
								draggable="true"
								role="button"
								tabindex="0"
								on:click={() => onOpen(task.path)}
								on:keydown={(e) => e.key === 'Enter' && onOpen(task.path)}
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

								{#if task.status === 'Blocked' && task.blocked_reason}
									<p class="tt-card-blocked-reason">{task.blocked_reason}</p>
								{/if}

								<div class="tt-card-meta">
									{#if task.category}
										<span class="tt-badge tt-badge-cat">{task.category}</span>
									{/if}
									{#if task.due_date}
										<span class="tt-badge" class:tt-badge-overdue={isOverdue(task.due_date)}>
											{task.due_date}
										</span>
									{/if}
									{#if task.task_type}
										<span class="tt-badge tt-badge-type">{task.task_type}</span>
									{/if}
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
		align-items: flex-start;
		box-sizing: border-box;
	}

	/* ── Column ─────────────────────────────────────────────────────────────────── */
	.tt-kanban-col {
		width: 240px;
		flex-shrink: 0;
		display: flex;
		flex-direction: column;
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
		color: var(--text-muted);
		white-space: nowrap;
	}

	.tt-badge-overdue {
		background: var(--color-red);
		color: var(--text-on-accent);
	}

	.tt-badge-type {
		background: var(--background-secondary);
	}

	/* ── Mobile ─────────────────────────────────────────────────────────────────── */
	@media (max-width: 768px) {
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
