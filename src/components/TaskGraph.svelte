<script lang="ts">
	import { onMount } from 'svelte';
	import type { Readable, Writable } from 'svelte/store';
	import type { Task } from '../types';
	import type { TaskGroup } from '../query/types';
	import type TTasksPlugin from '../main';
	import { buildHybridTimeline, buildTaskGraph, resolveConnectedDependencyPaths, resolveOwningProjectPath, type HybridTimelineGrouping, type TaskGraphEdge, type TaskGraphNode } from '../store/graph/taskGraph';
	import { computeEdgePath, sortIncomingEdges, sortOutgoingEdges } from '../store/graph/graphEdgeRouting';
	import { computeGraphQualityMetrics } from '../store/graph/graphQualityMetrics';
	import { buildLaneHeaders } from '../store/graph/graphLaneLayout';
	import { PRIORITY_COLORS } from '../constants';
	import { flattenTaskGroups } from './viewAdapters';
	import { buildTaskSchedule } from '../store/taskSchedule';
	import { formatHumanDate } from './taskDateMeta';
	import {
		buildTimelineNonWorkingBands,
		buildTimelineTicks,
		collectProjectHolidayDates,
		diffDays,
		formatDateISO,
		intersectsViewport,
		percentAtDate,
		startOfToday,
	} from '../store/graph/graphTimeline';
	import { computeDependencyLaneWidth, groupingLabel, laneHeaderClass } from '../store/graph/graphPresentation';
	import { splitHolidayCalendar } from '../settings/holidays';
	import { CreateTaskModal } from '../modals/CreateTaskModal';
	import { icon } from '../utils/icon';

	export let plugin: TTasksPlugin;
	export let groups: Readable<TaskGroup[]>;
	export let statusColors: Record<string, string>;
	export let areaColors: Record<string, string> = {};
	export let activeTaskPath: Writable<string | null>;
	export let onOpen: (path: string) => void;
	export let onContextMenu: ((task: Task, event: MouseEvent) => void) | undefined = undefined;

	type GraphMode = 'dependency' | 'overview';
	export let defaultGraphMode: GraphMode = 'dependency';
	const DEPENDENCY_NODE_HEIGHT = 96;
	const DEPENDENCY_ROW_GAP = 10;
	const DEPENDENCY_LANE_GUTTER = 64;
	const DEPENDENCY_LANE_MIN_WIDTH = 48;
	const DEPENDENCY_LANE_MAX_WIDTH = 60;
	const DEPENDENCY_LANE_COMPACT_HEIGHT = 132;
	// Labels rotate to vertical early so the slim gutter fits them without clipping.
	const DEPENDENCY_LANE_ROTATE_LABEL_LENGTH = 8;
	// GP4: a project lane's box (both the header chip and the tinted band) grows
	// symmetrically past its node rows by this many pixels top and bottom, so cards
	// sit with breathing room inside the lane and short lanes get room for their
	// rotated label without a downward-only header inflation. Kept under half the
	// inter-lane gap (40px) so adjacent lane boxes never overlap.
	const DEPENDENCY_LANE_PAD = 16;
	const DEPENDENCY_GRAPH_PADDING = 20;
	const DEPENDENCY_GRAPH_PADDING_LEFT = DEPENDENCY_LANE_GUTTER + DEPENDENCY_GRAPH_PADDING;
	const OVERVIEW_PIXELS_PER_DAY = 54;
	const HYBRID_ROW_HEIGHT = 34;
	const HYBRID_ROW_GAP = 8;
	const HYBRID_TRACK_PADDING = 8;
	const HYBRID_SIDEBAR_WIDTH = 110; // must match .tt-hybrid-lane-sidebar width
	let graphMode: GraphMode = defaultGraphMode;
	let appliedGraphMode: GraphMode = defaultGraphMode;
	let lastGraphMode: GraphMode = defaultGraphMode;
	let showIndependentInDependency = false;
	// Highlight "ready" work: open (incomplete) tasks with no unfinished upstream
	// dependency — i.e. the things that can actually be started right now.
	let highlightReady = false;
	let lastGraphDiagnosticsKey = '';
	let dependencyScrollEl: HTMLDivElement | null = null;
	let dependencyFitEl: HTMLDivElement | null = null;
	let dependencyViewportWidth = 0;
	let dependencyScrollLeft = 0;
	// Lane focus: the swim lane the cursor is over (transient) and one held by
	// interaction (clicking a task / header / new-item button). The active lane
	// gets its tint band + full-opacity nodes; every other lane recedes, except
	// cross-lane tasks that are part of the active lane's dependency chain — those
	// stay in focus and their own lane gets a softer tint.
	let hoveredLaneKey: string | null = null;
	let pinnedLaneKey: string | null = null;
	let overviewScrollEl: HTMLDivElement | null = null;
	let overviewViewportWidth = 0;
	let overviewScrollLeft = 0;
	let shouldAutoFocusOverview = defaultGraphMode === 'overview';
	let showCompletedInOverview = false;
	let overviewGrouping: HybridTimelineGrouping = 'project';
	let overviewPrefsHydrated = false;
	// GP3 project filter: paths of projects the user has hidden from the
	// dependency graph. Persisted to settings so the choice survives re-renders
	// and reloads (same pattern as the overview prefs above).
	let hiddenProjectPaths = new Set<string>();
	let projectFilterHydrated = false;
	let projectFilterOpen = false;

	$: if (defaultGraphMode !== appliedGraphMode) {
		graphMode = defaultGraphMode;
		appliedGraphMode = defaultGraphMode;
	}

	$: tasks = flattenTaskGroups($groups);
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
	$: dependencyGraphTasks = (() => {
		const projectRecords = visibleScopeTasks.filter((task) => task.type === 'project');
		const showIndependent = showIndependentInDependency || connectedDependencyPaths.size === 0;
		const dependencyTasks = visibleScopeTasks.filter((task) => {
			if (task.type !== 'task') return false;
			if (connectedDependencyPaths.has(task.path)) return true;
			if (task.is_complete) return false;
			return showIndependent || !!task.parent_task;
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
	$: hiddenProjectCount = graphProjects.filter((project) => hiddenProjectPaths.has(project.path)).length;

	// Universal working-calendar config (holidays + per-area workweek toggle),
	// threaded into every date resolution so the graph, timeline, and node cards
	// all agree with the list/detail views.
	$: holidayCalendar = splitHolidayCalendar(plugin.settings.holidays);
	$: calendarConfig = {
		holidays: holidayCalendar.holidays,
		recurringHolidays: holidayCalendar.recurringHolidays,
		areaWorkweek: plugin.settings.areaWorkweek,
	};

	// Same resolution the layout uses, exposed so undated node cards can show a
	// projected finish (~date) inferred from the dependency chain.
	$: graphSchedule = buildTaskSchedule(dependencyGraphTasks.filter((task) => task.type === 'task'), { allTasks: tasks, calendarConfig });
	function projectedEndLabel(path: string): string | null {
		const entry = graphSchedule.get(path);
		if (!entry) return null;
		return formatHumanDate(formatDateISO(entry.end), formatDateISO(startOfToday()));
	}

	$: layout = buildTaskGraph(dependencyGraphTasks, {
		nodeWidth: 196,
		nodeHeight: DEPENDENCY_NODE_HEIGHT,
		horizontalGap: 40,
		verticalGap: DEPENDENCY_ROW_GAP,
		padding: DEPENDENCY_GRAPH_PADDING,
		paddingLeft: DEPENDENCY_GRAPH_PADDING_LEFT,
		calendarConfig,
	});
	// User zoom multiplies the fit-to-width base scale; Ctrl/Cmd+wheel, toolbar
	// buttons, and drag-panning make large graphs navigable.
	let userZoom = 1;
	$: fitDependencyScale = dependencyViewportWidth > 0 && layout.width > 0
		? Math.min(1, dependencyViewportWidth / layout.width)
		: 1;
	$: dependencyScale = Math.min(2.5, Math.max(0.15, fitDependencyScale * userZoom));
	$: fittedDependencyWidth = Math.max(1, Math.round(layout.width * dependencyScale));
	$: fittedDependencyHeight = Math.max(1, Math.round(layout.height * dependencyScale));
	$: dependencyLaneStickyOffset = dependencyScale > 0 ? dependencyScrollLeft / dependencyScale : 0;
	$: nodesByPath = new Map(layout.nodes.map((node) => [node.path, node]));
	// Raw lane geometry: topPx/heightPx match the actual node rows exactly. The
	// tint bands (GP4) use this so they stay inside their lane; the headers below
	// inflate short lanes for label room, which the bands must NOT inherit or a
	// short lane's tint would spill into the next lane's gap and overlap it.
	$: dependencyLaneGeometry = buildLaneHeaders(
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
		DEPENDENCY_NODE_HEIGHT,
		DEPENDENCY_ROW_GAP,
		DEPENDENCY_GRAPH_PADDING,
	);
	$: dependencyLaneHeaders = dependencyLaneGeometry.map((header) => {
		// Project lanes grow their box symmetrically by the lane pad (top and
		// bottom) so the header chip and the tint band share one aligned box, and
		// short lanes get label room without a downward-only inflation. `rawHeightPx`
		// preserves the un-padded node-row height for the compact/rotate class
		// decision (padding must not flip a lane's label layout).
		const isProject = !header.isSatellite && header.key !== '__unassigned__';
		return isProject
			? {
				...header,
				topPx: header.topPx - DEPENDENCY_LANE_PAD,
				heightPx: header.heightPx + DEPENDENCY_LANE_PAD * 2,
				rawHeightPx: header.heightPx,
			}
			: { ...header, rawHeightPx: header.heightPx };
	});
	// Satellites are thin strips; keep them out of the shared gutter-width sizing.
	$: dependencyLaneWidth = computeDependencyLaneWidth(
		dependencyLaneHeaders.filter((lane) => !lane.isSatellite),
		DEPENDENCY_LANE_MIN_WIDTH,
		DEPENDENCY_LANE_MAX_WIDTH,
	);
	$: dependencyEmpty = layout.nodes.length === 0;
	$: readyCount = layout.nodes.filter(isReadyNode).length;

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

	let resizeObserver: ResizeObserver | null = null;

	function updateViewport(): void {
		dependencyViewportWidth = dependencyScrollEl?.clientWidth ?? 0;
		dependencyScrollLeft = dependencyScrollEl?.scrollLeft ?? 0;
		overviewViewportWidth = overviewScrollEl?.clientWidth ?? 0;
	}

	onMount(() => {
		showCompletedInOverview = plugin.settings.overviewGraphShowCompleted;
		overviewGrouping = plugin.settings.overviewGraphGrouping;
		overviewPrefsHydrated = true;

		hiddenProjectPaths = new Set(plugin.settings.graphHiddenProjects ?? []);
		projectFilterHydrated = true;

		updateViewport();

		if (typeof ResizeObserver !== 'undefined') {
			resizeObserver = new ResizeObserver(() => updateViewport());
		}

		window.addEventListener('resize', updateViewport);
		return () => {
			window.removeEventListener('resize', updateViewport);
			resizeObserver?.disconnect();
			resizeObserver = null;
			cancelHoverClear();
		};
	});

	// Mode switches destroy and recreate the scroll containers, so re-observe
	// whichever element is currently bound (ResizeObserver dedupes repeats).
	$: if (resizeObserver && dependencyScrollEl) resizeObserver.observe(dependencyScrollEl);
	$: if (resizeObserver && overviewScrollEl) resizeObserver.observe(overviewScrollEl);

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
	$: hybridTimeline = buildHybridTimeline(overviewTasks, { grouping: overviewGrouping, calendarConfig });
	$: timelineTaskCount = hybridTimeline.defined.length + hybridTimeline.underdefined.length;
	$: hiddenCompletedCount = Math.max(0, tasks.filter((task) => task.type === 'task' && task.is_complete).length - overviewTasks.filter((task) => task.type === 'task' && task.is_complete).length);
	$: timelineEmpty = timelineTaskCount === 0;
	$: overviewSpanDays = Math.max(1, diffDays(hybridTimeline.rangeStart, hybridTimeline.rangeEnd) + 1);
	$: overviewCanvasWidth = Math.max(overviewViewportWidth, Math.round(overviewSpanDays * OVERVIEW_PIXELS_PER_DAY));
	$: todayPercent = percentAtDate(startOfToday(), hybridTimeline.rangeStart, hybridTimeline.rangeEnd);
	$: dayWidthPercent = 100 / overviewSpanDays;
	$: visibleStartPercent = overviewCanvasWidth > 0 ? (overviewScrollLeft / overviewCanvasWidth) * 100 : 0;
	$: visibleEndPercent = overviewCanvasWidth > 0 ? ((overviewScrollLeft + overviewViewportWidth) / overviewCanvasWidth) * 100 : 100;
	$: virtualStartPercent = Math.max(0, visibleStartPercent - 8);
	$: virtualEndPercent = Math.min(100, visibleEndPercent + 8);
	$: visibleDefined = hybridTimeline.defined.filter((item) => intersectsViewport(item.leftPercent, item.widthPercent, virtualStartPercent, virtualEndPercent));
	$: visibleUnderdefined = hybridTimeline.underdefined.filter((item) => intersectsViewport(item.leftPercent, item.widthPercent, virtualStartPercent, virtualEndPercent));
	$: timelineTicks = buildTimelineTicks(hybridTimeline.rangeStart, hybridTimeline.rangeEnd);
	// Bands show the universal holiday list plus any legacy per-project holidays.
	$: overviewHolidayDates = new Set<string>([
		...collectProjectHolidayDates(overviewTasks),
		...holidayCalendar.holidays,
	]);
	$: overviewRecurringHolidays = new Set<string>(holidayCalendar.recurringHolidays);
	$: nonWorkingBands = buildTimelineNonWorkingBands(hybridTimeline.rangeStart, hybridTimeline.rangeEnd, overviewHolidayDates, overviewRecurringHolidays);
	$: definedTrackHeightPx = Math.max(42, hybridTimeline.definedRowCount * HYBRID_ROW_HEIGHT + Math.max(0, hybridTimeline.definedRowCount - 1) * HYBRID_ROW_GAP + HYBRID_TRACK_PADDING * 2);
	$: underdefinedTrackHeightPx = Math.max(42, hybridTimeline.underdefinedRowCount * HYBRID_ROW_HEIGHT + Math.max(0, hybridTimeline.underdefinedRowCount - 1) * HYBRID_ROW_GAP + HYBRID_TRACK_PADDING * 2);
	$: definedStatusSummary = summarizeByStatus(hybridTimeline.defined.map((item) => item.task));
	$: underdefinedStatusSummary = summarizeByStatus(hybridTimeline.underdefined.map((item) => item.task));
	$: definedLaneHeaders = buildLaneHeaders(hybridTimeline.definedGroups, HYBRID_ROW_HEIGHT, HYBRID_ROW_GAP, HYBRID_TRACK_PADDING);
	$: underdefinedLaneHeaders = buildLaneHeaders(hybridTimeline.underdefinedGroups, HYBRID_ROW_HEIGHT, HYBRID_ROW_GAP, HYBRID_TRACK_PADDING);
	// When either track shows a lane sidebar, BOTH tracks and the axis reserve
	// the same gutter — otherwise their percentage bases differ and the axis
	// "Today" line lands offset from the tracks' today band.
	$: overviewSidebarPx = definedLaneHeaders.length > 1 || underdefinedLaneHeaders.length > 1
		? HYBRID_SIDEBAR_WIDTH
		: 0;

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

	// ── GP3 project filter ──────────────────────────────────────────────────────
	function persistHiddenProjects(): void {
		if (!projectFilterHydrated) return;
		plugin.settings.graphHiddenProjects = [...hiddenProjectPaths];
		void plugin.saveSettings();
	}

	function toggleProjectVisibility(projectPath: string): void {
		const next = new Set(hiddenProjectPaths);
		if (next.has(projectPath)) {
			next.delete(projectPath);
		} else {
			next.add(projectPath);
		}
		hiddenProjectPaths = next;
		persistHiddenProjects();
	}

	function showAllProjects(): void {
		if (hiddenProjectPaths.size === 0) return;
		hiddenProjectPaths = new Set();
		persistHiddenProjects();
	}

	// A node is "ready" when it's open and nothing incomplete is upstream of it.
	function isReadyNode(node: TaskGraphNode): boolean {
		return !node.task.is_complete && node.blockedIncomingCount === 0;
	}

	function toggleHighlightReady(): void {
		highlightReady = !highlightReady;
	}

	// ── Pan & zoom (dependency mode) ────────────────────────────────────────────

	function zoomBy(factor: number, anchor?: { clientX: number; clientY: number }): void {
		const el = dependencyScrollEl;
		const prev = dependencyScale;
		userZoom = Math.min(8, Math.max(0.2, userZoom * factor));
		if (!el) return;
		requestAnimationFrame(() => {
			const next = dependencyScale;
			if (next === prev || prev === 0) return;
			const rect = el.getBoundingClientRect();
			const cx = anchor ? anchor.clientX - rect.left : el.clientWidth / 2;
			const cy = anchor ? anchor.clientY - rect.top : el.clientHeight / 2;
			el.scrollLeft = (el.scrollLeft + cx) * (next / prev) - cx;
			el.scrollTop = (el.scrollTop + cy) * (next / prev) - cy;
			dependencyScrollLeft = el.scrollLeft;
		});
	}

	function resetZoom(): void {
		userZoom = 1;
	}

	function onDependencyWheel(event: WheelEvent): void {
		if (!event.ctrlKey && !event.metaKey) return;
		event.preventDefault();
		zoomBy(event.deltaY < 0 ? 1.15 : 1 / 1.15, event);
	}

	let isPanning = false;
	let panStart = { x: 0, y: 0, scrollX: 0, scrollY: 0 };

	// Two-finger pinch-to-zoom. Every live touch point is tracked; with two down
	// we zoom by their distance ratio and anchor at the pinch midpoint (reusing
	// zoomBy's re-anchor math). Panning is suspended while pinching.
	const activePointers = new Map<number, { x: number; y: number }>();
	let pinchLastDist = 0;

	function pinchDistance(): number {
		const pts = [...activePointers.values()];
		if (pts.length < 2) return 0;
		return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
	}

	function pinchMidpoint(): { clientX: number; clientY: number } {
		const pts = [...activePointers.values()];
		return { clientX: (pts[0].x + pts[1].x) / 2, clientY: (pts[0].y + pts[1].y) / 2 };
	}

	function onDependencyPointerDown(event: PointerEvent): void {
		if (!dependencyScrollEl) return;
		// Track touch points for pinch detection even when a tap lands on a node
		// button — the event still bubbles to this scroll surface.
		if (event.pointerType === 'touch') {
			activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
			if (activePointers.size === 2) {
				// Entering a pinch: cancel any in-progress pan.
				isPanning = false;
				pinchLastDist = pinchDistance();
				return;
			}
			if (activePointers.size > 2) return;
		}
		if (event.button !== 0) return;
		const target = event.target as HTMLElement;
		// Lane header chips (incl. their bare padding between the focus/add buttons)
		// are inert to pan and never clear the pin — the chip's own buttons drive
		// focus/add. Everything else on the canvas is a pan/clear surface.
		if (target.closest('button, a, input, .tt-dependency-lane-header')) return;
		// Empty-canvas press clears the pinned chain highlight + held lane focus.
		pinnedTracePath = null;
		pinnedLaneKey = null;
		isPanning = true;
		panStart = {
			x: event.clientX,
			y: event.clientY,
			scrollX: dependencyScrollEl.scrollLeft,
			scrollY: dependencyScrollEl.scrollTop,
		};
		dependencyScrollEl.setPointerCapture(event.pointerId);
	}

	function onDependencyPointerMove(event: PointerEvent): void {
		if (event.pointerType === 'touch' && activePointers.has(event.pointerId)) {
			activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
		}
		if (activePointers.size >= 2) {
			const dist = pinchDistance();
			if (pinchLastDist > 0 && dist > 0) {
				zoomBy(dist / pinchLastDist, pinchMidpoint());
			}
			pinchLastDist = dist;
			return;
		}
		if (!isPanning || !dependencyScrollEl) return;
		dependencyScrollEl.scrollLeft = panStart.scrollX - (event.clientX - panStart.x);
		dependencyScrollEl.scrollTop = panStart.scrollY - (event.clientY - panStart.y);
		dependencyScrollLeft = dependencyScrollEl.scrollLeft;
	}

	function onDependencyPointerUp(event: PointerEvent): void {
		activePointers.delete(event.pointerId);
		if (activePointers.size < 2) {
			pinchLastDist = 0;
			// Hand a lingering single finger back to panning from its current
			// spot so lifting one pinch finger doesn't jump the graph.
			if (activePointers.size === 1 && dependencyScrollEl) {
				const [pt] = [...activePointers.values()];
				isPanning = true;
				panStart = { x: pt.x, y: pt.y, scrollX: dependencyScrollEl.scrollLeft, scrollY: dependencyScrollEl.scrollTop };
			}
		}
		if (activePointers.size === 0) isPanning = false;
	}

	// Map a viewport Y to the lane whose (pre-scaled) band contains it. Measured
	// from the fit box, whose top-left is the origin the band positions use, so it
	// stays correct through vertical scroll and zoom. Header chips share each
	// lane's Y range, so hovering a header resolves to its lane too.
	function laneAtClientY(clientY: number): string | null {
		if (!dependencyFitEl) return null;
		const relY = clientY - dependencyFitEl.getBoundingClientRect().top;
		for (const lane of dependencyLaneHeaders) {
			const top = lane.topPx * dependencyScale;
			if (relY >= top && relY <= top + lane.heightPx * dependencyScale) return lane.key;
		}
		return null;
	}

	// Desktop hover drives transient lane focus (touch has no hover — there focus
	// is held by a tap-pin instead). Suppressed mid-pan so dragging doesn't churn.
	function onDependencyMouseMove(event: MouseEvent): void {
		if (isPanning || !hoverCapable) return;
		hoveredLaneKey = laneAtClientY(event.clientY);
	}

	function onDependencyMouseLeave(): void {
		clearTrace();
		hoveredLaneKey = null;
	}

	function laneKeyForPath(path: string): string {
		return nodesByPath.get(path)?.laneKey ?? '__unassigned__';
	}

	// ── Hover state + click-pinned chain highlight ──────────────────────────────

	// Set on node hover; drives the hover "+" add-dependent button and the task
	// preview tooltip only (no longer the chain highlight). Cleared when the
	// pointer leaves the graph surface (not the node itself) so the "+" stays
	// reachable at the node's edge.
	let hoverTracePath: string | null = null;
	// A clicked node pins its dependency chain highlight so it survives mouse
	// movement; cleared by clicking empty canvas or pressing Esc.
	let pinnedTracePath: string | null = null;
	// Desktop has real hover, so the "+" tracks hover and hides on hover-off.
	// Touch has no hover — there a tap-pin is what surfaces the "+".
	const hoverCapable = typeof window !== 'undefined' && !!window.matchMedia?.('(hover: hover)').matches;

	function computeTrace(path: string, edges: TaskGraphEdge[]): { nodes: Set<string>; edges: Set<string> } {
		const nodes = new Set<string>([path]);
		const traced = new Set<string>();
		const walk = (start: string, direction: 'up' | 'down'): void => {
			const stack = [start];
			while (stack.length > 0) {
				const current = stack.pop();
				if (current === undefined) continue;
				for (const edge of edges) {
					if (edge.isParentEdge || traced.has(`${direction}:${edge.id}`)) continue;
					if (direction === 'down' && edge.from === current) {
						traced.add(`${direction}:${edge.id}`);
						nodes.add(edge.to);
						stack.push(edge.to);
					} else if (direction === 'up' && edge.to === current) {
						traced.add(`${direction}:${edge.id}`);
						nodes.add(edge.from);
						stack.push(edge.from);
					}
				}
			}
		};
		walk(path, 'up');
		walk(path, 'down');
		return {
			nodes,
			edges: new Set([...traced].map((key) => key.slice(key.indexOf(':') + 1))),
		};
	}

	// Chain highlight is click-driven only: clicking a node pins its chain, and
	// clicking empty canvas (or Esc) clears it. Hover no longer traces — it was
	// redundant with the pin and left the highlight lingering after click-off.
	// (hoverTracePath still drives the hover "+" button and task preview below.)
	$: traceSets = (() => {
		if (!pinnedTracePath || !nodesByPath.has(pinnedTracePath)) return null;
		const sets = computeTrace(pinnedTracePath, layout.edges);
		return sets.edges.size > 0 ? sets : null;
	})();

	// Node → lane-header key (nulls map to the unassigned lane's key), so hover
	// detection and focus classification agree with the rendered lane headers.
	const laneKeyOf = (node: TaskGraphNode): string => node.laneKey ?? '__unassigned__';

	$: activeLaneKey = pinnedLaneKey ?? hoveredLaneKey;

	// Focus set for the active lane: the lane's own nodes plus every node reachable
	// from them along dependency edges (the cross-lane chain), the edges internal
	// to that set, and the *other* lanes those reached nodes live in (→ soft tint).
	$: laneFocus = (() => {
		if (!activeLaneKey) return null;
		const laneNodes = layout.nodes.filter((node) => laneKeyOf(node) === activeLaneKey);
		if (laneNodes.length === 0) return null;
		const nodes = new Set<string>();
		for (const node of laneNodes) {
			for (const path of computeTrace(node.path, layout.edges).nodes) nodes.add(path);
		}
		const edges = new Set<string>();
		for (const edge of layout.edges) {
			if (nodes.has(edge.from) && nodes.has(edge.to)) edges.add(edge.id);
		}
		const softLanes = new Set<string>();
		for (const node of layout.nodes) {
			if (!nodes.has(node.path)) continue;
			const key = laneKeyOf(node);
			if (key !== activeLaneKey) softLanes.add(key);
		}
		return { active: activeLaneKey, nodes, edges, softLanes };
	})();

	// Per-lane focus state, precomputed reactively. It MUST reference `laneFocus`
	// textually here so Svelte re-runs it (and the template class strings that read
	// this map) whenever focus changes — a helper that reads `laneFocus` inside its
	// body would not register as a template dependency, so the bands/headers would
	// never update on hover. '' = nothing focused (resting).
	$: laneStates = (() => {
		const map = new Map<string, '' | 'active' | 'soft' | 'dim'>();
		for (const lane of dependencyLaneHeaders) {
			if (!laneFocus) {
				map.set(lane.key, '');
			} else if (lane.key === laneFocus.active) {
				map.set(lane.key, 'active');
			} else {
				map.set(lane.key, laneFocus.softLanes.has(lane.key) ? 'soft' : 'dim');
			}
		}
		return map;
	})();

	const laneStateClass = (state: '' | 'active' | 'soft' | 'dim'): string => (state ? `is-lane-${state}` : '');

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
		showTaskHoverPreview(event, node.task);
	}

	function clearTrace(): void {
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
		pinnedLaneKey = laneKeyForPath(path);
		onOpen(path);
	}

	function onGraphKeydown(event: KeyboardEvent): void {
		if (event.key === 'Escape' && (pinnedTracePath || pinnedLaneKey)) {
			pinnedTracePath = null;
			pinnedLaneKey = null;
			event.stopPropagation();
		}
	}

	// ── Create dependent task from a hovered node ───────────────────────────────

	function createDependentTask(task: Task): void {
		// Adding a dependent from a node holds focus on that node's lane.
		pinnedLaneKey = laneKeyForPath(task.path);
		new CreateTaskModal(plugin.app, plugin, 'task', {
			initialDependsOn: [task.path],
			prefill: {
				parent_task: task.parent_task,
				area: task.area,
				labels: task.labels,
				priority: task.priority,
			},
		}).open();
	}

	// GP5: tapping a lane header pins/unpins focus on that lane (a toggle) rather
	// than adding a task — add moved to the dedicated `+` subshape below. Pinning a
	// new lane replaces any existing pin; tapping the pinned lane again clears it.
	function toggleLaneFocus(laneKey: string): void {
		pinnedLaneKey = pinnedLaneKey === laneKey ? null : laneKey;
	}

	// Clicking a project's lane header creates a new task already parented to it,
	// and holds focus on that lane so the new card lands in a focused lane.
	function createTaskInProject(projectPath: string): void {
		pinnedLaneKey = projectPath;
		const project = tasks.find((task) => task.path === projectPath);
		new CreateTaskModal(plugin.app, plugin, 'task', {
			prefill: {
				parent_task: projectPath.replace(/\.md$/, ''),
				area: project?.area ?? undefined,
			},
		}).open();
	}

	// Only genuine project lanes are clickable — satellite / unassigned strips
	// aren't a project you can parent a task to.
	function isProjectLaneHeader(header: { key: string; isSatellite: boolean }): boolean {
		return !header.isSatellite && header.key !== '__unassigned__';
	}

	// Project records keyed by path, so a lane can resolve its owning project's
	// configured colour (via its area) for the GP4 swim-lane tint.
	$: projectsByPath = new Map(
		tasks.filter((task) => task.type === 'project').map((project) => [project.path, project]),
	);

	// The lane-tint colour for a project lane: the project's area colour, if the
	// project has an area and that area has a configured colour. Satellite /
	// unassigned strips and projects without a colour resolve to null (no tint).
	function laneTint(header: { key: string; isSatellite: boolean }): string | null {
		if (!isProjectLaneHeader(header)) return null;
		const area = projectsByPath.get(header.key)?.area;
		if (!area) return null;
		return areaColors?.[area] ?? null;
	}

	function nodeStyle(node: TaskGraphNode): string {
		const accent = statusColors?.[node.task.status] ?? 'var(--interactive-accent)';
		// Fixed height: the layout engine spaces rows assuming node.height, so the
		// card must never grow past it — content clamps/ellipsizes instead.
		return `left:${node.x}px;top:${node.y}px;width:${node.width}px;height:${node.height}px;--tt-node-accent:${accent};--tt-priority-accent:${PRIORITY_COLORS[node.task.priority] ?? PRIORITY_COLORS.None};`;
	}

	function subtitle(node: TaskGraphNode): string {
		if (node.blockedIncomingCount > 0) {
			return `${node.blockedIncomingCount} open ${node.blockedIncomingCount === 1 ? 'dependency' : 'dependencies'}`;
		}
		if (node.incomingCount > 0) {
			return `${node.incomingCount} ${node.incomingCount === 1 ? 'dependency' : 'dependencies'}`;
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

	function getLaneHeaderClass(lane: { label: string; heightPx: number; rawHeightPx?: number; isSatellite?: boolean }): string {
		// Decide compact/rotate from the un-padded node-row height so the symmetric
		// lane padding never flips a lane's label layout.
		const base = laneHeaderClass(
			{ label: lane.label, heightPx: lane.rawHeightPx ?? lane.heightPx },
			DEPENDENCY_LANE_COMPACT_HEIGHT,
			DEPENDENCY_LANE_ROTATE_LABEL_LENGTH,
		);
		return lane.isSatellite ? `${base} is-satellite` : base;
	}

	// Marquee action for a project lane label: if the name is taller than its
	// (vertical) viewport, expose the overflow so CSS can scroll it on hover —
	// letting the full name be read without a tooltip. `label` is passed so the
	// action re-measures when the text changes.
	function marqueeLabel(run: HTMLElement, _label: string) {
		const viewport = run.parentElement;
		let raf = 0;
		const measure = (): void => {
			if (!viewport) return;
			const overflow = viewport.scrollHeight - viewport.clientHeight;
			if (overflow > 6) {
				viewport.style.setProperty('--tt-marquee', `${overflow}px`);
				viewport.style.setProperty('--tt-marquee-dur', `${Math.max(2.6, overflow / 24)}s`);
				viewport.classList.add('is-truncated');
			} else {
				viewport.classList.remove('is-truncated');
				viewport.style.removeProperty('--tt-marquee');
				viewport.style.removeProperty('--tt-marquee-dur');
			}
		};
		const schedule = (): void => { cancelAnimationFrame(raf); raf = requestAnimationFrame(measure); };
		schedule();
		const observer = new ResizeObserver(schedule);
		if (viewport) observer.observe(viewport);
		return {
			update: schedule,
			destroy(): void { cancelAnimationFrame(raf); observer.disconnect(); },
		};
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
		<div class="tt-graph-toolbar-row">
			<div class="tt-graph-mode-toggle" role="group" aria-label="Graph mode">
				<button type="button" class="tt-mode-btn" class:is-active={graphMode === 'dependency'} aria-pressed={graphMode === 'dependency'} on:click={() => graphMode = 'dependency'}>Dependency</button>
				<button type="button" class="tt-mode-btn" class:is-active={graphMode === 'overview'} aria-pressed={graphMode === 'overview'} on:click={() => graphMode = 'overview'}>Overview</button>
			</div>
		</div>

		<div class="tt-graph-summary">
			{#if graphMode === 'dependency'}
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
					<button type="button" class="tt-graph-pill tt-graph-pill-toggle" on:click={toggleIndependentVisibility}>
						<span class="tt-graph-pill-label">Independent</span>
						<strong>{showIndependentInDependency ? 'Shown' : `${hiddenIndependentCount} hidden`}</strong>
					</button>
				{/if}
				{#if graphProjects.length > 1}
					<div class="tt-graph-project-filter">
						<button
							type="button"
							class="tt-graph-pill tt-graph-pill-toggle"
							class:is-active={hiddenProjectCount > 0}
							aria-haspopup="true"
							aria-expanded={projectFilterOpen}
							on:click={() => projectFilterOpen = !projectFilterOpen}
						>
							<span class="tt-graph-pill-icon" use:icon={'filter'}></span>
							<span class="tt-graph-pill-label">Projects</span>
							<strong>{hiddenProjectCount > 0 ? `${hiddenProjectCount} hidden` : 'All'}</strong>
						</button>
						{#if projectFilterOpen}
							<button
								type="button"
								class="tt-graph-project-filter-backdrop"
								aria-label="Close project filter"
								on:click={() => projectFilterOpen = false}
							></button>
							<div class="tt-graph-project-filter-menu" role="menu">
								<div class="tt-graph-project-filter-head">
									<span class="tt-graph-project-filter-title">Show projects</span>
									<button
										type="button"
										class="tt-btn tt-btn-sm"
										disabled={hiddenProjectCount === 0}
										on:click={showAllProjects}
									>Show all</button>
								</div>
								<div class="tt-graph-project-filter-list">
									{#each graphProjects as project (project.path)}
										<label class="tt-graph-project-filter-item">
											<input
												type="checkbox"
												checked={!hiddenProjectPaths.has(project.path)}
												on:change={() => toggleProjectVisibility(project.path)}
											/>
											<span class="tt-graph-project-filter-name">{project.name}</span>
										</label>
									{/each}
								</div>
							</div>
						{/if}
					</div>
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
				<button type="button" class="tt-graph-pill tt-graph-pill-toggle" on:click={() => showCompletedInOverview = !showCompletedInOverview}>
					<span class="tt-graph-pill-label">Completed</span>
					<strong>{showCompletedInOverview ? 'Shown' : `${hiddenCompletedCount} hidden`}</strong>
				</button>
				<button type="button" class="tt-graph-pill tt-graph-pill-toggle" on:click={() => overviewGrouping = overviewGrouping === 'project' ? 'dependency' : overviewGrouping === 'dependency' ? 'none' : 'project'}>
					<span class="tt-graph-pill-label">Grouping</span>
					<strong>{groupingLabel(overviewGrouping)}</strong>
				</button>
				<button type="button" class="tt-graph-pill tt-graph-pill-toggle" on:click={() => focusOverviewAroundToday()}>
					<strong>Jump to Today</strong>
				</button>
			{/if}
		</div>
		<p class="tt-graph-note" id="tt-dep-graph-legend">
			{#if graphMode === 'dependency'}
				Graph respects current filters. Solid amber paths have unfinished upstream dependencies. Dashed gray paths show subtask containment (a task nested under a parent task); project grouping is shown by the swim lanes. Red rings mark cycles. Independent tasks are hidden by default to keep the dependency map readable.
			{:else}
				Defined track shows dated/inferred windows. Underdefined track shows no-estimate tasks that anchor after resolved upstream work. Timeline opens focused around today; drag horizontally for history/future.
			{/if}
		</p>
	</div>

	{#if graphMode === 'dependency'}
		{#if dependencyEmpty}
			<div class="tt-graph-empty">No dependency relationships found. Add depends_on links between tasks to see the graph.</div>
		{:else}
			<div class="tt-graph-canvas">
			<div
				class="tt-graph-scroll"
				class:is-panning={isPanning}
				bind:this={dependencyScrollEl}
				role="application"
				aria-labelledby="tt-dep-graph-legend"
				on:scroll={onDependencyScroll}
				on:wheel|nonpassive={onDependencyWheel}
				on:pointerdown={onDependencyPointerDown}
				on:pointermove={onDependencyPointerMove}
				on:pointerup={onDependencyPointerUp}
				on:pointercancel={onDependencyPointerUp}
				on:mousemove={onDependencyMouseMove}
				on:mouseleave={onDependencyMouseLeave}
			>
				<div class="tt-graph-fit" bind:this={dependencyFitEl} style={`width:${fittedDependencyWidth}px;height:${fittedDependencyHeight}px;`}>
				{#if dependencyLaneHeaders.length > 0}
					<!-- Lane tint bands live in the fit box (not the scaled stage) so they
					     span the full visible width even when the graph is narrower than the
					     panel; positions are pre-scaled to match the stage. -->
					<div class="tt-dependency-lane-bands" aria-hidden="true">
						{#each dependencyLaneHeaders as lane (lane.key)}
							{@const tint = laneTint(lane)}
							{@const state = laneStates.get(lane.key) ?? ''}
							<!-- Tint is focus-gated: full for the active lane, reduced for the
							     soft lanes its chain reaches, invisible at rest. Kept mounted
							     (not {#if}-toggled) so the CSS opacity transition fades it in and
							     out instead of popping. Shares the header's padded box. -->
							{#if tint}
								<div
									class={`tt-dependency-lane-band ${state === 'active' ? 'is-active' : state === 'soft' ? 'is-soft' : ''}`}
									style={`top:${lane.topPx * dependencyScale}px;height:${lane.heightPx * dependencyScale}px;--tt-lane-tint:${tint};`}
								></div>
							{/if}
						{/each}
					</div>
				{/if}
				<div class="tt-graph-stage" class:highlight-ready={highlightReady} style={`width:${layout.width}px;height:${layout.height}px;transform:scale(${dependencyScale});`}>
					{#if dependencyLaneHeaders.length > 0}
						<div class="tt-dependency-lanes" style={`--tt-dependency-lane-width:${dependencyLaneWidth}px;transform:translateX(${dependencyLaneStickyOffset}px);`}>
							{#each dependencyLaneHeaders as lane (lane.key)}
								{#if isProjectLaneHeader(lane)}
									{@const pinned = pinnedLaneKey === lane.key}
									<!-- GP5: chip is now a container of two subshapes — the label body
									     (tap → focus/pin the lane) and a `+` at the bottom (tap → add a
									     task to the project). They share the chip's border/tint so they
									     read as one shape. Grows to show the full title while pinned. -->
									<div
										class={`${getLaneHeaderClass(lane)} is-clickable ${laneStateClass(laneStates.get(lane.key) ?? '')}`}
										class:is-lane-pinned={pinned}
										style={`top:${lane.topPx}px;height:${lane.heightPx}px;`}
									>
										<button
											type="button"
											class="tt-dependency-lane-focus"
											aria-pressed={pinned}
											aria-label={`Focus ${lane.label} lane`}
											on:click={() => toggleLaneFocus(lane.key)}
										>
											<span class="tt-dependency-lane-label">
												<span class="tt-dependency-lane-label-run" use:marqueeLabel={lane.label}>{lane.label}</span>
											</span>
											<span class="tt-dependency-lane-count">{lane.taskCount}</span>
										</button>
										<button
											type="button"
											class="tt-dependency-lane-add-btn"
											aria-label={`Add task to ${lane.label}`}
											on:click={() => createTaskInProject(lane.key)}
										>
											<span class="tt-dependency-lane-add" use:icon={'plus'}></span>
										</button>
									</div>
								{:else}
									<div
										class={`${getLaneHeaderClass(lane)} ${laneStateClass(laneStates.get(lane.key) ?? '')}`}
										style={`top:${lane.topPx}px;height:${lane.heightPx}px;`}
										aria-hidden="true"
									>
										<span class="tt-dependency-lane-label">{lane.label}</span>
										<span class="tt-dependency-lane-count">{lane.taskCount}</span>
									</div>
								{/if}
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
									class:is-traced={traceSets?.edges.has(edge.id)}
									class:is-dim={laneFocus && !laneFocus.edges.has(edge.id)}
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
							class:is-ready={highlightReady && isReadyNode(node)}
							class:is-dim={laneFocus && !laneFocus.nodes.has(node.path)}
							style={nodeStyle(node)}
							on:click={() => onNodeClick(node.path)}
							on:keydown={onGraphKeydown}
							on:mouseenter={(event) => onNodeHover(event, node)}
							on:mouseleave={(event) => onNodeHoverLeave(event, node)}
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
							{:else if projectedEndLabel(node.path)}
								<span aria-label="Projected from dependencies">~{projectedEndLabel(node.path)}</span>
								{/if}
							</div>
						</button>
						{#if (hoverTracePath === node.path || (!hoverCapable && pinnedTracePath === node.path)) && node.task.type === 'task'}
							<!-- Spawn a task depending on this one (inherits project/area/labels/priority).
							     Shown on hover (mouse) or, on touch (no hover), when the node is pinned by a tap. -->
							<button
								type="button"
								class="tt-node-add"
								style={`left:${node.x + node.width - 4}px;top:${node.y + node.height / 2 - 14}px;`}
								aria-label={`New task blocked by ${node.task.name}`}
								on:click|stopPropagation={() => createDependentTask(node.task)}
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
					<button type="button" class="tt-zoom-btn tt-zoom-reset" aria-label="Reset to fit width" on:click={resetZoom}>
						{Math.round(dependencyScale * 100)}%
					</button>
					<button type="button" class="tt-zoom-btn" aria-label="Zoom in" on:click={() => zoomBy(1.25)}>
						<span class="tt-zoom-icon" use:icon={'plus'}></span>
					</button>
				</div>
			</div>
		{/if}
	{:else}
		{#if timelineEmpty}
			<div class="tt-graph-empty">No scheduled tasks. Add a start or due date, or chain tasks with dependencies and estimated durations to see them here.</div>
		{:else}
			<div class="tt-overview-scroll" bind:this={overviewScrollEl} on:scroll={onOverviewScroll}>
				<div class="tt-overview-axis" style={`width:${overviewCanvasWidth}px;`}>
					<!-- Inner wrapper shares the tracks' sidebar gutter so its % base matches the track canvases. -->
					<div class="tt-overview-axis-inner" style={`margin-left:${overviewSidebarPx}px;width:${overviewCanvasWidth - overviewSidebarPx}px;`}>
						{#each nonWorkingBands as band (band.id)}
							<div class="tt-overview-nonworking" class:is-weekend={band.kind === 'weekend'} class:is-holiday={band.kind === 'holiday'} style={`left:${band.leftPercent.toFixed(3)}%;width:${band.widthPercent.toFixed(3)}%;`}></div>
						{/each}
						{#each timelineTicks as tick}
							<div class="tt-overview-tick" class:is-start={tick.position === 'start'} class:is-end={tick.position === 'end'} style={`left:${tick.leftPercent.toFixed(3)}%;`}>
								<span>{tick.label}</span>
							</div>
						{/each}
						<div class="tt-overview-today" style={`left:${todayPercent.toFixed(3)}%;`}><span>Today</span></div>
					</div>
				</div>

				<div class="tt-hybrid-shell" style={`width:${overviewCanvasWidth}px;`}>
					<div class="tt-hybrid-calendar-overlay" aria-hidden="true" style={`left:${overviewSidebarPx}px;`}>
						{#each nonWorkingBands as band (band.id)}
							<div class="tt-hybrid-calendar-band" class:is-weekend={band.kind === 'weekend'} class:is-holiday={band.kind === 'holiday'} style={`left:${band.leftPercent.toFixed(3)}%;width:${band.widthPercent.toFixed(3)}%;`}></div>
						{/each}
					</div>
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
							{#if overviewSidebarPx > 0}
								<div class="tt-hybrid-lane-sidebar" style={`height:${definedTrackHeightPx}px;transform:translateX(${overviewScrollLeft}px);`} aria-hidden="true">
									{#each definedLaneHeaders as header (header.key)}
										<div
											class="tt-hybrid-lane-header"
											style={`top:${header.topPx}px;height:${header.heightPx}px;`}
										>
											<span class="tt-lane-title">{header.label}</span>
											<span class="tt-lane-count">{header.taskCount}</span>
										</div>
									{/each}
								</div>
							{/if}
							<div class="tt-hybrid-track-canvas" style={`height:${definedTrackHeightPx}px;`}>
								<div class="tt-hybrid-today-band" style={`left:${todayPercent.toFixed(3)}%;width:${dayWidthPercent.toFixed(3)}%;`}></div>
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
							{#if overviewSidebarPx > 0}
								<div class="tt-hybrid-lane-sidebar" style={`height:${underdefinedTrackHeightPx}px;transform:translateX(${overviewScrollLeft}px);`} aria-hidden="true">
									{#each underdefinedLaneHeaders as header (header.key)}
										<div
											class="tt-hybrid-lane-header"
											style={`top:${header.topPx}px;height:${header.heightPx}px;`}
										>
											<span class="tt-lane-title">{header.label}</span>
											<span class="tt-lane-count">{header.taskCount}</span>
										</div>
									{/each}
								</div>
							{/if}
							<div class="tt-hybrid-track-canvas" style={`height:${underdefinedTrackHeightPx}px;`}>
								<div class="tt-hybrid-today-band" style={`left:${todayPercent.toFixed(3)}%;width:${dayWidthPercent.toFixed(3)}%;`}></div>
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

	.tt-graph-toolbar-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		flex-wrap: wrap;
	}

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

	.tt-graph-pill-ready.is-active {
		border-color: color-mix(in srgb, var(--color-green) 55%, var(--background-modifier-border));
		background: color-mix(in srgb, var(--color-green) 15%, var(--background-primary));
	}

	.tt-graph-pill-ready.is-active strong {
		color: var(--color-green);
	}

	.tt-graph-pill-icon {
		display: inline-flex;
		align-items: center;
		align-self: center;
	}

	.tt-graph-pill-icon :global(svg) {
		width: 14px;
		height: 14px;
	}

	.tt-graph-pill-toggle.is-active {
		border-color: color-mix(in srgb, var(--interactive-accent) 50%, var(--background-modifier-border));
		background: color-mix(in srgb, var(--interactive-accent) 12%, var(--background-primary));
		color: var(--text-normal);
	}

	/* GP3 project filter popover */
	.tt-graph-project-filter {
		position: relative;
		display: inline-flex;
	}

	.tt-graph-project-filter-backdrop {
		position: fixed;
		inset: 0;
		z-index: 40;
		background: transparent;
		border: none;
		padding: 0;
		cursor: default;
	}

	.tt-graph-project-filter-menu {
		position: absolute;
		top: calc(100% + 6px);
		/* Anchor to the pill's right edge and expand leftward: the Projects pill
		   sits toward the right of the (wrapping) toolbar, so a left anchor
		   overflows the panel on narrow/mobile viewports. */
		right: 0;
		left: auto;
		z-index: 41;
		min-width: 220px;
		max-width: min(320px, calc(100vw - 24px));
		padding: 8px;
		background: var(--background-primary);
		border: 1px solid var(--background-modifier-border);
		border-radius: 10px;
		box-shadow: var(--shadow-s);
	}

	.tt-graph-project-filter-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		padding: 2px 4px 8px;
		border-bottom: 1px solid var(--background-modifier-border);
		margin-bottom: 6px;
	}

	.tt-graph-project-filter-title {
		text-transform: uppercase;
		letter-spacing: 0.05em;
		font-size: 0.68rem;
		font-weight: 700;
		color: var(--text-muted);
	}

	.tt-graph-project-filter-list {
		display: flex;
		flex-direction: column;
		gap: 2px;
		max-height: 260px;
		overflow-y: auto;
	}

	.tt-graph-project-filter-item {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 5px 4px;
		border-radius: 6px;
		cursor: pointer;
		font-size: 0.85rem;
		color: var(--text-normal);
	}

	.tt-graph-project-filter-item:hover {
		background: var(--background-modifier-hover);
	}

	.tt-graph-project-filter-item input {
		flex: 0 0 auto;
		margin: 0;
	}

	.tt-graph-project-filter-name {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.tt-graph-note {
		margin: 0;
		color: var(--text-muted);
		font-size: 0.8rem;
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
		background:
			repeating-linear-gradient(
				45deg,
				color-mix(in srgb, var(--text-muted) 14%, transparent) 0,
				color-mix(in srgb, var(--text-muted) 14%, transparent) 3px,
				transparent 3px,
				transparent 7px
			),
			color-mix(in srgb, var(--background-modifier-border) 40%, transparent);
	}

	.tt-hybrid-calendar-band.is-holiday {
		background: color-mix(in srgb, var(--color-red) 22%, transparent);
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
		position: sticky;
		left: 0;
		max-width: 100vw;
		z-index: 3;
	}

	.tt-track-status-summary {
		display: inline-flex;
		flex-wrap: wrap;
		gap: 6px;
		flex-shrink: 1;
		min-width: 0;
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
		background:
			repeating-linear-gradient(
				45deg,
				color-mix(in srgb, var(--text-muted) 14%, transparent) 0,
				color-mix(in srgb, var(--text-muted) 14%, transparent) 3px,
				transparent 3px,
				transparent 7px
			),
			color-mix(in srgb, var(--background-modifier-border) 38%, transparent);
	}

	.tt-overview-nonworking.is-holiday {
		background: color-mix(in srgb, var(--color-red) 24%, transparent);
	}

	.tt-overview-axis-inner {
		position: relative;
		height: 100%;
	}

	/* No translateX: the line's left edge sits exactly on the day boundary (matches the band). */
	.tt-overview-today {
		position: absolute;
		top: 0;
		bottom: -10px;
		border-left: 2px dashed color-mix(in srgb, var(--color-red) 80%, var(--interactive-accent));
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

	.tt-hybrid-today-band {
		position: absolute;
		top: 0;
		bottom: 0;
		background: color-mix(in srgb, var(--color-red) 8%, transparent);
		border-left: 2px solid color-mix(in srgb, var(--color-red) 50%, var(--interactive-accent));
		border-radius: 2px;
		pointer-events: none;
		z-index: 0;
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

	.tt-dependency-lanes {
		position: absolute;
		inset: 0 auto 0 8px;
		width: var(--tt-dependency-lane-width, 136px);
		pointer-events: none;
		z-index: 10;
	}

	/* GP4: full-width swim-lane tint, keyed to the project's area colour. First
	   child of the stage with no z-index, so edges/nodes paint on top of it. */
	.tt-dependency-lane-bands {
		position: absolute;
		inset: 0;
		pointer-events: none;
	}

	.tt-dependency-lane-band {
		position: absolute;
		left: 0;
		right: 0;
		border-radius: 10px;
		/* Symmetric vertical gradient: a tint cap at the top/bottom edges, fading to
		   nothing across the middle of the lane. color-mix onto transparent keeps it
		   a translucent overlay, readable in dark + light. Focus-gated (shown only
		   for the active/soft lanes); `--tt-lane-cap` sets the strength per state. */
		background: linear-gradient(
			180deg,
			color-mix(in srgb, var(--tt-lane-tint) 17%, transparent) 0%,
			transparent 24%,
			transparent 76%,
			color-mix(in srgb, var(--tt-lane-tint) 17%, transparent) 100%
		);
		/* Active vs soft differ only by opacity (not gradient strength) so every
		   direction — rest↔active↔soft — is a single, smoothly animatable opacity
		   change. Hidden at rest; mounted always so the transition runs both ways. */
		opacity: 0;
		transition: opacity 0.32s ease;
	}

	.tt-dependency-lane-band.is-active {
		opacity: 1;
	}

	.tt-dependency-lane-band.is-soft {
		opacity: 0.42;
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
		padding: 8px 5px 8px 8px;
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
		transition: border-color 120ms ease, background 120ms ease, opacity 0.28s ease;
	}

	/* Lane focus: the active lane's header pops (accent border), soft lanes (the
	   ones the active chain reaches) stay bright, and other lanes recede — but
	   headers never fully hide, they are the lane map. */
	.tt-dependency-lane-header.is-lane-dim {
		opacity: 0.42;
	}

	.tt-dependency-lane-header.is-lane-active {
		border-color: color-mix(in srgb, var(--interactive-accent) 60%, var(--background-modifier-border));
		box-shadow:
			inset 3px 0 0 var(--interactive-accent),
			inset 0 0 0 1px color-mix(in srgb, var(--background-primary) 35%, transparent),
			0 1px 0 color-mix(in srgb, var(--text-faint) 18%, transparent);
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
		padding: 6px 6px 6px 8px;
		gap: 4px;
	}

	.tt-dependency-lane-header.is-rotated .tt-dependency-lane-label {
		display: block;
		/* Clip to the space the flex layout gives us (not to content), so a long
		name overflows and can be measured / marqueed; short-lane names truncate. */
		flex: 1 1 0;
		min-height: 0;
		font-size: 12px;
		line-height: 1.05;
		max-height: none;
		/* One vertical line, never wrapped to extra columns (which overflow the
		slim gutter on short lanes); long names truncate with an ellipsis. */
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		writing-mode: vertical-rl;
		text-orientation: mixed;
		transform: rotate(180deg);
		letter-spacing: 0.3px;
	}

	/* Inner text run of a project label — the element the marquee translates. */
	.tt-dependency-lane-label-run {
		display: block;
		white-space: nowrap;
	}

	/* When the name is longer than its viewport: fade the cut edge to hint more,
	and scroll the whole name through on hover/focus (a tooltip-free reveal). */
	.tt-dependency-lane-label.is-truncated {
		-webkit-mask-image: linear-gradient(to bottom, #000 82%, transparent);
		mask-image: linear-gradient(to bottom, #000 82%, transparent);
	}

	.tt-dependency-lane-header.is-clickable:not(.is-lane-pinned):hover .tt-dependency-lane-label.is-truncated .tt-dependency-lane-label-run,
	.tt-dependency-lane-header.is-clickable:not(.is-lane-pinned):focus-within .tt-dependency-lane-label.is-truncated .tt-dependency-lane-label-run {
		animation: tt-lane-marquee var(--tt-marquee-dur, 3.5s) ease-in-out infinite;
	}

	@keyframes tt-lane-marquee {
		0%, 14% { transform: translateY(0); }
		50%, 64% { transform: translateY(calc(-1 * var(--tt-marquee, 0px))); }
		100% { transform: translateY(0); }
	}

	@media (prefers-reduced-motion: reduce) {
		.tt-dependency-lane-header.is-clickable:not(.is-lane-pinned):hover .tt-dependency-lane-label.is-truncated .tt-dependency-lane-label-run,
		.tt-dependency-lane-header.is-clickable:not(.is-lane-pinned):focus-within .tt-dependency-lane-label.is-truncated .tt-dependency-lane-label-run {
			animation: none;
		}
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

	/* Satellite: a thin, muted, dashed unassigned strip parked next to its
	related project (reads as "unassigned, but tied to the adjacent lane"). */
	.tt-dependency-lane-header.is-satellite {
		right: auto;
		width: 30%;
		min-width: 22px;
		padding: 6px 4px;
		border-style: dashed;
		border-color: color-mix(in srgb, var(--text-faint) 40%, transparent);
		background: color-mix(in srgb, var(--background-secondary) 55%, transparent);
		box-shadow: none;
		opacity: 0.9;
	}

	.tt-dependency-lane-header.is-satellite .tt-dependency-lane-label {
		font-size: 10px;
		font-weight: 500;
		color: var(--text-muted);
		-webkit-line-clamp: 3;
	}

	.tt-dependency-lane-header.is-satellite .tt-dependency-lane-count {
		background: transparent;
		border-color: transparent;
		color: var(--text-faint);
		padding: 0;
	}

	/* Clickable project chip (GP5) — a container of two subshapes: the label body
	   (tap → focus/pin the lane) and a `+` footer (tap → add a task). Padding + gap
	   move onto the inner buttons so the `+` can sit flush at the bottom edge. */
	.tt-dependency-lane-header.is-clickable {
		pointer-events: auto;
		padding: 0;
		gap: 0;
		transition: border-color 120ms ease, background 120ms ease, opacity 0.28s ease,
			box-shadow 120ms ease;
	}

	.tt-dependency-lane-header.is-clickable:hover {
		border-color: color-mix(in srgb, var(--interactive-accent) 55%, var(--background-modifier-border));
		background: linear-gradient(
			180deg,
			color-mix(in srgb, var(--interactive-accent) 14%, var(--background-secondary)),
			color-mix(in srgb, var(--background-secondary-alt) 92%, var(--background-primary))
		);
	}

	/* Label body — fills the chip above the `+` footer, laying out the label +
	   count exactly as the old single-button chip did (inherits the header's
	   cross-axis alignment so compact chips stay centred). */
	.tt-dependency-lane-focus {
		flex: 1 1 auto;
		min-height: 0;
		width: 100%;
		display: flex;
		flex-direction: column;
		align-items: inherit;
		justify-content: flex-start;
		gap: 6px;
		padding: 8px 5px 4px 8px;
		margin: 0;
		background: none;
		border: none;
		box-shadow: none;
		font: inherit;
		text-align: inherit;
		color: inherit;
		cursor: pointer;
	}

	.tt-dependency-lane-header.is-compact .tt-dependency-lane-focus {
		padding: 6px 6px 2px 8px;
		gap: 4px;
	}

	.tt-dependency-lane-focus:focus-visible {
		outline: 2px solid var(--interactive-accent);
		outline-offset: -2px;
		border-radius: var(--radius-s);
	}

	/* `+` footer subshape — full-width strip flush to the chip's bottom edge,
	   divided from the body by a hairline so the two read as one card. */
	.tt-dependency-lane-add-btn {
		flex: 0 0 auto;
		width: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 3px 0;
		margin: 0;
		background: none;
		border: none;
		border-top: 1px solid color-mix(in srgb, var(--text-faint) 20%, transparent);
		color: var(--text-faint);
		cursor: pointer;
		opacity: 0.5;
		transition: opacity 120ms ease, color 120ms ease, background 120ms ease;
	}

	.tt-dependency-lane-add-btn:hover,
	.tt-dependency-lane-add-btn:focus-visible {
		opacity: 1;
		color: var(--interactive-accent);
		background: color-mix(in srgb, var(--interactive-accent) 12%, transparent);
		outline: none;
	}

	.tt-dependency-lane-add {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 14px;
	}

	.tt-dependency-lane-add :global(svg) {
		width: 14px;
		height: 14px;
	}

	/* Touch: expand the `+` footer's hit area to the mobile ≥44px minimum without
	   growing its visual strip (matches the node-add affordance). */
	@media (pointer: coarse) {
		.tt-dependency-lane-add-btn {
			position: relative;
			padding: 6px 0;
		}

		.tt-dependency-lane-add-btn::after {
			content: '';
			position: absolute;
			inset: -6px 0;
		}
	}

	/* GP5 grow-on-pin: a pinned lane grows in HEIGHT so its full (still-vertical)
	   title is readable — the rotated label un-clamps to its natural length and the
	   chip grows downward to contain it, floating over the canvas (raised z-index)
	   while focus is held. Height overrides the fixed inline lane height, so
	   `!important` is required. */
	.tt-dependency-lane-header.is-clickable.is-lane-pinned {
		height: auto !important;
		/* Block flow (not flex) so the chip sizes to the full-length vertical label —
		   a vertical writing-mode child isn't measured for its block-axis size inside
		   a flex column, which capped the grow; normal block flow contains it. */
		display: block;
		z-index: 20;
	}

	.tt-dependency-lane-header.is-lane-pinned .tt-dependency-lane-focus {
		display: block;
		height: auto;
		text-align: center;
	}

	/* Keep the vertical label centred in the slim chip while it grows downward. */
	.tt-dependency-lane-header.is-rotated.is-lane-pinned .tt-dependency-lane-label {
		margin: 0 auto;
	}

	/* Un-clamp the vertical label: drop the flex-bounded height + ellipsis so the
	   full name lays out at its natural length and the auto-height chip grows to
	   fit it. Stays vertical (writing-mode/rotation untouched). */
	.tt-dependency-lane-header.is-rotated.is-lane-pinned .tt-dependency-lane-label {
		flex: 0 0 auto;
		overflow: visible;
		text-overflow: clip;
		max-height: none;
		-webkit-mask-image: none;
		mask-image: none;
	}

	/* Non-rotated (tall) pinned lanes: un-clamp the multi-line label instead. */
	.tt-dependency-lane-header.is-lane-pinned:not(.is-rotated) .tt-dependency-lane-label {
		-webkit-line-clamp: unset;
		max-height: none;
	}

	.tt-dependency-lane-header.is-lane-pinned .tt-dependency-lane-label-run {
		animation: none;
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

	/* Hover chain tracing: traced path pops, everything else recedes */
	.tt-graph-edge.is-traced {
		stroke: var(--interactive-accent);
		color: var(--interactive-accent);
		stroke-width: 2.5;
		opacity: 1;
	}

	.tt-graph-edge.is-dim {
		opacity: 0.12;
	}

	.tt-graph-node.is-dim {
		opacity: 0.25;
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
		transition: opacity 0.28s ease;
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

	/* "Ready now" highlight: open, unblocked work pops green; everything else
	in the graph recedes so the actionable tasks read at a glance. */
	.tt-graph-node.is-ready {
		box-shadow:
			inset 0 0 0 1px color-mix(in srgb, var(--color-green) 60%, transparent),
			0 0 0 2px color-mix(in srgb, var(--color-green) 42%, transparent),
			0 0 18px color-mix(in srgb, var(--color-green) 28%, transparent);
	}

	.tt-graph-stage.highlight-ready .tt-graph-node:not(.is-ready) {
		opacity: 0.3;
	}

	.tt-graph-stage.highlight-ready .tt-graph-edge {
		opacity: 0.22;
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

	/* Content budget inside the fixed 122px card (102px after padding):
	top row ~13px + 3-line name ~52px + meta ~14px + two 6px gaps = ~91px. */
	.tt-graph-name {
		font-size: 0.92rem;
		font-weight: 700;
		color: var(--text-normal);
		line-height: 1.18;
		width: 100%;
		min-width: 0;
		word-break: break-word;
		overflow-wrap: break-word;
		max-height: 3.6em;
		display: -webkit-box;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 3;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.tt-graph-meta {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 10px;
		font-size: 0.72rem;
		color: var(--text-muted);
		white-space: nowrap;
	}

	.tt-graph-meta > span:first-child {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.tt-graph-meta > span + span {
		flex-shrink: 0;
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