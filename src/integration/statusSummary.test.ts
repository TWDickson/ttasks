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
		created: '2026-04-16',
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

const OPTS = { today: '2026-04-16', blockStatus: 'Blocked', inProgressStatus: 'In Progress' };

describe('buildStatusSummary', () => {
	it('counts overdue and blocked tasks', () => {
		const summary = buildStatusSummary([
			task({ due_date: '2026-04-10', status: 'Active' }),
			task({ due_date: '2026-04-20', status: 'Blocked' }),
			task({ status: 'Blocked', is_complete: true }),
		], OPTS);

		expect(summary.overdue).toBe(1);
		expect(summary.blocked).toBe(1);
		expect(summary.label).toContain('1 overdue');
		expect(summary.label).toContain('1 blocked');
	});

	it('returns zero state when nothing actionable exists', () => {
		const summary = buildStatusSummary([
			task({ due_date: '2026-04-20', status: 'Active' }),
			task({ status: 'Done', is_complete: true }),
		], OPTS);

		expect(summary.overdue).toBe(0);
		expect(summary.blocked).toBe(0);
		expect(summary.label).toBe('TTasks: all clear');
	});

	it('counts due-today and in-progress tasks and excludes completed', () => {
		const summary = buildStatusSummary([
			task({ due_date: '2026-04-16', status: 'Active' }),
			task({ due_date: '2026-04-16', status: 'In Progress' }),
			task({ status: 'In Progress' }),
			task({ due_date: '2026-04-16', status: 'In Progress', is_complete: true }),
		], OPTS);

		expect(summary.dueToday).toBe(2);
		expect(summary.inProgress).toBe(2);
		expect(summary.overdue).toBe(0);
		expect(summary.blocked).toBe(0);
		// Due-today and in-progress are not "urgent" — label stays all-clear.
		expect(summary.label).toBe('TTasks: all clear');
	});

	it('builds a four-line tooltip breakdown', () => {
		const summary = buildStatusSummary([
			task({ due_date: '2026-04-16', status: 'Active' }),
			task({ due_date: '2026-04-10', status: 'Active' }),
			task({ status: 'In Progress' }),
			task({ status: 'Blocked' }),
		], OPTS);

		expect(summary.tooltip).toBe('Due today: 1\nOverdue: 1\nIn progress: 1\nBlocked: 1');
	});
});
