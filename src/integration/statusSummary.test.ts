import { describe, expect, it } from 'vitest';
import type { Task } from '../types';
import { buildStatusSummary } from './statusSummary';

function task(overrides: Partial<Task>): Task {
	return {
		id: 'abc123',
		slug: 'task',
		path: 'Tasks/task.md',
		type: 'task',
		name: 'Task',
		category: null,
		status: 'Active',
		priority: 'None',
		task_type: null,
		parent_task: null,
		depends_on: [],
		blocks: [],
		blocked_reason: '',
		assigned_to: '',
		source: '',
		start_date: null,
		due_date: null,
		estimated_days: null,
		created: '2026-04-16',
		completed: null,
		recurrence: null,
		recurrence_type: null,
		notes: '',
		is_complete: false,
		is_inbox: false,
		...overrides,
	};
}

describe('buildStatusSummary', () => {
	it('counts overdue and blocked tasks', () => {
		const summary = buildStatusSummary([
			task({ due_date: '2026-04-10', status: 'Active' }),
			task({ due_date: '2026-04-20', status: 'Blocked' }),
			task({ status: 'Blocked', is_complete: true }),
		], { today: '2026-04-16', blockStatus: 'Blocked' });

		expect(summary.overdue).toBe(1);
		expect(summary.blocked).toBe(1);
		expect(summary.label).toContain('1 overdue');
		expect(summary.label).toContain('1 blocked');
	});

	it('returns zero state when nothing actionable exists', () => {
		const summary = buildStatusSummary([
			task({ due_date: '2026-04-20', status: 'Active' }),
			task({ status: 'Done', is_complete: true }),
		], { today: '2026-04-16', blockStatus: 'Blocked' });

		expect(summary.overdue).toBe(0);
		expect(summary.blocked).toBe(0);
		expect(summary.label).toBe('TTasks: all clear');
	});
});
