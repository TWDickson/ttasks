<script lang="ts">
	import type { Writable } from 'svelte/store';
	import type { Task } from '../types';

	export let tasks: Writable<Task[]>;
	export let activeTaskPath: Writable<string | null>;
	export let onOpen: (path: string) => void;

	// ── Date group definitions ────────────────────────────────────────────────

	type DateGroupKey = 'overdue' | 'today' | 'tomorrow' | 'this-week' | 'next-week' | 'later' | 'no-date';

	const GROUP_ORDER: DateGroupKey[] = [
		'overdue', 'today', 'tomorrow', 'this-week', 'next-week', 'later', 'no-date',
	];

	const GROUP_LABELS: Record<DateGroupKey, string> = {
		'overdue':   'Overdue',
		'today':     'Today',
		'tomorrow':  'Tomorrow',
		'this-week': 'This Week',
		'next-week': 'Next Week',
		'later':     'Later',
		'no-date':   'No Date',
	};

	const GROUP_COLORS: Record<DateGroupKey, string> = {
		'overdue':   'var(--color-red)',
		'today':     'var(--interactive-accent)',
		'tomorrow':  'var(--color-orange)',
		'this-week': 'var(--text-muted)',
		'next-week': 'var(--text-muted)',
		'later':     'var(--text-muted)',
		'no-date':   'var(--text-faint)',
	};

	// ── Priority sort order ───────────────────────────────────────────────────

	const PRIORITY_ORDER: Record<string, number> = {
		High: 0, Medium: 1, Low: 2, None: 3,
	};

	const PRIORITY_COLORS: Record<string, string> = {
		High:   'var(--color-red)',
		Medium: 'var(--color-orange)',
		Low:    'var(--color-blue)',
		None:   'var(--text-faint)',
	};

	// ── Helpers ───────────────────────────────────────────────────────────────

	function today(): string {
		return new Date().toISOString().slice(0, 10);
	}

	function offsetDate(days: number): string {
		const d = new Date();
		d.setDate(d.getDate() + days);
		return d.toISOString().slice(0, 10);
	}

	function classifyDate(due: string | null): DateGroupKey {
		if (!due) return 'no-date';
		const t = today();
		if (due < t)              return 'overdue';
		if (due === t)            return 'today';
		if (due === offsetDate(1)) return 'tomorrow';
		if (due <= offsetDate(7)) return 'this-week';
		if (due <= offsetDate(14)) return 'next-week';
		return 'later';
	}

	function isOverdue(due: string | null): boolean {
		if (!due) return false;
		return due < today();
	}

	function sortTasks(list: Task[]): Task[] {
		return [...list].sort((a, b) => {
			// Sort by due_date asc (null goes last within the group but
			// the no-date group only contains nulls, so this is a no-op there)
			const dateA = a.due_date ?? '9999-99-99';
			const dateB = b.due_date ?? '9999-99-99';
			if (dateA !== dateB) return dateA < dateB ? -1 : 1;
			// Then by priority
			const pa = PRIORITY_ORDER[a.priority] ?? 3;
			const pb = PRIORITY_ORDER[b.priority] ?? 3;
			return pa - pb;
		});
	}

	// ── Reactive grouping ─────────────────────────────────────────────────────

	$: grouped = groupTasks($tasks);
	$: totalCount = [...grouped.values()].reduce((n, g) => n + g.length, 0);

	function groupTasks(all: Task[]): Map<DateGroupKey, Task[]> {
		const map = new Map<DateGroupKey, Task[]>();
		for (const key of GROUP_ORDER) map.set(key, []);

		for (const task of all) {
			if (task.type === 'project') continue;
			const key = classifyDate(task.due_date);
			map.get(key)!.push(task);
		}

		// Sort within each group and remove empty groups
		for (const [key, list] of map) {
			if (list.length === 0) {
				map.delete(key);
			} else {
				map.set(key, sortTasks(list));
			}
		}

		return map;
	}
</script>

