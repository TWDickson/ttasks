/**
 * Plans the dependency-graph edits the user makes by hand: drag a connector to
 * link two cards, click a break-link to unlink them, drop a card on another to
 * insert it into that chain, or drop it on a lane to move it to that project.
 *
 * Pure: each `plan*` takes the task list and returns either the ordered store
 * writes to make, or why the edit is refused. A refusal is a value, not a throw,
 * so the graph can say why in a notice. Every plan that adds a link is
 * cycle-checked against the graph it would produce. A cycle is never written.
 *
 * Paths in ops are canonical (`.md`). The caller strips the extension where a
 * store method wants it (`addDependency`).
 */
import type { Task } from '../../types';
import { normalizeTaskPath, SATELLITE_LANE_PREFIX } from './taskGraph';

export type GraphEditOp =
	| { kind: 'addDependency'; taskPath: string; dependencyPath: string }
	| { kind: 'removeDependency'; taskPath: string; dependencyPath: string }
	| { kind: 'setParent'; taskPath: string; parentPath: string | null };

export type GraphEditRefusal =
	/** Source and target are the same card. */
	| 'self'
	/** One end isn't a task on the graph (a project record, or gone). */
	| 'not-task'
	/** The link already exists. */
	| 'exists'
	/** The edit would leave the graph as it is. */
	| 'noop'
	/** The edit would close a dependency loop. */
	| 'cycle';

export type GraphEditPlan =
	| { ok: true; ops: GraphEditOp[] }
	| { ok: false; reason: GraphEditRefusal };

type DependencyMap = Map<string, string[]>;

function taskIndex(tasks: Task[]): Map<string, Task> {
	return new Map(tasks.map((task) => [task.path, task]));
}

/** Each task's `depends_on`, canonicalised, de-duplicated, self-links dropped. */
function dependencyMap(tasks: Task[]): DependencyMap {
	const map: DependencyMap = new Map();
	for (const task of tasks) {
		const deps: string[] = [];
		for (const raw of task.depends_on) {
			const path = normalizeTaskPath(raw);
			if (path && path !== task.path && !deps.includes(path)) deps.push(path);
		}
		map.set(task.path, deps);
	}
	return map;
}

/** True when the dependency map has a loop. Iterative DFS, three-colour. */
function hasCycle(map: DependencyMap): boolean {
	const state = new Map<string, 1 | 2>(); // 1 = on stack, 2 = finished
	for (const start of map.keys()) {
		if (state.has(start)) continue;
		const stack: Array<{ path: string; next: number }> = [{ path: start, next: 0 }];
		state.set(start, 1);
		while (stack.length > 0) {
			const frame = stack[stack.length - 1];
			const deps = map.get(frame.path) ?? [];
			if (frame.next >= deps.length) {
				state.set(frame.path, 2);
				stack.pop();
				continue;
			}
			const dep = deps[frame.next++];
			const seen = state.get(dep);
			if (seen === 1) return true;
			if (seen === undefined && map.has(dep)) {
				state.set(dep, 1);
				stack.push({ path: dep, next: 0 });
			}
		}
	}
	return false;
}

/** The add/remove ops that turn `before` into `after`, task by task. */
function diffDependencies(before: DependencyMap, after: DependencyMap): GraphEditOp[] {
	const ops: GraphEditOp[] = [];
	for (const [taskPath, next] of after) {
		const prev = before.get(taskPath) ?? [];
		for (const dep of prev) {
			if (!next.includes(dep)) ops.push({ kind: 'removeDependency', taskPath, dependencyPath: dep });
		}
		for (const dep of next) {
			if (!prev.includes(dep)) ops.push({ kind: 'addDependency', taskPath, dependencyPath: dep });
		}
	}
	return ops;
}

function cloneMap(map: DependencyMap): DependencyMap {
	return new Map([...map].map(([key, deps]) => [key, [...deps]]));
}

function isTask(task: Task | undefined): task is Task {
	return !!task && task.type === 'task';
}

