import type { Task } from '../types';

export interface TaskWithDepth {
	task: Task;
	depth: number;
}

/**
 * Takes a flat task array and returns a DFS-ordered flat list with depth info.
 * Tasks whose parent is not in the input set are treated as roots (including
 * tasks filtered out of the current view). Cycles are broken via visited tracking.
 *
 * Note: Task.path includes `.md`; Task.parent_task does NOT include `.md`.
 * This function normalises both sides before comparing.
 */
export function flattenWithDepth(tasks: Task[]): TaskWithDepth[] {
	const byPath = new Map<string, Task>();
	for (const task of tasks) {
		byPath.set(task.path, task);
	}

	const childrenOf = new Map<string, Task[]>();
	const roots: Task[] = [];

	for (const task of tasks) {
		const parentRaw = task.parent_task;
		if (parentRaw) {
			const parentPath = parentRaw.endsWith('.md') ? parentRaw : `${parentRaw}.md`;
			if (byPath.has(parentPath)) {
				const list = childrenOf.get(parentPath) ?? [];
				list.push(task);
				childrenOf.set(parentPath, list);
				continue;
			}
		}
		roots.push(task);
	}

	const result: TaskWithDepth[] = [];
	const visited = new Set<string>();

	function walk(task: Task, depth: number): void {
		if (visited.has(task.path)) return; // cycle guard
		visited.add(task.path);
		result.push({ task, depth });
		const children = childrenOf.get(task.path) ?? [];
		for (const child of children) {
			walk(child, depth + 1);
		}
	}

	for (const root of roots) {
		walk(root, 0);
	}

	// Any tasks not reached by the initial walk are stuck in a cycle.
	// Treat each as an additional root so they still appear in the list.
	for (const task of tasks) {
		if (!visited.has(task.path)) {
			walk(task, 0);
		}
	}

	return result;
}

/**
 * Filters a DFS-ordered flat list to only the items that should be visible
 * given the set of collapsed parent paths.
 *
 * Because flattenWithDepth produces DFS order, a collapsed item at depth N
 * means all immediately following items with depth > N are its descendants
 * and should be hidden, until we encounter an item at depth ≤ N again.
 */
export function buildVisibleItems(
	items: TaskWithDepth[],
	collapsedPaths: Set<string>,
): TaskWithDepth[] {
	const visible: TaskWithDepth[] = [];
	let skipBelowDepth: number | null = null;

	for (const item of items) {
		if (skipBelowDepth !== null) {
			if (item.depth > skipBelowDepth) continue;
			skipBelowDepth = null;
		}
		visible.push(item);
		if (collapsedPaths.has(item.task.path)) {
			skipBelowDepth = item.depth;
		}
	}

	return visible;
}

/**
 * Returns the set of task paths that have at least one child in the given
 * DFS-ordered flat list. Uses the ordering invariant: a task has children
 * if and only if the immediately following item has a greater depth.
 */
export function getParentPaths(items: TaskWithDepth[]): Set<string> {
	const parents = new Set<string>();
	for (let i = 0; i < items.length - 1; i++) {
		if (items[i + 1].depth > items[i].depth) {
			parents.add(items[i].task.path);
		}
	}
	return parents;
}
