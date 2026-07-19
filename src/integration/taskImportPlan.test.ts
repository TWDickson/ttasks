import { describe, expect, it } from 'vitest';
import type { Task } from '../types';
import type { ParsedImportTask } from './taskJsonImport';
import { changesToPatch, planImport, summarizeImportPlan } from './taskImportPlan';

function task(overrides: Partial<Task> = {}): Task {
	return {
		id: 'aaa111',
		slug: 't',
		path: 'Tasks/aaa111-t.md',
		name: 'Task',
		type: 'task',
		status: 'Active',
		priority: 'None',
		area: 'Work',
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
		workweek_only: false,
		holiday_dates: [],
		created: '2026-07-19',
		completed: null,
		status_changed: '2026-07-19',
		recurrence: null,
		recurrence_type: null,
		notes: '',
		reminder_override: null,
		is_complete: false,
		is_inbox: false,
		...overrides,
	};
}

function parsed(overrides: Partial<ParsedImportTask> = {}): ParsedImportTask {
	return {
		type: 'task',
		name: 'Task',
		area: null,
		status: null,
		priority: null,
		labels: [],
		parent: null,
		depends_on: [],
		blocked_reason: '',
		assigned_to: '',
		source: '',
		start_date: null,
		due_date: null,
		due_time: null,
		estimated_days: null,
		created: null,
		completed: null,
		recurrence: null,
		recurrence_type: null,
		pomodoro_count: null,
		focused_minutes: null,
		notes: '',
		...overrides,
	};
}

describe('planImport', () => {
	it('creates when no existing task matches by type+name', () => {
		const plan = planImport([parsed({ name: 'Brand new' })], [task({ name: 'Existing' })]);
		expect(plan.creates).toHaveLength(1);
		expect(plan.creates[0].parsed.name).toBe('Brand new');
		expect(plan.updates).toHaveLength(0);
	});

	it('matches case-insensitively and records only changed fields', () => {
		const existing = task({ name: 'Write Report', status: 'Active', priority: 'None' });
		const plan = planImport(
			[parsed({ name: 'write report', status: 'Done', priority: 'None' })],
			[existing],
		);
		expect(plan.creates).toHaveLength(0);
		expect(plan.updates).toHaveLength(1);
		expect(plan.updates[0].path).toBe(existing.path);
		expect(plan.updates[0].changes).toEqual([{ field: 'status', from: 'Active', to: 'Done' }]);
		expect(plan.fieldChangeCounts).toEqual({ status: 1 });
	});

	it('counts a matched-but-identical task as unchanged', () => {
		const existing = task({ name: 'A', status: 'Active' });
		const plan = planImport([parsed({ name: 'A', status: 'Active' })], [existing]);
		expect(plan.updates).toHaveLength(0);
		expect(plan.unchangedCount).toBe(1);
	});

	it('never clears a field from an omitted (null/empty) parsed value', () => {
		const existing = task({ area: 'Work', labels: ['feature'], due_date: '2026-08-01' });
		const plan = planImport([parsed({ area: null, labels: [], due_date: null })], [existing]);
		expect(plan.updates).toHaveLength(0);
		expect(plan.unchangedCount).toBe(1);
	});

	it('diffs labels as a set, ignoring order', () => {
		const existing = task({ labels: ['a', 'b'] });
		const same = planImport([parsed({ labels: ['b', 'a'] })], [existing]);
		expect(same.unchangedCount).toBe(1);
		const changed = planImport([parsed({ labels: ['a', 'c'] })], [existing]);
		expect(changed.updates[0].changes[0].field).toBe('labels');
	});

	it('skips ambiguous names that match multiple tasks', () => {
		const plan = planImport(
			[parsed({ name: 'Dup', status: 'Done' })],
			[task({ name: 'Dup', path: 'Tasks/1.md' }), task({ name: 'Dup', path: 'Tasks/2.md' })],
		);
		expect(plan.updates).toHaveLength(0);
		expect(plan.creates).toHaveLength(0);
		expect(plan.ambiguousNames).toEqual(['Dup']);
	});

	it('does not match a task to a project of the same name', () => {
		const plan = planImport(
			[parsed({ name: 'Website', type: 'project', status: 'Done' })],
			[task({ name: 'Website', type: 'task' })],
		);
		expect(plan.creates).toHaveLength(1);
	});
});

describe('changesToPatch', () => {
	it('collapses changes into a Partial<Task>', () => {
		expect(
			changesToPatch([
				{ field: 'status', from: 'Active', to: 'Done' },
				{ field: 'priority', from: 'None', to: 'High' },
			]),
		).toEqual({ status: 'Done', priority: 'High' });
	});
});

describe('summarizeImportPlan', () => {
	it('produces headline + field-breakdown lines', () => {
		const existing = task({ name: 'A', status: 'Active', due_date: null });
		const plan = planImport(
			[
				parsed({ name: 'A', status: 'Done', due_date: '2026-08-02' }),
				parsed({ name: 'New one' }),
			],
			[existing],
		);
		const lines = summarizeImportPlan(plan);
		expect(lines[0]).toBe('1 new task');
		expect(lines[1]).toBe('1 task updated');
		expect(lines.some((l) => l.includes('status: 1') && l.includes('due date: 1'))).toBe(true);
	});
});
