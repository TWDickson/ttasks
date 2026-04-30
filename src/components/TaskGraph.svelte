<script lang="ts">
	import type { Readable, Writable } from 'svelte/store';
	import type { Task } from '../types';
	import type { TaskGroup } from '../query/types';
	import type TTasksPlugin from '../main';
	import { buildHybridTimeline, buildTaskGraph, resolveConnectedDependencyPaths, type TaskGraphEdge, type TaskGraphNode } from '../store/taskGraph';
	import { PRIORITY_COLORS } from '../constants';
	import { flattenTaskGroups } from './viewAdapters';
	import { formatHumanDate } from './taskDateMeta';

	export let plugin: TTasksPlugin;
	export let groups: Readable<TaskGroup[]>;
	export let statusColors: Record<string, string>;
	export let activeTaskPath: Writable<string | null>;
	export let onOpen: (path: string) => void;
	export let onContextMenu: ((task: Task, event: MouseEvent) => void) | undefined = undefined;

	type GraphMode = 'dependency' | 'overview';
	export let defaultGraphMode: GraphMode = 'dependency';
	const DAY_MS = 24 * 60 * 60 * 1000;
	const HYBRID_ROW_HEIGHT = 34;
	const HYBRID_ROW_GAP = 8;
	const HYBRID_TRACK_PADDING = 8;
	let graphMode: GraphMode = defaultGraphMode;
	let appliedGraphMode: GraphMode = defaultGraphMode;
	let showIndependentInDependency = false;

	$: if (defaultGraphMode !== appliedGraphMode) {
		graphMode = defaultGraphMode;
		appliedGraphMode = defaultGraphMode;
	}

	$: tasks = flattenTaskGroups($groups);
	$: connectedDependencyPaths = resolveConnectedDependencyPaths(tasks);
	$: dependencyGraphTasks = showIndependentInDependency || connectedDependencyPaths.size === 0
		? tasks
		: tasks.filter((task) => task.type === 'project' || connectedDependencyPaths.has(task.path));
	$: hiddenIndependentCount = Math.max(0, tasks.filter((task) => task.type === 'task').length - connectedDependencyPaths.size);

	$: layout = buildTaskGraph(dependencyGraphTasks, {
		nodeWidth: 220,
		nodeHeight: 88,
		horizontalGap: 36,
		verticalGap: 22,
		padding: 20,
	});
	$: nodesByPath = new Map(layout.nodes.map((node) => [node.path, node]));
	$: dependencyEmpty = layout.nodes.length === 0;

	$: hybridTimeline = buildHybridTimeline(tasks);
	$: timelineTaskCount = hybridTimeline.defined.length + hybridTimeline.underdefined.length;
	$: timelineEmpty = timelineTaskCount === 0;
	$: timelineTicks = buildTimelineTicks(hybridTimeline.rangeStart, hybridTimeline.rangeEnd);
	$: definedTrackHeightPx = Math.max(42, hybridTimeline.definedRowCount * HYBRID_ROW_HEIGHT + Math.max(0, hybridTimeline.definedRowCount - 1) * HYBRID_ROW_GAP + HYBRID_TRACK_PADDING * 2);
	$: underdefinedTrackHeightPx = Math.max(42, hybridTimeline.underdefinedRowCount * HYBRID_ROW_HEIGHT + Math.max(0, hybridTimeline.underdefinedRowCount - 1) * HYBRID_ROW_GAP + HYBRID_TRACK_PADDING * 2);
	$: linkCanvasHeightPx = definedTrackHeightPx + underdefinedTrackHeightPx + 78;
	$: definedStatusSummary = summarizeByStatus(hybridTimeline.defined.map((item) => item.task));
	$: underdefinedStatusSummary = summarizeByStatus(hybridTimeline.underdefined.map((item) => item.task));

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

	function toggleIndependentVisibility(): void {
		showIndependentInDependency = !showIndependentInDependency;
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

	function definedBarStyle(item: { leftPercent: number; widthPercent: number; row: number; task: Task }): string {
		const accent = statusColors?.[item.task.status] ?? 'var(--interactive-accent)';
		const rowTop = HYBRID_TRACK_PADDING + item.row * (HYBRID_ROW_HEIGHT + HYBRID_ROW_GAP);
		return `left:${item.leftPercent.toFixed(3)}%;width:${item.widthPercent.toFixed(3)}%;top:${rowTop}px;--tt-bar-accent:${accent};`;
	}

	function underdefinedCardStyle(item: { leftPercent: number; widthPercent: number; row: number; task: Task }): string {
		const accent = statusColors?.[item.task.status] ?? 'var(--interactive-accent)';
		const rowTop = HYBRID_TRACK_PADDING + item.row * (HYBRID_ROW_HEIGHT + HYBRID_ROW_GAP);
		return `left:${item.leftPercent.toFixed(3)}%;width:${item.widthPercent.toFixed(3)}%;top:${rowTop}px;--tt-bar-accent:${accent};`;
	}

	function hybridLinkPath(link: { fromPercent: number; toPercent: number; fromRow: number; toRow: number }): string {
		const startY = HYBRID_TRACK_PADDING + link.fromRow * (HYBRID_ROW_HEIGHT + HYBRID_ROW_GAP) + HYBRID_ROW_HEIGHT;
		const endY = definedTrackHeightPx + 54 + HYBRID_TRACK_PADDING + link.toRow * (HYBRID_ROW_HEIGHT + HYBRID_ROW_GAP);
		const deltaX = Math.abs(link.toPercent - link.fromPercent);
		const controlX = Math.max(4, deltaX * 0.35);
		const controlY = Math.round((startY + endY) / 2);
		const leftControlX = Math.min(100, link.fromPercent + controlX);
		const rightControlX = Math.max(0, link.toPercent - controlX);
		return `M ${link.fromPercent.toFixed(3)} ${startY.toFixed(2)} C ${leftControlX.toFixed(3)} ${controlY.toFixed(2)}, ${rightControlX.toFixed(3)} ${controlY.toFixed(2)}, ${link.toPercent.toFixed(3)} ${endY.toFixed(2)}`;
	}

	function showTaskHoverPreview(event: MouseEvent, task: Task): void {
		plugin.triggerTaskHoverPreview(task.path, event);
	}

	function handleTaskContextMenu(event: MouseEvent, task: Task): void {
		if (!onContextMenu) return;
		event.preventDefault();
		onContextMenu(task, event);
	}

	function summarizeByStatus(items: Task[]): Array<{ status: string; count: number }> {
		const counts = new Map<string, number>();
		for (const item of items) {
			counts.set(item.status, (counts.get(item.status) ?? 0) + 1);
		}
		return [...counts.entries()]
			.map(([status, count]) => ({ status, count }))
			.sort((left, right) => right.count - left.count || left.status.localeCompare(right.status));
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
				{#if hiddenIndependentCount > 0}
					<button type="button" class="tt-graph-pill tt-graph-pill-toggle" on:click={toggleIndependentVisibility}>
						<span class="tt-graph-pill-label">Independent</span>
						<strong>{showIndependentInDependency ? 'Shown' : `${hiddenIndependentCount} hidden`}</strong>
					</button>
				{/if}
			{:else}
				<div class="tt-graph-pill">
					<span class="tt-graph-pill-label">Defined Track</span>
					<strong>{hybridTimeline.defined.length}</strong>
				</div>
				<div class="tt-graph-pill">
					<span class="tt-graph-pill-label">Underdefined Track</span>
					<strong>{hybridTimeline.underdefined.length}</strong>
				</div>
				<div class="tt-graph-pill">
					<span class="tt-graph-pill-label">Total Tasks</span>
					<strong>{timelineTaskCount}</strong>
				</div>
				<div class="tt-graph-pill">
					<span class="tt-graph-pill-label">Flow Links</span>
					<strong>{hybridTimeline.links.length}</strong>
				</div>
			{/if}
		</div>
		<p class="tt-graph-note">
			{#if graphMode === 'dependency'}
				Graph respects current filters. Amber paths have unfinished upstream dependencies. Red rings mark cycles. Independent tasks are hidden by default to keep the dependency map readable.
			{:else}
				Defined track shows dated/inferred windows. Underdefined track shows no-estimate tasks that anchor after resolved upstream work.
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
							<marker id="ttasks-graph-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="userSpaceOnUse">
								<path d="M 0 0 L 8 4 L 0 8 z" fill="currentColor"></path>
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
							{#if node.task.is_complete && node.task.completed}
								<span>Done {formatHumanDate(node.task.completed, formatDate(startOfToday()))}</span>
							{:else if node.task.due_date}
								<span>Due {formatHumanDate(node.task.due_date, formatDate(startOfToday()))}</span>
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

				<div class="tt-hybrid-shell" style={`--tt-link-canvas-height:${linkCanvasHeightPx}px;`}>
					<svg class="tt-hybrid-links" viewBox={`0 0 100 ${linkCanvasHeightPx}`} preserveAspectRatio="none" aria-hidden="true">
						<defs>
							<marker id="ttasks-hybrid-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="strokeWidth">
								<path d="M 0 0 L 8 4 L 0 8 z" fill="currentColor"></path>
							</marker>
						</defs>
						{#each hybridTimeline.links as link (link.id)}
							<path class="tt-hybrid-link" d={hybridLinkPath(link)} marker-end="url(#ttasks-hybrid-arrow)"></path>
						{/each}
					</svg>

					<section class="tt-hybrid-track tt-hybrid-track-defined">
						<div class="tt-hybrid-track-header">
							<h4 class="tt-overview-category-title">Defined Track</h4>
							<div class="tt-track-status-summary">
								{#each definedStatusSummary as summary (summary.status)}
									<span class="tt-track-status-chip" style={`--tt-chip-accent:${statusColors?.[summary.status] ?? 'var(--interactive-accent)'};`}>
										{summary.status} {summary.count}
									</span>
								{/each}
							</div>
						</div>
						<div class="tt-hybrid-track-canvas" style={`height:${definedTrackHeightPx}px;`}>
							{#each hybridTimeline.defined as item (item.path)}
								<button
									type="button"
									class="tt-overview-bar tt-hybrid-defined-item"
									class:is-done={item.task.is_complete}
									class:is-active={$activeTaskPath === item.path}
									class:is-inferred={item.isInferred}
									style={definedBarStyle(item)}
									title={`${item.task.name} | ${formatDate(item.start)} → ${formatDate(item.end)}${item.isInferred ? ' (inferred)' : ''}`}
									on:click={() => onOpen(item.path)}
									on:mouseenter={(event) => showTaskHoverPreview(event, item.task)}
									on:contextmenu={(event) => handleTaskContextMenu(event, item.task)}
								>
									<span>{item.task.name}</span>
								</button>
							{/each}
						</div>
					</section>

					<section class="tt-hybrid-track tt-hybrid-track-underdefined">
						<div class="tt-hybrid-track-header">
							<h4 class="tt-overview-category-title">Underdefined Track</h4>
							<div class="tt-track-status-summary">
								{#each underdefinedStatusSummary as summary (summary.status)}
									<span class="tt-track-status-chip" style={`--tt-chip-accent:${statusColors?.[summary.status] ?? 'var(--interactive-accent)'};`}>
										{summary.status} {summary.count}
									</span>
								{/each}
							</div>
						</div>
						<div class="tt-hybrid-track-canvas" style={`height:${underdefinedTrackHeightPx}px;`}>
							{#each hybridTimeline.underdefined as item (item.path)}
								<button
									type="button"
									class="tt-overview-bar tt-hybrid-underdefined-item"
									class:is-active={$activeTaskPath === item.path}
									style={underdefinedCardStyle(item)}
									title={`${item.task.name} | follows ${item.anchorPath.replace(/\.md$/, '')}`}
									on:click={() => onOpen(item.path)}
									on:mouseenter={(event) => showTaskHoverPreview(event, item.task)}
									on:contextmenu={(event) => handleTaskContextMenu(event, item.task)}
								>
									<span class="tt-hybrid-underdefined-name">{item.task.name}</span>
									<span class="tt-hybrid-underdefined-anchor">after {item.anchorPath.replace(/\.md$/, '').split('/').pop()}</span>
								</button>
							{/each}
						</div>
					</section>
				</div>
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

	.tt-graph-pill-toggle {
		cursor: pointer;
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

	.tt-hybrid-shell {
		position: relative;
		display: flex;
		flex-direction: column;
		gap: 12px;
		padding-bottom: 8px;
	}

	.tt-hybrid-links {
		position: absolute;
		left: 0;
		right: 0;
		top: 30px;
		height: var(--tt-link-canvas-height);
		width: 100%;
		pointer-events: none;
		overflow: visible;
		z-index: 1;
	}

	.tt-hybrid-link {
		fill: none;
		stroke: color-mix(in srgb, var(--color-orange) 78%, var(--text-faint));
		color: color-mix(in srgb, var(--color-orange) 78%, var(--text-faint));
		stroke-width: 2;
		stroke-dasharray: 6 6;
		opacity: 0.78;
	}

	.tt-hybrid-track {
		position: relative;
		display: flex;
		flex-direction: column;
		gap: 6px;
		z-index: 2;
	}

	.tt-hybrid-track-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		flex-wrap: wrap;
	}

	.tt-track-status-summary {
		display: inline-flex;
		flex-wrap: wrap;
		gap: 6px;
	}

	.tt-track-status-chip {
		padding: 2px 7px;
		border-radius: 999px;
		font-size: 0.66rem;
		font-weight: 700;
		letter-spacing: 0.03em;
		color: var(--text-muted);
		background: color-mix(in srgb, var(--tt-chip-accent) 14%, var(--background-primary));
		border: 1px solid color-mix(in srgb, var(--tt-chip-accent) 40%, var(--background-modifier-border));
	}

	.tt-hybrid-track-canvas {
		position: relative;
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

	.tt-hybrid-underdefined-item {
		border-style: dashed;
		height: 28px;
		padding: 3px 8px;
		align-items: flex-start;
		flex-direction: column;
		gap: 1px;
	}

	.tt-hybrid-underdefined-name {
		line-height: 1.05;
	}

	.tt-hybrid-underdefined-anchor {
		font-size: 0.62rem;
		font-weight: 600;
		color: var(--text-faint);
		line-height: 1.05;
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

	.tt-overview-category-title {
		margin: 0;
		font-size: 0.78rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--text-muted);
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
		stroke-width: 1.75;
		color: color-mix(in srgb, var(--text-faint) 72%, transparent);
		opacity: 0.78;
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
		line-height: 1.2;
		max-height: 2.4em;
		display: -webkit-box;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 2;
		overflow: hidden;
		text-overflow: ellipsis;
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

		.tt-overview-category-title {
			font-size: 0.72rem;
		}

		.tt-hybrid-track-header {
			align-items: flex-start;
			gap: 5px;
		}

		.tt-track-status-summary {
			max-width: 100%;
			overflow-x: auto;
			padding-bottom: 2px;
			-webkit-overflow-scrolling: touch;
		}

		.tt-track-status-chip {
			font-size: 0.62rem;
			white-space: nowrap;
		}

		.tt-hybrid-track-canvas {
			border-radius: var(--radius-s, 6px);
		}

		.tt-overview-bar {
			font-size: 0.68rem;
			padding-inline: 6px;
		}

		.tt-hybrid-underdefined-item {
			height: 24px;
			padding: 2px 6px;
		}

		.tt-hybrid-underdefined-anchor {
			display: none;
		}

	}
</style>