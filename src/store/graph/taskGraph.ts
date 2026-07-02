import type { Task } from '../../types';
import { ensureMdExt, pathLeaf } from '../../utils/pathUtils';
import { parseWikiLink } from '../../utils/wikiLink';
import { optimizeLaneBandOrder } from './graphCrossingOptimizer';
import { parseIsoDate } from '../../utils/dateUtils';
import { buildTaskSchedule } from '../taskSchedule';

export interface TaskGraphNode {
	path: string;
	task: Task;
	laneKey: string | null;  // Project path or null for unassigned/independent
	column: number;
	row: number;
	x: number;
	y: number;
	width: number;
	height: number;
	isCycle: boolean;
	isBlockedChain: boolean;
	incomingCount: number;
	outgoingCount: number;
	blockedIncomingCount: number;
}

export interface TaskGraphEdge {
	id: string;
	from: string;
	to: string;
	isCycle: boolean;
	isBlockedChain: boolean;
	isParentEdge: boolean;
}

export interface GraphLane {
	key: string | null;  // Project path or null for independent
	label: string;       // Project name or "Unassigned"
	taskPaths: string[];  // All task paths in this lane
	startRow: number;
	endRow: number;
}

export interface TaskGraphLayout {
	nodes: TaskGraphNode[];
	edges: TaskGraphEdge[];
	lanes: GraphLane[];  // Project-based lane structure
	columns: number;
	rows: number;
	width: number;
	height: number;
	cycleCount: number;
	blockedNodeCount: number;
	blockedEdgeCount: number;
	maxDepth: number;
}

export interface BuildTaskGraphOptions {
	nodeWidth?: number;
	nodeHeight?: number;
	horizontalGap?: number;
	verticalGap?: number;
	padding?: number;
	/** Extra-wide left padding (e.g. a lane-header gutter). Falls back to `padding`. */
	paddingLeft?: number;
}

interface ComponentInfo {
	id: number;
	paths: string[];
	label: string;
	level: number;
	incoming: Set<number>;
	outgoing: Set<number>;
	isCycle: boolean;
}

interface LaneBand {
	startRow: number;
	endRow: number;
	paths: string[];
}

/**
 * Get a numeric date key for task ordering.
 * Earlier dates = lower numbers (appear on the left).
 * Returns timestamp for start_date, due_date, or created, or Infinity if none available.
 */
function getDateKey(task: Task): number {
	// Local-midnight parsing to stay comparable with resolveTaskDates output;
	// bare new Date('YYYY-MM-DD') would parse as UTC and skew by a day.
	const date = parseIsoDate(task.start_date) ?? parseIsoDate(task.due_date) ?? parseIsoDate(task.created);
	return date ? date.getTime() : Infinity;
}

/**
 * Group visible tasks by owning project lane.
 * Lane resolution walks parent_task ancestry until it reaches a project record.
 */
function buildLaneAssignment(tasks: Task[], allTaskByPath: Map<string, Task>): Map<string | null, string[]> {
	const lanesByKey = new Map<string | null, string[]>();

	// First pass: collect all known project paths.
	const projectPaths = new Set<string>();
	for (const task of tasks) {
		if (task.type === 'project') {
			projectPaths.add(task.path);
		}

		const projectPath = resolveOwningProjectPath(task, allTaskByPath);
		if (projectPath) {
			projectPaths.add(projectPath);
		}
	}

	// Initialize lanes for each project + one for unassigned
	for (const projectPath of projectPaths) {
		lanesByKey.set(projectPath, []);
	}
	lanesByKey.set(null, []);  // Unassigned/independent lane

	// Assign visible tasks to their owning project lane.
	for (const task of tasks) {
		const laneKey = resolveOwningProjectPath(task, allTaskByPath);
		lanesByKey.get(laneKey)?.push(task.path);
	}

	return lanesByKey;
}

function resolveNodeLaneKey(task: Task, allTaskByPath: Map<string, Task>): string | null {
	return resolveOwningProjectPath(task, allTaskByPath);
}

