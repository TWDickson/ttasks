import { describe, expect, it } from 'vitest';
import { resolveDetailHeaderActions } from './detailHeaderActions';

describe('resolveDetailHeaderActions', () => {
	it('hides the actions when no task is active', () => {
		expect(resolveDetailHeaderActions(null)).toEqual({
			hidden: true,
			completeIcon: 'check',
			completeLabel: 'Mark complete',
		});
	});

	it('offers mark-complete for an open task', () => {
		expect(resolveDetailHeaderActions({ is_complete: false })).toEqual({
			hidden: false,
			completeIcon: 'check',
			completeLabel: 'Mark complete',
		});
	});

	it('flips to reopen for a completed task', () => {
		expect(resolveDetailHeaderActions({ is_complete: true })).toEqual({
			hidden: false,
			completeIcon: 'undo-2',
			completeLabel: 'Reopen task',
		});
	});
});
