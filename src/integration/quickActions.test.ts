import { describe, expect, it } from 'vitest';
import { resolveQuickAction, type QuickActionContext } from './quickActions';
import type { Task } from '../types';

function makeTask(overrides: Partial<Task> = {}): Task {
	return {
		id: 'abc',
		slug: 'test',
		path: 'Tasks/abc-test.md',
		type: 'task',
		name: 'Test Task',
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

const ctx: QuickActionContext = {
	completionStatus: 'Done',
	startStatus: 'In Progress',
	blockStatus: 'Blocked',
	statuses: ['Active', 'In Progress', 'Blocked', 'Done'],
	deferDays: 3,
	today: '2026-05-13',
};

describe('resolveQuickAction — complete', () => {
	it('returns complete update with todays date', () => {
		const result = resolveQuickAction('complete', makeTask(), ctx);
		expect(result.kind).toBe('updates');
		if (result.kind !== 'updates') return;
		expect(result.updates).toEqual({ status: 'Done', completed: '2026-05-13' });
		expect(result.noticeLabel).toContain('Completed');
	});

	it('errors when completionStatus is not in statuses', () => {
		const badCtx = { ...ctx, statuses: ['Active'], completionStatus: 'Done' };
		const result = resolveQuickAction('complete', makeTask(), badCtx);
		expect(result.kind).toBe('error');
		if (result.kind !== 'error') return;
		expect(result.reason).toContain('Done');
	});
});

describe('resolveQuickAction — start', () => {
	it('sets startStatus and records start_date', () => {
		const result = resolveQuickAction('start', makeTask(), ctx);
		expect(result.kind).toBe('updates');
		if (result.kind !== 'updates') return;
		expect(result.updates).toEqual({ status: 'In Progress', completed: null, start_date: '2026-05-13' });
		expect(result.noticeLabel).toContain('Started');
	});

	it('errors when startStatus is not in statuses', () => {
		const badCtx = { ...ctx, statuses: ['Active', 'Done'], startStatus: 'In Progress' };
		const result = resolveQuickAction('start', makeTask(), badCtx);
		expect(result.kind).toBe('error');
	});
});

describe('resolveQuickAction — block', () => {
	it('sets blockStatus and clears completed', () => {
		const result = resolveQuickAction('block', makeTask({ completed: '2026-01-01' }), ctx);
		expect(result.kind).toBe('updates');
		if (result.kind !== 'updates') return;
		expect(result.updates).toEqual({ status: 'Blocked', completed: null });
		expect(result.noticeLabel).toContain('Blocked');
	});
});

describe('resolveQuickAction — defer', () => {
	it('defers from task due_date by deferDays', () => {
		const result = resolveQuickAction('defer', makeTask({ due_date: '2026-05-20' }), ctx);
		expect(result.kind).toBe('updates');
		if (result.kind !== 'updates') return;
		expect(result.updates).toEqual({ due_date: '2026-05-23' });
		expect(result.noticeLabel).toContain('Deferred');
		expect(result.noticeLabel).toContain('2026-05-23');
	});

	it('defers from today when task has no due_date', () => {
		const result = resolveQuickAction('defer', makeTask({ due_date: null }), ctx);
		expect(result.kind).toBe('updates');
		if (result.kind !== 'updates') return;
		expect(result.updates).toEqual({ due_date: '2026-05-16' });
	});

	it('uses deferDays from context', () => {
		const result = resolveQuickAction('defer', makeTask({ due_date: '2026-05-13' }), { ...ctx, deferDays: 7 });
		expect(result.kind).toBe('updates');
		if (result.kind !== 'updates') return;
		expect(result.updates.due_date).toBe('2026-05-20');
	});
});