<div class="tt-agenda">
	{#if totalCount === 0}
		<div class="tt-empty">No upcoming tasks.</div>
	{:else}
		{#each GROUP_ORDER as group}
			{#if grouped.has(group)}
				{@const groupTasks = grouped.get(group) ?? []}
				<section class="tt-group">
					<h3 class="tt-group-heading">
						<span
							class="tt-group-label"
							style="color: {GROUP_COLORS[group]}"
						>{GROUP_LABELS[group]}</span>
						<span class="tt-count">{groupTasks.length}</span>
					</h3>
					<ul class="tt-task-list">
						{#each groupTasks as task (task.path)}
							<li
								class="tt-task"
								class:is-overdue={isOverdue(task.due_date)}
								class:is-active={$activeTaskPath === task.path}
							>
								<button
									class="tt-task-btn"
									class:is-active={$activeTaskPath === task.path}
									on:click={() => onOpen(task.path)}
								>
									<div class="tt-task-main">
										<span
											class="tt-priority-dot"
											style="background: {PRIORITY_COLORS[task.priority] ?? PRIORITY_COLORS.None}"
											title="Priority: {task.priority}"
										></span>
										<span class="tt-task-name">{task.name}</span>
									</div>
									<div class="tt-task-meta">
										{#if task.category}
											<span class="tt-badge tt-badge-cat">{task.category}</span>
										{/if}
										{#if task.due_date}
											<span
												class="tt-badge"
												class:tt-badge-overdue={isOverdue(task.due_date)}
											>{task.due_date}</span>
										{/if}
										{#if task.task_type}
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
	.tt-agenda {
		overflow-y: auto;
		flex: 1;
		padding: 8px 4px;
		display: flex;
		flex-direction: column;
		gap: 16px;
		max-width: 660px;
	}

	/* ── Empty state ─────────────────────────────────────────────────────────── */
	.tt-empty {
		padding: 32px 16px;
		text-align: center;
		color: var(--text-muted);
		font-size: 0.9rem;
	}

	/* ── Group header ────────────────────────────────────────────────────────── */
	.tt-group-heading {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 0.72rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		padding: 0 12px 4px;
		margin: 0;
	}

	/* Label color is applied inline via style prop */
	.tt-group-label {
		/* inherits color from inline style */
	}

	.tt-count {
		background: var(--background-modifier-border);
		border-radius: 999px;
		padding: 1px 7px;
		font-size: 0.7rem;
		font-weight: 600;
		color: var(--text-muted);
	}

	/* ── Task list ───────────────────────────────────────────────────────────── */
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

	/* ── Task row button ─────────────────────────────────────────────────────── */
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
		/* Suppress Obsidian default button effects */
		box-shadow: none;
		transform: none;
	}

	.tt-task-btn:hover {
		background: var(--background-modifier-hover);
		box-shadow: none;
		transform: none;
	}

	.tt-task-btn:focus-visible {
		outline: 2px solid var(--interactive-accent);
		outline-offset: -2px;
	}

	/* Active state: left border accent + name color */
	.tt-task-btn.is-active {
		background: var(--background-modifier-hover);
		border-left: 2px solid var(--interactive-accent);
		padding-left: 10px; /* compensate for the 2px border */
	}

	.tt-task-btn.is-active .tt-task-name {
		color: var(--interactive-accent);
		font-weight: 500;
	}

	.tt-task-btn.is-active .tt-priority-dot {
		outline: 2px solid var(--interactive-accent);
		outline-offset: 1px;
	}

	/* ── Overdue row: name turns red ─────────────────────────────────────────── */
	.tt-task.is-overdue .tt-task-name {
		color: var(--color-red);
	}

	/* ── Task row internals ──────────────────────────────────────────────────── */
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
		flex: 1;
	}

	.tt-task-meta {
		display: flex;
		align-items: center;
		gap: 4px;
		flex-shrink: 0;
	}

	/* ── Badges ──────────────────────────────────────────────────────────────── */
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
		color: var(--text-on-accent);
	}

	.tt-badge-type {
		background: var(--background-secondary);
	}
</style>