export function resolveOwningProjectPath(task: Task, allTaskByPath: Map<string, Task>): string | null {
	const normalizedParent = normalizeTaskPath(task.parent_task);
	if (!normalizedParent) {
		return null;
	}

	let currentPath: string | null = normalizedParent;
	const visited = new Set<string>();

	while (currentPath && !visited.has(currentPath)) {
		visited.add(currentPath);
		const current = allTaskByPath.get(currentPath);
		if (!current) {
			// Parent may exist in vault but not in the current query; preserve lane grouping key.
			return currentPath;
		}
		if (current.type === 'project') {
			return current.path;
		}
		currentPath = normalizeTaskPath(current.parent_task);
	}

	return null;
}

const DEFAULT_NODE_WIDTH = 232;
const DEFAULT_NODE_HEIGHT = 92;
const DEFAULT_HORIZONTAL_GAP = 88;
const DEFAULT_VERTICAL_GAP = 28;
const DEFAULT_PADDING = 28;

/**
 * Pack lane nodes into rows with branch-aware verticality.
 *
 * Columns are processed left→right so a node's same-lane predecessors are
 * always placed first. Row assignment follows a spine-and-fork rule:
 *  - A node with no same-lane predecessors (a root / independent start) claims
 *    its own fresh row, so parallel starts separate vertically.
 *  - The FIRST child of a predecessor inherits that predecessor's row, keeping
 *    a linear chain flat (the spine).
 *  - Each ADDITIONAL child of the same predecessor forks down to a fresh row,
 *    making fan-outs visible.
 *  - A node with several same-lane predecessors (a merge) centers between them.
 * Cross-lane dependencies are ignored here, so they remain diagonal connectors
 * rather than pulling a node out of its swim lane.
 */
function packLaneNodeRows(
	laneNodes: TaskGraphNode[],
	startRow: number,
	edges: TaskGraphEdge[],
	allNodesByPath: Map<string, TaskGraphNode>,
	temporalKeyByPath: Map<string, number>,
	nodeHeight: number,
	verticalGap: number,
	padding: number,
): number {
	if (laneNodes.length === 0) return startRow;
	const laneKey = laneNodes[0].laneKey;

	const incomingByPath = new Map<string, string[]>();
	for (const edge of edges) {
		if (edge.isParentEdge) continue;
		const list = incomingByPath.get(edge.to) ?? [];
		list.push(edge.from);
		incomingByPath.set(edge.to, list);
	}

	const byColumn = new Map<number, TaskGraphNode[]>();
	for (const node of laneNodes) {
		const list = byColumn.get(node.column) ?? [];
		list.push(node);
		byColumn.set(node.column, list);
	}

	const sortedCols = [...byColumn.keys()].sort((a, b) => a - b);
	const occupiedByColumn = new Map<number, Set<number>>();
	const placed = new Set<string>();
	const childCount = new Map<string, number>();
	let nextFreshRow = startRow;

	const sameLanePreds = (node: TaskGraphNode): TaskGraphNode[] =>
		(incomingByPath.get(node.path) ?? [])
			.map((p) => allNodesByPath.get(p))
			.filter((p): p is TaskGraphNode => !!p && p.laneKey === laneKey && placed.has(p.path));

	const prelimIdeal = (node: TaskGraphNode): number => {
		const preds = sameLanePreds(node);
		if (preds.length === 0) return nextFreshRow;
		return preds.reduce((s, p) => s + p.row, 0) / preds.length;
	};

	const temporalKey = (node: TaskGraphNode): number =>
		temporalKeyByPath.get(node.path) ?? Number.POSITIVE_INFINITY;

	for (const col of sortedCols) {
		const colNodes = byColumn.get(col)!;

		// Sort by predecessor average so the column lays out top-to-bottom in the
		// order its predecessors appear; break ties by date so same-depth nodes
		// (e.g. the roots in column 0) stack earliest-first, top to bottom.
		const sorted = [...colNodes].sort((a, b) =>
			prelimIdeal(a) - prelimIdeal(b)
			|| temporalKey(a) - temporalKey(b)
			|| a.path.localeCompare(b.path));

		const colOccupied = occupiedByColumn.get(col) ?? new Set<number>();
		for (const node of sorted) {
			const preds = sameLanePreds(node);

			let ideal: number;
			if (preds.length === 0) {
				// Root / independent start: own fresh row.
				ideal = nextFreshRow;
			} else if (preds.length > 1) {
				// Merge: center between predecessors.
				ideal = Math.round(preds.reduce((s, p) => s + p.row, 0) / preds.length);
			} else {
				const parent = preds[0];
				const seen = childCount.get(parent.path) ?? 0;
				// First child continues the spine; later children fork to a fresh row.
				ideal = seen === 0 ? parent.row : nextFreshRow;
			}
			for (const p of preds) {
				childCount.set(p.path, (childCount.get(p.path) ?? 0) + 1);
			}

			const row = findNearestFreeRow(Math.max(startRow, ideal), startRow, colOccupied);
			node.row = row;
			node.y = padding + row * (nodeHeight + verticalGap);
			colOccupied.add(row);
			placed.add(node.path);
			nextFreshRow = Math.max(nextFreshRow, row + 1);
		}
		occupiedByColumn.set(col, colOccupied);
	}

	return Math.max(startRow, ...laneNodes.map((n) => n.row));
}

