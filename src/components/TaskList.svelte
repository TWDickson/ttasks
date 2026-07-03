<script lang="ts">
	import type TTasksPlugin from '../main';
	import TaskRow from './TaskRow.svelte';
	import type { Readable, Writable } from 'svelte/store';
	import type { Task } from '../types';
	import type { ExternalTask } from '../integration/types';
	import type { TaskGroup } from '../query/types';
	import type { ResolvedTaskDate } from '../store/taskSchedule';
	import { buildListRows, labelForGroup, type ListSection, type ListHierarchyMode } from './viewAdapters';
	export let plugin: TTasksPlugin;
	export let viewId = '';
	export let groups: Readable<TaskGroup[]>;
	export let schedule: Map<string, ResolvedTaskDate> | undefined = undefined;
	export let statuses: string[];
	export let hierarchy: ListHierarchyMode = 'tree';
	export let areaColors: Record<string, string>;
	export let labelColors: Record<string, string>;
	export let activeTaskPath: Writable<string | null>;
	export let onOpen: (path: string) => void;
	export let onContextMenu: ((task: Task, event: MouseEvent) => void) | undefined = undefined;
	export let onRestore: ((path: string) => Promise<void>) | undefined = undefined;
	export let onNewTask: (() => void) | undefined = undefined;
	export let selectable = false;
	export let selectedPaths: Set<string> = new Set();
	export let onSelect: ((path: string) => void) | undefined = undefined;
	export let focusedTaskPath: string | null = null;
	export let onPromote: ((task: ExternalTask) => void) | undefined = undefined;

	let collapsedPaths = new Set<string>();

	function buildSections(groups: TaskGroup[], configuredStatuses: string[]): ListSection[] {
		const statusTasks = new Map<string, Task[]>();
		const projectTasks: Task[] = [];

		for (const group of groups) {
			for (const task of group.tasks) {
				if (task.type === 'project') {
					projectTasks.push(task);
				} else {
					const current = statusTasks.get(group.key) ?? [];
					statusTasks.set(group.key, [...current, task]);
				}
			}
		}

		const sections: ListSection[] = [];
		for (const status of configuredStatuses) {
			const tasks = statusTasks.get(status);
			if (tasks && tasks.length > 0) {
				sections.push({ key: status, label: labelForGroup(status), tasks });
				statusTasks.delete(status);
			}
		}
		for (const [key, tasks] of statusTasks.entries()) {
			sections.push({ key, label: labelForGroup(key), tasks });
		}
		if (projectTasks.length > 0) {
			sections.push({ key: 'project', label: 'Projects', tasks: projectTasks });
		}
		return sections;
	}

	$: sections = buildSections($groups, statuses ?? []);

	function toggleExpanded(path: string): void {
		const next = new Set(collapsedPaths);
		if (next.has(path)) {
			next.delete(path);
		} else {
			next.add(path);
		}
		collapsedPaths = next;
	}
</script>

<div class="tt-list">
	{#if sections.length === 0}
		<div class="tt-empty">
			<p>No tasks yet.</p>
			<p class="tt-empty-hint">Create your first task to get started.</p>
			{#if onNewTask}
				<button class="tt-btn tt-btn-primary tt-empty-cta" on:click={onNewTask}>+ New task</button>
			{/if}
		</div>
	{:else}
		{#each sections as section (section.key)}
			{@const rows = buildListRows(section.tasks, collapsedPaths, hierarchy)}
				<section class="tt-group">
					<h3 class="tt-group-heading">
						{section.label}
						<span class="tt-count">{section.tasks.length}</span>
					</h3>
					<ul class="tt-task-list">
						{#each rows as row (row.task.path)}
							<TaskRow
								{plugin}
								{viewId}
								task={row.task}
								{schedule}
								active={$activeTaskPath === row.task.path}
								{areaColors}
								{labelColors}
								{onOpen}
								indent={row.depth}
								expandable={row.expandable}
								expanded={row.expanded}
								onExpand={() => toggleExpanded(row.task.path)}
								onContextMenu={onContextMenu}
								onRestore={onRestore}
								{selectable}
								selected={selectedPaths.has(row.task.path)}
								keyboardFocused={focusedTaskPath === row.task.path}
								{onSelect}
								{onPromote}
							/>
						{/each}
					</ul>
				</section>
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

	/* .tt-empty, .tt-group-heading, .tt-count, .tt-btn are plugin-global (styles.css). */

	.tt-empty-cta {
		margin-top: var(--tt-space-3, 12px);
	}

	/* .tt-task-list (incl. row separators) is plugin-global (styles.css). */
</style>
