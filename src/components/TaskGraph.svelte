<script lang="ts">
	import type { Readable, Writable } from 'svelte/store';
	import type { Task } from '../types';
	import type TTasksPlugin from '../main';
	import { buildTaskGraph, resolveTaskDates, type TaskGraphEdge, type TaskGraphNode } from '../store/taskGraph';


	export let plugin: TTasksPlugin;
	export let tasks: Readable<Task[]>;
	export let statusColors: Record<string, string>;
	export let activeTaskPath: Writable<string | null>;
	export let onOpen: (path: string) => void;
	export let onContextMenu: ((task: Task, event: MouseEvent) => void) | undefined = undefined;

	type GraphMode = 'dependency' | 'overview';
	type TimelineItem = {
		task: Task;
		projectName: string;
		categoryName: string;
		start: Date;
		end: Date;
		leftPercent: number;
		widthPercent: number;
		isLate: boolean;
		isInferred: boolean;
	};
	type TimelineLane = { projectName: string; items: TimelineItem[] };
	type TimelineCategory = { categoryName: string; lanes: TimelineLane[] };

	const DAY_MS = 24 * 60 * 60 * 1000;
	const PRIORITY_COLORS: Record<string, string> = {
		High: 'var(--color-red)',
		Medium: 'var(--color-orange)',
		Low: 'var(--color-blue)',
		None: 'var(--text-faint)',
	};

	let graphMode: GraphMode = 'dependency';

	$: layout = buildTaskGraph($tasks, {});
	$: nodesByPath = new Map(layout.nodes.map((node) => [node.path, node]));
	$: dependencyEmpty = layout.nodes.length === 0;

	$: projectByPath = new Map($tasks.filter((task) => task.type === 'project').map((task) => [task.path, task]));
	$: timelineRows = buildTimelineRows($tasks, projectByPath);
	$: timelineCategoryCount = timelineRows.length;
	$: timelineLaneCount = timelineRows.reduce((count, group) => count + group.lanes.length, 0);
	$: timelineTaskCount = timelineRows.reduce((count, group) => count + group.lanes.reduce((inner, lane) => inner + lane.items.length, 0), 0);
	$: timelineEmpty = timelineTaskCount === 0;
	$: timelineBounds = getTimelineBounds(timelineRows);
	$: timelineTicks = buildTimelineTicks(timelineBounds.start, timelineBounds.end);

	function edgePath(edge: TaskGraphEdge): string {
		const from = nodesByPath.get(edge.from);
		const to = nodesByPath.get(edge.to);
		if (!from || !to) return '';

		const startX = from.x + from.width;
		const startY = from.y + from.height / 2;
		const endX = to.x;
		const endY = to.y + to.height / 2;
		const deltaX = endX - startX;
		const curve = Math.max(42, Math.abs(deltaX) * 0.45);

		if (deltaX >= 0) {
			return `M ${startX} ${startY} C ${startX + curve} ${startY}, ${endX - curve} ${endY}, ${endX} ${endY}`;
		}

		const midY = Math.min(startY, endY) - 48;
		return `M ${startX} ${startY} C ${startX + 64} ${startY}, ${startX + 64} ${midY}, ${startX + 22} ${midY} S ${endX - 64} ${midY}, ${endX} ${endY}`;
	}

	function nodeStyle(node: TaskGraphNode): string {
		const accent = statusColors?.[node.task.status] ?? 'var(--interactive-accent)';
		return `left:${node.x}px;top:${node.y}px;width:${node.width}px;height:${node.height}px;--tt-node-accent:${accent};--tt-priority-accent:${PRIORITY_COLORS[node.task.priority] ?? PRIORITY_COLORS.None};`;
	}

	function subtitle(node: TaskGraphNode): string {
		if (node.blockedIncomingCount > 0) {
			return `${node.blockedIncomingCount} open dependency${node.blockedIncomingCount === 1 ? '' : 'ies'}`;
		}
		if (node.incomingCount > 0) {
			return `${node.incomingCount} dependency${node.incomingCount === 1 ? '' : 'ies'}`;
		}
		if (node.outgoingCount > 0) {
			return `blocks ${node.outgoingCount} task${node.outgoingCount === 1 ? '' : 's'}`;
		}
		return 'independent';
	}

	function normalizeTaskPath(pathLike: string | null | undefined): string | null {
		if (!pathLike) return null;
		const clean = pathLike.trim();
		if (!clean) return null;
		return clean.endsWith('.md') ? clean : `${clean}.md`;
	}

	function parseDate(value: string | null | undefined): Date | null {
		if (!value) return null;
		if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
		const parsed = new Date(`${value}T00:00:00`);
		if (Number.isNaN(parsed.getTime())) return null;
		return parsed;
	}

	function addDays(date: Date, days: number): Date {
		const next = new Date(date.getTime());
		next.setDate(next.getDate() + days);
		return next;
	}

	function startOfToday(): Date {
		const today = new Date();
		today.setHours(0, 0, 0, 0);
		return today;
	}

	function diffDays(start: Date, end: Date): number {
		return Math.round((end.getTime() - start.getTime()) / DAY_MS);
	}

	function formatDate(date: Date): string {
		return date.toISOString().slice(0, 10);
	}

	function timelineBarStyle(item: TimelineItem): string {
		const accent = statusColors?.[item.task.status] ?? 'var(--interactive-accent)';
		return `left:${item.leftPercent.toFixed(3)}%;width:${item.widthPercent.toFixed(3)}%;--tt-bar-accent:${accent};`;
	}

	function showTaskHoverPreview(event: MouseEvent, task: Task): void {
		plugin.triggerTaskHoverPreview(task.path, event);
	}

	function handleTaskContextMenu(event: MouseEvent, task: Task): void {
		if (!onContextMenu) return;
		event.preventDefault();
		onContextMenu(task, event);
	}

	function buildTimelineRows(allTasks: Task[], projectMap: Map<string, Task>): TimelineCategory[] {
		const today = startOfToday();
		// Resolve dates for all tasks via topological sort over the dependency
		// graph. This handles arbitrary-depth chains: task C depends on B which
		// depends on A — if A has a due date, B and C get inferred positions.
		const resolvedDates = resolveTaskDates(allTasks);
		const groups = new Map<string, Map<string, TimelineItem[]>>();

		for (const task of allTasks) {
			if (task.type !== 'task') continue;
			const dates = resolvedDates.get(task.path);
			if (!dates) continue; // no resolvable dates, or task is in a cycle

			const { start, end, isInferred } = dates;
			const categoryName = task.category?.trim() || 'Uncategorized';
			const projectPath = normalizeTaskPath(task.parent_task);
			const projectName = projectPath ? (projectMap.get(projectPath)?.name ?? projectPath.split('/').pop()?.replace(/\.md$/, '') ?? 'Unknown Project') : 'No Project';

			if (!groups.has(categoryName)) groups.set(categoryName, new Map<string, TimelineItem[]>());
			const lanes = groups.get(categoryName)!;
			if (!lanes.has(projectName)) lanes.set(projectName, []);
			lanes.get(projectName)!.push({
				task,
				projectName,
				categoryName,
				start,
				end,
				leftPercent: 0,
				widthPercent: 0,
				isLate: !!task.due_date && parseDate(task.due_date) !== null && parseDate(task.due_date)!.getTime() < today.getTime() && !task.is_complete,
				isInferred,
			});
		}

		const flattened = [...groups.entries()]
			.sort((left, right) => left[0].localeCompare(right[0]))
			.map(([categoryName, lanes]) => ({
				categoryName,
				lanes: [...lanes.entries()]
					.sort((left, right) => left[0].localeCompare(right[0]))
					.map(([projectName, items]) => ({ projectName, items: [...items].sort((left, right) => left.start.getTime() - right.start.getTime() || left.task.name.localeCompare(right.task.name)) })),
			}));

		if (flattened.length === 0) return [];

		const starts = flattened.flatMap((category) => category.lanes.flatMap((lane) => lane.items.map((item) => item.start.getTime())));
		const ends = flattened.flatMap((category) => category.lanes.flatMap((lane) => lane.items.map((item) => item.end.getTime())));
		const rangeStart = new Date(Math.min(...starts));
		const rangeEnd = new Date(Math.max(...ends));
		const spanDays = Math.max(1, diffDays(rangeStart, rangeEnd) + 1);

		for (const category of flattened) {
			for (const lane of category.lanes) {
				for (const item of lane.items) {
					const leftDays = diffDays(rangeStart, item.start);
					const durationDays = Math.max(1, diffDays(item.start, item.end) + 1);
					item.leftPercent = (leftDays / spanDays) * 100;
					item.widthPercent = Math.max(2.4, (durationDays / spanDays) * 100);
				}
			}
		}

		return flattened;
	}

	function getTimelineBounds(rows: TimelineCategory[]): { start: Date; end: Date } {
		if (rows.length === 0) {
			const base = startOfToday();
			return { start: addDays(base, -7), end: addDays(base, 21) };
		}

		const starts = rows.flatMap((category) => category.lanes.flatMap((lane) => lane.items.map((item) => item.start.getTime())));
		const ends = rows.flatMap((category) => category.lanes.flatMap((lane) => lane.items.map((item) => item.end.getTime())));
		return { start: new Date(Math.min(...starts)), end: new Date(Math.max(...ends)) };
	}

	function buildTimelineTicks(start: Date, end: Date): Array<{ date: Date; label: string; leftPercent: number }> {
		const span = Math.max(1, diffDays(start, end) + 1);
		const steps = 5;
		const ticks: Array<{ date: Date; label: string; leftPercent: number }> = [];
		for (let i = 0; i <= steps; i++) {
			const offset = Math.round(((span - 1) * i) / steps);
			const tickDate = addDays(start, offset);
			ticks.push({
				date: tickDate,
				label: formatDate(tickDate),
				leftPercent: (offset / span) * 100,
			});
		}
		return ticks;
	}