function findNearestFreeRow(ideal: number, minRow: number, occupied: Set<number>): number {
	if (!occupied.has(ideal)) return ideal;
	for (let delta = 1; delta < 1000; delta++) {
		const above = ideal - delta;
		if (above >= minRow && !occupied.has(above)) return above;
		const below = ideal + delta;
		if (!occupied.has(below)) return below;
	}
	return ideal + occupied.size;
}

export function buildTaskGraph(tasks: Task[], options: BuildTaskGraphOptions): TaskGraphLayout {
	const nodeWidth = options.nodeWidth ?? DEFAULT_NODE_WIDTH;
	const nodeHeight = options.nodeHeight ?? DEFAULT_NODE_HEIGHT;
	const horizontalGap = options.horizontalGap ?? DEFAULT_HORIZONTAL_GAP;
	const verticalGap = options.verticalGap ?? DEFAULT_VERTICAL_GAP;
	const padding = options.padding ?? DEFAULT_PADDING;
	const paddingLeft = options.paddingLeft ?? padding;

	// Hide project records from graph nodes; project lanes are still derived
	// from parent_task links and project metadata in allTaskByPath.
	const allTasks = [...tasks]
		.sort((left, right) => left.name.localeCompare(right.name) || left.path.localeCompare(right.path));
	const visibleTasks = allTasks.filter((task) => task.type !== 'project');

	if (visibleTasks.length === 0) {
		return {
			nodes: [],
			edges: [],
			lanes: [],
			columns: 0,
			rows: 0,
			width: paddingLeft + padding,
			height: padding * 2,
			cycleCount: 0,
			blockedNodeCount: 0,
			blockedEdgeCount: 0,
			maxDepth: 0,
		};
	}

	const allTaskByPath = new Map(allTasks.map((task) => [task.path, task]));
	const taskByPath = new Map(visibleTasks.map((task) => [task.path, task]));
	const resolvedTemporalDates = buildTaskSchedule(visibleTasks.filter((task) => task.type === 'task'), {
		allTasks,
	});
	const getTemporalKeyForTask = (task: Task): number => {
		const resolved = resolvedTemporalDates.get(task.path);
		if (resolved) return resolved.start.getTime();
		return getDateKey(task);
	};
	const adjacency = new Map<string, string[]>();
	const incoming = new Map<string, string[]>();
	const edges: TaskGraphEdge[] = [];

	for (const task of visibleTasks) {
		adjacency.set(task.path, []);
		incoming.set(task.path, []);
	}

	for (const task of visibleTasks) {
		const dependencyPaths = dedupePaths(
			task.depends_on
				.map((path) => normalizeTaskPath(path))
				.filter((path): path is string => !!path && taskByPath.has(path))
		);

		for (const dependencyPath of dependencyPaths) {
			adjacency.get(dependencyPath)?.push(task.path);
			incoming.get(task.path)?.push(dependencyPath);
			edges.push({
				id: `${dependencyPath}->${task.path}`,
				from: dependencyPath,
				to: task.path,
				isCycle: false,
				isBlockedChain: false,
				isParentEdge: false,
			});
		}

		// Add parent-task containment edges
		if (task.parent_task) {
			const parentPath = normalizeTaskPath(task.parent_task);
			if (parentPath && taskByPath.has(parentPath)) {
				const parentTaskPath = parentPath;
				// Parent edges don't affect topological ordering, so we don't add to adjacency/incoming
				edges.push({
					id: `${parentTaskPath}=>${task.path}`,
					from: parentTaskPath,
					to: task.path,
					isCycle: false,
					isBlockedChain: false,
					isParentEdge: true,
				});
			}
		}
	}

	for (const values of adjacency.values()) {
		values.sort();
	}
	for (const values of incoming.values()) {
		values.sort();
	}

	const components = buildComponents(visibleTasks, adjacency);
	const componentByPath = new Map<string, number>();
	for (const component of components) {
		for (const path of component.paths) {
			componentByPath.set(path, component.id);
		}
	}

	for (const edge of edges) {
		const fromComponent = componentByPath.get(edge.from);
		const toComponent = componentByPath.get(edge.to);
		if (fromComponent === undefined || toComponent === undefined) continue;
		if (fromComponent === toComponent) {
			edge.isCycle = true;
			continue;
		}
		components[fromComponent]?.outgoing.add(toComponent);
		components[toComponent]?.incoming.add(fromComponent);
		if (components[fromComponent]?.isCycle && components[toComponent]?.isCycle) {
			edge.isCycle = true;
		}
	}

	assignComponentLevels(components);

	// Temporal nudging: for components without strict dependency placement,
	// push later-dated work to the right while preserving dependency order.
	const componentDateKey = new Map<number, number>();
	for (const component of components) {
		let minDate = Infinity;
		for (const path of component.paths) {
			const task = taskByPath.get(path);
			if (!task) continue;
			minDate = Math.min(minDate, getTemporalKeyForTask(task));
		}
		componentDateKey.set(component.id, minDate);
	}

	const datedComponentsByLane = new Map<string | null, ComponentInfo[]>();
	for (const component of components) {
		const dateKey = componentDateKey.get(component.id) ?? Infinity;
		if (!Number.isFinite(dateKey)) continue;

		// Only nudge fully isolated components (no dependency edges) by date.
		// Connected chains derive their column purely from dependency depth, so
		// date never spreads a chain across extra columns — keeping the layout
		// compact and letting direct dependencies sit close together.
		if (component.incoming.size > 0 || component.outgoing.size > 0) continue;

		const laneKeys = new Set<string | null>();
		for (const path of component.paths) {
			const componentTask = taskByPath.get(path);
			if (!componentTask) continue;
			laneKeys.add(resolveOwningProjectPath(componentTask, allTaskByPath));
		}
		const laneKey = laneKeys.size === 1 ? [...laneKeys][0] : null;
		const bucket = datedComponentsByLane.get(laneKey) ?? [];
		bucket.push(component);
		datedComponentsByLane.set(laneKey, bucket);
	}

	for (const laneComponents of datedComponentsByLane.values()) {
		laneComponents.sort((left, right) => {
			const l = componentDateKey.get(left.id) ?? Infinity;
			const r = componentDateKey.get(right.id) ?? Infinity;
			return l - r || left.label.localeCompare(right.label) || left.id - right.id;
		});

		for (const [temporalRank, component] of laneComponents.entries()) {
			component.level = Math.max(component.level, temporalRank);
		}
	}

	// Re-apply dependency constraints after temporal nudging.
	for (const component of [...components].sort((a, b) => a.level - b.level || a.id - b.id)) {
		for (const nextId of component.outgoing) {
			const next = components[nextId];
			next.level = Math.max(next.level, component.level + 1);
		}
	}

	// Compute chain groups from weakly-connected components so converging
	// dependencies remain in the same visual chain cluster.
	const chainGroups = computeChainGroups(components);
	// Stable sequential rank for each group (walk topo-order so roots come first).
	const chainGroupOrder = new Map<number, number>();
	const topoSortedForChain = [...components].sort(
		(a, b) => a.level - b.level || a.label.localeCompare(b.label) || a.id - b.id
	);
	for (const comp of topoSortedForChain) {
		const group = chainGroups.get(comp.id) ?? comp.id;
		if (!chainGroupOrder.has(group)) {
			chainGroupOrder.set(group, chainGroupOrder.size);
		}
	}

	const blockedPaths = new Set<string>();
	for (const edge of edges) {
		// Parent edges are containment relationships, not blocking dependencies
		if (edge.isParentEdge) continue;
		const dependencyTask = taskByPath.get(edge.from);
		if (!dependencyTask) continue;
		if (dependencyTask.is_complete) continue;
		edge.isBlockedChain = true;
		blockedPaths.add(edge.from);
		blockedPaths.add(edge.to);
	}

	const incomingCountByPath = new Map<string, number>();
	const outgoingCountByPath = new Map<string, number>();
	const blockedIncomingCountByPath = new Map<string, number>();
	for (const task of visibleTasks) {
		incomingCountByPath.set(task.path, incoming.get(task.path)?.length ?? 0);
		outgoingCountByPath.set(task.path, adjacency.get(task.path)?.length ?? 0);
		blockedIncomingCountByPath.set(task.path, 0);
	}
	for (const edge of edges) {
		if (!edge.isBlockedChain) continue;
		blockedIncomingCountByPath.set(edge.to, (blockedIncomingCountByPath.get(edge.to) ?? 0) + 1);
	}

	const componentsByLevel = new Map<number, ComponentInfo[]>();
	for (const component of components) {
		const group = componentsByLevel.get(component.level) ?? [];
		group.push(component);
		componentsByLevel.set(component.level, group);
	}

	const sortedLevels = [...componentsByLevel.keys()].sort((left, right) => left - right);
	let maxRow = -1;
	const nodes: TaskGraphNode[] = [];

	// Tracks the starting row of each component so downstream columns can align to it.
	const componentStartRow = new Map<number, number>();

	/** Minimum starting row of any already-placed predecessor component. */
	function minPredRow(comp: ComponentInfo): number {
		let min = Infinity;
		for (const predId of comp.incoming) {
			const row = componentStartRow.get(predId);
			if (row !== undefined) min = Math.min(min, row);
		}
		return min;
	}

	for (const level of sortedLevels) {
		const levelComponents = componentsByLevel.get(level) ?? [];

		// Round 1 — Chain sort: isolated nodes (no edges at all) go last; within each
		// group sort by predecessor start-row so chains align across columns, then by
		// chain-group rank for siblings, then alphabetically.
		levelComponents.sort((left, right) => {
			const lIso = left.incoming.size === 0 && left.outgoing.size === 0;
			const rIso = right.incoming.size === 0 && right.outgoing.size === 0;
			if (lIso !== rIso) return lIso ? 1 : -1; // isolated → end

			const lRow = minPredRow(left);
			const rRow = minPredRow(right);
			if (lRow !== rRow) return lRow - rRow;

			// Round 2 — Interchain sort: tie-break by shared chain group rank so
			// siblings of the same ancestor cluster together.
			const lChain = chainGroupOrder.get(chainGroups.get(left.id) ?? left.id) ?? Infinity;
			const rChain = chainGroupOrder.get(chainGroups.get(right.id) ?? right.id) ?? Infinity;
			if (lChain !== rChain) return lChain - rChain;

			return left.label.localeCompare(right.label) || left.id - right.id;
		});

		let rowCursor = 0;

		for (const component of levelComponents) {
			// Align this component's start row with its earliest predecessor.
			// Never move backward (rowCursor only advances).
			const pRow = minPredRow(component);
			if (pRow !== Infinity) {
				rowCursor = Math.max(rowCursor, pRow);
			}
			componentStartRow.set(component.id, rowCursor);

			const orderedPaths = [...component.paths].sort((left, right) => {
				const leftTask = taskByPath.get(left);
				const rightTask = taskByPath.get(right);
				const leftDate = leftTask ? getTemporalKeyForTask(leftTask) : Infinity;
				const rightDate = rightTask ? getTemporalKeyForTask(rightTask) : Infinity;
				return leftDate - rightDate
					|| (leftTask?.name ?? left).localeCompare(rightTask?.name ?? right)
					|| left.localeCompare(right);
			});

			for (const [index, path] of orderedPaths.entries()) {
				const task = taskByPath.get(path);
				if (!task) continue;
				const row = rowCursor + index;
				maxRow = Math.max(maxRow, row);
				nodes.push({
					path,
					task,
					laneKey: resolveNodeLaneKey(task, allTaskByPath),
					column: level,
					row,
					x: paddingLeft + level * (nodeWidth + horizontalGap),
					y: padding + row * (nodeHeight + verticalGap),
					width: nodeWidth,
					height: nodeHeight,
					isCycle: component.isCycle,
					isBlockedChain: blockedPaths.has(path),
					incomingCount: incomingCountByPath.get(path) ?? 0,
					outgoingCount: outgoingCountByPath.get(path) ?? 0,
					blockedIncomingCount: blockedIncomingCountByPath.get(path) ?? 0,
				});
			}

			rowCursor += orderedPaths.length;
		}
	}

	// Lane compaction pass: make rows contiguous inside project lanes so lane
	// headers are meaningful and edge crossings are reduced by local ordering.
	const laneAssignments = buildLaneAssignment(visibleTasks, allTaskByPath);
	const laneKeysSorted = [...laneAssignments.keys()].sort((left, right) => {
		if (left === null) return 1;
		if (right === null) return -1;
		const leftLabel = allTaskByPath.get(left)?.name ?? pathLeaf(left);
		const rightLabel = allTaskByPath.get(right)?.name ?? pathLeaf(right);
		return leftLabel.localeCompare(rightLabel);
	});

	// Temporal key per task so same-column nodes (e.g. the roots in column 0)
	// stack vertically in date order — earlier work sits higher — preserving a
	// "completed before others" signal without spreading the chain horizontally.
	const temporalKeyByPath = new Map(visibleTasks.map((task) => [task.path, getTemporalKeyForTask(task)]));

	// Optimize lane ordering to minimize cross-lane edge distance.
	const laneBandsForOptimization = laneKeysSorted
		.filter((key) => (laneAssignments.get(key) ?? []).length > 0)
		.map((key) => ({ key, paths: laneAssignments.get(key) ?? [] }));
	const nodesByPathForOpt = new Map(nodes.map((n) => [n.path, n]));
	const optimizedLaneBands = optimizeLaneBandOrder(laneBandsForOptimization, nodesByPathForOpt, edges);
	const optimizedLaneKeys = optimizedLaneBands.map((b) => b.key);

	const laneBands = new Map<string | null, LaneBand>();
	let laneRowCursor = 0;
	for (const laneKey of optimizedLaneKeys) {
		const laneNodes = nodes
			.filter((node) => node.laneKey === laneKey)
			.sort((left, right) => left.row - right.row || left.column - right.column || left.path.localeCompare(right.path));

		if (laneNodes.length === 0) continue;

		const startRow = laneRowCursor;
		const endRow = packLaneNodeRows(
			laneNodes, startRow, edges, new Map(nodes.map((n) => [n.path, n])),
			temporalKeyByPath, nodeHeight, verticalGap, padding,
		);
		laneBands.set(laneKey, {
			startRow,
			endRow,
			paths: laneNodes.map((node) => node.path),
		});

		// Leave one row gap between lanes for readability.
		laneRowCursor = endRow + 2;
	}

	maxRow = Math.max(-1, laneRowCursor - 2);

	nodes.sort((left, right) => left.column - right.column || left.row - right.row || left.path.localeCompare(right.path));

	// Build lanes from packed lane bands.
	const lanes: GraphLane[] = [];
	const projectLanes: [string, LaneBand][] = [];
	let unassignedLane: [string | null, LaneBand] | null = null;

	for (const [laneKey, laneBand] of laneBands) {
		if (laneKey === null) {
			unassignedLane = [laneKey, laneBand];
		} else {
			projectLanes.push([laneKey, laneBand]);
		}
	}

	// Sort project lanes by name
	projectLanes.sort((a, b) => {
		const aLabel = allTaskByPath.get(a[0])?.name ?? pathLeaf(a[0]);
		const bLabel = allTaskByPath.get(b[0])?.name ?? pathLeaf(b[0]);
		return aLabel.localeCompare(bLabel);
	});

	// Build lane descriptors
	for (const [laneKey, laneBand] of projectLanes) {
		const label = allTaskByPath.get(laneKey)?.name ?? pathLeaf(laneKey);
		lanes.push({
			key: laneKey,
			label,
			taskPaths: laneBand.paths,
			startRow: laneBand.startRow,
			endRow: laneBand.endRow,
		});
	}

	if (unassignedLane) {
		const [, laneBand] = unassignedLane;
		if (laneBand.paths.length > 0) {
			lanes.push({
				key: null,
				label: 'Unassigned',
				taskPaths: laneBand.paths,
				startRow: laneBand.startRow,
				endRow: laneBand.endRow,
			});
		}
	}

	const rows = Math.max(0, maxRow + 1);
	const columns = Math.max(1, sortedLevels.length);
	return {
		nodes,
		edges,
		lanes,
		columns,
		rows,
		width: paddingLeft + padding + columns * nodeWidth + Math.max(0, columns - 1) * horizontalGap,
		height: padding * 2 + rows * nodeHeight + Math.max(0, rows - 1) * verticalGap,
		cycleCount: nodes.filter((node) => node.isCycle).length,
		blockedNodeCount: nodes.filter((node) => node.isBlockedChain).length,
		blockedEdgeCount: edges.filter((edge) => edge.isBlockedChain).length,
		maxDepth: Math.max(...nodes.map((node) => node.column), 0),
	};
}

