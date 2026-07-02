import type { TaskGroup } from '../query/types';
import { buildVisibleItems, flattenWithDepth, getParentPaths } from '../store/taskHierarchy';
import type { Task } from '../types';

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