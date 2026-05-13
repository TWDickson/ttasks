import { describe, expect, it } from 'vitest';
import type { Task } from '../types';
import type { TaskGroup } from '../query/types';
import {
	buildListRows,
	flattenTaskGroups,
	labelForGroup,
	resolveBoardQuery,
} from './viewAdapters';

function makeTask(overrides: Partial<Task> = {}): Task {
	return {
		id: 'abc123',
		slug: 'task',
		path: 'Tasks/abc123-task.md',
		type: 'task',
		name: 'Default task',
		area: 'engineering',
		status: 'Active',
		priority: 'None',
		labels: [],
		parent_task: null,
		depends_on: [],
		blocks: [],
		blocked_reason: '',
		assigned_to: '',
		source: '',
		start_date: null,
		due_date: null,
		due_time: null,
		estimated_days: null,
		created: '2026-04-01',
		completed: null,
		recurrence: null,
		recurrence_type: null,
		notes: '',
		is_complete: false,
		is_inbox: false,
		status_changed: null,
		...overrides,
	};
}

function makeGroup(key: string, tasks: Task[]): TaskGroup {
	return { key, tasks };
}

describe('resolveBoardQuery', () => {
	it('groups list and kanban views by status', () => {
		expect(resolveBoardQuery('list')).toEqual({ group: { kind: 'field', field: 'status' }, sort: [], baseFilterConditions: [] });
		expect(resolveBoardQuery('kanban')).toEqual({ group: { kind: 'field', field: 'status' }, sort: [], baseFilterConditions: [] });
	});

	it('uses agenda date buckets plus built-in task filters for agenda view', () => {
		expect(resolveBoardQuery('agenda')).toEqual({
			group: { kind: 'date_buckets', field: 'due_date', preset: 'agenda' },
			sort: [
				{ field: 'due_date', direction: 'asc' },
				{ field: 'priority', direction: 'asc' },
			],
			baseFilterConditions: [
				{ field: 'type', operator: 'is', value: 'task' },
				{ field: 'is_complete', operator: 'is', value: false },
			],
		});
		expect(resolveBoardQuery('graph')).toEqual({ group: { kind: 'none' }, sort: [], baseFilterConditions: [] });
	});
});

describe('buildListRows', () => {
	it('returns hierarchical visible rows with expand metadata', () => {
		const parent = makeTask({ path: 'Tasks/parent.md', name: 'Parent' });
		const child = makeTask({ path: 'Tasks/child.md', name: 'Child', parent_task: 'Tasks/parent' });

		const rows = buildListRows([parent, child], new Set());

		expect(rows).toHaveLength(2);
		expect(rows[0]).toMatchObject({ task: parent, depth: 0, expandable: true, expanded: true });
		expect(rows[1]).toMatchObject({ task: child, depth: 1, expandable: false, expanded: true });
	});

	it('hides collapsed descendants and marks the parent collapsed', () => {
		const parent = makeTask({ path: 'Tasks/parent.md', name: 'Parent' });
		const child = makeTask({ path: 'Tasks/child.md', name: 'Child', parent_task: 'Tasks/parent' });

		const rows = buildListRows([parent, child], new Set([parent.path]));

		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({ task: parent, depth: 0, expandable: true, expanded: false });
	});

	it('returns flat rows when hierarchy presentation is disabled', () => {
		const parent = makeTask({ path: 'Tasks/parent.md', name: 'Parent' });
		const child = makeTask({ path: 'Tasks/child.md', name: 'Child', parent_task: 'Tasks/parent' });

		const rows = buildListRows([parent, child], new Set([parent.path]), 'flat');

		expect(rows).toHaveLength(2);
		expect(rows[0]).toMatchObject({ task: parent, depth: 0, expandable: false, expanded: true });
		expect(rows[1]).toMatchObject({ task: child, depth: 0, expandable: false, expanded: true });
	});
});

describe('flattenTaskGroups', () => {
	it('flattens grouped query output in group order', () => {
		const groups = [
			makeGroup('first', [makeTask({ path: 'Tasks/a.md', name: 'A' })]),
			makeGroup('second', [makeTask({ path: 'Tasks/b.md', name: 'B' }), makeTask({ path: 'Tasks/c.md', name: 'C' })]),
		];

		expect(flattenTaskGroups(groups).map((task) => task.path)).toEqual([
			'Tasks/a.md',
			'Tasks/b.md',
			'Tasks/c.md',
		]);
	});
});

describe('labelForGroup', () => {
	it('renames Hold to On Hold', () => {
		expect(labelForGroup('Hold')).toBe('On Hold');
	});

	it('returns other values unchanged', () => {
		expect(labelForGroup('Active')).toBe('Active');
		expect(labelForGroup('Blocked')).toBe('Blocked');
		expect(labelForGroup('Custom Status')).toBe('Custom Status');
	});
});
