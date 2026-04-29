import { describe, expect, it } from 'vitest';
import type { Task } from '../types';
import type { TaskGroup } from '../query/types';
import {
	buildKanbanColumns,
	buildListRows,
	buildListSections,
	flattenTaskGroups,
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

describe('buildKanbanColumns', () => {
	it('returns one column per configured status in configured order', () => {
		const groups = [
			makeGroup('Blocked', [makeTask({ path: 'Tasks/b.md', status: 'Blocked' })]),
			makeGroup('Active', [makeTask({ path: 'Tasks/a.md', status: 'Active' })]),
		];

		const columns = buildKanbanColumns(groups, ['Active', 'Blocked', 'Done'], { Blocked: '#f00' });

		expect(columns.map(column => column.id)).toEqual(['Active', 'Blocked', 'Done']);
		expect(columns[0].tasks.map(task => task.path)).toEqual(['Tasks/a.md']);
		expect(columns[1].tasks.map(task => task.path)).toEqual(['Tasks/b.md']);
		expect(columns[2].tasks).toEqual([]);
		expect(columns[1].accent).toBe('#f00');
	});

	it('filters projects out of kanban columns', () => {
		const groups = [
			makeGroup('Active', [
				makeTask({ path: 'Tasks/task.md', type: 'task', status: 'Active' }),
				makeTask({ path: 'Tasks/project.md', type: 'project', status: 'Active' }),
			]),
		];

		const columns = buildKanbanColumns(groups, ['Active'], {});

		expect(columns[0].tasks.map(task => task.path)).toEqual(['Tasks/task.md']);
	});
});

describe('buildListSections', () => {
	it('orders sections by configured statuses and appends projects', () => {
		const groups = [
			makeGroup('Blocked', [makeTask({ path: 'Tasks/blocked.md', status: 'Blocked' })]),
			makeGroup('Active', [
				makeTask({ path: 'Tasks/active.md', status: 'Active' }),
				makeTask({ path: 'Tasks/project.md', type: 'project', status: 'Active' }),
			]),
		];

		const sections = buildListSections(groups, ['Active', 'Blocked', 'Done']);

		expect(sections.map(section => section.key)).toEqual(['Active', 'Blocked', 'project']);
		expect(sections.map(section => section.label)).toEqual(['Active', 'Blocked', 'Projects']);
		expect(sections[0].tasks.map(task => task.path)).toEqual(['Tasks/active.md']);
		expect(sections[2].tasks.map(task => task.path)).toEqual(['Tasks/project.md']);
	});

	it('renames Hold to On Hold and preserves unknown statuses after configured ones', () => {
		const groups = [
			makeGroup('Custom', [makeTask({ path: 'Tasks/custom.md', status: 'Custom' })]),
			makeGroup('Hold', [makeTask({ path: 'Tasks/hold.md', status: 'Hold' })]),
		];

		const sections = buildListSections(groups, ['Hold']);

		expect(sections.map(section => section.label)).toEqual(['On Hold', 'Custom']);
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