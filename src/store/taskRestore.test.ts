import { describe, expect, it } from 'vitest';
import { buildRestoreInput, resolveRestoreStatus } from './taskRestore';

describe('resolveRestoreStatus', () => {
	it('defaults to Active for any completed task', () => {
		expect(resolveRestoreStatus({ status: 'Completed', completed: '2026-04-30', is_complete: true })).toBe('Active');
		expect(resolveRestoreStatus({ status: 'Completed', completed: null, is_complete: true })).toBe('Active');
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
});
