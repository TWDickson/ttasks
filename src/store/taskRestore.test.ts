import { describe, expect, it } from 'vitest';
import { buildRestoreInput, resolveRestoreStatus } from './taskRestore';
import { resolveQuickAction } from '../integration/quickActions';
import type { Task } from '../types';

function makeTask(overrides: Partial<Task> = {}): Task {
	return {
		id: 'abc', slug: 'task', path: 'Tasks/abc-task.md',
		type: 'task', name: 'Test', area: null, status: 'Active',
		priority: 'None', labels: [], parent_task: null, depends_on: [],
		blocks: [], blocked_reason: '', assigned_to: '', source: '',
		start_date: null, due_date: null, due_time: null, estimated_days: null,
		created: '2026-01-01', completed: null, recurrence: null,
		recurrence_type: null, notes: '', is_complete: false, is_inbox: true,
		status_changed: null,
		...overrides,
	};
}

describe('resolveRestoreStatus', () => {
	it('defaults to Active for any completed task', () => {
		expect(resolveRestoreStatus({ status: 'Completed', completed: '2026-04-30', is_complete: true })).toBe('Active');
		expect(resolveRestoreStatus({ status: 'Completed', completed: null, is_complete: true })).toBe('Active');
	});

	it('defaults to Active regardless of what the prior status was', () => {
		expect(resolveRestoreStatus({ status: 'Done', completed: '2026-05-14', is_complete: true })).toBe('Active');
	});
});

describe('buildRestoreInput', () => {
	it('clears completion state and resets status', () => {
		const task = {
			status: 'Completed',
			completed: '2026-04-30',
			is_complete: true,
		};

		const restore = buildRestoreInput(task);

		expect(restore).toEqual({
			status: 'Active',
			is_complete: false,
			completed: null,
			blocked_reason: '',
		});
	});

	it('clears blocked_reason to avoid stale block message after reopening', () => {
		const task = { status: 'Done', completed: '2026-05-14', is_complete: true };
		const restore = buildRestoreInput(task);
		expect(restore.blocked_reason).toBe('');
	});
});

// ── B6: complete → uncomplete → complete cycle (pure layer) ─────────────────

describe('complete/uncomplete status cycle', () => {
	const ctx = {
		completionStatus: 'Done',
		startStatus: 'In Progress',
		blockStatus: 'Blocked',
		statuses: ['Active', 'In Progress', 'Blocked', 'Done'],
		deferDays: 3,
		today: '2026-05-14',
	};

	it('complete action sets status to completionStatus and stamps completed date', () => {
		const task = makeTask({ status: 'Active' });
		const result = resolveQuickAction('complete', task, ctx);
		expect(result.kind).toBe('updates');
		if (result.kind !== 'updates') return;
		expect(result.updates.status).toBe('Done');
		expect(result.updates.completed).toBe('2026-05-14');
	});

	it('restore produces Active status and clears completed date', () => {
		const completedTask = { status: 'Done', completed: '2026-05-14', is_complete: true };
		const restored = buildRestoreInput(completedTask);
		expect(restored.status).toBe('Active');
		expect(restored.completed).toBeNull();
		expect(restored.is_complete).toBe(false);
	});

	it('complete → restore → complete cycle works at pure function level', () => {
		const task = makeTask({ status: 'Active' });

		// Step 1: complete
		const step1 = resolveQuickAction('complete', task, ctx);
		expect(step1.kind).toBe('updates');

		// Step 2: restore (uncomplete)
		const completedState = { status: 'Done', completed: '2026-05-14', is_complete: true };
		const restored = buildRestoreInput(completedState);
		expect(restored.status).toBe('Active');

		// Step 3: complete again (task is back to Active)
		const activeTask = makeTask({ status: 'Active' });
		const step3 = resolveQuickAction('complete', activeTask, ctx);
		expect(step3.kind).toBe('updates');
		if (step3.kind !== 'updates') return;
		expect(step3.updates.status).toBe('Done');
	});

	it('completing a blocked task works (blocked → done is a valid transition)', () => {
		const blockedTask = makeTask({ status: 'Blocked' });
		const result = resolveQuickAction('complete', blockedTask, ctx);
		expect(result.kind).toBe('updates');
		if (result.kind !== 'updates') return;
		expect(result.updates.status).toBe('Done');
	});
});
