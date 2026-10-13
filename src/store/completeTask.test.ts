import { describe, expect, it } from 'vitest';
import type { Task } from '../types';
import { decideCompletion, sameSeries } from './completeTask';
import type { RepeatRule } from '../repeat/types';

function makeTask(overrides: Partial<Task> = {}): Task {
	return {
		id: 'abc123',
		slug: 'task',
		path: 'Tasks/abc123-task.md',
		type: 'task',
		name: 'Water plants',
		area: 'home',
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
		repeat: null,
		notes: '',
		is_complete: false,
		is_inbox: false,
		status_changed: null,
		...overrides,
	};
}

const DEPS = { completionStatus: 'Done', today: '2026-04-16' };
const WEEKLY: RepeatRule = { every: 1, unit: 'week' };
const MONTHLY_31: RepeatRule = { every: 1, unit: 'month', monthday: 31 };

describe('decideCompletion', () => {
	it('completes a non-repeating task without spawning', () => {
		const task = makeTask();
		const decision = decideCompletion(task, { ...DEPS, allTasks: [task] });
		expect(decision.kind).toBe('complete-only');
		expect(decision.updates).toEqual({ status: 'Done', completed: '2026-04-16' });
	});

	it('spawns a repeating task with no existing next instance', () => {
		const task = makeTask({ repeat: WEEKLY, due_date: '2026-04-16' });
		const decision = decideCompletion(task, { ...DEPS, allTasks: [task] });
		expect(decision).toMatchObject({ kind: 'complete-and-recur', nextDue: '2026-04-23', nextRule: WEEKLY });
		expect(decision.updates).toEqual({ status: 'Done', completed: '2026-04-16' });
	});

	it('advances from today when there is no due date', () => {
		const task = makeTask({ repeat: { every: 1, unit: 'day' } });
		expect(decideCompletion(task, { ...DEPS, allTasks: [task] })).toMatchObject({ nextDue: '2026-04-17' });
	});

	describe('pinned day-of-month (RP-1)', () => {
		it('recovers the 31st after a clamped February', () => {
			const task = makeTask({ repeat: MONTHLY_31, due_date: '2026-02-28' });
			expect(decideCompletion(task, { ...DEPS, allTasks: [task] })).toMatchObject({ kind: 'complete-and-recur', nextDue: '2026-03-31' });
		});

		it('holds a month-end schedule across a simulated 4-month chain', () => {
			let due = '2026-01-31';
			let rule: RepeatRule = MONTHLY_31;
			const chain: string[] = [];
			for (let i = 0; i < 4; i++) {
				const task = makeTask({ repeat: rule, due_date: due });
				const decision = decideCompletion(task, { ...DEPS, allTasks: [task] });
				if (decision.kind !== 'complete-and-recur') throw new Error('expected a spawn');
				due = decision.nextDue;
				rule = decision.nextRule;
				chain.push(due);
			}
			expect(chain).toEqual(['2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31']);
		});

		it('a completion-based rule advances from today, not the due date', () => {
			const task = makeTask({ repeat: { every: 1, unit: 'month', basis: 'completion' }, due_date: '2026-01-31' });
			expect(decideCompletion(task, { ...DEPS, allTasks: [task] })).toMatchObject({ kind: 'complete-and-recur', nextDue: '2026-05-16' });
		});
	});

	describe('end conditions', () => {
		it('decrements count on the spawned rule, and stops at zero', () => {
			const task = makeTask({ repeat: { every: 1, unit: 'week', count: 2 }, due_date: '2026-04-16' });
			expect(decideCompletion(task, { ...DEPS, allTasks: [task] })).toMatchObject({ nextRule: { every: 1, unit: 'week', count: 1 } });
			const last = makeTask({ repeat: { every: 1, unit: 'week', count: 0 }, due_date: '2026-04-16' });
			expect(decideCompletion(last, { ...DEPS, allTasks: [last] }).kind).toBe('complete-only');
		});

		it('stops once the next date would pass `until`', () => {
			const task = makeTask({ repeat: { every: 1, unit: 'week', until: '2026-04-20' }, due_date: '2026-04-16' });
			expect(decideCompletion(task, { ...DEPS, allTasks: [task] }).kind).toBe('complete-only');
		});
	});

	describe('working-day rules use the supplied calendar', () => {
		it('first working day of the month skips a holiday', () => {
			const calendar = { isWorkingDay: (d: string) => d !== '2026-06-01' && ![0, 6].includes(new Date(`${d}T12:00:00Z`).getUTCDay()) };
			const task = makeTask({ repeat: { every: 1, unit: 'month', nth: { n: 1, target: 'working-day' } }, due_date: '2026-05-01' });
			expect(decideCompletion(task, { ...DEPS, allTasks: [task], calendar })).toMatchObject({ nextDue: '2026-06-02' });
		});
	});

	describe('idempotence guard', () => {
		const base = () => makeTask({ repeat: WEEKLY, due_date: '2026-04-16' });

		it('skips the spawn when an open next instance already exists (same name + series, due >= next)', () => {
			const existing = makeTask({ path: 'Tasks/def456-water-plants.md', repeat: WEEKLY, due_date: '2026-04-23' });
			expect(decideCompletion(base(), { ...DEPS, allTasks: [base(), existing] }).kind).toBe('complete-only');
		});

		it('treats a decremented count as the same series', () => {
			const task = makeTask({ repeat: { ...WEEKLY, count: 3 }, due_date: '2026-04-16' });
			const existing = makeTask({ path: 'Tasks/def456-water-plants.md', repeat: { ...WEEKLY, count: 2 }, due_date: '2026-04-23' });
			expect(decideCompletion(task, { ...DEPS, allTasks: [task, existing] }).kind).toBe('complete-only');
		});

		it('still spawns when the existing candidate is completed', () => {
			const completed = makeTask({ path: 'Tasks/def456-water-plants.md', repeat: WEEKLY, due_date: '2026-04-23', is_complete: true });
			expect(decideCompletion(base(), { ...DEPS, allTasks: [base(), completed] }).kind).toBe('complete-and-recur');
		});

		it('still spawns when the existing candidate has a different name or series', () => {
			const other = makeTask({ path: 'Tasks/def456-mow-lawn.md', name: 'Mow lawn', repeat: WEEKLY, due_date: '2026-04-23' });
			const otherRule = makeTask({ path: 'Tasks/def456-water-plants.md', repeat: { every: 1, unit: 'day' }, due_date: '2026-04-23' });
			expect(decideCompletion(base(), { ...DEPS, allTasks: [base(), other, otherRule] }).kind).toBe('complete-and-recur');
		});

		it('still spawns when the existing candidate is due before the next due date', () => {
			const stale = makeTask({ path: 'Tasks/def456-water-plants.md', repeat: WEEKLY, due_date: '2026-04-16' });
			expect(decideCompletion(base(), { ...DEPS, allTasks: [base(), stale] }).kind).toBe('complete-and-recur');
		});

		it('RP-3: a renamed open child still counts — matched by its repeat_of link', () => {
			const renamed = makeTask({
				path: 'Tasks/def456-water-the-ferns.md', name: 'Water the ferns', repeat: WEEKLY,
				due_date: '2026-04-23', repeat_of: 'Tasks/abc123-task.md',
			});
			expect(decideCompletion(base(), { ...DEPS, allTasks: [base(), renamed] }).kind).toBe('complete-only');
		});

		it('RP-3: matches the link with or without the .md extension', () => {
			const child = makeTask({ path: 'Tasks/def456-x.md', name: 'X', repeat: WEEKLY, due_date: '2026-04-23', repeat_of: 'Tasks/abc123-task' });
			expect(decideCompletion(base(), { ...DEPS, allTasks: [base(), child] }).kind).toBe('complete-only');
		});

		it('RP-3: a completed child does not block the next spawn', () => {
			const child = makeTask({ path: 'Tasks/def456-x.md', repeat: WEEKLY, due_date: '2026-04-23', repeat_of: 'Tasks/abc123-task.md', is_complete: true });
			expect(decideCompletion(base(), { ...DEPS, allTasks: [base(), child] }).kind).toBe('complete-and-recur');
		});

		it('does not treat the task itself as an existing instance', () => {
			const task = makeTask({ repeat: WEEKLY, due_date: '2026-05-01' });
			expect(decideCompletion(task, { ...DEPS, allTasks: [task] }).kind).toBe('complete-and-recur');
		});
	});
});

describe('sameSeries', () => {
	it('ignores count, compares everything else', () => {
		expect(sameSeries({ ...WEEKLY, count: 1 }, { ...WEEKLY, count: 5 })).toBe(true);
		expect(sameSeries(WEEKLY, { every: 2, unit: 'week' })).toBe(false);
		expect(sameSeries(null, WEEKLY)).toBe(false);
	});
});
