import type { Task } from '../types';

export interface TaskGraphNode {
	path: string;
	task: Task;
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
}

export interface TaskGraphLayout {
	nodes: TaskGraphNode[];
	edges: TaskGraphEdge[];
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

const DEFAULT_NODE_WIDTH = 232;
const DEFAULT_NODE_HEIGHT = 92;
const DEFAULT_HORIZONTAL_GAP = 88;
const DEFAULT_VERTICAL_GAP = 28;
const DEFAULT_PADDING = 28;

export function buildTaskGraph(tasks: Task[], options: BuildTaskGraphOptions): TaskGraphLayout {
	const nodeWidth = options.nodeWidth ?? DEFAULT_NODE_WIDTH;
	const nodeHeight = options.nodeHeight ?? DEFAULT_NODE_HEIGHT;
	const horizontalGap = options.horizontalGap ?? DEFAULT_HORIZONTAL_GAP;
	const verticalGap = options.verticalGap ?? DEFAULT_VERTICAL_GAP;
	const padding = options.padding ?? DEFAULT_PADDING;

	const visibleTasks = [...tasks]
		.filter((task) => task.type !== 'project')
		.sort((left, right) => left.name.localeCompare(right.name) || left.path.localeCompare(right.path));

	if (visibleTasks.length === 0) {
		return {
			nodes: [],
			edges: [],
			columns: 0,
			rows: 0,
			width: padding * 2,
			height: padding * 2,
			cycleCount: 0,
			blockedNodeCount: 0,
			blockedEdgeCount: 0,
			maxDepth: 0,
		};
	}

	const taskByPath = new Map(visibleTasks.map((task) => [task.path, task]));
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
			});
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
				return (leftTask?.name ?? left).localeCompare(rightTask?.name ?? right) || left.localeCompare(right);
			});

			for (const [index, path] of orderedPaths.entries()) {
				const task = taskByPath.get(path);
				if (!task) continue;
				const row = rowCursor + index;
				maxRow = Math.max(maxRow, row);
				nodes.push({
					path,
					task,
					column: level,
					row,
					x: padding + level * (nodeWidth + horizontalGap),
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

	// Lane compaction pass: remove empty row indices while preserving relative
	// ordering/alignment produced by the chain + interchain sort.
	if (nodes.length > 0) {
		const usedRows = [...new Set(nodes.map((node) => node.row))].sort((left, right) => left - right);
		const rowMap = new Map<number, number>();
		for (const [index, row] of usedRows.entries()) {
			rowMap.set(row, index);
		}

		for (const node of nodes) {
			const compactRow = rowMap.get(node.row) ?? node.row;
			node.row = compactRow;
			node.y = padding + compactRow * (nodeHeight + verticalGap);
		}

		maxRow = usedRows.length - 1;
	}

	nodes.sort((left, right) => left.column - right.column || left.row - right.row || left.path.localeCompare(right.path));

	const rows = Math.max(0, maxRow + 1);
	const columns = Math.max(1, sortedLevels.length);
	return {
		nodes,
		edges,
		columns,
		rows,
		width: padding * 2 + columns * nodeWidth + Math.max(0, columns - 1) * horizontalGap,
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

function normalizeTaskPath(path: string | null | undefined): string | null {
	if (!path) return null;
	return path.endsWith('.md') ? path : `${path}.md`;
}

function dedupePaths(paths: string[]): string[] {
	return [...new Set(paths)];
}

// ---------------------------------------------------------------------------
// Timeline date inference
// ---------------------------------------------------------------------------

export interface ResolvedTaskDate {
	start: Date;
	end: Date;
	/** True when start was propagated from dependency end dates rather than
	 *  set explicitly by the user. Used by the timeline to visually distinguish
	 *  inferred bars from explicitly scheduled ones. */
	isInferred: boolean;
}

const INFER_DAY_MS = 24 * 60 * 60 * 1000;

function inferParseDate(value: string | null | undefined): Date | null {
	if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
	const d = new Date(`${value}T00:00:00`);
	return isNaN(d.getTime()) ? null : d;
}

function inferAddDays(date: Date, days: number): Date {
	return new Date(date.getTime() + days * INFER_DAY_MS);
}

/**
 * Resolves start/end dates for all tasks via topological sort over the
 * dependency graph. Propagates resolved end dates forward through
 * arbitrary-depth dependency chains so that a task with no explicit dates
 * can inherit its position from its dependencies.
 *
 * Cycle handling: tasks whose in-degree never reaches zero during Kahn's
 * traversal are in a dependency cycle and are excluded from the result.
 *
 * Inclusion: a task appears in the result if at least one anchor date can
 * be established — either an explicit start_date / due_date, or a start
 * inferred from a resolved upstream dependency.
 */
export function resolveTaskDates(tasks: Task[]): Map<string, ResolvedTaskDate> {
	const taskByPath = new Map(tasks.map((t) => [t.path, t]));

	// Build normalized depends_on map for each task
	const depsOf = new Map<string, string[]>();
	for (const task of tasks) {
		const deps = dedupePaths(
			(task.depends_on ?? [])
				.map((p) => normalizeTaskPath(p))
				.filter((p): p is string => !!p && taskByPath.has(p) && p !== task.path)
		);
		depsOf.set(task.path, deps);
	}

	// Reverse map: dep path → paths that depend on it (for propagation)
	const dependentsOf = new Map<string, string[]>();
	for (const task of tasks) dependentsOf.set(task.path, []);
	for (const [path, deps] of depsOf) {
		for (const dep of deps) dependentsOf.get(dep)?.push(path);
	}

	// Kahn's: in-degree = number of unprocessed dependencies
	const inDegree = new Map<string, number>();
	for (const task of tasks) inDegree.set(task.path, depsOf.get(task.path)?.length ?? 0);

	const queue: string[] = [];
	for (const task of tasks) {
		if ((inDegree.get(task.path) ?? 0) === 0) queue.push(task.path);
	}

	const resolved = new Map<string, ResolvedTaskDate>();

	while (queue.length > 0) {
		const path = queue.shift()!;
		const task = taskByPath.get(path);
		if (!task) continue;

		const deps = depsOf.get(path) ?? [];

		// Latest resolved end across all dependencies
		const depEndTimes = deps
			.map((d) => resolved.get(d)?.end.getTime())
			.filter((t): t is number => t !== undefined);
		const latestDepEnd = depEndTimes.length > 0
			? new Date(Math.max(...depEndTimes))
			: null;

		// Resolve start — explicit start_date wins, then propagate from deps,
		// then fall back to due_date as a deadline-only anchor point
		const explicitStart = inferParseDate(task.start_date);
		const explicitDue   = inferParseDate(task.due_date);

		let start: Date | null = explicitStart;
		let isInferred = false;

		if (!start && latestDepEnd) {
			start = inferAddDays(latestDepEnd, 1);
			isInferred = true;
		}
		if (!start && explicitDue) {
			start = new Date(explicitDue.getTime()); // deadline-only: point bar
		}

		if (start) {
			// Resolve end — explicit due_date wins, then estimated_days from start
			let end: Date | null = explicitDue;
			if (!end) {
				const estDays = task.estimated_days;
				if (estDays && estDays > 0) {
					end = inferAddDays(start, Math.max(0, Math.round(estDays) - 1));
				}
			}
			if (!end) end = new Date(start.getTime()); // point bar
			if (end.getTime() < start.getTime()) end = new Date(start.getTime());

			resolved.set(path, { start, end, isInferred });
		}

		// Propagate: decrement in-degree of dependents, enqueue when ready
		for (const dependent of dependentsOf.get(path) ?? []) {
			const newDegree = (inDegree.get(dependent) ?? 1) - 1;
			inDegree.set(dependent, newDegree);
			if (newDegree === 0) queue.push(dependent);
		}
	}

	// Any task still with inDegree > 0 is in a cycle — not included in result
	return resolved;
}

export interface HybridTimelineDefinedItem {
	path: string;
	task: Task;
	start: Date;
	end: Date;
	leftPercent: number;
	widthPercent: number;
	row: number;
	isInferred: boolean;
	groupKey: string;
	groupLabel: string;
}

export interface HybridTimelineUnderdefinedItem {
	path: string;
	task: Task;
	anchorPath: string;
	leftPercent: number;
	widthPercent: number;
	row: number;
	groupKey: string;
	groupLabel: string;
}

export interface HybridTimelineGroupBand {
	key: string;
	label: string;
	startRow: number;
	endRow: number;
	count: number;
}

export interface HybridTimelineLink {
	id: string;
	fromPath: string;
	toPath: string;
	fromPercent: number;
	toPercent: number;
	fromRow: number;
	toRow: number;
}

export interface HybridTimelineModel {
	rangeStart: Date;
	rangeEnd: Date;
	defined: HybridTimelineDefinedItem[];
	underdefined: HybridTimelineUnderdefinedItem[];
	links: HybridTimelineLink[];
	definedGroups: HybridTimelineGroupBand[];
	underdefinedGroups: HybridTimelineGroupBand[];
	definedRowCount: number;
	underdefinedRowCount: number;
}

export type HybridTimelineGrouping = 'none' | 'project' | 'dependency';

export interface BuildHybridTimelineOptions {
	grouping?: HybridTimelineGrouping;
}

export function buildHybridTimeline(tasks: Task[], options: BuildHybridTimelineOptions = {}): HybridTimelineModel {
	const today = new Date();
	today.setHours(0, 0, 0, 0);
	const fallbackStart = inferAddDays(today, -7);
	const fallbackEnd = inferAddDays(today, 21);
	const grouping = options.grouping ?? 'none';

	const visibleTasks = tasks.filter((task) => task.type === 'task');
	const taskByPath = new Map(visibleTasks.map((task) => [task.path, task]));
	const resolved = resolveTaskDates(visibleTasks);
	const resolveGroup = createTimelineGroupingResolver(grouping, visibleTasks);

	const resolvedEntries = [...resolved.entries()]
		.map(([path, dates]) => ({ path, task: taskByPath.get(path), dates }))
		.filter((entry): entry is { path: string; task: Task; dates: ResolvedTaskDate } => {
			if (!entry.task) return false;
			const hasExplicitDate = !!inferParseDate(entry.task.start_date) || !!inferParseDate(entry.task.due_date);
			const hasEstimate = typeof entry.task.estimated_days === 'number' && entry.task.estimated_days > 0;
			return hasExplicitDate || hasEstimate;
		})
		.sort((left, right) => left.dates.start.getTime() - right.dates.start.getTime() || left.task.name.localeCompare(right.task.name));

	const starts = resolvedEntries.map((entry) => entry.dates.start.getTime());
	const ends = resolvedEntries.map((entry) => entry.dates.end.getTime());
	const rangeStart = starts.length > 0 ? new Date(Math.min(...starts)) : fallbackStart;
	const rangeEnd = ends.length > 0 ? new Date(Math.max(...ends)) : fallbackEnd;
	const spanDays = Math.max(1, Math.round((rangeEnd.getTime() - rangeStart.getTime()) / INFER_DAY_MS) + 1);

	const definedRowEndsByGroup = new Map<string, number[]>();
	const definedGroupOrder: string[] = [];
	const definedGroupLabels = new Map<string, string>();
	const defined: HybridTimelineDefinedItem[] = [];
	const definedByPath = new Map<string, HybridTimelineDefinedItem>();

	for (const entry of resolvedEntries) {
		const group = resolveGroup(entry.task);
		if (!definedRowEndsByGroup.has(group.key)) {
			definedRowEndsByGroup.set(group.key, []);
			definedGroupOrder.push(group.key);
			definedGroupLabels.set(group.key, group.label);
		}
		const groupRows = definedRowEndsByGroup.get(group.key) ?? [];

		const leftDays = Math.max(0, Math.round((entry.dates.start.getTime() - rangeStart.getTime()) / INFER_DAY_MS));
		const durationDays = Math.max(1, Math.round((entry.dates.end.getTime() - entry.dates.start.getTime()) / INFER_DAY_MS) + 1);
		const leftPercent = (leftDays / spanDays) * 100;
		const widthPercent = Math.max(2.4, (durationDays / spanDays) * 100);

		let localRow = 0;
		while (localRow < groupRows.length && leftDays <= groupRows[localRow]) {
			localRow += 1;
		}
		groupRows[localRow] = leftDays + durationDays;
		definedRowEndsByGroup.set(group.key, groupRows);

		const item: HybridTimelineDefinedItem = {
			path: entry.path,
			task: entry.task,
			start: entry.dates.start,
			end: entry.dates.end,
			leftPercent,
			widthPercent,
			row: localRow,
			isInferred: entry.dates.isInferred,
			groupKey: group.key,
			groupLabel: group.label,
		};
		defined.push(item);
		definedByPath.set(entry.path, item);
	}

	const definedGroupBands = buildGroupBands(definedGroupOrder, definedGroupLabels, definedRowEndsByGroup);
	for (const item of defined) {
		const band = definedGroupBands.find((candidate) => candidate.key === item.groupKey);
		item.row = (band?.startRow ?? 0) + item.row;
	}

	const underRowEndsByGroup = new Map<string, number[]>();
	const underGroupOrder: string[] = [];
	const underGroupLabels = new Map<string, string>();
	const underdefined: HybridTimelineUnderdefinedItem[] = [];
	const links: HybridTimelineLink[] = [];

	for (const task of visibleTasks) {
		if (definedByPath.has(task.path)) continue;
		if (inferParseDate(task.start_date) || inferParseDate(task.due_date)) continue;
		if (typeof task.estimated_days === 'number' && task.estimated_days > 0) continue;

		const deps = dedupePaths(
			(task.depends_on ?? [])
				.map((path) => normalizeTaskPath(path))
				.filter((path): path is string => !!path && taskByPath.has(path))
		);

		let anchorPath: string | null = null;
		let anchorEndMs = Number.NEGATIVE_INFINITY;
		for (const depPath of deps) {
			const depDates = resolved.get(depPath);
			if (!depDates) continue;
			const depEndMs = depDates.end.getTime();
			if (depEndMs > anchorEndMs) {
				anchorEndMs = depEndMs;
				anchorPath = depPath;
			}
		}

		if (!anchorPath || !Number.isFinite(anchorEndMs)) continue;
		const anchorDate = new Date(anchorEndMs + INFER_DAY_MS);
		const leftDays = Math.max(0, Math.round((anchorDate.getTime() - rangeStart.getTime()) / INFER_DAY_MS));
		const leftPercent = Math.min(98, (leftDays / spanDays) * 100);
		const widthPercent = resolveUnderdefinedWidthPercent(task);

		const group = resolveGroup(task);
		if (!underRowEndsByGroup.has(group.key)) {
			underRowEndsByGroup.set(group.key, []);
			underGroupOrder.push(group.key);
			underGroupLabels.set(group.key, group.label);
		}
		const groupRows = underRowEndsByGroup.get(group.key) ?? [];

		let localRow = 0;
		while (localRow < groupRows.length && leftPercent <= groupRows[localRow]) {
			localRow += 1;
		}
		groupRows[localRow] = leftPercent + widthPercent + 1.25;
		underRowEndsByGroup.set(group.key, groupRows);

		const item: HybridTimelineUnderdefinedItem = {
			path: task.path,
			task,
			anchorPath,
			leftPercent,
			widthPercent,
			row: localRow,
			groupKey: group.key,
			groupLabel: group.label,
		};
		underdefined.push(item);
	}

	const underGroupBands = buildGroupBands(underGroupOrder, underGroupLabels, underRowEndsByGroup);
	for (const item of underdefined) {
		const band = underGroupBands.find((candidate) => candidate.key === item.groupKey);
		item.row = (band?.startRow ?? 0) + item.row;

		const anchorResolved = definedByPath.get(item.anchorPath);
		if (anchorResolved) {
			links.push({
				id: `${item.anchorPath}->${item.path}`,
				fromPath: item.anchorPath,
				toPath: item.path,
				fromPercent: Math.min(99, anchorResolved.leftPercent + anchorResolved.widthPercent),
				toPercent: item.leftPercent,
				fromRow: anchorResolved.row,
				toRow: item.row,
			});
		}
	}

	underdefined.sort((left, right) => left.leftPercent - right.leftPercent || left.task.name.localeCompare(right.task.name));
	const definedRowCount = Math.max(1, definedGroupBands.length > 0 ? definedGroupBands[definedGroupBands.length - 1].endRow + 1 : 0);
	const underdefinedRowCount = Math.max(1, underGroupBands.length > 0 ? underGroupBands[underGroupBands.length - 1].endRow + 1 : 0);

	return {
		rangeStart,
		rangeEnd,
		defined,
		underdefined,
		links,
		definedGroups: definedGroupBands,
		underdefinedGroups: underGroupBands,
		definedRowCount,
		underdefinedRowCount,
	};
}

function resolveUnderdefinedWidthPercent(task: Task): number {
	// Wider cards for longer titles improve scanability while still allowing
	// dense tracks on large boards.
	const titleLength = task.name.trim().length;
	const width = 9 + Math.min(44, titleLength) * 0.23;
	return Math.min(20, Math.max(10, width));
}

function createTimelineGroupingResolver(
	mode: HybridTimelineGrouping,
	visibleTasks: Task[],
): (task: Task) => { key: string; label: string } {
	if (mode === 'none') {
		return () => ({ key: '__all__', label: 'All tasks' });
	}

	if (mode === 'project') {
		const taskByPath = new Map(visibleTasks.map((task) => [task.path, task]));
		return (task) => {
			const parent = normalizeTaskPath(task.parent_task ?? null);
			if (!parent) return { key: '__no_project__', label: 'No project' };
			const project = taskByPath.get(parent);
			return {
				key: `project:${parent}`,
				label: project?.name ?? pathLeaf(parent),
			};
		};
	}

	const taskByPath = new Map(visibleTasks.map((task) => [task.path, task]));
	const neighbors = new Map<string, Set<string>>();
	for (const task of visibleTasks) {
		neighbors.set(task.path, new Set<string>());
	}
	for (const task of visibleTasks) {
		const deps = dedupePaths(
			(task.depends_on ?? [])
				.map((path) => normalizeTaskPath(path))
				.filter((path): path is string => !!path && taskByPath.has(path) && path !== task.path)
		);
		for (const dep of deps) {
			neighbors.get(task.path)?.add(dep);
			neighbors.get(dep)?.add(task.path);
		}
	}

	const componentByPath = new Map<string, string>();
	const labelByComponent = new Map<string, string>();
	let componentIndex = 0;
	for (const task of visibleTasks) {
		if (componentByPath.has(task.path)) continue;
		const stack = [task.path];
		const componentTasks: Task[] = [];
		while (stack.length > 0) {
			const current = stack.pop();
			if (!current || componentByPath.has(current)) continue;
			componentByPath.set(current, `dependency:${componentIndex}`);
			const currentTask = taskByPath.get(current);
			if (currentTask) componentTasks.push(currentTask);
			for (const next of neighbors.get(current) ?? []) {
				if (!componentByPath.has(next)) stack.push(next);
			}
		}
		componentTasks.sort((left, right) => left.name.localeCompare(right.name) || left.path.localeCompare(right.path));
		labelByComponent.set(`dependency:${componentIndex}`, componentTasks[0]?.name ?? `Chain ${componentIndex + 1}`);
		componentIndex += 1;
	}

	return (task) => {
		const key = componentByPath.get(task.path) ?? 'dependency:unassigned';
		return {
			key,
			label: labelByComponent.get(key) ?? task.name,
		};
	};
}

function buildGroupBands(
	order: string[],
	labels: Map<string, string>,
	rowsByGroup: Map<string, number[]>,
): HybridTimelineGroupBand[] {
	const bands: HybridTimelineGroupBand[] = [];
	let cursor = 0;
	for (const key of order) {
		const rows = rowsByGroup.get(key) ?? [];
		const rowCount = Math.max(1, rows.length);
		bands.push({
			key,
			label: labels.get(key) ?? key,
			startRow: cursor,
			endRow: cursor + rowCount - 1,
			count: rowCount,
		});
		cursor += rowCount + 1;
	}
	if (bands.length > 0) {
		bands[bands.length - 1].endRow = Math.max(bands[bands.length - 1].startRow, bands[bands.length - 1].endRow);
	}
	return bands;
}

function pathLeaf(path: string): string {
	const leaf = path.split('/').pop() ?? path;
	return leaf.replace(/\.md$/, '').replace(/^[a-f0-9]+-/, '');
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