function buildComponents(tasks: Task[], adjacency: Map<string, string[]>): ComponentInfo[] {
	const pathOrder = tasks.map((task) => task.path);
	const indices = new Map<string, number>();
	const lowLinks = new Map<string, number>();
	const onStack = new Set<string>();
	const stack: string[] = [];
	const components: ComponentInfo[] = [];
	let nextIndex = 0;

	function strongConnect(path: string): void {
		indices.set(path, nextIndex);
		lowLinks.set(path, nextIndex);
		nextIndex += 1;
		stack.push(path);
		onStack.add(path);

		for (const neighbor of adjacency.get(path) ?? []) {
			if (!indices.has(neighbor)) {
				strongConnect(neighbor);
				lowLinks.set(path, Math.min(lowLinks.get(path) ?? 0, lowLinks.get(neighbor) ?? 0));
			} else if (onStack.has(neighbor)) {
				lowLinks.set(path, Math.min(lowLinks.get(path) ?? 0, indices.get(neighbor) ?? 0));
			}
		}

		if (lowLinks.get(path) !== indices.get(path)) return;

		const paths: string[] = [];
		let current: string | undefined;
		do {
			current = stack.pop();
			if (!current) break;
			onStack.delete(current);
			paths.push(current);
		} while (current !== path);

		paths.sort();
		const isSelfCycle = paths.length === 1 && (adjacency.get(paths[0]) ?? []).includes(paths[0]);
		const firstTask = tasks.find((task) => task.path === paths[0]);
		components.push({
			id: components.length,
			paths,
			label: firstTask?.name ?? paths[0],
			level: 0,
			incoming: new Set<number>(),
			outgoing: new Set<number>(),
			isCycle: paths.length > 1 || isSelfCycle,
		});
	}

	for (const path of pathOrder) {
		if (!indices.has(path)) {
			strongConnect(path);
		}
	}

	return components;
}

