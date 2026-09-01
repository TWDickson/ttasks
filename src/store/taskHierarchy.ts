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

/**
 * Every task reachable *downward* from `rootPath` via `parent_task`. The root is
 * absent from the result unless the data already contains a cycle that leads
 * back to it — which is exactly when a picker most needs it excluded.
 *
 * Used to keep a parent picker from offering an option that would close a loop:
 * a project can be nested under another project, and "A's parent is B, B's
 * parent is A" has no root, so nothing in that cycle would render as a tree.
 * `flattenWithDepth` survives it (there's a visited guard), but it survives it
 * by dropping the pair to depth 0 — the structure the user asked for is silently
 * not the structure they get. Cheaper to make the choice unavailable.
 *
 * Note the path convention mismatch this has to absorb: `Task.path` ends in
 * `.md`, `Task.parent_task` does not.
 */
export function collectDescendantPaths(tasks: Task[], rootPath: string): Set<string> {
	const childrenOf = new Map<string, Task[]>();
	for (const task of tasks) {
		const parentRaw = task.parent_task;
		if (!parentRaw) continue;
		const parentPath = parentRaw.endsWith('.md') ? parentRaw : `${parentRaw}.md`;
		const list = childrenOf.get(parentPath) ?? [];
		list.push(task);
		childrenOf.set(parentPath, list);
	}

	const descendants = new Set<string>();
	const queue = [rootPath];
	while (queue.length > 0) {
		const current = queue.shift()!;
		for (const child of childrenOf.get(current) ?? []) {
			// Guard against a pre-existing cycle in the data: a vault edited by hand
			// (or by an older build) can already contain one, and this walk must
			// terminate regardless.
			if (descendants.has(child.path)) continue;
			descendants.add(child.path);
			queue.push(child.path);
		}
	}
	return descendants;
}