/** `dependentPath` will depend on `blockerPath`, so the blocker must finish first. */
export function planConnect(tasks: Task[], blockerPath: string, dependentPath: string): GraphEditPlan {
	if (blockerPath === dependentPath) return { ok: false, reason: 'self' };
	const byPath = taskIndex(tasks);
	if (!isTask(byPath.get(blockerPath)) || !isTask(byPath.get(dependentPath))) return { ok: false, reason: 'not-task' };
	const before = dependencyMap(tasks);
	if (before.get(dependentPath)?.includes(blockerPath)) return { ok: false, reason: 'exists' };
	const after = cloneMap(before);
	after.get(dependentPath)?.push(blockerPath);
	if (hasCycle(after)) return { ok: false, reason: 'cycle' };
	return { ok: true, ops: [{ kind: 'addDependency', taskPath: dependentPath, dependencyPath: blockerPath }] };
}

/** Removes the `dependentPath` → `blockerPath` dependency. */
export function planDisconnect(tasks: Task[], blockerPath: string, dependentPath: string): GraphEditPlan {
	const before = dependencyMap(tasks);
	if (!before.get(dependentPath)?.includes(blockerPath)) return { ok: false, reason: 'noop' };
	return { ok: true, ops: [{ kind: 'removeDependency', taskPath: dependentPath, dependencyPath: blockerPath }] };
}

/**
 * Moves `movedPath` to sit immediately before `targetPath` in the target's chain.
 *
 * 1. **Splice the moved task out** of wherever it was: its dependents take over
 *    its blockers, so `A → X → C` closes up to `A → C`. Without this, dragging a
 *    later step in front of an earlier one would close a loop.
 * 2. **Insert it**: the moved task takes over the target's blockers, and the
 *    target depends on the moved task alone. `A → Y` becomes `A → X → Y`.
 *
 * The project is left alone. A card dropped into another project's chain keeps
 * its own lane, and the cross-lane link shows the move.
 */
export function planInsertBefore(tasks: Task[], movedPath: string, targetPath: string): GraphEditPlan {
	if (movedPath === targetPath) return { ok: false, reason: 'self' };
	const byPath = taskIndex(tasks);
	if (!isTask(byPath.get(movedPath)) || !isTask(byPath.get(targetPath))) return { ok: false, reason: 'not-task' };

	const before = dependencyMap(tasks);
	const after = cloneMap(before);

	const movedBlockers = after.get(movedPath) ?? [];
	for (const [path, deps] of after) {
		const at = deps.indexOf(movedPath);
		if (at === -1) continue;
		const spliced = deps.filter((dep) => dep !== movedPath);
		for (const blocker of movedBlockers) {
			if (blocker !== path && !spliced.includes(blocker)) spliced.push(blocker);
		}
		after.set(path, spliced);
	}

	const targetBlockers = (after.get(targetPath) ?? []).filter((dep) => dep !== movedPath);
	after.set(movedPath, targetBlockers);
	after.set(targetPath, [movedPath]);

	if (hasCycle(after)) return { ok: false, reason: 'cycle' };
	const ops = diffDependencies(before, after);
	if (ops.length === 0) return { ok: false, reason: 'noop' };
	// Adds before removes: a write that fails half-way leaves an extra link
	// rather than an orphaned task, and the extra link is visible on the graph.
	ops.sort((left, right) => (left.kind === right.kind ? 0 : left.kind === 'addDependency' ? -1 : 1));
	return { ok: true, ops };
}

/** The project a lane key names, or `null` for the Unassigned and satellite lanes. */
export function laneProjectPath(laneKey: string | null): string | null {
	if (!laneKey || laneKey === '__unassigned__' || laneKey.startsWith(SATELLITE_LANE_PREFIX)) return null;
	return laneKey;
}

/**
 * Moves a task into a lane: parented to that lane's project, or unparented for
 * the Unassigned lane. `currentLaneKey` is the lane the card sits in now, so
 * dropping a card back into its own lane, a subtask included, changes nothing.
 */
export function planMoveToLane(
	tasks: Task[],
	taskPath: string,
	currentLaneKey: string | null,
	targetLaneKey: string | null,
): GraphEditPlan {
	const task = taskIndex(tasks).get(taskPath);
	if (!isTask(task)) return { ok: false, reason: 'not-task' };
	const target = laneProjectPath(targetLaneKey);
	if (target === laneProjectPath(currentLaneKey)) return { ok: false, reason: 'noop' };
	if (target === null && !task.parent_task) return { ok: false, reason: 'noop' };
	return { ok: true, ops: [{ kind: 'setParent', taskPath, parentPath: target }] };
}
