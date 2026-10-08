import type { Task } from '../types';
import { normalizeRefPath } from './taskRef';

/**
 * Comparator for sorting candidate dependency tasks.
 * Same-project tasks (matching currentParentTask) sort first,
 * then all others alphabetically by name.
 *
 * Paths are compared extension-normalised: stored tasks carry `.md`
 * (`TaskStore.resolveWikiLinkPath`) while the create modal and link fields hold
 * the extensionless form, and a raw `===` silently never matched across them.
 */
export function sortDependencyFirst(a: Task, b: Task, currentParentTask: string | null): number {
	const parent = normalizeRefPath(currentParentTask);
	const aIsSameProject = !!parent && normalizeRefPath(a.parent_task) === parent;
	const bIsSameProject = !!parent && normalizeRefPath(b.parent_task) === parent;
	if (aIsSameProject && !bIsSameProject) return -1;
	if (!aIsSameProject && bIsSameProject) return 1;
	return a.name.localeCompare(b.name);
}
