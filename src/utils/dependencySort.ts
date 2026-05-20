import type { Task } from '../types';

/**
 * Comparator for sorting candidate dependency tasks.
 * Same-project tasks (matching currentParentTask) sort first,
 * then all others alphabetically by name.
 */
export function sortDependencyFirst(a: Task, b: Task, currentParentTask: string | null): number {
	const aIsSameProject = !!currentParentTask && a.parent_task === currentParentTask;
	const bIsSameProject = !!currentParentTask && b.parent_task === currentParentTask;
	if (aIsSameProject && !bIsSameProject) return -1;
	if (!aIsSameProject && bIsSameProject) return 1;
	return a.name.localeCompare(b.name);
}
