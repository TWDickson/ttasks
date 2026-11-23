import type { Task } from '../types';
import { normalizeRefPath } from './taskRef';
import { normalizeTaskPath } from '../store/graph/taskGraph';

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

export type DependencyCandidateGroupKind = 'same-project' | 'project' | 'no-project' | 'done';

export interface DependencyCandidateGroup {
	/** Stable key: the kind, plus the project path for a `project` group. */
	key: string;
	kind: DependencyCandidateGroupKind;
	/** The project for a `project` group (user data, shown as-is); else null. */
	project: Task | null;
	tasks: Task[];
}

/** The project a task belongs to, walking up through parent tasks (subtasks). */
function owningProjectPath(task: Task, byPath: Map<string, Task>): string | null {
	let current = normalizeTaskPath(task.parent_task);
	const seen = new Set<string>();
	while (current && !seen.has(current)) {
		seen.add(current);
		const parent = byPath.get(current);
		if (!parent) return current;
		if (parent.type === 'project') return parent.path;
		current = normalizeTaskPath(parent.parent_task);
	}
	return null;
}

const byName = (a: Task, b: Task): number => a.name.localeCompare(b.name);

/**
 * The detail pane's "Add a dependency" choices, grouped so a long vault is
 * workable: this task's own project first, then each other project by name,
 * then tasks with no project, then finished tasks (most recently completed
 * first). Within a group, open tasks sort by name.
 *
 * Left out: the task itself, what it already depends on, projects, and every
 * task downstream of it. Those would wait on this task already, so picking
 * one would close a dependency loop.
 */
export function groupDependencyCandidates(task: Task, tasks: Task[]): DependencyCandidateGroup[] {
	const byPath = new Map(tasks.map((candidate) => [candidate.path, candidate]));

	// Everything that (transitively) waits on `task`.
	const dependents = new Map<string, string[]>();
	for (const candidate of tasks) {
		for (const dep of candidate.depends_on) {
			// Link-aware: a stored `[[path|Name]]` resolves the same as a bare path.
			const path = normalizeTaskPath(dep);
			if (!path) continue;
			const list = dependents.get(path);
			if (list) list.push(candidate.path);
			else dependents.set(path, [candidate.path]);
		}
	}
	const downstream = new Set<string>();
	const queue = [task.path];
	while (queue.length > 0) {
		const path = queue.shift() as string;
		for (const next of dependents.get(path) ?? []) {
			if (downstream.has(next)) continue;
			downstream.add(next);
			queue.push(next);
		}
	}

	const existing = new Set(task.depends_on.map((dep) => normalizeTaskPath(dep)));
	const ownProject = owningProjectPath(task, byPath);
	const same: Task[] = [];
	const none: Task[] = [];
	const done: Task[] = [];
	const projects = new Map<string, Task[]>();

	for (const candidate of tasks) {
		if (candidate.type !== 'task' || candidate.path === task.path) continue;
		if (existing.has(candidate.path) || downstream.has(candidate.path)) continue;
		if (candidate.is_complete) {
			done.push(candidate);
			continue;
		}
		const project = owningProjectPath(candidate, byPath);
		if (project && project === ownProject) same.push(candidate);
		else if (project) {
			const list = projects.get(project);
			if (list) list.push(candidate);
			else projects.set(project, [candidate]);
		} else none.push(candidate);
	}

	const groups: DependencyCandidateGroup[] = [];
	if (same.length > 0) groups.push({ key: 'same-project', kind: 'same-project', project: byPath.get(ownProject ?? '') ?? null, tasks: same.sort(byName) });
	const projectGroups = [...projects]
		.map(([path, list]): DependencyCandidateGroup => ({ key: `project:${path}`, kind: 'project', project: byPath.get(path) ?? null, tasks: list.sort(byName) }))
		// A project missing from the task set still groups, under its path.
		.sort((a, b) => (a.project?.name ?? a.key).localeCompare(b.project?.name ?? b.key));
	groups.push(...projectGroups);
	if (none.length > 0) groups.push({ key: 'no-project', kind: 'no-project', project: null, tasks: none.sort(byName) });
	if (done.length > 0) {
		done.sort((a, b) => (b.completed ?? '').localeCompare(a.completed ?? '') || byName(a, b));
		groups.push({ key: 'done', kind: 'done', project: null, tasks: done });
	}
	return groups;
}
