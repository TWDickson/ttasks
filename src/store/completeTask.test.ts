import { describe, expect, it } from 'vitest';
import type { Task } from '../types';
import { decideCompletion } from './completeTask';

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
		recurrence: null,
		recurrence_type: null,
		notes: '',
		is_complete: false,
		is_inbox: false,
		status_changed: null,
		...overrides,
	};
}

const DEPS = { completionStatus: 'Done', today: '2026-04-16' };

describe('decideCompletion', () => {
	it('completes a non-recurring task without recurrence', () => {
		const task = makeTask();
		const decision = decideCompletion(task, { ...DEPS, allTasks: [task] });
		expect(decision.kind).toBe('complete-only');
		expect(decision.updates).toEqual({ status: 'Done', completed: '2026-04-16' });
	});

	it('recurs a recurring task with no existing next instance', () => {
		const task = makeTask({ recurrence: 'weekly', recurrence_type: 'fixed', due_date: '2026-04-16' });
		const decision = decideCompletion(task, { ...DEPS, allTasks: [task] });
		expect(decision.kind).toBe('complete-and-recur');
		expect(decision.updates).toEqual({ status: 'Done', completed: '2026-04-16' });
	});

	it('always stamps the completion status and date in updates', () => {
		const task = makeTask({ recurrence: 'daily', due_date: '2026-04-16' });
		const decision = decideCompletion(task, { ...DEPS, allTasks: [task] });
		expect(decision.updates).toEqual({ status: 'Done', completed: '2026-04-16' });
	});

	describe('recurrence anchor (RP-1)', () => {
		it('uses a stored anchor so a month-end schedule recovers its day', () => {
			// Instance due Feb 28 was itself clamped from a 31st schedule; the next
			// one must go back to the 31st, not stay on the 28th.
			const task = makeTask({
				recurrence: 'monthly',
				recurrence_type: 'fixed',
				due_date: '2026-02-28',
				recurrence_anchor_day: 31,
			});
			const decision = decideCompletion(task, { ...DEPS, allTasks: [task] });
			expect(decision).toMatchObject({ kind: 'complete-and-recur', nextDue: '2026-03-31' });
		});

		it('falls back to the due date’s own day when no anchor is stored', () => {
			// Tasks created before the anchor field existed keep their old behaviour.
			const task = makeTask({
				recurrence: 'monthly',
				recurrence_type: 'fixed',
				due_date: '2026-02-28',
			});
			const decision = decideCompletion(task, { ...DEPS, allTasks: [task] });
			expect(decision).toMatchObject({ kind: 'complete-and-recur', nextDue: '2026-03-28' });
		});

		it('holds a month-end schedule across a simulated 4-month chain', () => {
			let due = '2026-01-31';
			const chain: string[] = [];
			for (let i = 0; i < 4; i++) {
				const task = makeTask({
					recurrence: 'monthly',
					recurrence_type: 'fixed',
					due_date: due,
					recurrence_anchor_day: 31,
				});
				const decision = decideCompletion(task, { ...DEPS, allTasks: [task] });
				if (decision.kind !== 'complete-and-recur') throw new Error('expected a spawn');
				due = decision.nextDue;
				chain.push(due);
			}
			expect(chain).toEqual(['2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31']);
		});

		it('ignores the anchor in from_completion mode', () => {
			const task = makeTask({
				recurrence: 'monthly',
				recurrence_type: 'from_completion',
				due_date: '2026-01-31',
				recurrence_anchor_day: 31,
			});
			const decision = decideCompletion(task, { ...DEPS, allTasks: [task] });
			// Advances from `today` (2026-04-16), not from the anchored due date.
			expect(decision).toMatchObject({ kind: 'complete-and-recur', nextDue: '2026-05-16' });
		});
	});

	describe('idempotence guard', () => {
		it('skips the spawn when an open next instance already exists (same name + rule, due >= next)', () => {
			const task = makeTask({ recurrence: 'weekly', recurrence_type: 'fixed', due_date: '2026-04-16' });
			// nextDue for a fixed weekly task due 2026-04-16 is 2026-04-23.
			const existing = makeTask({
				path: 'Tasks/def456-water-plants.md',
				recurrence: 'weekly',
				due_date: '2026-04-23',
			});
			const decision = decideCompletion(task, { ...DEPS, allTasks: [task, existing] });
			expect(decision.kind).toBe('complete-only');
		});

		it('still spawns when the existing candidate is completed', () => {
			const task = makeTask({ recurrence: 'weekly', recurrence_type: 'fixed', due_date: '2026-04-16' });
			const completed = makeTask({
				path: 'Tasks/def456-water-plants.md',
				recurrence: 'weekly',
				due_date: '2026-04-23',
				is_complete: true,
			});
			const decision = decideCompletion(task, { ...DEPS, allTasks: [task, completed] });
			expect(decision.kind).toBe('complete-and-recur');
		});

		it('still spawns when the existing candidate has a different name', () => {
			const task = makeTask({ recurrence: 'weekly', recurrence_type: 'fixed', due_date: '2026-04-16' });
			const other = makeTask({
				path: 'Tasks/def456-mow-lawn.md',
				name: 'Mow lawn',
				recurrence: 'weekly',
				due_date: '2026-04-23',
			});
			const decision = decideCompletion(task, { ...DEPS, allTasks: [task, other] });
			expect(decision.kind).toBe('complete-and-recur');
		});

		it('still spawns when the existing candidate is due before the next due date', () => {
			const task = makeTask({ recurrence: 'weekly', recurrence_type: 'fixed', due_date: '2026-04-16' });
			const stale = makeTask({
				path: 'Tasks/def456-water-plants.md',
				recurrence: 'weekly',
				due_date: '2026-04-16',
			});
			const decision = decideCompletion(task, { ...DEPS, allTasks: [task, stale] });
			expect(decision.kind).toBe('complete-and-recur');
		});

		it('does not treat the task itself as an existing instance', () => {
			const task = makeTask({ recurrence: 'weekly', recurrence_type: 'fixed', due_date: '2026-05-01' });
			// The task's own due_date is >= its next due date is false, but guard must
			// exclude self regardless — verify a lone recurring task always recurs.
			const decision = decideCompletion(task, { ...DEPS, allTasks: [task] });
			expect(decision.kind).toBe('complete-and-recur');
		});
	});
});
