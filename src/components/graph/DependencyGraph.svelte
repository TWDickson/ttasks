<script lang="ts">
	// The dependency graph: project swim lanes of task cards joined by dependency
	// edges, with pan/zoom, a click-pinned chain highlight, and hover `+` buttons
	// that spawn a blocker or a dependent. Takes callbacks, never the plugin.
	import { onMount } from 'svelte';
	import type { Readable } from 'svelte/store';
	import type { Task } from '../../types';
	import type { CalendarConfig } from '../../store/graph/taskGraphDates';
	import type { BadgePalette } from '../../utils/badgePalette';
	import { buildTaskGraph, resolveConnectedDependencyPaths, resolveOwningProjectPath, type TaskGraphNode } from '../../store/graph/taskGraph';
	import { computeEdgeAttachments, layoutEdgePath } from '../../store/graph/graphEdgeRouting';
	import { computeGraphQualityMetrics, graphLayoutKey } from '../../store/graph/graphQualityMetrics';
	import { buildLaneHeaders } from '../../store/graph/graphLaneLayout';
	import { computeDependencyLaneWidth, isReadyNode } from '../../store/graph/graphPresentation';
	import { computeTrace } from '../../store/graph/graphTrace';
	import { formatDateISO } from '../../store/graph/graphTimeline';
	import { buildTaskSchedule } from '../../store/taskSchedule';
	import { formatHumanDate } from '../../utils/dateUtils';
	import { icon } from '../../utils/icon';
	import { today } from '../../utils/todayStore';
	import { createPanZoomGestures } from './panZoomGestures';
	import GraphProjectFilter from './GraphProjectFilter.svelte';
	import DependencyLaneHeaders, { type DependencyLaneHeader } from './DependencyLaneHeaders.svelte';
	import GraphNodeCard from './GraphNodeCard.svelte';

	export let tasks: Task[];
	export let palette: BadgePalette;
	export let activeTaskPath: Readable<string | null>;
	export let calendarConfig: CalendarConfig;
	export let diagnosticsEnabled: boolean;
	/** GP3: projects hidden from the graph, as persisted. */
	export let initialHiddenProjects: string[];
	export let onHiddenProjectsChange: (paths: string[]) => void;
	export let onOpen: (path: string) => void;
	export let onHoverPreview: (event: MouseEvent, task: Task) => void;
	export let onContextMenu: ((event: MouseEvent, task: Task) => void) | undefined = undefined;
	/** New task that depends on `task`. */
	export let onCreateDependent: (task: Task) => void;
	/** New task that `task` will depend on. */
	export let onCreateBlocker: (task: Task) => void;
	export let onCreateInProject: (projectPath: string) => void;

	const NODE_HEIGHT = 96;
	const ROW_GAP = 10;
	const LANE_GUTTER = 64;
	const LANE_MIN_WIDTH = 48;
	const LANE_MAX_WIDTH = 60;
	// GP4: a project lane's box (both the header chip and the frame) grows
	// symmetrically past its node rows by this many pixels top and bottom, so cards
	// sit with breathing room inside the lane and short lanes get room for their
	// rotated label without a downward-only header inflation. Kept under half the
	// inter-lane gap (40px) so adjacent lane boxes never overlap.
	const LANE_PAD = 16;
	const GRAPH_PADDING = 20;
	const GRAPH_PADDING_LEFT = LANE_GUTTER + GRAPH_PADDING;

	let showIndependent = true;
	// Highlight "ready" work: open (incomplete) tasks with no unfinished upstream
	// dependency — i.e. the things that can actually be started right now.
	let highlightReady = false;
	let lastDiagnosticsKey = '';
	let scrollEl: HTMLDivElement | null = null;
	let viewportWidth = 0;
	let scrollLeft = 0;
	// GP3: paths of projects the user has hidden. Persisted through the callback
	// so the choice survives re-renders and reloads.
	let hiddenProjectPaths = new Set<string>(initialHiddenProjects);

	$: tasksByPath = new Map(tasks.map((task) => [task.path, task]));
	// All project records, name-sorted — the source list for the GP3 filter menu.
	$: graphProjects = tasks
		.filter((task) => task.type === 'project')
		.slice()
		.sort((left, right) => (left.name ?? '').localeCompare(right.name ?? ''));
	// GP3: drop hidden projects (their record + every task they own) before any
	// connectivity is computed, so a satellite that only linked to a hidden
	// project loses its connection here and falls away with it, per spec. Kept as
	// a no-op reference to `tasks` when nothing is hidden.
	$: visibleScopeTasks = hiddenProjectPaths.size === 0
		? tasks
		: tasks.filter((task) => {
			if (task.type === 'project') return !hiddenProjectPaths.has(task.path);
			const owner = resolveOwningProjectPath(task, tasksByPath);
			return !(owner && hiddenProjectPaths.has(owner));
		});
	$: connectedDependencyPaths = resolveConnectedDependencyPaths(visibleScopeTasks);
	// Completed tasks stay visible only while part of a dependency chain (they
	// anchor downstream work); otherwise the graph shows open work. Independent
	// open tasks join when toggled on, or when there are no chains yet.
	$: graphTasks = (() => {
		const projectRecords = visibleScopeTasks.filter((task) => task.type === 'project');
		const includeIndependent = showIndependent || connectedDependencyPaths.size === 0;
		const dependencyTasks = visibleScopeTasks.filter((task) => {
			if (task.type !== 'task') return false;
			if (connectedDependencyPaths.has(task.path)) return true;
			if (task.is_complete) return false;
			return includeIndependent || !!task.parent_task;
		});
		return [...projectRecords, ...dependencyTasks];
	})();
	$: hiddenIndependentCount = visibleScopeTasks.filter(
		(task) =>
			task.type === 'task' &&
			!task.is_complete &&
			!task.parent_task &&
			!connectedDependencyPaths.has(task.path),
	).length;

	// Same resolution the layout uses, exposed so undated node cards can show a
	// projected finish (~date) inferred from the dependency chain.
	$: schedule = buildTaskSchedule(graphTasks.filter((task) => task.type === 'task'), { allTasks: tasks, calendarConfig });
	function projectedEndLabel(path: string, now: string): string | null {
		const entry = schedule.get(path);
		return entry ? formatHumanDate(formatDateISO(entry.end), now) : null;
	}

	$: layout = buildTaskGraph(graphTasks, {
		nodeWidth: 196,
		nodeHeight: NODE_HEIGHT,
		horizontalGap: 40,
		verticalGap: ROW_GAP,
		padding: GRAPH_PADDING,
		paddingLeft: GRAPH_PADDING_LEFT,
		calendarConfig,
	});
	// User zoom multiplies the fit-to-width base scale; Ctrl/Cmd+wheel, toolbar
	// buttons, and drag-panning make large graphs navigable.
	let userZoom = 1;
	$: fitScale = viewportWidth > 0 && layout.width > 0 ? Math.min(1, viewportWidth / layout.width) : 1;
	$: scale = Math.min(2.5, Math.max(0.15, fitScale * userZoom));
	$: fittedWidth = Math.max(1, Math.round(layout.width * scale));
	$: fittedHeight = Math.max(1, Math.round(layout.height * scale));
	$: laneStickyOffset = scale > 0 ? scrollLeft / scale : 0;
	$: nodesByPath = new Map(layout.nodes.map((node) => [node.path, node]));
	$: edgeAttachments = computeEdgeAttachments(layout.nodes, layout.edges, nodesByPath);
	$: laneHeaders = buildLaneHeaders(
		layout.lanes.map((lane) => ({
			key: lane.key ?? '__unassigned__',
			// Satellites are unassigned tasks parked next to a project — label them
			// like the bottom lane, not the project, so they don't read as a duplicate.
			label: lane.isSatellite ? 'Unassigned' : lane.label,
			startRow: lane.startRow,
			endRow: lane.endRow,
			count: lane.taskPaths.length,
			gapOffsetPx: lane.gapOffsetPx,
			isSatellite: lane.isSatellite ?? false,
		})),
		NODE_HEIGHT,
		ROW_GAP,
		GRAPH_PADDING,
	).map((header): DependencyLaneHeader => {
		// Project lanes grow their box symmetrically by the lane pad so the header
		// chip and the frame share one aligned box. `rawHeightPx` keeps the
		// un-padded height for the compact/rotate decision.
		const isProject = !header.isSatellite && header.key !== '__unassigned__';
		return isProject
			? { ...header, topPx: header.topPx - LANE_PAD, heightPx: header.heightPx + LANE_PAD * 2, rawHeightPx: header.heightPx }
			: { ...header, rawHeightPx: header.heightPx };
	});
	// Satellites are thin strips; keep them out of the shared gutter-width sizing.
	$: laneWidth = computeDependencyLaneWidth(laneHeaders.filter((lane) => !lane.isSatellite), LANE_MIN_WIDTH, LANE_MAX_WIDTH);
	$: readyCount = layout.nodes.filter(isReadyNode).length;

	$: if (diagnosticsEnabled) {
		const key = graphLayoutKey(layout);
		if (key !== lastDiagnosticsKey) {
			lastDiagnosticsKey = key;
			console.info('[TTasks][GraphDiagnostics]', {
				view: 'dependency',
				timestamp: new Date().toISOString(),
				metrics: computeGraphQualityMetrics(layout.nodes, layout.edges, layout.lanes),
			});
		}
	} else {
		lastDiagnosticsKey = '';
	}

	function updateViewport(): void {
		viewportWidth = scrollEl?.clientWidth ?? 0;
		scrollLeft = scrollEl?.scrollLeft ?? 0;
	}

	let resizeObserver: ResizeObserver | null = null;

	onMount(() => {
		updateViewport();
		if (typeof ResizeObserver !== 'undefined') resizeObserver = new ResizeObserver(updateViewport);
		window.addEventListener('resize', updateViewport);
		return () => {
			window.removeEventListener('resize', updateViewport);
			resizeObserver?.disconnect();
			resizeObserver = null;
			cancelHoverClear();
		};
	});

	// The scroll box is recreated when the graph goes empty and back, so observe
	// whichever element is currently bound (ResizeObserver dedupes repeats).
	$: if (resizeObserver && scrollEl) resizeObserver.observe(scrollEl);

	// ── GP3 project filter ──────────────────────────────────────────────────────
	function setHiddenProjects(next: Set<string>): void {
		hiddenProjectPaths = next;
		onHiddenProjectsChange([...next]);
	}

	function toggleProjectVisibility(projectPath: string): void {
		const next = new Set(hiddenProjectPaths);
		if (next.has(projectPath)) next.delete(projectPath);
		else next.add(projectPath);
		setHiddenProjects(next);
	}

	function showAllProjects(): void {
		if (hiddenProjectPaths.size > 0) setHiddenProjects(new Set());
	}

	// "Ready now" and a pinned chain are two competing lenses on the same graph,
	// and each dims what the other wants to show — left both on, their opacities
	// multiply and everything turns to soup. `onNodeClick` already drops ready
	// mode when you pin a chain; this is the same trade in the other direction.
	function toggleHighlightReady(): void {
		highlightReady = !highlightReady;
		if (highlightReady) pinnedTracePath = null;
	}

	// ── Pan & zoom ──────────────────────────────────────────────────────────────

	function zoomBy(factor: number, anchor?: { clientX: number; clientY: number }): void {
		const el = scrollEl;
		const prev = scale;
		userZoom = Math.min(8, Math.max(0.2, userZoom * factor));
		if (!el) return;
		requestAnimationFrame(() => {
			const next = scale;
			if (next === prev || prev === 0) return;
			const rect = el.getBoundingClientRect();
			const cx = anchor ? anchor.clientX - rect.left : el.clientWidth / 2;
			const cy = anchor ? anchor.clientY - rect.top : el.clientHeight / 2;
			el.scrollLeft = (el.scrollLeft + cx) * (next / prev) - cx;
			el.scrollTop = (el.scrollTop + cy) * (next / prev) - cy;
			scrollLeft = el.scrollLeft;
		});
	}

	function onWheel(event: WheelEvent): void {
		if (!event.ctrlKey && !event.metaKey) return;
		event.preventDefault();
		zoomBy(event.deltaY < 0 ? 1.15 : 1 / 1.15, event);
	}

	let isPanning = false;
	const gestures = createPanZoomGestures({
		scrollEl: () => scrollEl,
		zoomBy,
		// A real drag clears the pinned chain, as a press on canvas used to.
		onDragStart: () => { pinnedTracePath = null; },
		// So does a tap on empty canvas — the old empty-canvas deselect.
		onEmptyTap: () => { pinnedTracePath = null; },
		onPanningChange: (panning) => { isPanning = panning; },
		onScroll: () => { scrollLeft = scrollEl?.scrollLeft ?? 0; },
	});

	// ── Hover state + click-pinned chain highlight ──────────────────────────────

	// Set on node hover; drives the hover "+" buttons and the task preview only
	// (not the chain highlight). Cleared when the pointer leaves the graph
	// surface (not the node itself) so the "+" stays reachable at the node's edge.
	let hoverTracePath: string | null = null;
	// A clicked node pins its dependency chain highlight so it survives mouse
	// movement; cleared by clicking empty canvas or pressing Esc.
	let pinnedTracePath: string | null = null;
	// Desktop has real hover, so the "+" tracks hover and hides on hover-off.
	// Touch has no hover — there a tap-pin is what surfaces the "+".
	const hoverCapable = typeof window !== 'undefined' && !!window.matchMedia?.('(hover: hover)').matches;

	// Chain highlight is click-driven only: clicking a node pins its chain, and
	// clicking empty canvas (or Esc) clears it. Hover doesn't trace — it was
	// redundant with the pin and left the highlight lingering after click-off.
	$: traceSets = (() => {
		if (!pinnedTracePath || !nodesByPath.has(pinnedTracePath)) return null;
		const sets = computeTrace(pinnedTracePath, layout.edges);
		return sets.edges.size > 0 ? sets : null;
	})();

	// Grace delay before the hover "+" hides, so the pointer has time to travel
	// from the node to the small edge-anchored add button even at an off angle.
	let hoverClearTimer: ReturnType<typeof setTimeout> | null = null;

	function cancelHoverClear(): void {
		if (hoverClearTimer !== null) {
			clearTimeout(hoverClearTimer);
			hoverClearTimer = null;
		}
	}

	function onNodeHover(event: MouseEvent, node: TaskGraphNode): void {
		cancelHoverClear();
		hoverTracePath = node.path;
		onHoverPreview(event, node.task);
	}

	// Leaving the graph surface drops the hover "+"/preview.
	function clearHover(): void {
		cancelHoverClear();
		hoverTracePath = null;
	}

	// Hovering off a node hides its "+", but with a grace window. Keep it alive
	// immediately when the pointer crosses onto the node's own add button (a
	// sibling at its edge) or onto another node; otherwise schedule a short
	// delayed clear so a near-miss on the way to the "+" doesn't kill it.
	function onNodeHoverLeave(event: MouseEvent, node: TaskGraphNode): void {
		const related = event.relatedTarget as HTMLElement | null;
		if (related && typeof related.closest === 'function' && related.closest('.tt-graph-node, .tt-node-add')) return;
		cancelHoverClear();
		hoverClearTimer = setTimeout(() => {
			if (hoverTracePath === node.path) hoverTracePath = null;
			hoverClearTimer = null;
		}, 800);
	}

	// Click = open the task and pin its chain (re-pins when a different node is
	// clicked). The pin is cleared on empty-canvas click or Esc.
	function onNodeClick(path: string): void {
		pinnedTracePath = path;
		highlightReady = false;
		onOpen(path);
	}

	// Touch needs its own open path. The node carries hover behaviour (preview +
	// the hover `+`), so iOS/WKWebView spends the first tap applying the emulated
	// hover state and withholds the synthesized `click` until a second tap — the
	// "double-tap to open" bug. Pointer events fire on the first tap regardless, so
	// on touch we open from pointerup and let desktop keep using click. The
	// gesture's `moved` guards against a drag that merely ended over the node.
	//
	// Cross-platform: iOS withholds the first-tap click, but Android *does* fire a
	// real click right after touch pointerup — so opening from both would double-
	// fire. `lastTouchOpenAt` lets the click handler swallow that trailing ghost.
	let lastTouchOpenAt = 0;
	function onNodePointerUp(event: PointerEvent, path: string): void {
		if (event.pointerType !== 'touch') return;
		if (gestures.moved) return;
		lastTouchOpenAt = Date.now();
		onNodeClick(path);
	}
	function onNodeClickEvent(path: string): void {
		// Ignore the synthesized click Android emits right after a handled touch tap.
		if (Date.now() - lastTouchOpenAt < 700) return;
		onNodeClick(path);
	}

	function onNodeKeydown(event: KeyboardEvent): void {
		if (event.key === 'Escape' && pinnedTracePath) {
			pinnedTracePath = null;
			event.stopPropagation();
		}
	}

	function handleContextMenu(event: MouseEvent, task: Task): void {
		if (!onContextMenu) return;
		event.preventDefault();
		onContextMenu(event, task);
	}
