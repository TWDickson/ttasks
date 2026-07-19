// Pure export-filtering. NO Obsidian imports (boundary-tested). The Share/Sync
// modal builds an ExportFilterCriteria from the user's checkbox selections and
// this narrows the task list before it's serialized. Empty dimensions mean "no
// constraint on this axis"; a task must pass every constrained axis (AND across
// axes, OR within an axis).

import type { Task } from '../types';

export interface ExportFilterCriteria {
	/** Areas to include; empty = all areas. */
	areas: string[];
	/** Project note paths whose tasks (and the project itself) to include; empty = all. */
	projects: string[];
	/** Statuses to include; empty = all statuses. */
	statuses: string[];
	/** Labels to include (a task matches if it has any); empty = all. */
	labels: string[];
	/** When false, completed tasks are dropped. */
	includeCompleted: boolean;
}

export const EMPTY_EXPORT_CRITERIA: ExportFilterCriteria = {
	areas: [],
	projects: [],
	statuses: [],
	labels: [],
	includeCompleted: true,
};

const stripMd = (path: string): string => path.replace(/\.md$/, '');

/** Extract the target path from a wiki-link like "[[path|Name]]"; null when absent. */
export function linkTargetPath(link: string | null): string | null {
	if (!link) return null;
	const match = /\[\[([^|\]]+)/.exec(link);
	const raw = (match ? match[1] : link).trim();
	return raw ? stripMd(raw) : null;
}

/** Apply the criteria to a task list, preserving order. */
export function filterTasksForExport(tasks: Task[], criteria: ExportFilterCriteria): Task[] {
	const projectSet = new Set(criteria.projects.map(stripMd));
	return tasks.filter((task) => {
		if (!criteria.includeCompleted && task.is_complete) return false;
		if (criteria.areas.length && !(task.area !== null && criteria.areas.includes(task.area))) return false;
		if (criteria.statuses.length && !criteria.statuses.includes(task.status)) return false;
		if (criteria.labels.length && !task.labels.some((label) => criteria.labels.includes(label))) return false;
		if (projectSet.size) {
			const parentPath = linkTargetPath(task.parent_task);
			const selfPath = stripMd(task.path);
			const inProject = (parentPath !== null && projectSet.has(parentPath)) || (task.type === 'project' && projectSet.has(selfPath));
			if (!inProject) return false;
		}
		return true;
	});
}

export interface ProjectFacet {
	path: string;
	name: string;
}

/** Distinct projects (type === 'project') present in the task list, name-sorted. */
export function collectProjectFacets(tasks: Task[]): ProjectFacet[] {
	const facets = tasks
		.filter((task) => task.type === 'project')
		.map((task) => ({ path: stripMd(task.path), name: task.name }));
	facets.sort((a, b) => a.name.localeCompare(b.name));
	return facets;
}

/** True when no dimension constrains the selection (the whole set exports). */
export function isUnfilteredCriteria(criteria: ExportFilterCriteria): boolean {
	return (
		criteria.areas.length === 0 &&
		criteria.projects.length === 0 &&
		criteria.statuses.length === 0 &&
		criteria.labels.length === 0 &&
		criteria.includeCompleted
	);
}