</script>

<div class="tt-graph-shell">
	<div class="tt-graph-toolbar">
		<div class="tt-graph-mode-toggle" role="tablist" aria-label="Graph mode">
			<button type="button" class="tt-mode-btn" class:is-active={graphMode === 'dependency'} on:click={() => graphMode = 'dependency'}>Dependency</button>
			<button type="button" class="tt-mode-btn" class:is-active={graphMode === 'overview'} on:click={() => graphMode = 'overview'}>Overview</button>
		</div>

		<div class="tt-graph-summary">
			{#if graphMode === 'dependency'}
				<div class="tt-graph-pill">
					<span class="tt-graph-pill-label">Tasks</span>
					<strong>{layout.nodes.length}</strong>
				</div>
				<div class="tt-graph-pill">
					<span class="tt-graph-pill-label">Links</span>
					<strong>{layout.edges.length}</strong>
				</div>
				<div class="tt-graph-pill" class:tt-graph-pill-alert={layout.blockedEdgeCount > 0}>
					<span class="tt-graph-pill-label">Blocked chains</span>
					<strong>{layout.blockedEdgeCount}</strong>
				</div>
				<div class="tt-graph-pill" class:tt-graph-pill-alert={layout.cycleCount > 0}>
					<span class="tt-graph-pill-label">Cycle nodes</span>
					<strong>{layout.cycleCount}</strong>
				</div>
			{:else}
				<div class="tt-graph-pill">
					<span class="tt-graph-pill-label">Categories</span>
					<strong>{timelineCategoryCount}</strong>
				</div>
				<div class="tt-graph-pill">
					<span class="tt-graph-pill-label">Project Lanes</span>
					<strong>{timelineLaneCount}</strong>
				</div>
				<div class="tt-graph-pill">
					<span class="tt-graph-pill-label">Scheduled Tasks</span>
					<strong>{timelineTaskCount}</strong>
				</div>
				<div class="tt-graph-pill">
					<span class="tt-graph-pill-label">Range</span>
					<strong>{formatDate(timelineBounds.start)} - {formatDate(timelineBounds.end)}</strong>
				</div>
			{/if}
		</div>
		<p class="tt-graph-note">
			{#if graphMode === 'dependency'}
				Graph respects current filters. Amber paths have unfinished upstream dependencies. Red rings mark cycles.
			{:else}
				Overview is grouped by Category then Project. Bars represent start-to-due windows for project items.
			{/if}
		</p>
	</div>

	{#if graphMode === 'dependency'}
		{#if dependencyEmpty}
			<div class="tt-graph-empty">No dependency relationships found. Add depends_on links between tasks to see the graph.</div>
		{:else}
			<div class="tt-graph-scroll">
				<div class="tt-graph-stage" style={`width:${layout.width}px;height:${layout.height}px;`}>
					<svg class="tt-graph-svg" viewBox={`0 0 ${layout.width} ${layout.height}`} preserveAspectRatio="xMinYMin meet" aria-hidden="true">
						<defs>
							<marker id="ttasks-graph-arrow" markerWidth="10" markerHeight="10" refX="9" refY="5" orient="auto" markerUnits="strokeWidth">
								<path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor"></path>
							</marker>
						</defs>
						{#each layout.edges as edge (edge.id)}
							{#if edgePath(edge)}
								<path
									class="tt-graph-edge"
									class:is-cycle={edge.isCycle}
									class:is-blocked={edge.isBlockedChain}
									d={edgePath(edge)}
									marker-end="url(#ttasks-graph-arrow)"
								></path>
							{/if}
						{/each}
					</svg>

					{#each layout.nodes as node (node.path)}
						<button
							type="button"
							class="tt-graph-node"
							class:is-active={$activeTaskPath === node.path}
							class:is-cycle={node.isCycle}
							class:is-blocked={node.isBlockedChain}
							style={nodeStyle(node)}
							on:click={() => onOpen(node.path)}
							on:mouseenter={(event) => showTaskHoverPreview(event, node.task)}
							on:contextmenu={(event) => handleTaskContextMenu(event, node.task)}
						>
							<div class="tt-graph-node-top">
								<span class="tt-graph-priority-dot"></span>
								<span class="tt-graph-status">{node.task.status}</span>
							</div>
							<div class="tt-graph-name">{node.task.name}</div>
							<div class="tt-graph-meta">
								<span>{subtitle(node)}</span>
								{#if node.task.due_date}
									<span>Due {node.task.due_date}</span>
								{/if}
							</div>
						</button>
					{/each}
				</div>
			</div>
		{/if}
	{:else}
		{#if timelineEmpty}
			<div class="tt-graph-empty">No scheduled tasks. Add a start or due date, or chain tasks with dependencies and estimated durations to see them here.</div>
		{:else}
			<div class="tt-overview-scroll">
				<div class="tt-overview-axis">
					{#each timelineTicks as tick}
						<div class="tt-overview-tick" style={`left:${tick.leftPercent.toFixed(3)}%;`}>
							<span>{tick.label}</span>
						</div>
					{/each}
				</div>

				{#each timelineRows as category}
					<section class="tt-overview-category">
						<h4 class="tt-overview-category-title">{category.categoryName}</h4>
						{#each category.lanes as lane}
							<div class="tt-overview-lane">
								<div class="tt-overview-lane-label">{lane.projectName}</div>
								<div class="tt-overview-lane-track">
									{#each lane.items as item (item.task.path)}
										<button
											type="button"
											class="tt-overview-bar"
											class:is-late={item.isLate}
											class:is-done={item.task.is_complete}
											class:is-active={$activeTaskPath === item.task.path}
											class:is-inferred={item.isInferred}
											style={timelineBarStyle(item)}
											title={`${item.task.name} | ${formatDate(item.start)} → ${formatDate(item.end)}${item.isInferred ? ' (inferred)' : ''}`}
											on:click={() => onOpen(item.task.path)}
											on:mouseenter={(event) => showTaskHoverPreview(event, item.task)}
											on:contextmenu={(event) => handleTaskContextMenu(event, item.task)}
										>
											<span>{item.task.name}</span>
										</button>
									{/each}
								</div>
							</div>
						{/each}
					</section>
				{/each}
			</div>
		{/if}
	{/if}
</div>

<style>
	.tt-graph-shell {
		display: flex;
		flex-direction: column;
		height: 100%;
		min-height: 0;
	}

	.tt-graph-toolbar {
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding: 12px 14px 4px;
	}

	.tt-graph-mode-toggle {
		display: inline-flex;
		gap: 6px;
		flex-wrap: wrap;
	}

	.tt-mode-btn {
		border: 1px solid var(--background-modifier-border);
		background: var(--background-secondary);
		color: var(--text-muted);
		border-radius: 999px;
		padding: 5px 11px;
		font-size: 0.78rem;
		font-weight: 700;
		cursor: pointer;
	}

	.tt-mode-btn.is-active {
		background: color-mix(in srgb, var(--interactive-accent) 22%, var(--background-primary));
		border-color: color-mix(in srgb, var(--interactive-accent) 48%, var(--background-modifier-border));
		color: var(--interactive-accent);
	}

	.tt-graph-summary {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}

	.tt-graph-pill {
		display: inline-flex;
		align-items: baseline;
		gap: 8px;
		padding: 6px 10px;
		border-radius: 999px;
		background: var(--background-secondary);
		border: 1px solid var(--background-modifier-border);
		color: var(--text-muted);
		font-size: 0.8rem;
	}

	.tt-graph-pill-label {
		text-transform: uppercase;
		letter-spacing: 0.05em;
		font-size: 0.68rem;
		font-weight: 700;
	}

	.tt-graph-pill strong {
		color: var(--text-normal);
		font-size: 0.94rem;
	}

	.tt-graph-pill-alert {
		border-color: color-mix(in srgb, var(--color-orange) 45%, var(--background-modifier-border));
		background: color-mix(in srgb, var(--color-orange) 12%, var(--background-primary));
	}

	.tt-graph-note {
		margin: 0;
		color: var(--text-muted);
		font-size: 0.8rem;
	}

	.tt-graph-scroll {
		flex: 1;
		min-height: 0;
		overflow: auto;
		padding: 8px 12px 16px;
	}

	.tt-overview-scroll {
		flex: 1;
		min-height: 0;
		overflow: auto;
		padding: 10px 12px 16px;
		display: flex;
		flex-direction: column;
		gap: 14px;
	}

	.tt-overview-axis {
		position: sticky;
		top: 0;
		height: 26px;
		background: linear-gradient(180deg, var(--background-primary), color-mix(in srgb, var(--background-primary) 82%, transparent));
		border-bottom: 1px solid var(--background-modifier-border);
		z-index: 2;
	}

	.tt-overview-tick {
		position: absolute;
		top: 3px;
		transform: translateX(-50%);
		font-size: 0.68rem;
		color: var(--text-faint);
		white-space: nowrap;
	}

	.tt-overview-tick::after {
		content: '';
		position: absolute;
		left: 50%;
		top: 16px;
		width: 1px;
		height: 10px;
		background: var(--background-modifier-border);
		transform: translateX(-50%);
	}

	.tt-overview-category {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.tt-overview-category-title {
		margin: 0;
		font-size: 0.78rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--text-muted);
	}

	.tt-overview-lane {
		display: grid;
		grid-template-columns: minmax(140px, 220px) 1fr;
		gap: 10px;
		align-items: center;
	}

	.tt-overview-lane-label {
		font-size: 0.78rem;
		font-weight: 600;
		color: var(--text-normal);
	}

	.tt-overview-lane-track {
		position: relative;
		height: 34px;
		border-radius: var(--radius-m, 8px);
		border: var(--border-width, 1px) solid var(--background-modifier-border);
		background: repeating-linear-gradient(
			90deg,
			color-mix(in srgb, var(--background-secondary) 76%, transparent),
			color-mix(in srgb, var(--background-secondary) 76%, transparent) 24px,
			var(--background-primary) 24px,
			var(--background-primary) 48px
		);
		overflow: hidden;
	}

	.tt-overview-bar {
		position: absolute;
		top: 4px;
		height: 24px;
		padding: 0 8px;
		border-radius: var(--radius-s, 4px);
		border: var(--border-width, 1px) solid color-mix(in srgb, var(--tt-bar-accent) 52%, var(--background-modifier-border));
		background: linear-gradient(180deg, color-mix(in srgb, var(--tt-bar-accent) 18%, var(--background-primary)), color-mix(in srgb, var(--tt-bar-accent) 10%, var(--background-secondary)));
		color: var(--text-normal);
		font-size: 0.73rem;
		font-weight: 600;
		display: flex;
		align-items: center;
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
		cursor: pointer;
	}

	.tt-overview-bar.is-late {
		border-color: color-mix(in srgb, var(--color-red) 58%, var(--background-modifier-border));
		box-shadow: 0 0 0 1px color-mix(in srgb, var(--color-red) 32%, transparent) inset;
	}

	.tt-overview-bar.is-done {
		opacity: 0.62;
	}

	.tt-overview-bar.is-inferred {
		border-style: dashed;
		opacity: 0.82;
	}

	.tt-overview-bar.is-active {
		box-shadow: 0 0 0 2px color-mix(in srgb, var(--interactive-accent) 35%, transparent);
	}

	.tt-graph-stage {
		position: relative;
		min-width: 100%;
	}

	.tt-graph-svg {
		position: absolute;
		inset: 0;
		overflow: visible;
	}

	.tt-graph-edge {
		fill: none;
		stroke: color-mix(in srgb, var(--text-faint) 72%, transparent);
		stroke-width: 2;
		color: color-mix(in srgb, var(--text-faint) 72%, transparent);
		opacity: 0.9;
	}

	.tt-graph-edge.is-blocked {
		stroke: var(--color-orange);
		color: var(--color-orange);
		stroke-dasharray: 8 6;
	}

	.tt-graph-edge.is-cycle {
		stroke: var(--color-red);
		color: var(--color-red);
		stroke-width: 2.5;
	}

	.tt-graph-node {
		position: absolute;
		display: flex;
		flex-direction: column;
		justify-content: space-between;
		gap: 8px;
		padding: 12px 14px;
		border-radius: var(--radius-xl, 16px);
		border: var(--border-width, 1px) solid color-mix(in srgb, var(--tt-node-accent) 42%, var(--background-modifier-border));
		background: linear-gradient(180deg, color-mix(in srgb, var(--tt-node-accent) 12%, var(--background-primary)), var(--background-primary));
		box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--background-primary) 72%, transparent), 0 8px 24px rgba(var(--mono-rgb-100), 0.08);
		cursor: pointer;
		text-align: left;
	}

	.tt-graph-node::before {
		content: '';
		position: absolute;
		inset: 0 auto 0 0;
		width: 5px;
		border-radius: var(--radius-xl, 16px) 0 0 var(--radius-xl, 16px);
		background: var(--tt-node-accent);
	}

	.tt-graph-node.is-active {
		box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--interactive-accent) 45%, transparent), 0 0 0 2px color-mix(in srgb, var(--interactive-accent) 28%, transparent), 0 10px 24px rgba(var(--mono-rgb-100), 0.12);
	}

	.tt-graph-node.is-blocked {
		background: linear-gradient(180deg, color-mix(in srgb, var(--color-orange) 12%, var(--background-primary)), var(--background-primary));
	}

	.tt-graph-node.is-cycle {
		box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--color-red) 40%, transparent), 0 0 0 2px color-mix(in srgb, var(--color-red) 18%, transparent), 0 10px 24px rgba(var(--mono-rgb-100), 0.12);
	}

	.tt-graph-node-top {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 0.72rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--text-muted);
		font-weight: 700;
	}

	.tt-graph-priority-dot {
		width: 9px;
		height: 9px;
		border-radius: 999px;
		background: var(--tt-priority-accent);
		flex-shrink: 0;
	}

	.tt-graph-status {
		min-width: 0;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.tt-graph-name {
		font-size: 0.95rem;
		font-weight: 700;
		color: var(--text-normal);
		display: -webkit-box;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 2;
		overflow: hidden;
	}

	.tt-graph-meta {
		display: flex;
		flex-wrap: wrap;
		gap: 6px 10px;
		font-size: 0.76rem;
		color: var(--text-muted);
	}

	.tt-graph-empty {
		margin: 16px 14px;
		padding: 28px 16px;
		border: 1px dashed var(--background-modifier-border);
		border-radius: var(--radius-l, 12px);
		text-align: center;
		color: var(--text-muted);
	}

	@media (max-width: 900px) {
		.tt-graph-toolbar {
			padding-inline: 12px;
		}

		.tt-graph-scroll {
			padding-inline: 8px;
		}

		.tt-overview-scroll {
			padding-inline: 8px;
		}

		.tt-overview-lane {
			grid-template-columns: 1fr;
			gap: 6px;
		}

		.tt-overview-lane-label {
			font-size: 0.73rem;
		}
	}
</style>