function assignComponentLevels(components: ComponentInfo[]): void {
	const indegree = new Map<number, number>();
	const queue: number[] = [];

	for (const component of components) {
		const degree = component.incoming.size;
		indegree.set(component.id, degree);
		if (degree === 0) {
			queue.push(component.id);
		}
	}

	queue.sort((left, right) => components[left].label.localeCompare(components[right].label) || left - right);

	while (queue.length > 0) {
		const componentId = queue.shift();
		if (componentId === undefined) break;
		const component = components[componentId];
		for (const nextId of component.outgoing) {
			const next = components[nextId];
			next.level = Math.max(next.level, component.level + 1);
			const nextDegree = (indegree.get(nextId) ?? 0) - 1;
			indegree.set(nextId, nextDegree);
			if (nextDegree === 0) {
				queue.push(nextId);
				queue.sort((left, right) => components[left].label.localeCompare(components[right].label) || left - right);
			}
		}
	}
}

/**
 * Assigns each component to a weakly-connected chain group (ignoring edge
 * direction). This keeps merged chains together, e.g. multiple predecessors
 * feeding one task are treated as a single chain cluster.
 */
function computeChainGroups(components: ComponentInfo[]): Map<number, number> {
	const chainGroup = new Map<number, number>();
	const visited = new Set<number>();

	for (const comp of components) {
		if (visited.has(comp.id)) continue;

		const stack = [comp.id];
		const members: number[] = [];
		let minId = comp.id;

		while (stack.length > 0) {
			const currentId = stack.pop();
			if (currentId === undefined || visited.has(currentId)) continue;
			visited.add(currentId);
			members.push(currentId);
			minId = Math.min(minId, currentId);

			const current = components[currentId];
			for (const nextId of current.outgoing) {
				if (!visited.has(nextId)) stack.push(nextId);
			}
			for (const prevId of current.incoming) {
				if (!visited.has(prevId)) stack.push(prevId);
			}
		}

		for (const memberId of members) {
			chainGroup.set(memberId, minId);
		}
	}

	return chainGroup;
}

