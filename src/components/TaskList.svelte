<script lang="ts">
	import type { Writable } from 'svelte/store';
	import type { Task, TaskStatus } from '../types';

	export let tasks: Writable<Task[]>;
	export let onOpen: (path: string) => void;

	type GroupKey = TaskStatus | 'project';

	const STATUS_ORDER: GroupKey[] = [
		'In Progress', 'Active', 'Future', 'Blocked', 'Hold', 'project', 'Done', 'Cancelled',
	];

	const STATUS_LABELS: Record<GroupKey, string> = {
		'In Progress': 'In Progress',
		'Active':      'Active',
		'Future':      'Future',
		'Blocked':     'Blocked',
		'Hold':        'On Hold',
		'project':     'Projects',
		'Done':        'Done',
		'Cancelled':   'Cancelled',
	};

	const PRIORITY_COLORS: Record<string, string> = {
		High:   'var(--color-red)',
		Medium: 'var(--color-orange)',
		Low:    'var(--color-blue)',
		None:   'var(--text-faint)',
	};

	$: grouped = groupTasks($tasks);

	function groupTasks(all: Task[]): Map<GroupKey, Task[]> {
		const map = new Map<GroupKey, Task[]>();
		for (const task of all) {
			const key: GroupKey = task.type === 'project' ? 'project' : (task.status as GroupKey);
			if (!map.has(key)) map.set(key, []);
			map.get(key)?.push(task);
		}
		return map;
	}

	function isOverdue(due: string | null): boolean {
		if (!due) return false;
		return due < new Date().toISOString().slice(0, 10);
	}
</script>

<div class="tt-list">
	{#if $tasks.length === 0}
		<div class="tt-empty">No tasks found in the configured folder.</div>
	{:else}
		{#each STATUS_ORDER as group}
			{#if grouped.has(group)}
				<section class="tt-group">
					<h3 class="tt-group-heading">
						{STATUS_LABELS[group]}
						<span class="tt-count">{grouped.get(group)?.length ?? 0}</span>
					</h3>
					<ul class="tt-task-list">
						{#each (grouped.get(group) ?? []) as task (task.path)}
							<li class="tt-task" class:tt-overdue={isOverdue(task.due_date)}>
								<button class="tt-task-btn" on:click={() => onOpen(task.path)}>
									<div class="tt-task-main">
										<span
											class="tt-priority-dot"
											style="background:{PRIORITY_COLORS[task.priority] ?? PRIORITY_COLORS.None}"
											title="Priority: {task.priority}"
										></span>
										<span class="tt-task-name">{task.name}</span>
									</div>
									<div class="tt-task-meta">
										{#if task.category}
											<span class="tt-badge tt-badge-cat">{task.category}</span>
										{/if}
										{#if task.due_date}
											<span class="tt-badge" class:tt-badge-overdue={isOverdue(task.due_date)}>
												{task.due_date}
											</span>
										{/if}
										{#if task.type === 'task' && task.task_type}
											<span class="tt-badge tt-badge-type">{task.task_type}</span>
										{/if}
									</div>
								</button>
							</li>
						{/each}
					</ul>
				</section>
			{/if}
		{/each}
	{/if}
</div>

<style>
	.tt-list {
		padding: 8px 0;
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	.tt-empty {
		padding: 32px 16px;
		text-align: center;
		color: var(--text-muted);
		font-size: 0.9rem;
	}

	.tt-group-heading {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 0.72rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--text-muted);
		padding: 0 12px 4px;
		margin: 0;
	}

	.tt-count {
		background: var(--background-modifier-border);
		border-radius: 999px;
		padding: 1px 7px;
		font-size: 0.7rem;
		font-weight: 600;
	}

	.tt-task-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 1px;
	}

	.tt-task {
		display: flex;
	}

	.tt-task-btn {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		padding: 8px 12px;
		width: 100%;
		border: none;
		border-radius: var(--radius-m, 6px);
		background: transparent;
		color: var(--text-normal);
		cursor: pointer;
		text-align: left;
		transition: background 0.1s;
	}

	.tt-task-btn:hover {
		background: var(--background-modifier-hover);
	}

	.tt-task-btn:focus {
		outline: 2px solid var(--interactive-accent);
		outline-offset: -2px;
	}

	.tt-task-main {
		display: flex;
		align-items: center;
		gap: 8px;
		min-width: 0;
	}

	.tt-priority-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.tt-task-name {
		font-size: 0.9rem;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.tt-task-meta {
		display: flex;
		align-items: center;
		gap: 4px;
		flex-shrink: 0;
	}

	.tt-badge {
		font-size: 0.7rem;
		padding: 2px 6px;
		border-radius: 999px;
		background: var(--background-modifier-border);
		color: var(--text-muted);
		white-space: nowrap;
	}

	.tt-badge-overdue {
		background: var(--color-red);
		color: #fff;
	}

	.tt-badge-type {
		background: var(--background-secondary);
	}

	.tt-overdue .tt-task-name {
		color: var(--color-red);
	}
</style>
