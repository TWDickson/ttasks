import type { Task } from '../types';
import { normalizeRefPath } from '../utils/taskRef';

/**
 * `blocks` is the reverse index of `depends_on` — a pure function of the other
 * tasks, so it is derived rather than stored (MD-3). Called on every write to the
 * task store, so no consumer ever sees a stale or hand-edited value.
 *
 * Tasks whose `blocks` is already correct keep their identity, so a change to one
 * dependency doesn't invalidate every row downstream of Svelte's equality checks.
 * Dependents appear in the order the tasks are held.
 *
 * Pure module — no Obsidian imports.
 */
export function deriveBlocks(tasks: Task[]): Task[] {
	const dependentsByTarget = new Map<string, string[]>();
	for (const task of tasks) {
		const seen = new Set<string>();
		for (const dep of task.depends_on) {
			const target = normalizeRefPath(dep);
			if (!target || seen.has(target)) continue;
			seen.add(target);
			const list = dependentsByTarget.get(target);
			if (list) list.push(task.path);
			else dependentsByTarget.set(target, [task.path]);
		}
	}

	return tasks.map((task) => {
		const next = dependentsByTarget.get(normalizeRefPath(task.path) ?? '') ?? [];
		const same = next.length === task.blocks.length && next.every((path, i) => path === task.blocks[i]);
		return same ? task : { ...task, blocks: next };
	});
}
