import { describe, expect, it } from 'vitest';
import type { Task } from '../types';
import { findLinkedTask, normalizeTaskPath, resolveLinkedTaskPath } from './taskDetailLinks';

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

describe('normalizeTaskPath', () => {
	it('trims and appends .md when absent', () => {
		expect(normalizeTaskPath('  Tasks/foo  ')).toBe('Tasks/foo.md');
	});

	it('returns null for empty-like values', () => {
		expect(normalizeTaskPath('')).toBeNull();
		expect(normalizeTaskPath('   ')).toBeNull();
		expect(normalizeTaskPath(null)).toBeNull();
		expect(normalizeTaskPath(undefined)).toBeNull();
	});
});

describe('findLinkedTask', () => {
	const project = makeTask({ id: 'p1', path: 'Planner/Tasks/p1-project.md', type: 'project' });
	const task = makeTask({ id: 't1', path: 'Planner/Tasks/t1-task.md', type: 'task' });
	const tasks = [project, task];

	it('matches exact full path first', () => {
		expect(findLinkedTask('Planner/Tasks/t1-task', tasks)?.id).toBe('t1');
	});

	it('falls back to filename-only matching', () => {
		expect(findLinkedTask('t1-task', tasks)?.id).toBe('t1');
	});
});

describe('resolveLinkedTaskPath', () => {
	const task = makeTask({ id: 't1', path: 'Planner/Tasks/t1-task.md', type: 'task' });
	const tasks = [task];

	it('returns full stored path when a task is found', () => {
		expect(resolveLinkedTaskPath('t1-task', tasks)).toBe('Planner/Tasks/t1-task.md');
	});

	it('returns normalized path when no task is found', () => {
		expect(resolveLinkedTaskPath('missing-task', tasks)).toBe('missing-task.md');
	});

	it('returns null for blank input', () => {
		expect(resolveLinkedTaskPath('  ', tasks)).toBeNull();
	});
});
