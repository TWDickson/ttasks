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
	completionStatus: string;
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

	const blockedPaths = new Set<string>();
	for (const edge of edges) {
		const dependencyTask = taskByPath.get(edge.from);
		if (!dependencyTask) continue;
		if (dependencyTask.status === options.completionStatus) continue;
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

	for (const level of sortedLevels) {
		const levelComponents = componentsByLevel.get(level) ?? [];
		levelComponents.sort((left, right) => left.label.localeCompare(right.label) || left.id - right.id);
		let rowCursor = 0;

		for (const component of levelComponents) {
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

			rowCursor += orderedPaths.length + 1;
		}
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

function normalizeTaskPath(path: string | null | undefined): string | null {
	if (!path) return null;
	return path.endsWith('.md') ? path : `${path}.md`;
}

function dedupePaths(paths: string[]): string[] {
	return [...new Set(paths)];
}