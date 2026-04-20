<script lang="ts">
	import type TTasksPlugin from '../main';
	import TaskRow from './TaskRow.svelte';
	import type { Readable, Writable } from 'svelte/store';
	import type { Task } from '../types';
	export let plugin: TTasksPlugin;
	export let tasks: Readable<Task[]>;
	export let statuses: string[];
	export let categoryColors: Record<string, string>;
	export let taskTypeColors: Record<string, string>;
	export let activeTaskPath: Writable<string | null>;
	export let onOpen: (path: string) => void;
	export let onContextMenu: ((task: Task, event: MouseEvent) => void) | undefined = undefined;
	export let onNewTask: (() => void) | undefined = undefined;

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
		<div class="tt-empty">
			<p>No tasks yet.</p>
			<p class="tt-empty-hint">Create your first task to get started.</p>
			{#if onNewTask}
				<button class="tt-empty-cta" on:click={onNewTask}>+ New task</button>
			{/if}
		</div>
	{:else}
		{#each statusOrder as group}
			{#if grouped.has(group)}
				{@const groupTaskList = grouped.get(group) ?? []}
				<section class="tt-group">
					<h3 class="tt-group-heading">
						{groupLabel(group)}
						<span class="tt-count">{groupTaskList.length}</span>
					</h3>
					<ul class="tt-task-list">
						{#each groupTaskList as task (task.path)}
							<TaskRow
								{plugin}
								{task}
								active={$activeTaskPath === task.path}
								{categoryColors}
								{taskTypeColors}
								{onOpen}
								onContextMenu={onContextMenu}
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
		padding: var(--size-4-2, 8px) var(--size-4-1, 4px);
		display: flex;
		flex-direction: column;
		gap: var(--size-4-4, 16px);
		max-width: 660px;
		overflow-y: auto;
		flex: 1;
	}

	.tt-empty {
		padding: var(--size-4-8, 32px) var(--size-4-4, 16px);
		text-align: center;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--size-4-1, 4px);
		flex-shrink: 0;
		color: var(--text-muted);
		font-size: 0.9rem;
	}

	.tt-empty-cta {
		margin-top: var(--size-4-3, 12px);
		padding: var(--size-4-2, 8px) var(--size-4-5, 20px);
		border: none;
		border-radius: var(--button-radius, var(--radius-m, 8px));
		background: var(--interactive-accent);
		color: var(--text-on-accent);
		font-size: 0.88rem;
		font-weight: 500;
		cursor: pointer;
		transition: background 0.1s;
	}
	.tt-empty-cta:hover {
		background: var(--interactive-accent-hover);
	}

	.tt-group-heading {
		display: flex;
		align-items: center;
		gap: var(--size-4-2, 8px);
		font-size: 0.72rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--text-muted);
		padding: 0 var(--size-4-3, 12px) var(--size-4-1, 4px);
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
