import type { FilterCondition, GroupSpec, SortSpec, TaskGroup } from '../query/types';
import { buildVisibleItems, flattenWithDepth, getParentPaths } from '../store/taskHierarchy';
import type { Task } from '../types';

export type BoardViewMode = 'list' | 'kanban' | 'agenda' | 'graph';

export interface BoardQueryConfig {
	group: GroupSpec;
	sort: SortSpec;
	baseFilterConditions: FilterCondition[];
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

export type ListHierarchyMode = 'flat' | 'tree';

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

export function buildListRows(
	tasks: Task[],
	collapsedPaths: Set<string>,
	hierarchy: ListHierarchyMode = 'tree',
): ListRow[] {
	if (hierarchy === 'flat') {
		return tasks.map((task) => ({
			task,
			depth: 0,
			expandable: false,
			expanded: true,
		}));
	}

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

export function labelForGroup(group: string): string {
	if (group === 'Hold') return 'On Hold';
	return group;
}