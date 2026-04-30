import { describe, expect, it } from 'vitest';
import type { Task } from '../types';
import { canShowInlineReopen } from './taskRowActions';

function makeTask(overrides: Partial<Task> = {}): Task {
	return {
		id: 'abc123',
		slug: 'task',
		path: 'Tasks/abc123-task.md',
		type: 'task',
		name: 'Default task',
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

describe('canShowInlineReopen', () => {
	it('returns true only for completed tasks in logbook view', () => {
		expect(canShowInlineReopen('logbook', makeTask({ is_complete: true, completed: '2026-04-30' }))).toBe(true);
	});

	it('returns false for completed tasks outside logbook view', () => {
		expect(canShowInlineReopen('list', makeTask({ is_complete: true, completed: '2026-04-30' }))).toBe(false);
		expect(canShowInlineReopen('kanban', makeTask({ is_complete: true, completed: '2026-04-30' }))).toBe(false);
	});

	it('returns false for active/incomplete tasks', () => {
		expect(canShowInlineReopen('logbook', makeTask({ is_complete: false, completed: null }))).toBe(false);
	});
});