</script>

<div class="tt-graph-toolbar">
	<div class="tt-graph-summary">
		{#if layout.blockedEdgeCount > 0}
			<div class="tt-graph-pill tt-graph-pill-alert">
				<span class="tt-graph-pill-label">Blocked chains</span>
				<strong>{layout.blockedEdgeCount}</strong>
			</div>
		{/if}
		{#if layout.cycleCount > 0}
			<div class="tt-graph-pill tt-graph-pill-alert">
				<span class="tt-graph-pill-label">Cycle nodes</span>
				<strong>{layout.cycleCount}</strong>
			</div>
		{/if}
		{#if readyCount > 0}
			<button
				type="button"
				class="tt-graph-pill tt-graph-pill-toggle tt-graph-pill-ready"
				class:is-active={highlightReady}
				aria-pressed={highlightReady}
				on:click={toggleHighlightReady}
			>
				<span class="tt-graph-pill-label">Ready now</span>
				<strong>{readyCount}</strong>
			</button>
		{/if}
		{#if hiddenIndependentCount > 0}
			<button type="button" class="tt-graph-pill tt-graph-pill-toggle" on:click={() => showIndependent = !showIndependent}>
				<span class="tt-graph-pill-label">Independent</span>
				<strong>{showIndependent ? 'Shown' : `${hiddenIndependentCount} hidden`}</strong>
			</button>
		{/if}
		{#if graphProjects.length > 1}
			<GraphProjectFilter
				projects={graphProjects}
				{hiddenProjectPaths}
				onToggle={toggleProjectVisibility}
				onShowAll={showAllProjects}
			/>
		{/if}
	</div>
	<p class="tt-graph-note" id="tt-dep-graph-legend">
		Graph respects current filters. Solid amber paths have unfinished upstream dependencies. Dashed gray paths show subtask containment (a task nested under a parent task); project grouping is shown by the swim lanes. Red rings mark cycles. Independent tasks are hidden by default to keep the dependency map readable.
	</p>
</div>

{#if layout.nodes.length === 0}
	<div class="tt-graph-empty">No dependency relationships found. Add depends_on links between tasks to see the graph.</div>
{:else}
	<div class="tt-graph-canvas">
		<div
			class="tt-graph-scroll"
			class:is-panning={isPanning}
			bind:this={scrollEl}
			role="application"
			aria-labelledby="tt-dep-graph-legend"
			on:scroll={() => { scrollLeft = scrollEl?.scrollLeft ?? 0; }}
			on:wheel|nonpassive={onWheel}
			on:pointerdown={gestures.pointerdown}
			on:pointermove={gestures.pointermove}
			on:pointerup={gestures.pointerup}
			on:pointercancel={gestures.pointerup}
			on:mouseleave={clearHover}
		>
			<div class="tt-graph-fit" style={`width:${fittedWidth}px;height:${fittedHeight}px;`}>
				{#if laneHeaders.length > 0}
					<!-- Lane frames live in the fit box (not the scaled stage) so they span
					the full visible width even when the graph is narrower than the panel;
					positions are pre-scaled to match the stage. Always on and identical for
					every lane — the tint and hover spotlight they replaced are gone. -->
					<div class="tt-dependency-lane-frames" aria-hidden="true">
						{#each laneHeaders as lane (lane.key)}
							<div
								class="tt-dependency-lane-frame"
								style={`top:${lane.topPx * scale}px;height:${lane.heightPx * scale}px;`}
							></div>
						{/each}
					</div>
				{/if}
				<div class="tt-graph-stage" class:highlight-ready={highlightReady} class:chain-pinned={!!traceSets} style={`width:${layout.width}px;height:${layout.height}px;transform:scale(${scale});`}>
					{#if laneHeaders.length > 0}
						<DependencyLaneHeaders
							headers={laneHeaders}
							{laneWidth}
							stickyOffset={laneStickyOffset}
							onAddTask={onCreateInProject}
						/>
					{/if}
					<svg class="tt-graph-svg" viewBox={`0 0 ${layout.width} ${layout.height}`} preserveAspectRatio="xMinYMin meet" aria-hidden="true">
						<defs>
							<marker id="ttasks-graph-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="userSpaceOnUse">
								<path d="M 0 0 L 8 4 L 0 8 z" fill="currentColor"></path>
							</marker>
						</defs>
						{#each layout.edges as edge (edge.id)}
							{@const d = layoutEdgePath(edge, nodesByPath, edgeAttachments)}
							{#if d}
								<path
									class="tt-graph-edge"
									class:is-cycle={edge.isCycle}
									class:is-blocked={edge.isBlockedChain}
									class:is-parent={edge.isParentEdge}
									class:is-complete={edge.isSourceComplete}
									class:is-traced={traceSets?.edges.has(edge.id)}
									{d}
									marker-end="url(#ttasks-graph-arrow)"
								></path>
							{/if}
						{/each}
					</svg>

					{#each layout.nodes as node (node.path)}
						<GraphNodeCard
							{node}
							{palette}
							today={$today}
							projectedEnd={projectedEndLabel(node.path, $today)}
							active={$activeTaskPath === node.path}
							ready={highlightReady && isReadyNode(node)}
							traced={!!traceSets?.nodes.has(node.path)}
							on:click={() => onNodeClickEvent(node.path)}
							on:pointerup={(event) => onNodePointerUp(event, node.path)}
							on:keydown={onNodeKeydown}
							on:mouseenter={(event) => onNodeHover(event, node)}
							on:mouseleave={(event) => onNodeHoverLeave(event, node)}
							on:contextmenu={(event) => handleContextMenu(event, node.task)}
						/>
						{#if (hoverTracePath === node.path || (!hoverCapable && pinnedTracePath === node.path)) && node.task.type === 'task'}
							<!-- Left `+`: spawn a blocker (upstream/parent) this task will depend on.
							Right `+`: spawn a dependent that depends on this one. Both inherit
							project/area/labels/priority. Shown on hover (mouse) or, on touch (no
							hover), when the node is pinned by a tap. -->
							<button
								type="button"
								class="tt-node-add tt-node-add-left"
								style={`left:${node.x - 24}px;top:${node.y + node.height / 2 - 14}px;`}
								aria-label={`New task blocking ${node.task.name}`}
								on:click|stopPropagation={() => onCreateBlocker(node.task)}
								on:mouseenter={cancelHoverClear}
								on:mouseleave={(event) => onNodeHoverLeave(event, node)}
							>
								<span class="tt-node-add-icon" use:icon={'plus'}></span>
							</button>
							<button
								type="button"
								class="tt-node-add"
								style={`left:${node.x + node.width - 4}px;top:${node.y + node.height / 2 - 14}px;`}
								aria-label={`New task blocked by ${node.task.name}`}
								on:click|stopPropagation={() => onCreateDependent(node.task)}
								on:mouseenter={cancelHoverClear}
								on:mouseleave={(event) => onNodeHoverLeave(event, node)}
							>
								<span class="tt-node-add-icon" use:icon={'plus'}></span>
							</button>
						{/if}
					{/each}
				</div>
			</div>
		</div>
		<div class="tt-graph-zoom tt-graph-zoom-float" role="group" aria-label="Zoom (or Ctrl+scroll)">
			<button type="button" class="tt-zoom-btn" aria-label="Zoom out" on:click={() => zoomBy(1 / 1.25)}>
				<span class="tt-zoom-icon" use:icon={'minus'}></span>
			</button>
			<button type="button" class="tt-zoom-btn tt-zoom-reset" aria-label="Reset to fit width" on:click={() => { userZoom = 1; }}>
				{Math.round(scale * 100)}%
			</button>
			<button type="button" class="tt-zoom-btn" aria-label="Zoom in" on:click={() => zoomBy(1.25)}>
				<span class="tt-zoom-icon" use:icon={'plus'}></span>
			</button>
		</div>
	</div>
{/if}

<style>
	.tt-graph-zoom {
		display: inline-flex;
		align-items: center;
		gap: 2px;
		border: 1px solid var(--background-modifier-border);
		border-radius: 999px;
		padding: 2px;
		background: var(--background-secondary);
	}

	.tt-zoom-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 26px;
		min-height: 26px;
		height: auto;
		padding: 2px 6px;
		border: none;
		border-radius: 999px;
		background: transparent;
		color: var(--text-muted);
		font-size: 0.72rem;
		font-weight: 600;
		font-variant-numeric: tabular-nums;
		cursor: pointer;
	}

	.tt-zoom-btn:hover {
		background: var(--background-modifier-hover);
		color: var(--text-normal);
	}

	.tt-zoom-reset {
		min-width: 44px;
	}

	/* Touch devices: zoom controls need ≥44px hit targets. */
	@media (pointer: coarse) {
		.tt-zoom-btn {
			min-width: 44px;
			min-height: 44px;
		}

		.tt-zoom-reset {
			min-width: 56px;
		}
	}

	.tt-zoom-icon {
		display: flex;
		align-items: center;
	}

	.tt-zoom-icon :global(svg) {
		width: 13px;
		height: 13px;
	}

	.tt-graph-canvas {
		position: relative;
		flex: 1;
		min-height: 0;
		display: flex;
	}

	.tt-graph-zoom-float {
		position: absolute;
		/* Anchor top-right: the board's create-task FAB owns the bottom corners
		(bottom-right by default, bottom-left via settings), so the top-right is
		the only corner guaranteed clear of it. */
		top: 12px;
		right: 16px;
		z-index: 11;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.18);
		/* Sit above the pannable stage without stealing its drag gestures. */
		background: color-mix(in srgb, var(--background-secondary) 88%, transparent);
		backdrop-filter: blur(4px);
	}

	.tt-graph-scroll {
		flex: 1;
		min-height: 0;
		overflow: auto;
		/* Extra top/side breathing room so the first row of cards and the tinted
		lane bands don't sit flush against the board edges. */
		padding: 22px 20px 20px;
		cursor: grab;
		/* Pan and pinch-zoom are handled manually via pointer events; opt out of
		the browser's own touch scrolling/zooming so those gestures reach us. */
		touch-action: none;
	}

	.tt-graph-scroll.is-panning {
		cursor: grabbing;
		user-select: none;
	}

	.tt-graph-stage {
		position: relative;
		/* No min-width: the stage box must stay exactly layout.width so the
		absolutely-positioned <svg> (inset:0, viewBox 0 0 layout.width
		layout.height) maps 1:1. A min-width:100% inflated the box past the
		inline width once dependencyScale > 1 (fit width = layout.width*scale),
		which made preserveAspectRatio rescale edges while nodes stayed in
		unscaled coords — edges detached above 100% zoom (C1). */
		transform-origin: top left;
	}

	.tt-graph-fit {
		position: relative;
		/* Fill the scroll viewport when the graph is narrower than the panel, so
		the full-width lane tint bands reach the right edge instead of stopping
		at the graph's own (narrower) right edge. When the graph is wider, its
		explicit inline width wins and the box scrolls as before. */
		min-width: 100%;
	}

	.tt-graph-svg {
		position: absolute;
		inset: 0;
		overflow: visible;
	}

	/* Swim-lane frames. Replaced GP4's area-keyed tint and GP8's hover spotlight
	(2026-07-26): a lane is now delimited by a plain, always-on border, identical
	for every lane and with no interactive state. First child of the stage with no
	z-index, so edges/nodes paint on top. */
	.tt-dependency-lane-frames {
		position: absolute;
		inset: 0;
		pointer-events: none;
	}

	.tt-dependency-lane-frame {
		position: absolute;
		left: 0;
		right: 0;
		border-radius: 10px;
		border: 1px solid color-mix(in srgb, var(--background-modifier-border) 70%, transparent);
	}

	.tt-graph-edge {
		fill: none;
		stroke: color-mix(in srgb, var(--text-faint) 72%, transparent);
		stroke-width: 1.75;
		color: color-mix(in srgb, var(--text-faint) 72%, transparent);
		opacity: 0.78;
		transition: opacity 0.28s ease;
	}

	.tt-graph-edge.is-blocked {
		stroke: var(--color-orange);
		color: var(--color-orange);
		stroke-dasharray: 8 6;
	}

	/* A dependency that's already finished — done, not blocking. */
	.tt-graph-edge.is-complete {
		stroke: color-mix(in srgb, var(--color-green) 65%, transparent);
		color: color-mix(in srgb, var(--color-green) 65%, transparent);
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

	/* Click-pinned chain tracing: the traced dependency path pops. The paired
	`is-dim` recede rules were removed with the lane spotlight (2026-07-26) — the
	trace now reads by its own accent rather than by dimming everything else. */
	.tt-graph-edge.is-traced {
		stroke: var(--interactive-accent);
		color: var(--interactive-accent);
		stroke-width: 2.5;
		opacity: 1;
	}

	/* Edges recede under the "Ready now" lens and off a pinned chain; the node
	half of each lives in GraphNodeCard (edges go further down than nodes). */
	.tt-graph-stage.highlight-ready .tt-graph-edge {
		opacity: 0.22;
	}

	.tt-graph-stage.chain-pinned .tt-graph-edge:not(.is-traced) {
		opacity: 0.14;
	}

	/* Hover "+" affordance on a node's right edge — creates a dependent task */
	.tt-node-add {
		position: absolute;
		z-index: 4;
		width: 28px;
		height: 28px;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0;
		border-radius: 999px;
		border: 1px solid color-mix(in srgb, var(--interactive-accent) 55%, var(--background-modifier-border));
		background: var(--background-primary);
		color: var(--interactive-accent);
		cursor: pointer;
		box-shadow: 0 2px 8px rgba(var(--mono-rgb-100), 0.18);
	}

	.tt-node-add:hover {
		background: var(--interactive-accent);
		color: var(--text-on-accent);
	}

	/* Touch devices: keep the 28px visual chip but expand the tap area to ≥44px
	so the "add dependent" affordance meets the mobile hit-target minimum. */
	@media (pointer: coarse) {
		.tt-node-add::after {
			content: '';
			position: absolute;
			inset: -8px;
		}
	}

	.tt-node-add-icon {
		display: flex;
		align-items: center;
	}

	.tt-node-add-icon :global(svg) {
		width: 15px;
		height: 15px;
	}

	@media (max-width: 900px) {
		.tt-graph-scroll {
			padding-inline: 8px;
		}
	}
</style>
