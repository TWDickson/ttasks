import { describe, expect, it } from 'vitest';
import type { Task } from '../types';
import { buildTaskSchedule, resolveProjectedSchedule, resolveInferredDueDate } from './taskSchedule';
import type { ResolvedTaskDate } from './graph/taskGraphDates';

function makeTask(overrides: Partial<Task> & Pick<Task, 'path' | 'name'>): Task {
	return {
		id: overrides.path.slice(0, 6),
		slug: 'task',
		type: 'task',
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

function resolvedDate(start: string, end: string, isInferred: boolean): ResolvedTaskDate {
	return {
		start: new Date(`${start}T00:00:00`),
		end: new Date(`${end}T00:00:00`),
		isInferred,
	};
}

describe('buildTaskSchedule', () => {
	it('memoizes on the tasks array identity', () => {
		const tasks = [makeTask({ path: 'Tasks/a.md', name: 'A', due_date: '2026-04-05' })];
		const first = buildTaskSchedule(tasks);
		const second = buildTaskSchedule(tasks);
		expect(second).toBe(first);
	});

	it('recomputes for a new array identity', () => {
		const a = [makeTask({ path: 'Tasks/a.md', name: 'A', due_date: '2026-04-05' })];
		const b = [makeTask({ path: 'Tasks/a.md', name: 'A', due_date: '2026-04-05' })];
		expect(buildTaskSchedule(b)).not.toBe(buildTaskSchedule(a));
	});

	it('does not cache when allTasks options are passed', () => {
		const tasks = [makeTask({ path: 'Tasks/a.md', name: 'A', due_date: '2026-04-05' })];
		const withOptions = buildTaskSchedule(tasks, { allTasks: tasks });
		const cached = buildTaskSchedule(tasks);
		expect(withOptions).not.toBe(cached);
	});

	it('reuses the cache for the same calendar-config signature', () => {
		const tasks = [makeTask({ path: 'Tasks/a.md', name: 'A', due_date: '2026-04-05' })];
		const config = { holidays: ['2026-04-06'], areaWorkweek: { Work: true } };
		const first = buildTaskSchedule(tasks, { calendarConfig: config });
		const second = buildTaskSchedule(tasks, { calendarConfig: { holidays: ['2026-04-06'], areaWorkweek: { Work: true } } });
		expect(second).toBe(first);
	});

	it('invalidates the cache when the calendar config changes', () => {
		const tasks = [makeTask({ path: 'Tasks/a.md', name: 'A', due_date: '2026-04-05' })];
		const first = buildTaskSchedule(tasks, { calendarConfig: { holidays: [], areaWorkweek: {} } });
		const second = buildTaskSchedule(tasks, { calendarConfig: { holidays: ['2026-04-06'], areaWorkweek: {} } });
		expect(second).not.toBe(first);
	});

	it('propagates dates through a dependency chain', () => {
		const tasks = [
			makeTask({ path: 'Tasks/a.md', name: 'A', start_date: '2026-04-01', due_date: '2026-04-03' }),
			makeTask({ path: 'Tasks/b.md', name: 'B', depends_on: ['Tasks/a'], estimated_days: 2 }),
		];
		const schedule = buildTaskSchedule(tasks);
		expect(schedule.has('Tasks/b.md')).toBe(true);
		expect(schedule.get('Tasks/b.md')?.isInferred).toBe(true);
	});
});

describe('resolveProjectedSchedule', () => {
	it('returns null when there is no resolution', () => {
		expect(resolveProjectedSchedule({ due_date: null }, undefined)).toBeNull();
	});

	it('shows when the schedule is inferred', () => {
		const result = resolveProjectedSchedule({ due_date: null }, resolvedDate('2026-04-10', '2026-04-12', true));
		expect(result).toEqual({ start: '2026-04-10', end: '2026-04-12', isInferred: true });
	});

	it('shows when the resolved end differs from the explicit due date (e.g. estimate)', () => {
		const result = resolveProjectedSchedule({ due_date: '2026-04-10' }, resolvedDate('2026-04-08', '2026-04-12', false));
		expect(result).toMatchObject({ end: '2026-04-12', isInferred: false });
	});

	it('hides when explicit due date already matches the resolution', () => {
		expect(resolveProjectedSchedule({ due_date: '2026-04-12' }, resolvedDate('2026-04-10', '2026-04-12', false))).toBeNull();
	});
});

describe('resolveInferredDueDate', () => {
	it('returns the projected end for an incomplete, date-less task with a resolution', () => {
		expect(resolveInferredDueDate({ due_date: null, is_complete: false }, resolvedDate('2026-04-10', '2026-04-12', true))).toBe('2026-04-12');
	});

	it('returns null when the task has an explicit due date', () => {
		expect(resolveInferredDueDate({ due_date: '2026-04-10', is_complete: false }, resolvedDate('2026-04-10', '2026-04-12', true))).toBeNull();
	});

	it('returns null for a completed task', () => {
		expect(resolveInferredDueDate({ due_date: null, is_complete: true }, resolvedDate('2026-04-10', '2026-04-12', false))).toBeNull();
	});

	it('returns null when there is no resolution', () => {
		expect(resolveInferredDueDate({ due_date: null, is_complete: false }, undefined)).toBeNull();
	});
});
