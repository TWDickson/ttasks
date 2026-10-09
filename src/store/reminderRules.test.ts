import { describe, expect, it } from 'vitest';
import type { Task } from '../types';
import {
	checkDueTimePassed,
	checkDueToday,
	checkLeadTime,
	checkOverdue,
	checkStaleInProgress,
	evaluateReminders,
} from './reminderRules';

function makeTask(overrides: Partial<Task> = {}): Task {
	return {
		id: 'abc123',
		slug: 'task',
		path: 'Tasks/abc123-task.md',
		type: 'task',
		name: 'Default task',
		area: null,
		status: 'In Progress',
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
		created: '2026-05-20',
		completed: null,
		status_changed: null,
		recurrence: null,
		recurrence_type: null,
		notes: '',
		is_complete: false,
		is_inbox: true,
		...overrides,
	};
}

describe('reminder rules', () => {
	it('fires due-today when due date matches today', () => {
		const result = checkDueToday(makeTask({ due_date: '2026-05-25' }), '2026-05-25');
		expect(result?.ruleId).toBe('due-today');
	});

	it('does not fire due-today for tomorrow', () => {
		expect(checkDueToday(makeTask({ due_date: '2026-05-26' }), '2026-05-25')).toBeNull();
	});

	it('fires overdue for past due incomplete tasks', () => {
		expect(checkOverdue(makeTask({ due_date: '2026-05-20' }), '2026-05-25')?.ruleId).toBe('overdue');
	});

	it('does not fire overdue for completed tasks', () => {
		expect(checkOverdue(makeTask({ due_date: '2026-05-20', is_complete: true }), '2026-05-25')).toBeNull();
	});

	it('fires lead-time when within the lead window', () => {
		expect(checkLeadTime(makeTask({ due_date: '2026-05-29' }), '2026-05-25', 7)?.ruleId).toBe('lead-time');
	});

	it('does not fire lead-time when beyond the window', () => {
		expect(checkLeadTime(makeTask({ due_date: '2026-06-10' }), '2026-05-25', 7)).toBeNull();
	});

	it('does not fire lead-time when overdue', () => {
		expect(checkLeadTime(makeTask({ due_date: '2026-05-20' }), '2026-05-25', 7)).toBeNull();
	});

	it('fires stale when in progress long enough', () => {
		expect(checkStaleInProgress(makeTask({ status_changed: '2026-05-01' }), '2026-05-25', 14, 'In Progress')?.ruleId).toBe('stale');
	});

	it('does not fire stale when status changed recently', () => {
		expect(checkStaleInProgress(makeTask({ status_changed: '2026-05-20' }), '2026-05-25', 14, 'In Progress')).toBeNull();
	});

	it('does not fire stale when status is not the start status', () => {
		expect(checkStaleInProgress(makeTask({ status: 'Active', status_changed: '2026-05-01' }), '2026-05-25', 14, 'In Progress')).toBeNull();
	});

	it('skips stale gracefully without a date anchor', () => {
		expect(checkStaleInProgress(makeTask({ status_changed: null, start_date: null }), '2026-05-25', 14, 'In Progress')).toBeNull();
	});

	it('returns no reminders for a completed task', () => {
		expect(evaluateReminders(makeTask({ is_complete: true, due_date: '2026-05-25' }), '2026-05-25', 7, 14, 'In Progress', '12:00')).toEqual([]);
	});

	it('ignores mute flags in the pure helper', () => {
		expect(evaluateReminders(makeTask({ reminder_override: 'mute', due_date: '2026-05-25' }), '2026-05-25', 7, 14, 'In Progress', '12:00')).toHaveLength(1);
	});

	it('can return multiple reminders for the same task', () => {
		const reminders = evaluateReminders(
			makeTask({ due_date: '2026-05-29', status_changed: '2026-05-01' }),
			'2026-05-25',
			7,
			14,
			'In Progress',
			'12:00',
		);
		expect(reminders.map((reminder) => reminder.ruleId)).toEqual(['lead-time', 'stale']);
	});

	it('returns only due-today when due date is today', () => {
		const reminders = evaluateReminders(
			makeTask({ due_date: '2026-05-25', status_changed: '2026-05-01' }),
			'2026-05-25',
			7,
			14,
			'In Progress',
			'12:00',
		);
		expect(reminders.map((reminder) => reminder.ruleId)).toEqual(['due-today']);
	});

	it('does not fire due-today or overdue without a due date', () => {
		const reminders = evaluateReminders(makeTask({ due_date: null }), '2026-05-25', 7, 14, 'In Progress', '12:00');
		expect(reminders.every((reminder) => reminder.ruleId !== 'due-today' && reminder.ruleId !== 'overdue')).toBe(true);
	});

	describe('due-time-passed', () => {
		const timed = (overrides: Partial<Task> = {}) =>
			makeTask({ due_date: '2026-05-25', due_time: '09:00', ...overrides });

		it('fires once the due time has been reached', () => {
			expect(checkDueTimePassed(timed(), '2026-05-25', '09:00')?.ruleId).toBe('due-time-passed');
			expect(checkDueTimePassed(timed(), '2026-05-25', '14:30')?.message).toBe('Due now: Default task (was 09:00)');
		});

		it('waits until the due time', () => {
			expect(checkDueTimePassed(timed(), '2026-05-25', '08:59')).toBeNull();
		});

		it('needs a due time, today\'s date, and an open task', () => {
			expect(checkDueTimePassed(timed({ due_time: null }), '2026-05-25', '23:59')).toBeNull();
			expect(checkDueTimePassed(timed({ due_date: '2026-05-26' }), '2026-05-25', '23:59')).toBeNull();
			expect(checkDueTimePassed(timed({ due_date: '2026-05-24' }), '2026-05-25', '23:59')).toBeNull();
			expect(checkDueTimePassed(timed({ is_complete: true }), '2026-05-25', '23:59')).toBeNull();
		});

		it('evaluateReminders adds it alongside due-today, only when the time has come', () => {
			const ids = (now: string) =>
				evaluateReminders(timed(), '2026-05-25', 7, 14, 'In Progress', now).map((r) => r.ruleId);
			expect(ids('08:00')).toEqual(['due-today']);
			expect(ids('09:05')).toEqual(['due-today', 'due-time-passed']);
		});
	});
});
