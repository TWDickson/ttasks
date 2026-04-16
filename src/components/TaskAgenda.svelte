<script lang="ts">
	import type TTasksPlugin from '../main';
	import SwipeableTaskRow from './SwipeableTaskRow.svelte';
	import type { Readable, Writable } from 'svelte/store';
	import type { Task } from '../types';

	export let plugin: TTasksPlugin;
	export let tasks: Readable<Task[]>;
	export let categoryColors: Record<string, string>;
	export let taskTypeColors: Record<string, string>;
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
			if (task.is_complete) continue;
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
							<SwipeableTaskRow
								{plugin}
								{task}
								active={$activeTaskPath === task.path}
								{categoryColors}
								{taskTypeColors}
								{onOpen}
							/>
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
		padding: 0 12px 4px;
		margin: 0;
	}

	.tt-count {
		background: var(--background-modifier-border);
		border-radius: 999px;
		padding: 1px 7px;
		font-size: 0.7rem;
		font-weight: 600;
		color: var(--text-muted);
	}

	.tt-task-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 1px;
	}

</style>
