<script lang="ts">
	import type TTasksPlugin from '../main';
	import SwipeableTaskRow from './SwipeableTaskRow.svelte';
	import type { Writable } from 'svelte/store';
	import type { Task } from '../types';

	export let plugin: TTasksPlugin;
	export let tasks: Writable<Task[]>;
	export let statuses: string[];
	export let categoryColors: Record<string, string>;
	export let taskTypeColors: Record<string, string>;
	export let activeTaskPath: Writable<string | null>;
	export let onOpen: (path: string) => void;

	type GroupKey = string;

	$: statusOrder = [...(statuses ?? []), 'project'];

	function groupLabel(group: GroupKey): string {
		if (group === 'project') return 'Projects';
		if (group === 'Hold') return 'On Hold';
		return group;
	}

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
</script>

<div class="tt-list">
	{#if $tasks.length === 0}
		<div class="tt-empty">No tasks found in the configured folder.</div>
	{:else}
		{#each statusOrder as group}
			{#if grouped.has(group)}
				<section class="tt-group">
					<h3 class="tt-group-heading">
						{groupLabel(group)}
						<span class="tt-count">{grouped.get(group)?.length ?? 0}</span>
					</h3>
					<ul class="tt-task-list">
						{#each (grouped.get(group) ?? []) as task (task.path)}
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
	.tt-list {
		padding: 8px 4px;
		display: flex;
		flex-direction: column;
		gap: 16px;
		max-width: 660px;
		overflow-y: auto;
		flex: 1;
	}

	.tt-empty {
		padding: 32px 16px;
		text-align: center;
		display: flex;
		align-items: center;
		gap: 4px;
		flex-shrink: 0;
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
</style>
