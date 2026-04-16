import { describe, expect, it } from 'vitest';
import { computeStatusChanged } from './statusChanged';

// ── computeStatusChanged ────────────────────────────────────────────────────
// Returns today when status is changing, undefined when it isn't.

describe('computeStatusChanged', () => {
	const TODAY = '2026-04-16';

	describe('when status is not part of the update', () => {
		it('returns undefined (do not touch the field)', () => {
			expect(computeStatusChanged('Active', undefined, TODAY)).toBeUndefined();
		});
	});

	describe('when status is unchanged', () => {
		it('returns undefined for identical status strings', () => {
			expect(computeStatusChanged('Active', 'Active', TODAY)).toBeUndefined();
		});

		it('returns undefined when current and next are both undefined', () => {
			expect(computeStatusChanged(undefined, undefined, TODAY)).toBeUndefined();
		});
	});

	describe('when status is actually changing', () => {
		it('returns today when status moves from one value to another', () => {
			expect(computeStatusChanged('Active', 'Done', TODAY)).toBe(TODAY);
		});

		it('returns today when a task is given a status for the first time (current undefined)', () => {
			expect(computeStatusChanged(undefined, 'Active', TODAY)).toBe(TODAY);
		});

		it('returns today when status changes to Inbox', () => {
			expect(computeStatusChanged('Done', 'Inbox', TODAY)).toBe(TODAY);
		});

		it('returns today for any non-empty date string', () => {
			expect(computeStatusChanged('Blocked', 'In Progress', '2025-01-01')).toBe('2025-01-01');
		});
	});

	describe('edge cases', () => {
		it('treats empty string current status as different from a named status', () => {
			expect(computeStatusChanged('', 'Active', TODAY)).toBe(TODAY);
		});

		it('returns undefined when both current and next are the same empty string', () => {
			expect(computeStatusChanged('', '', TODAY)).toBeUndefined();
		});
	});
});

// ── stale-in-progress reminder source precedence ─────────────────────────────
// Pure helper: picks the best date for stale-in-progress checking.

import { resolveStaleDate } from './statusChanged';

describe('resolveStaleDate', () => {
	it('prefers status_changed over start_date', () => {
		expect(resolveStaleDate('2026-04-01', '2026-03-01')).toBe('2026-04-01');
	});

	it('falls back to start_date when status_changed is null', () => {
		expect(resolveStaleDate(null, '2026-03-01')).toBe('2026-03-01');
	});

	it('falls back to start_date when status_changed is undefined', () => {
		expect(resolveStaleDate(undefined, '2026-03-01')).toBe('2026-03-01');
	});

	it('returns null when both are null', () => {
		expect(resolveStaleDate(null, null)).toBeNull();
	});

	it('returns null when both are undefined', () => {
		expect(resolveStaleDate(undefined, undefined)).toBeNull();
	});

	it('returns status_changed even when start_date is present (status_changed wins)', () => {
		expect(resolveStaleDate('2026-04-10', '2026-04-01')).toBe('2026-04-10');
	});
});
