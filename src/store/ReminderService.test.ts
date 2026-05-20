import { describe, expect, it } from 'vitest';
import { isInQuietHoursWindow, buildReminderKey, pruneOldReminderKeys } from './ReminderService';

// ---------------------------------------------------------------------------
// isInQuietHoursWindow
// ---------------------------------------------------------------------------

describe('isInQuietHoursWindow', () => {
	describe('non-wrapping range (daytime, e.g. 9–17)', () => {
		const start = 9;
		const end = 17;

		it('returns false before the window', () => {
			expect(isInQuietHoursWindow(start, end, 8)).toBe(false);
		});

		it('returns true at the start boundary (inclusive)', () => {
			expect(isInQuietHoursWindow(start, end, 9)).toBe(true);
		});

		it('returns true inside the window', () => {
			expect(isInQuietHoursWindow(start, end, 12)).toBe(true);
		});

		it('returns false at the end boundary (exclusive)', () => {
			expect(isInQuietHoursWindow(start, end, 17)).toBe(false);
		});

		it('returns false after the window', () => {
			expect(isInQuietHoursWindow(start, end, 18)).toBe(false);
		});
	});

	describe('wrapping range (overnight, e.g. 22–8)', () => {
		const start = 22;
		const end = 8;

		it('returns true at start (22:00)', () => {
			expect(isInQuietHoursWindow(start, end, 22)).toBe(true);
		});

		it('returns true past midnight (e.g. 2:00)', () => {
			expect(isInQuietHoursWindow(start, end, 2)).toBe(true);
		});

		it('returns false at end boundary (8:00 is exclusive)', () => {
			expect(isInQuietHoursWindow(start, end, 8)).toBe(false);
		});

		it('returns false in the middle of the day (12:00)', () => {
			expect(isInQuietHoursWindow(start, end, 12)).toBe(false);
		});

		it('returns false just before start (21:00)', () => {
			expect(isInQuietHoursWindow(start, end, 21)).toBe(false);
		});
	});

	describe('edge cases', () => {
		it('returns false for equal start and end (zero-length window)', () => {
			expect(isInQuietHoursWindow(10, 10, 10)).toBe(false);
			expect(isInQuietHoursWindow(10, 10, 9)).toBe(false);
			expect(isInQuietHoursWindow(10, 10, 11)).toBe(false);
		});

		it('handles full-day window 0–23', () => {
			expect(isInQuietHoursWindow(0, 23, 0)).toBe(true);
			expect(isInQuietHoursWindow(0, 23, 22)).toBe(true);
			expect(isInQuietHoursWindow(0, 23, 23)).toBe(false);
		});
	});
});

// ---------------------------------------------------------------------------
// buildReminderKey
// ---------------------------------------------------------------------------

describe('buildReminderKey', () => {
	it('builds a pipe-delimited key', () => {
		expect(buildReminderKey('Planner/Tasks/abc-task.md', 'due-today', '2026-05-20'))
			.toBe('Planner/Tasks/abc-task.md|due-today|2026-05-20');
	});

	it('produces unique keys for different rules on the same task/date', () => {
		const a = buildReminderKey('Tasks/x.md', 'due-today', '2026-05-20');
		const b = buildReminderKey('Tasks/x.md', 'overdue',   '2026-05-20');
		expect(a).not.toBe(b);
	});

	it('produces unique keys for the same rule on different dates', () => {
		const a = buildReminderKey('Tasks/x.md', 'overdue', '2026-05-19');
		const b = buildReminderKey('Tasks/x.md', 'overdue', '2026-05-20');
		expect(a).not.toBe(b);
	});
});

// ---------------------------------------------------------------------------
// pruneOldReminderKeys
// ---------------------------------------------------------------------------

describe('pruneOldReminderKeys', () => {
	it('removes keys for dates strictly before today', () => {
		const keys = new Set([
			'Tasks/a.md|due-today|2026-05-18',
			'Tasks/b.md|overdue|2026-05-19',
			'Tasks/c.md|due-today|2026-05-20',
		]);
		const result = pruneOldReminderKeys(keys, '2026-05-20');
		expect([...result]).toEqual(['Tasks/c.md|due-today|2026-05-20']);
	});

	it('keeps keys for today', () => {
		const keys = new Set(['Tasks/a.md|due-today|2026-05-20']);
		const result = pruneOldReminderKeys(keys, '2026-05-20');
		expect(result.has('Tasks/a.md|due-today|2026-05-20')).toBe(true);
	});

	it('keeps keys for future dates', () => {
		const keys = new Set(['Tasks/a.md|lead-time|2026-05-25']);
		const result = pruneOldReminderKeys(keys, '2026-05-20');
		expect(result.has('Tasks/a.md|lead-time|2026-05-25')).toBe(true);
	});

	it('returns empty set when all keys are stale', () => {
		const keys = new Set([
			'Tasks/a.md|due-today|2026-05-01',
			'Tasks/b.md|overdue|2026-05-02',
		]);
		const result = pruneOldReminderKeys(keys, '2026-05-20');
		expect(result.size).toBe(0);
	});

	it('does not mutate the original set', () => {
		const keys = new Set(['Tasks/a.md|due-today|2026-05-18']);
		pruneOldReminderKeys(keys, '2026-05-20');
		expect(keys.size).toBe(1);
	});
});