export function normalizeTaskPath(path: string | null | undefined): string | null {
	if (!path) return null;
	const wikiPath = parseWikiLink(path);
	const normalized = (wikiPath ?? path).trim();
	if (!normalized) return null;
	return ensureMdExt(normalized);
}

export function dedupePaths(paths: string[]): string[] {
	return [...new Set(paths)];
}


export function resolveConnectedDependencyPaths(tasks: Task[]): Set<string> {
	const taskPaths = new Set(tasks.map((task) => task.path));
	const connected = new Set<string>();

	for (const task of tasks) {
		const deps = dedupePaths(
			(task.depends_on ?? [])
				.map((path) => normalizeTaskPath(path))
				.filter((path): path is string => !!path && taskPaths.has(path))
		);
		if (deps.length === 0) continue;
		connected.add(task.path);
		for (const dep of deps) {
			connected.add(dep);
		}
	}

	return connected;
}

// ---------------------------------------------------------------------------
// Re-exports — keep the public API surface stable for all existing imports
// ---------------------------------------------------------------------------

export type { ResolvedTaskDate, ResolveTaskDatesOptions } from './taskGraphDates';
export { resolveTaskDates } from './taskGraphDates';

export type {
	HybridTimelineDefinedItem,
	HybridTimelineUnderdefinedItem,
	HybridTimelineGroupBand,
	HybridTimelineLink,
	HybridTimelineModel,
	HybridTimelineGrouping,
	BuildHybridTimelineOptions,
} from './hybridTimeline';
export { buildHybridTimeline } from './hybridTimeline';
