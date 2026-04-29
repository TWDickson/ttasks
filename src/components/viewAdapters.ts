import type { FilterCondition, GroupSpec, SortSpec, TaskGroup } from '../query/types';
import { buildVisibleItems, flattenWithDepth, getParentPaths } from '../store/taskHierarchy';
import type { Task } from '../types';

export type BoardViewMode = 'list' | 'kanban' | 'agenda' | 'graph';

export interface BoardQueryConfig {
	group: GroupSpec;
	sort: SortSpec;
	baseFilterConditions: FilterCondition[];
}

export interface KanbanColumn {
	id: string;
	label: string;
	accent?: string;
	tasks: Task[];
}

export interface ListSection {
	key: string;
	label: string;
	tasks: Task[];
}

export interface ListRow {
	task: Task;
	depth: number;
	expandable: boolean;
	expanded: boolean;
}

export function flattenTaskGroups(groups: TaskGroup[]): Task[] {
	return groups.flatMap((group) => group.tasks);
}

export function resolveBoardQuery(view: BoardViewMode): BoardQueryConfig {
	switch (view) {
		case 'list':
		case 'kanban':
			return { group: { kind: 'field', field: 'status' }, sort: [], baseFilterConditions: [] };
		case 'agenda':
			return {
				group: { kind: 'date_buckets', field: 'due_date', preset: 'agenda' },
				sort: [
					{ field: 'due_date', direction: 'asc' },
					{ field: 'priority', direction: 'asc' },
				],
				baseFilterConditions: [
					{ field: 'type', operator: 'is', value: 'task' },
					{ field: 'is_complete', operator: 'is', value: false },
				],
			};
		case 'graph':
		default:
			return { group: { kind: 'none' }, sort: [], baseFilterConditions: [] };
	}
}

export function buildKanbanColumns(
	groups: TaskGroup[],
	statuses: string[],
	statusColors: Record<string, string>,
): KanbanColumn[] {
	const tasksByStatus = new Map<string, Task[]>();
	for (const group of groups) {
		tasksByStatus.set(
			group.key,
			group.tasks.filter(task => task.type !== 'project'),
		);
	}

	return statuses.map((status) => ({
		id: status,
		label: labelForGroup(status),
		accent: statusColors[status],
		tasks: tasksByStatus.get(status) ?? [],
	}));
}

export function buildListSections(groups: TaskGroup[], statuses: string[]): ListSection[] {
	const statusTasks = new Map<string, Task[]>();
	const projectTasks: Task[] = [];

	for (const group of groups) {
		const existing = statusTasks.get(group.key) ?? [];
		const sectionTasks: Task[] = [];

		for (const task of group.tasks) {
			if (task.type === 'project') {
				projectTasks.push(task);
			} else {
				sectionTasks.push(task);
			}
		}

		if (sectionTasks.length > 0) {
			statusTasks.set(group.key, [...existing, ...sectionTasks]);
		}
	}

	const sections: ListSection[] = [];
	for (const status of statuses) {
		const tasks = statusTasks.get(status);
		if (tasks && tasks.length > 0) {
			sections.push({ key: status, label: labelForGroup(status), tasks });
			statusTasks.delete(status);
		}
	}

	for (const [key, tasks] of statusTasks.entries()) {
		sections.push({ key, label: labelForGroup(key), tasks });
	}

	if (projectTasks.length > 0) {
		sections.push({ key: 'project', label: 'Projects', tasks: projectTasks });
	}

	return sections;
}

export function buildListRows(tasks: Task[], collapsedPaths: Set<string>): ListRow[] {
	const flattened = flattenWithDepth(tasks);
	const parentPaths = getParentPaths(flattened);
	const visible = buildVisibleItems(flattened, collapsedPaths);

	return visible.map(({ task, depth }) => ({
		task,
		depth,
		expandable: parentPaths.has(task.path),
		expanded: !collapsedPaths.has(task.path),
	}));
}

function labelForGroup(group: string): string {
	if (group === 'Hold') return 'On Hold';
	return group;
}