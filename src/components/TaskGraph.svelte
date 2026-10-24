<script lang="ts">
	// The graph view's shell (AR-2). It turns `GraphHost` state into props and
	// callbacks for the two mode components: DependencyGraph (`dependency`) and
	// TimelineOverview (`overview`, the Timeline view). It sees the plugin only
	// through `GraphHost` (AR-8), so the rig's mock is type-checked against it.
	import type { Readable, Writable } from 'svelte/store';
	import type { Task } from '../types';
	import type { TaskGroup } from '../query/types';
	import type { GraphHost } from './hosts';
	import { flattenTaskGroups } from './viewAdapters';
	import { splitHolidayCalendar } from '../settings/holidays';
	import { icon } from '../utils/icon';
	import type { BadgePalette } from '../utils/badgePalette';
	import DependencyGraph from './graph/DependencyGraph.svelte';
	import TimelineOverview from './graph/TimelineOverview.svelte';

	export let host: GraphHost;
	export let groups: Readable<TaskGroup[]>;
	/** Resolved area/label/status colours. See utils/badgePalette. */
	export let palette: BadgePalette;
	export let activeTaskPath: Writable<string | null>;
	export let onOpen: (path: string) => void;
	export let onContextMenu: ((task: Task, event: MouseEvent) => void) | undefined = undefined;
	// GP1: fullscreen expand. When `onToggleFullscreen` is set the graph shows a
	// maximize button. The fullscreen instance inside GraphExpandModal leaves this
	// unset — closing is `Modal`'s own close button, Esc, or the phone back
	// gesture, and a second control of ours landed on top of the first.
	export let onToggleFullscreen: (() => void) | undefined = undefined;

	type GraphMode = 'dependency' | 'overview';
	export let defaultGraphMode: GraphMode = 'dependency';

	$: tasks = flattenTaskGroups($groups);

	// Universal working-calendar config (holidays + per-area workweek toggle),
	// threaded into every date resolution so the graph, timeline, and node cards
	// all agree with the list/detail views.
	$: holidayCalendar = splitHolidayCalendar(host.settings.holidays);
	$: calendarConfig = {
		holidays: holidayCalendar.holidays,
		recurringHolidays: holidayCalendar.recurringHolidays,
		areaWorkweek: host.settings.areaWorkweek,
	};

	function showHoverPreview(event: MouseEvent, task: Task): void {
		host.triggerTaskHoverPreview(task.path, event);
	}

	$: contextMenu = onContextMenu
		? (event: MouseEvent, task: Task) => onContextMenu?.(task, event)
		: undefined;


	// New tasks spawned from the graph inherit the source task's grouping.
	function prefillFrom(task: Task) {
		return { parent_task: task.parent_task, area: task.area, labels: task.labels, priority: task.priority };
	}

	function createDependentTask(task: Task): void {
		host.openCreateTask('task', {
			initialDependsOn: [task.path],
			prefill: prefillFrom(task),
		});
	}

	function createBlockerTask(task: Task): void {
		// The new task blocks this one — i.e. this task will depend_on the new task.
		host.openCreateTask('task', {
			initialBlocks: [task.path],
			prefill: prefillFrom(task),
		});
	}

	// A project lane's `+` creates a new task already parented to it.
	function createTaskInProject(projectPath: string): void {
		const project = tasks.find((task) => task.path === projectPath);
		host.openCreateTask('task', {
			prefill: {
				parent_task: projectPath.replace(/\.md$/, ''),
				area: project?.area ?? undefined,
			},
		});
	}
</script>

<div class="tt-graph-shell">
	{#if onToggleFullscreen}
		<button
			type="button"
			class="tt-graph-expand"
			aria-label="Expand graph to full screen"
			on:click={() => onToggleFullscreen?.()}
		>
			<span class="tt-graph-expand-icon" use:icon={'maximize-2'}></span>
		</button>
	{/if}
	{#if defaultGraphMode === 'dependency'}
		<DependencyGraph
			{tasks}
			{palette}
			{activeTaskPath}
			{calendarConfig}
			diagnosticsEnabled={host.settings.graphDiagnosticsEnabled}
			initialHiddenProjects={host.settings.graphHiddenProjects ?? []}
			onHiddenProjectsChange={(paths) => void host.updateSettings({ graphHiddenProjects: paths })}
			{onOpen}
			onHoverPreview={showHoverPreview}
			onContextMenu={contextMenu}
			onCreateDependent={createDependentTask}
			onCreateBlocker={createBlockerTask}
			onCreateInProject={createTaskInProject}
		/>
	{:else}
		<TimelineOverview
			{tasks}
			{palette}
			{activeTaskPath}
			{calendarConfig}
			showCompleted={host.settings.overviewGraphShowCompleted}
			grouping={host.settings.overviewGraphGrouping}
			onShowCompletedChange={(show) => void host.updateSettings({ overviewGraphShowCompleted: show })}
			onGroupingChange={(grouping) => void host.updateSettings({ overviewGraphGrouping: grouping })}
			{onOpen}
			onHoverPreview={showHoverPreview}
			onContextMenu={contextMenu}
		/>
	{/if}
</div>

<style>
	.tt-graph-shell {
		position: relative;
		display: flex;
		flex-direction: column;
		height: 100%;
		min-height: 0;
	}

	/* GP1: expand/collapse toggle, pinned top-right (clear of the toolbar pills),
		present in both dependency and timeline modes. */
	.tt-graph-expand {
		position: absolute;
		top: 8px;
		right: 8px;
		z-index: 5;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 30px;
		height: 30px;
		padding: 0;
		border: 1px solid var(--background-modifier-border);
		border-radius: 8px;
		background: var(--background-secondary);
		color: var(--text-muted);
		cursor: pointer;
		transition: color 120ms ease, background 120ms ease, border-color 120ms ease;
	}

	.tt-graph-expand:hover {
		color: var(--text-normal);
		background: var(--background-modifier-hover);
		border-color: var(--background-modifier-border-hover);
	}

	.tt-graph-expand-icon {
		display: inline-flex;
		width: 16px;
		height: 16px;
	}

	/* Coarse-pointer (touch) gets the P4 minimum hit area. */
	@media (pointer: coarse) {
		.tt-graph-expand {
			width: 44px;
			height: 44px;
			border-radius: 10px;
		}
	}
</style>
