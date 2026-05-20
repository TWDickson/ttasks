<script lang="ts">
	import { onMount } from 'svelte';
	import type { Readable, Writable } from 'svelte/store';
	import type { Task } from '../types';
	import type { TaskGroup } from '../query/types';
	import type TTasksPlugin from '../main';
	import { buildHybridTimeline, buildTaskGraph, resolveConnectedDependencyPaths, type HybridTimelineGrouping, type TaskGraphEdge, type TaskGraphNode } from '../store/taskGraph';
	import { computeEdgePath, sortIncomingEdges, sortOutgoingEdges } from '../store/graphEdgeRouting';
	import { computeGraphQualityMetrics } from '../store/graphQualityMetrics';
	import { buildLaneHeaders } from '../store/graphLaneLayout';
	import { PRIORITY_COLORS } from '../constants';
	import { flattenTaskGroups } from './viewAdapters';
	import { formatHumanDate } from './taskDateMeta';
	import {
		buildTimelineNonWorkingBands,
		buildTimelineTicks,
		collectProjectHolidayDates,
		diffDays,
		formatDateISO,
		intersectsViewport,
		normalizeTimelineRange,
		percentAtDate,
		startOfToday,
	} from './graphTimeline';
	import { computeDependencyLaneWidth, groupingLabel, laneHeaderClass } from './graphPresentation';

	export let plugin: TTasksPlugin;
	export let groups: Readable<TaskGroup[]>;
	export let statusColors: Record<string, string>;
	export let activeTaskPath: Writable<string | null>;
	export let onOpen: (path: string) => void;
	export let onContextMenu: ((task: Task, event: MouseEvent) => void) | undefined = undefined;

	type GraphMode = 'dependency' | 'overview';
	export let defaultGraphMode: GraphMode = 'dependency';
	const DEPENDENCY_NODE_HEIGHT = 122;
	const DEPENDENCY_ROW_GAP = 12;
	const DEPENDENCY_LANE_GUTTER = 152;
	const DEPENDENCY_LANE_MIN_WIDTH = 112;
	const DEPENDENCY_LANE_MAX_WIDTH = 148;
	const DEPENDENCY_LANE_COMPACT_HEIGHT = 132;
	const DEPENDENCY_LANE_ROTATE_LABEL_LENGTH = 14;
	const DEPENDENCY_GRAPH_PADDING = DEPENDENCY_LANE_GUTTER + 20;
	const OVERVIEW_PIXELS_PER_DAY = 54;
	const HYBRID_ROW_HEIGHT = 34;
	const HYBRID_ROW_GAP = 8;
	const HYBRID_TRACK_PADDING = 8;
	let graphMode: GraphMode = defaultGraphMode;
	let appliedGraphMode: GraphMode = defaultGraphMode;
	let lastGraphMode: GraphMode = defaultGraphMode;
	let showIndependentInDependency = false;
	let lastGraphDiagnosticsKey = '';
	let dependencyScrollEl: HTMLDivElement | null = null;
	let dependencyViewportWidth = 0;
	let dependencyScrollLeft = 0;
	let overviewScrollEl: HTMLDivElement | null = null;
	let overviewViewportWidth = 0;
	let overviewScrollLeft = 0;
	let shouldAutoFocusOverview = defaultGraphMode === 'overview';
	let showCompletedInOverview = false;
	let overviewGrouping: HybridTimelineGrouping = 'project';
	let overviewPrefsHydrated = false;

	$: if (defaultGraphMode !== appliedGraphMode) {
		graphMode = defaultGraphMode;
		appliedGraphMode = defaultGraphMode;
	}

	$: tasks = flattenTaskGroups($groups);
	$: connectedDependencyPaths = resolveConnectedDependencyPaths(tasks);
	$: dependencyGraphTasks = (() => {
		const projectRecords = tasks.filter((task) => task.type === 'project');
		const dependencyTasks = (showIndependentInDependency || connectedDependencyPaths.size === 0
			? tasks.filter((task) => task.type === 'task')
			: tasks.filter((task) => {
				if (task.type !== 'task') return false;
				// Always include project-assigned tasks (part of a project lane)
				if (task.parent_task) return true;
				// For unassigned/independent tasks, only include if they have dependencies
				return connectedDependencyPaths.has(task.path);
			}));

		return [...projectRecords, ...dependencyTasks];
	})();
	$: hiddenIndependentCount = Math.max(
		0,
		tasks
			.filter(
				(task) =>
					task.type === 'task' &&
					!task.parent_task &&
					!connectedDependencyPaths.has(task.path),
			)
			.length,
	);

	$: layout = buildTaskGraph(dependencyGraphTasks, {
		nodeWidth: 226,
		nodeHeight: DEPENDENCY_NODE_HEIGHT,
		horizontalGap: 52,
		verticalGap: DEPENDENCY_ROW_GAP,
		padding: DEPENDENCY_GRAPH_PADDING,
	});
	$: dependencyScale = dependencyViewportWidth > 0 && layout.width > 0
		? Math.min(1, dependencyViewportWidth / layout.width)
		: 1;
	$: fittedDependencyWidth = Math.max(1, Math.round(layout.width * dependencyScale));
	$: fittedDependencyHeight = Math.max(1, Math.round(layout.height * dependencyScale));
	$: dependencyLaneStickyOffset = dependencyScale > 0 ? dependencyScrollLeft / dependencyScale : 0;
	$: nodesByPath = new Map(layout.nodes.map((node) => [node.path, node]));
	$: dependencyLaneHeaders = buildLaneHeaders(
		layout.lanes.map((lane) => ({
			key: lane.key ?? '__unassigned__',
			label: lane.label,
			startRow: lane.startRow,
			endRow: lane.endRow,
			count: lane.taskPaths.length,
		})),
		DEPENDENCY_NODE_HEIGHT,
		DEPENDENCY_ROW_GAP,
		DEPENDENCY_GRAPH_PADDING,
	);
	$: dependencyLaneWidth = computeDependencyLaneWidth(
		dependencyLaneHeaders,
		DEPENDENCY_LANE_MIN_WIDTH,
		DEPENDENCY_LANE_MAX_WIDTH,
	);
	$: dependencyEmpty = layout.nodes.length === 0;

	$: {
		if (!plugin.settings.graphDiagnosticsEnabled || graphMode !== 'dependency') {
			lastGraphDiagnosticsKey = '';
		} else {
			const edgeKey = layout.edges
				.map((edge) => `${edge.id}:${edge.from}:${edge.to}:${edge.isParentEdge ? 'p' : 'd'}`)
				.sort()
				.join('|');
			const nodeKey = layout.nodes
				.map((node) => `${node.path}:${node.row}:${node.column}:${node.laneKey ?? '__u__'}`)
				.sort()
				.join('|');
			const layoutKey = `${layout.nodes.length}:${layout.edges.length}:${layout.lanes.length}:${nodeKey}:${edgeKey}`;

			if (layoutKey !== lastGraphDiagnosticsKey) {
				lastGraphDiagnosticsKey = layoutKey;
				const metrics = computeGraphQualityMetrics(layout.nodes, layout.edges, layout.lanes);
				console.info('[TTasks][GraphDiagnostics]', {
					view: 'dependency',
					timestamp: new Date().toISOString(),
					metrics,
				});
			}
		}
	}

	// For each node spread outgoing and incoming edge attachment points so
	// multiple edges don't draw on top of each other.
	$: edgeYOffsets = (() => {
		const offsets = new Map<string, { startY: number; endY: number }>();
		for (const node of layout.nodes) {
			const out = sortOutgoingEdges(
				node,
				layout.edges.filter((e) => e.from === node.path),
				nodesByPath,
			);
			const nOut = out.length;
			for (const [i, edge] of out.entries()) {
				const startY = node.y + node.height * (i + 1) / (nOut + 1);
				const existing = offsets.get(edge.id);
				offsets.set(edge.id, { startY, endY: existing?.endY ?? (node.y + node.height / 2) });
			}
		}
		for (const node of layout.nodes) {
			const inc = sortIncomingEdges(
				node,
				layout.edges.filter((e) => e.to === node.path),
				nodesByPath,
			);
			const nInc = inc.length;
			for (const [i, edge] of inc.entries()) {
				const endY = node.y + node.height * (i + 1) / (nInc + 1);
				const existing = offsets.get(edge.id);
				offsets.set(edge.id, { startY: existing?.startY ?? (node.y + node.height / 2), endY });
			}
		}
		return offsets;
	})();

	onMount(() => {
		showCompletedInOverview = plugin.settings.overviewGraphShowCompleted;
		overviewGrouping = plugin.settings.overviewGraphGrouping;
		overviewPrefsHydrated = true;

		const updateViewport = () => {
			dependencyViewportWidth = dependencyScrollEl?.clientWidth ?? 0;
			dependencyScrollLeft = dependencyScrollEl?.scrollLeft ?? 0;
			overviewViewportWidth = overviewScrollEl?.clientWidth ?? 0;
		};

		updateViewport();

		let observer: ResizeObserver | null = null;
		if (dependencyScrollEl && typeof ResizeObserver !== 'undefined') {
			observer = new ResizeObserver(() => updateViewport());
			observer.observe(dependencyScrollEl);
			if (overviewScrollEl) observer.observe(overviewScrollEl);
		}

		window.addEventListener('resize', updateViewport);
		return () => {
			window.removeEventListener('resize', updateViewport);
			observer?.disconnect();
		};
	});

	$: if (overviewPrefsHydrated && plugin.settings.overviewGraphShowCompleted !== showCompletedInOverview) {
		plugin.settings.overviewGraphShowCompleted = showCompletedInOverview;
		void plugin.saveSettings();
	}

	$: if (overviewPrefsHydrated && plugin.settings.overviewGraphGrouping !== overviewGrouping) {
		plugin.settings.overviewGraphGrouping = overviewGrouping;
		void plugin.saveSettings();
	}

	$: overviewTasks = showCompletedInOverview
		? tasks
		: tasks.filter((task) => task.type !== 'task' || !task.is_complete);
	$: hybridTimeline = buildHybridTimeline(overviewTasks, { grouping: overviewGrouping });
	$: normalizedOverviewRange = normalizeTimelineRange(hybridTimeline.rangeStart, hybridTimeline.rangeEnd);
	$: timelineTaskCount = hybridTimeline.defined.length + hybridTimeline.underdefined.length;
	$: hiddenCompletedCount = Math.max(0, tasks.filter((task) => task.type === 'task' && task.is_complete).length - overviewTasks.filter((task) => task.type === 'task' && task.is_complete).length);
	$: timelineEmpty = timelineTaskCount === 0;
	$: overviewSpanDays = Math.max(1, diffDays(normalizedOverviewRange.start, normalizedOverviewRange.end) + 1);
	$: overviewCanvasWidth = Math.max(overviewViewportWidth, Math.round(overviewSpanDays * OVERVIEW_PIXELS_PER_DAY));
	$: todayPercent = percentAtDate(startOfToday(), normalizedOverviewRange.start, normalizedOverviewRange.end);
	$: visibleStartPercent = overviewCanvasWidth > 0 ? (overviewScrollLeft / overviewCanvasWidth) * 100 : 0;
	$: visibleEndPercent = overviewCanvasWidth > 0 ? ((overviewScrollLeft + overviewViewportWidth) / overviewCanvasWidth) * 100 : 100;
	$: virtualStartPercent = Math.max(0, visibleStartPercent - 8);
	$: virtualEndPercent = Math.min(100, visibleEndPercent + 8);
	$: visibleDefined = hybridTimeline.defined.filter((item) => intersectsViewport(item.leftPercent, item.widthPercent, virtualStartPercent, virtualEndPercent));
	$: visibleUnderdefined = hybridTimeline.underdefined.filter((item) => intersectsViewport(item.leftPercent, item.widthPercent, virtualStartPercent, virtualEndPercent));
	$: visibleLinks = hybridTimeline.links.filter((link) => intersectsViewport(Math.min(link.fromPercent, link.toPercent), Math.abs(link.toPercent - link.fromPercent), virtualStartPercent, virtualEndPercent));
	$: timelineTicks = buildTimelineTicks(normalizedOverviewRange.start, normalizedOverviewRange.end);
	$: overviewHolidayDates = collectProjectHolidayDates(overviewTasks);
	$: nonWorkingBands = buildTimelineNonWorkingBands(normalizedOverviewRange.start, normalizedOverviewRange.end, overviewHolidayDates);
	$: definedTrackHeightPx = Math.max(42, hybridTimeline.definedRowCount * HYBRID_ROW_HEIGHT + Math.max(0, hybridTimeline.definedRowCount - 1) * HYBRID_ROW_GAP + HYBRID_TRACK_PADDING * 2);
	$: underdefinedTrackHeightPx = Math.max(42, hybridTimeline.underdefinedRowCount * HYBRID_ROW_HEIGHT + Math.max(0, hybridTimeline.underdefinedRowCount - 1) * HYBRID_ROW_GAP + HYBRID_TRACK_PADDING * 2);
	$: linkCanvasHeightPx = definedTrackHeightPx + underdefinedTrackHeightPx + 78;
	$: definedStatusSummary = summarizeByStatus(hybridTimeline.defined.map((item) => item.task));
	$: underdefinedStatusSummary = summarizeByStatus(hybridTimeline.underdefined.map((item) => item.task));
	$: definedLaneHeaders = buildLaneHeaders(hybridTimeline.definedGroups, HYBRID_ROW_HEIGHT, HYBRID_ROW_GAP, HYBRID_TRACK_PADDING);
	$: underdefinedLaneHeaders = buildLaneHeaders(hybridTimeline.underdefinedGroups, HYBRID_ROW_HEIGHT, HYBRID_ROW_GAP, HYBRID_TRACK_PADDING);

	$: if (graphMode !== lastGraphMode) {
		shouldAutoFocusOverview = graphMode === 'overview';
		lastGraphMode = graphMode;
	}

	$: if (graphMode === 'overview' && overviewScrollEl) {
		overviewViewportWidth = overviewScrollEl.clientWidth;
	}

	$: if (graphMode === 'overview' && shouldAutoFocusOverview && overviewScrollEl && overviewCanvasWidth > 0) {
		requestAnimationFrame(() => focusOverviewAroundToday());
		shouldAutoFocusOverview = false;
	}

	function edgePath(edge: TaskGraphEdge): string {
		const from = nodesByPath.get(edge.from);
		const to = nodesByPath.get(edge.to);
		if (!from || !to) return '';

		const offset = edgeYOffsets.get(edge.id);
		const startY = offset?.startY ?? (from.y + from.height / 2);
		const endY = offset?.endY ?? (to.y + to.height / 2);
		return computeEdgePath(edge, from, to, startY, endY);
	}

	function toggleIndependentVisibility(): void {
		showIndependentInDependency = !showIndependentInDependency;
	}

	function nodeStyle(node: TaskGraphNode): string {
		const accent = statusColors?.[node.task.status] ?? 'var(--interactive-accent)';
		return `left:${node.x}px;top:${node.y}px;width:${node.width}px;min-height:${node.height}px;--tt-node-accent:${accent};--tt-priority-accent:${PRIORITY_COLORS[node.task.priority] ?? PRIORITY_COLORS.None};`;
	}

	function subtitle(node: TaskGraphNode): string {
		if (node.blockedIncomingCount > 0) {
			return `${node.blockedIncomingCount} open dependency${node.blockedIncomingCount === 1 ? '' : 'ies'}`;
		}
		if (node.incomingCount > 0) {
			return `${node.incomingCount} dependency${node.incomingCount === 1 ? '' : 'ies'}`;
		}
		if (node.outgoingCount > 0) {
			return `unblocks ${node.outgoingCount} task${node.outgoingCount === 1 ? '' : 's'}`;
		}
		return 'independent';
	}

	function focusOverviewAroundToday(): void {
		if (!overviewScrollEl) return;
		const viewportWidth = overviewScrollEl.clientWidth;
		if (viewportWidth <= 0) return;
		const todayX = (todayPercent / 100) * overviewCanvasWidth;
		const target = Math.max(0, Math.min(overviewCanvasWidth - viewportWidth, todayX - viewportWidth * 0.33));
		overviewScrollEl.scrollLeft = target;
		overviewScrollLeft = target;
	}

	function onOverviewScroll(event: Event): void {
		const target = event.currentTarget as HTMLDivElement | null;
		overviewScrollLeft = target?.scrollLeft ?? 0;
	}

	function onDependencyScroll(event: Event): void {
		const target = event.currentTarget as HTMLDivElement | null;
		dependencyScrollLeft = target?.scrollLeft ?? 0;
	}

	function getLaneHeaderClass(lane: { label: string; heightPx: number }): string {
		return laneHeaderClass(lane, DEPENDENCY_LANE_COMPACT_HEIGHT, DEPENDENCY_LANE_ROTATE_LABEL_LENGTH);
	}

	function groupBandStyle(band: { startRow: number; endRow: number }): string {
		const top = HYBRID_TRACK_PADDING + band.startRow * (HYBRID_ROW_HEIGHT + HYBRID_ROW_GAP);
		const height = (band.endRow - band.startRow + 1) * HYBRID_ROW_HEIGHT + Math.max(0, band.endRow - band.startRow) * HYBRID_ROW_GAP;
		return `top:${top}px;height:${height}px;`;
	}

	function groupLabelStyle(band: { startRow: number }): string {
		const top = HYBRID_TRACK_PADDING + band.startRow * (HYBRID_ROW_HEIGHT + HYBRID_ROW_GAP);
		return `top:${top}px;`;
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
				<button type="button" class="tt-graph-pill tt-graph-pill-toggle" on:click={() => showCompletedInOverview = !showCompletedInOverview}>
					<span class="tt-graph-pill-label">Completed</span>
					<strong>{showCompletedInOverview ? 'Shown' : `${hiddenCompletedCount} hidden`}</strong>
				</button>
				<button type="button" class="tt-graph-pill tt-graph-pill-toggle" on:click={() => overviewGrouping = overviewGrouping === 'project' ? 'dependency' : overviewGrouping === 'dependency' ? 'none' : 'project'}>
					<span class="tt-graph-pill-label">Grouping</span>
					<strong>{groupingLabel(overviewGrouping)}</strong>
				</button>
			{/if}
		</div>
		<p class="tt-graph-note">
			{#if graphMode === 'dependency'}
				Graph respects current filters. Solid amber paths have unfinished upstream dependencies. Dashed gray paths show project containment. Red rings mark cycles. Independent tasks are hidden by default to keep the dependency map readable.
			{:else}
				Defined track shows dated/inferred windows. Underdefined track shows no-estimate tasks that anchor after resolved upstream work. Timeline opens focused around today; drag horizontally for history/future.
			{/if}
		</p>
	</div>

	{#if graphMode === 'dependency'}
		{#if dependencyEmpty}
			<div class="tt-graph-empty">No dependency relationships found. Add depends_on links between tasks to see the graph.</div>
		{:else}
			<div class="tt-graph-scroll" bind:this={dependencyScrollEl} on:scroll={onDependencyScroll}>
				<div class="tt-graph-fit" style={`width:${fittedDependencyWidth}px;height:${fittedDependencyHeight}px;`}>
				<div class="tt-graph-stage" style={`width:${layout.width}px;height:${layout.height}px;transform:scale(${dependencyScale});`}>
					{#if dependencyLaneHeaders.length > 0}
						<div class="tt-dependency-lanes" style={`--tt-dependency-lane-width:${dependencyLaneWidth}px;transform:translateX(${dependencyLaneStickyOffset}px);`} aria-hidden="true">
							{#each dependencyLaneHeaders as lane (lane.key)}
								<div
									class={getLaneHeaderClass(lane)}
									style={`top:${lane.topPx}px;height:${lane.heightPx}px;`}
									title={lane.label}
								>
									<span class="tt-dependency-lane-label">{lane.label}</span>
									<span class="tt-dependency-lane-count">{lane.taskCount}</span>
								</div>
							{/each}
						</div>
					{/if}
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
									class:is-parent={edge.isParentEdge}
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
								<span>Done {formatHumanDate(node.task.completed, formatDateISO(startOfToday()))}</span>
							{:else if node.task.due_date}
								<span>Due {formatHumanDate(node.task.due_date, formatDateISO(startOfToday()))}</span>
								{/if}
							</div>
						</button>
					{/each}
				</div>
				</div>
			</div>
		{/if}
	{:else}
		{#if timelineEmpty}
			<div class="tt-graph-empty">No scheduled tasks. Add a start or due date, or chain tasks with dependencies and estimated durations to see them here.</div>
		{:else}
			<div class="tt-overview-scroll" bind:this={overviewScrollEl} on:scroll={onOverviewScroll}>
				<div class="tt-overview-axis" style={`width:${overviewCanvasWidth}px;`}>
					{#each nonWorkingBands as band (band.id)}
						<div class="tt-overview-nonworking" class:is-weekend={band.kind === 'weekend'} class:is-holiday={band.kind === 'holiday'} style={`left:${band.leftPercent.toFixed(3)}%;width:${band.widthPercent.toFixed(3)}%;`} title={band.label}></div>
					{/each}
					{#each timelineTicks as tick}
						<div class="tt-overview-tick" class:is-start={tick.position === 'start'} class:is-end={tick.position === 'end'} style={`left:${tick.leftPercent.toFixed(3)}%;`}>
							<span>{tick.label}</span>
						</div>
					{/each}
					<div class="tt-overview-today" style={`left:${todayPercent.toFixed(3)}%;`}><span>Today</span></div>
				</div>

				<div class="tt-hybrid-shell" style={`width:${overviewCanvasWidth}px;--tt-link-canvas-height:${linkCanvasHeightPx}px;`}>
					<div class="tt-hybrid-calendar-overlay" aria-hidden="true">
						{#each nonWorkingBands as band (band.id)}
							<div class="tt-hybrid-calendar-band" class:is-weekend={band.kind === 'weekend'} class:is-holiday={band.kind === 'holiday'} style={`left:${band.leftPercent.toFixed(3)}%;width:${band.widthPercent.toFixed(3)}%;`} title={band.label}></div>
						{/each}
					</div>
					<div class="tt-hybrid-today-line" style={`left:${todayPercent.toFixed(3)}%;`}></div>
					<svg class="tt-hybrid-links" viewBox={`0 0 100 ${linkCanvasHeightPx}`} preserveAspectRatio="none" aria-hidden="true">
						{#each visibleLinks as link (link.id)}
							<path class="tt-hybrid-link" d={hybridLinkPath(link)}></path>
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
						<div class="tt-hybrid-track-body">
							<!-- Lane sidebar: named project headers positioned at each band's row -->
							{#if definedLaneHeaders.length > 1}
								<div class="tt-hybrid-lane-sidebar" style={`height:${definedTrackHeightPx}px;transform:translateX(${overviewScrollLeft}px);`} aria-hidden="true">
									{#each definedLaneHeaders as header (header.key)}
										<div
											class="tt-hybrid-lane-header"
											style={`top:${header.topPx}px;height:${header.heightPx}px;`}
										>
											<span class="tt-lane-title" title={header.label}>{header.label}</span>
											<span class="tt-lane-count">{header.taskCount}</span>
										</div>
									{/each}
								</div>
							{/if}
							<div class="tt-hybrid-track-canvas" style={`height:${definedTrackHeightPx}px;`}>
								{#each hybridTimeline.definedGroups as group (group.key)}
									<div class="tt-hybrid-group-band" style={groupBandStyle(group)}></div>
								{/each}
								{#each visibleDefined as item (item.path)}
									<button
										type="button"
										class="tt-overview-bar tt-hybrid-defined-item"
										class:is-done={item.task.is_complete}
										class:is-active={$activeTaskPath === item.path}
										class:is-inferred={item.isInferred}
										style={definedBarStyle(item)}
										title={`${item.task.name} | ${formatDateISO(item.start)} → ${formatDateISO(item.end)}${item.isInferred ? ' (inferred)' : ''}`}
										tabindex="0"
										aria-label="{item.task.name} — {formatDateISO(item.start)} to {formatDateISO(item.end)}{item.isInferred ? ' (estimated)' : ''}"
										aria-pressed={$activeTaskPath === item.path}
										on:click={() => onOpen(item.path)}
										on:keydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(item.path); } }}
										on:mouseenter={(event) => showTaskHoverPreview(event, item.task)}
										on:contextmenu={(event) => handleTaskContextMenu(event, item.task)}
									>
										<span class="tt-overview-title">{item.task.name}</span>
									</button>
								{/each}
							</div>
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
						<div class="tt-hybrid-track-body">
							{#if underdefinedLaneHeaders.length > 1}
								<div class="tt-hybrid-lane-sidebar" style={`height:${underdefinedTrackHeightPx}px;transform:translateX(${overviewScrollLeft}px);`} aria-hidden="true">
									{#each underdefinedLaneHeaders as header (header.key)}
										<div
											class="tt-hybrid-lane-header"
											style={`top:${header.topPx}px;height:${header.heightPx}px;`}
										>
											<span class="tt-lane-title" title={header.label}>{header.label}</span>
											<span class="tt-lane-count">{header.taskCount}</span>
										</div>
									{/each}
								</div>
							{/if}
							<div class="tt-hybrid-track-canvas" style={`height:${underdefinedTrackHeightPx}px;`}>
								{#each hybridTimeline.underdefinedGroups as group (group.key)}
									<div class="tt-hybrid-group-band" style={groupBandStyle(group)}></div>
								{/each}
								{#each visibleUnderdefined as item (item.path)}
									<button
										type="button"
										class="tt-overview-bar tt-hybrid-underdefined-item"
										class:is-done={item.task.is_complete}
										class:is-active={$activeTaskPath === item.path}
										style={underdefinedCardStyle(item)}
										title={`${item.task.name} | follows ${item.anchorPath.replace(/\.md$/, '')}`}
										tabindex="0"
										aria-label="{item.task.name} — follows {item.anchorPath.replace(/\.md$/, '').split('/').pop()}"
										aria-pressed={$activeTaskPath === item.path}
										on:click={() => onOpen(item.path)}
										on:keydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(item.path); } }}
										on:mouseenter={(event) => showTaskHoverPreview(event, item.task)}
										on:contextmenu={(event) => handleTaskContextMenu(event, item.task)}
									>
										<span class="tt-hybrid-underdefined-name">{item.task.name}</span>
										<span class="tt-hybrid-underdefined-anchor">after {item.anchorPath.replace(/\.md$/, '').split('/').pop()}</span>
									</button>
								{/each}
							</div>
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

	.tt-hybrid-calendar-overlay {
		position: absolute;
		left: 0;
		right: 0;
		top: 30px;
		bottom: 8px;
		pointer-events: none;
		z-index: 0;
	}

	.tt-hybrid-calendar-band {
		position: absolute;
		top: 0;
		bottom: 0;
	}

	.tt-hybrid-calendar-band.is-weekend {
		background: color-mix(in srgb, var(--background-modifier-border) 24%, transparent);
	}

	.tt-hybrid-calendar-band.is-holiday {
		background: color-mix(in srgb, var(--color-red) 14%, transparent);
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

	.tt-hybrid-track-body {
		display: flex;
		align-items: flex-start;
	}

	.tt-hybrid-lane-sidebar {
		width: 110px;
		flex-shrink: 0;
		position: relative;
		border-right: 1px solid var(--background-modifier-border);
		border-radius: var(--radius-m, 8px) 0 0 var(--radius-m, 8px);
		background: var(--background-primary-alt, var(--background-secondary));
		overflow: hidden;
		z-index: 4;
	}

	.tt-hybrid-lane-header {
		position: absolute;
		left: 0;
		right: 0;
		display: flex;
		flex-direction: column;
		justify-content: center;
		padding: 0 8px;
		border-bottom: 1px dashed color-mix(in srgb, var(--background-modifier-border) 60%, transparent);
		overflow: hidden;
	}

	.tt-lane-title {
		font-size: 0.68rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--text-muted);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.tt-lane-count {
		font-size: 0.62rem;
		color: var(--text-faint);
	}

	.tt-hybrid-lane-sidebar + .tt-hybrid-track-canvas {
		border-radius: 0 var(--radius-m, 8px) var(--radius-m, 8px) 0;
		border-left: none;
		flex: 1;
		min-width: 0;
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

	.tt-hybrid-group-band {
		position: absolute;
		left: 0;
		right: 0;
		border-top: 1px dashed color-mix(in srgb, var(--background-modifier-border) 80%, transparent);
		background: linear-gradient(180deg, color-mix(in srgb, var(--background-secondary) 35%, transparent), transparent 40%);
		pointer-events: none;
		z-index: 0;
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
		display: block;
		width: 100%;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
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
		min-width: 100%;
		height: 26px;
		background: linear-gradient(180deg, var(--background-primary), color-mix(in srgb, var(--background-primary) 82%, transparent));
		border-bottom: 1px solid var(--background-modifier-border);
		z-index: 2;
	}

	.tt-overview-nonworking {
		position: absolute;
		top: 0;
		bottom: 0;
		pointer-events: none;
	}

	.tt-overview-nonworking.is-weekend {
		background: color-mix(in srgb, var(--background-modifier-border) 22%, transparent);
	}

	.tt-overview-nonworking.is-holiday {
		background: color-mix(in srgb, var(--color-red) 16%, transparent);
	}

	.tt-overview-today {
		position: absolute;
		top: 0;
		bottom: -10px;
		border-left: 2px dashed color-mix(in srgb, var(--color-red) 80%, var(--interactive-accent));
		transform: translateX(-50%);
		pointer-events: none;
	}

	.tt-overview-today > span {
		position: absolute;
		top: -1px;
		left: 8px;
		font-size: 0.66rem;
		font-weight: 700;
		color: color-mix(in srgb, var(--color-red) 80%, var(--text-normal));
		white-space: nowrap;
	}

	.tt-hybrid-today-line {
		position: absolute;
		top: 34px;
		bottom: 8px;
		border-left: 2px dashed color-mix(in srgb, var(--color-red) 80%, var(--interactive-accent));
		transform: translateX(-50%);
		pointer-events: none;
		opacity: 0.92;
		z-index: 2;
	}

	.tt-overview-tick {
		position: absolute;
		top: 3px;
		transform: translateX(-50%);
		font-size: 0.66rem;
		color: var(--text-faint);
		white-space: nowrap;
	}

	.tt-overview-tick.is-start {
		transform: translateX(0);
	}

	.tt-overview-tick.is-end {
		transform: translateX(-100%);
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
		transition: border-color 0.14s ease, box-shadow 0.14s ease, background-color 0.14s ease;
		z-index: 3;
	}

	.tt-overview-bar:hover {
		transform: none;
		box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--interactive-accent) 38%, transparent), 0 0 0 1px color-mix(in srgb, var(--interactive-accent) 18%, transparent);
	}

	.tt-overview-title {
		display: block;
		width: 100%;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.tt-overview-bar.is-done {
		opacity: 0.46;
		filter: saturate(0.56) contrast(0.92);
	}

	.tt-overview-bar.is-done .tt-overview-title,
	.tt-overview-bar.is-done .tt-hybrid-underdefined-name {
		text-decoration: line-through;
		text-decoration-color: color-mix(in srgb, var(--text-muted) 72%, transparent);
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
		transform-origin: top left;
	}

	.tt-graph-fit {
		position: relative;
		min-width: 1px;
	}

	.tt-graph-svg {
		position: absolute;
		inset: 0;
		overflow: visible;
	}

	.tt-dependency-lanes {
		position: absolute;
		inset: 0 auto 0 8px;
		width: var(--tt-dependency-lane-width, 136px);
		pointer-events: none;
		z-index: 1;
	}

	.tt-dependency-lane-header {
		position: absolute;
		left: 0;
		right: 0;
		display: flex;
		flex-direction: column;
		justify-content: flex-start;
		align-items: flex-start;
		gap: 8px;
		padding: 10px 10px 10px 12px;
		border-radius: var(--radius-m);
		border: var(--border-width, 1px) solid color-mix(in srgb, var(--text-accent) 30%, var(--background-modifier-border));
		background: linear-gradient(
			180deg,
			color-mix(in srgb, var(--background-secondary) 86%, var(--background-primary)),
			color-mix(in srgb, var(--background-secondary-alt) 92%, var(--background-primary))
		);
		box-shadow:
			inset 3px 0 0 color-mix(in srgb, var(--interactive-accent) 62%, transparent),
			inset 0 0 0 1px color-mix(in srgb, var(--background-primary) 35%, transparent),
			0 1px 0 color-mix(in srgb, var(--text-faint) 18%, transparent);
		overflow: hidden;
	}

	.tt-dependency-lane-label {
		display: -webkit-box;
		font-size: 12px;
		font-weight: 600;
		line-height: 1.25;
		color: color-mix(in srgb, var(--text-normal) 88%, var(--text-muted));
		overflow: hidden;
		overflow-wrap: anywhere;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 5;
	}

	.tt-dependency-lane-count {
		margin-top: auto;
		font-size: 11px;
		font-weight: 700;
		color: color-mix(in srgb, var(--text-normal) 75%, var(--text-faint));
		background: color-mix(in srgb, var(--interactive-accent) 20%, var(--background-modifier-border));
		padding: 1px 6px;
		border-radius: var(--radius-s);
		border: 1px solid color-mix(in srgb, var(--interactive-accent) 22%, transparent);
	}

	.tt-dependency-lane-header.is-compact {
		align-items: center;
		padding: 8px 8px 8px 10px;
		gap: 6px;
	}

	.tt-dependency-lane-header.is-rotated .tt-dependency-lane-label {
		display: block;
		font-size: 12px;
		line-height: 1.05;
		max-height: none;
		white-space: normal;
		writing-mode: vertical-rl;
		text-orientation: mixed;
		transform: rotate(180deg);
		letter-spacing: 0.3px;
	}

	@media (min-width: 1024px) {
		.tt-dependency-lane-header.is-rotated .tt-dependency-lane-label {
			font-size: 13px;
			letter-spacing: 0.4px;
		}
	}

	@media (max-width: 767px) {
		.tt-dependency-lane-header.is-rotated .tt-dependency-lane-label {
			font-size: 11px;
			letter-spacing: 0.2px;
		}

		.tt-dependency-lane-header.is-rotated {
			padding: 6px 6px 6px 8px;
			gap: 4px;
		}
	}

	.tt-dependency-lane-header.is-compact .tt-dependency-lane-count {
		margin-top: 0;
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

	.tt-graph-edge.is-parent {
		stroke: color-mix(in srgb, var(--text-faint) 45%, transparent);
		color: color-mix(in srgb, var(--text-faint) 45%, transparent);
		stroke-dasharray: 4 4;
		opacity: 0.55;
	}

	.tt-graph-edge.is-cycle {
		stroke: var(--color-red);
		color: var(--color-red);
		stroke-width: 2.5;
	}

	.tt-graph-node {
		position: absolute;
		box-sizing: border-box;
		overflow: hidden;
		display: flex;
		flex-direction: column;
		justify-content: space-between;
		gap: 6px;
		padding: 10px 12px 10px 16px;
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
		z-index: 0;
		pointer-events: none;
		border-radius: var(--radius-xl, 16px) 0 0 var(--radius-xl, 16px);
		background: var(--tt-node-accent);
	}

	.tt-graph-node > * {
		position: relative;
		z-index: 1;
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
		font-size: 0.68rem;
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
		font-size: 0.92rem;
		font-weight: 700;
		color: var(--text-normal);
		line-height: 1.18;
		width: 100%;
		min-width: 0;
		word-break: break-word;
		overflow-wrap: break-word;
		max-height: 4.72em;
		display: -webkit-box;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 4;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.tt-graph-meta {
		display: flex;
		flex-wrap: wrap;
		gap: 6px 10px;
		font-size: 0.72rem;
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