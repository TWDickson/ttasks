import { describe, expect, it } from 'vitest';
import { sortDependencyFirst } from './dependencySort';
import type { Task } from '../types';

function makeTask(overrides: Partial<Task> = {}): Task {
	return {
		id: 'abc',
		slug: 'task',
		path: 'Tasks/abc-task.md',
		type: 'task',
		name: 'Task',
		area: null,
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
		created: '2026-01-01',
		completed: null,
		recurrence: null,
		recurrence_type: null,
		notes: '',
		is_complete: false,
		is_inbox: true,
		status_changed: null,
		...overrides,
	};
}

describe('sortDependencyFirst', () => {
	const parent = 'Tasks/project-parent';

	it('puts same-project task before non-project task', () => {
		const sameProject = makeTask({ name: 'Zebra', parent_task: parent });
		const otherProject = makeTask({ name: 'Alpha', parent_task: null });
		expect(sortDependencyFirst(sameProject, otherProject, parent)).toBeLessThan(0);
		expect(sortDependencyFirst(otherProject, sameProject, parent)).toBeGreaterThan(0);
	});

	it('sorts alphabetically within same-project group', () => {
		const a = makeTask({ name: 'Alpha', parent_task: parent });
		const b = makeTask({ name: 'Beta', parent_task: parent });
		expect(sortDependencyFirst(a, b, parent)).toBeLessThan(0);
		expect(sortDependencyFirst(b, a, parent)).toBeGreaterThan(0);
	});

	it('sorts alphabetically within non-project group', () => {
		const a = makeTask({ name: 'Alpha', parent_task: null });
		const b = makeTask({ name: 'Beta', parent_task: 'Tasks/other-project' });
		expect(sortDependencyFirst(a, b, parent)).toBeLessThan(0);
	});

	it('treats tasks with different parent as non-same-project', () => {
		const sameProject = makeTask({ name: 'A', parent_task: parent });
		const differentProject = makeTask({ name: 'Z', parent_task: 'Tasks/other' });
		expect(sortDependencyFirst(sameProject, differentProject, parent)).toBeLessThan(0);
	});

	it('falls back to alphabetical when currentParentTask is null', () => {
		const a = makeTask({ name: 'Alpha', parent_task: 'Tasks/some-project' });
		const b = makeTask({ name: 'Beta', parent_task: 'Tasks/some-project' });
		expect(sortDependencyFirst(a, b, null)).toBeLessThan(0);
		expect(sortDependencyFirst(b, a, null)).toBeGreaterThan(0);
	});

	it('returns 0 for equal names with same project membership', () => {
		const a = makeTask({ name: 'Same', parent_task: parent });
		const b = makeTask({ name: 'Same', parent_task: parent });
		expect(sortDependencyFirst(a, b, parent)).toBe(0);
	});
});
