import type { Task } from '../types';
import { normalizeTaskPath } from '../store/graph/taskGraph';

/**
 * A task is "ready" when it's open and every resolvable dependency it has is
 * complete. An unresolved (dangling) depends_on link doesn't block — mirrors
 * the dependency graph's own "Ready now" definition.
 */
export function isTaskReady(task: Task, tasksByPath: Map<string, Task>): boolean {
	if (task.is_complete) return false;
	return task.depends_on.every((dep) => {
		const depPath = normalizeTaskPath(dep);
		const depTask = depPath ? tasksByPath.get(depPath) : null;
		return !depTask || depTask.is_complete;
	});
}

/**
 * Stable partition: ready-to-work tasks first, then blocked ones, each side
 * keeping its existing relative order (so an upstream sort by priority/date
 * still governs within each side). `allTasks` should be the full, unfiltered
 * task list so a blocker outside the visible/filtered set still resolves.
 */
export function sortReadyFirst(tasks: Task[], allTasks: Task[]): Task[] {
	const tasksByPath = new Map(allTasks.map((task) => [task.path, task]));
	const ready: Task[] = [];
	const blocked: Task[] = [];
	for (const task of tasks) {
		(isTaskReady(task, tasksByPath) ? ready : blocked).push(task);
	}
	return [...ready, ...blocked];
}
