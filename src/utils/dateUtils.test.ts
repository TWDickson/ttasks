import { describe, expect, it } from 'vitest';
import { localDateString, daysBetweenLocal, addDaysLocal, toCalendarDate } from './dateUtils';

// ── localDateString ───────────────────────────────────────────────────────────
//
// Contract: return YYYY-MM-DD from the *local* calendar date of the given Date
// object.  Must NOT use toISOString() / UTC components because those can roll
// over to the next day for users in UTC-offset zones near midnight.

describe('localDateString', () => {
	it('formats a normal date correctly', () => {
		expect(localDateString(new Date(2026, 3, 16))).toBe('2026-04-16');
	});

	it('pads single-digit month and day', () => {
		expect(localDateString(new Date(2026, 0, 5))).toBe('2026-01-05');
	});

	it('uses LOCAL date components (getFullYear/getMonth/getDate), not UTC', () => {
		// Construct a date at 23:30 local time on April 16.
		// If the system is UTC+X the UTC date may already be April 17, but the
		// local date is still April 16.  localDateString must return Apr 16.
		const d = new Date(2026, 3, 16, 23, 30, 0); // local-time constructor
		expect(localDateString(d)).toBe('2026-04-16');
	});

	it('uses local midnight of Jan 1 (different from UTC for positive-offset zones)', () => {
		const d = new Date(2026, 0, 1, 0, 0, 0);
		expect(localDateString(d)).toBe('2026-01-01');
	});

	it('defaults to current date when no argument supplied', () => {
		// Can only assert it returns a YYYY-MM-DD string — not the exact value.
		const result = localDateString();
		expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
	});
});

// ── daysBetweenLocal ─────────────────────────────────────────────────────────
//
// Contract: given two YYYY-MM-DD strings, return the exact integer number of
// calendar days between them.  Must be immune to DST transitions:
//   • Spring-forward day (23 h) must still count as 1
//   • Fall-back day     (25 h) must still count as 1
//
// Implementation note: parse the strings as UTC components (not local-midnight)
// so millisecond arithmetic is always a multiple of 86 400 000.

describe('daysBetweenLocal', () => {
	it('counts simple calendar days', () => {
		expect(daysBetweenLocal('2026-04-10', '2026-04-16')).toBe(6);
	});

	it('returns 0 for the same date', () => {
		expect(daysBetweenLocal('2026-04-16', '2026-04-16')).toBe(0);
	});

	it('returns negative when from > to', () => {
		expect(daysBetweenLocal('2026-04-20', '2026-04-16')).toBe(-4);
	});

	it('crosses a month boundary', () => {
		expect(daysBetweenLocal('2026-03-28', '2026-04-04')).toBe(7);
	});

	it('crosses a year boundary', () => {
		expect(daysBetweenLocal('2025-12-31', '2026-01-01')).toBe(1);
	});

	it('handles a leap year (Feb has 29 days)', () => {
		expect(daysBetweenLocal('2024-02-28', '2024-03-01')).toBe(2);
	});

	it('handles a non-leap year (Feb has 28 days)', () => {
		expect(daysBetweenLocal('2025-02-28', '2025-03-01')).toBe(1);
	});

	// DST boundary tests — the critical correctness contract.
	// These are written against US DST dates but the arithmetic must hold
	// on any machine regardless of its local timezone setting.

	it('returns exactly 1 across US spring-forward DST boundary (23-hour day)', () => {
		// 2026-03-08 (Sun 2am → 3am): the local day is only 23 hours long.
		// A naive ms/86400000 calculation gives ≈0.958 → Math.round → 1 (ok),
		// but parsing local-midnight T00:00:00 can put one side a real hour off.
		// Calendar-parse → UTC arithmetic always gives exactly 86 400 000 ms.
		expect(daysBetweenLocal('2026-03-08', '2026-03-09')).toBe(1);
	});

	it('returns exactly 1 across US fall-back DST boundary (25-hour day)', () => {
		// 2026-11-01 (Sun 2am → 1am): the local day is 25 hours long.
		// Naive ms/86400000 gives ≈1.042 → Math.round → 1 (ok here),
		// but local-midnight parsing is subject to the ambiguous hour.
		expect(daysBetweenLocal('2026-11-01', '2026-11-02')).toBe(1);
	});

	it('counts 7 days cleanly across the spring-forward week', () => {
		expect(daysBetweenLocal('2026-03-07', '2026-03-14')).toBe(7);
	});

	it('counts 7 days cleanly across the fall-back week', () => {
		expect(daysBetweenLocal('2026-10-31', '2026-11-07')).toBe(7);
	});

	it('stale reminder: 7-day threshold fires correctly across spring-forward', () => {
		// Task start_date = 2026-03-02, today = 2026-03-09 (post-DST).
		// Should be 7 days — threshold must not be off by 1.
		expect(daysBetweenLocal('2026-03-02', '2026-03-09')).toBe(7);
	});
});

// ── addDaysLocal ─────────────────────────────────────────────────────────────
//
// Contract: add N calendar days to a YYYY-MM-DD string and return a new
// YYYY-MM-DD string.  Used by the defer quick action.  N can be negative.

describe('addDaysLocal', () => {
	it('adds 1 day (defer by 1)', () => {
		expect(addDaysLocal('2026-04-15', 1)).toBe('2026-04-16');
	});

	it('adds multiple days', () => {
		expect(addDaysLocal('2026-04-15', 7)).toBe('2026-04-22');
	});

	it('crosses a month boundary', () => {
		expect(addDaysLocal('2026-04-29', 3)).toBe('2026-05-02');
	});

	it('crosses a year boundary', () => {
		expect(addDaysLocal('2026-12-31', 1)).toBe('2027-01-01');
	});

	it('subtracts days with negative N', () => {
		expect(addDaysLocal('2026-04-16', -3)).toBe('2026-04-13');
	});

	it('stays stable across spring-forward DST boundary', () => {
		expect(addDaysLocal('2026-03-08', 1)).toBe('2026-03-09');
	});

	it('stays stable across fall-back DST boundary', () => {
		expect(addDaysLocal('2026-11-01', 1)).toBe('2026-11-02');
	});
});

// ── toCalendarDate ───────────────────────────────────────────────────────────
//
// Contract: coerce whatever a frontmatter date field decodes to (a plain
// YYYY-MM-DD string, an ISO datetime string, a Date object, or junk) into a
// canonical YYYY-MM-DD calendar-date string, or null.
//
// This is the guard against the "unquoted YAML date" regression: an unquoted
// `due_date: 2026-07-20` is a YAML *timestamp*, so the parser hands back UTC
// midnight as a Date / ISO datetime instead of the bare string, and the naive
// day arithmetic then renders a task due *today* as "Tomorrow". The recovered
// day must be the UTC date portion (the day the user typed), never a
// local-timezone conversion of it.

describe('toCalendarDate', () => {
	it('passes a canonical YYYY-MM-DD string straight through', () => {
		expect(toCalendarDate('2026-07-20')).toBe('2026-07-20');
	});

	it('extracts the date portion of an ISO datetime string (UTC Z)', () => {
		// This is exactly what Obsidian re-serializes an unquoted date to after a
		// processFrontMatter mutation, read back through a YAML timestamp parse.
		expect(toCalendarDate('2026-07-20T00:00:00.000Z')).toBe('2026-07-20');
	});

	it('keeps the literal written day for an ISO string with a timezone offset', () => {
		// The date portion is the day the user wrote — do NOT shift it by the offset.
		expect(toCalendarDate('2026-07-20T00:00:00.000-04:00')).toBe('2026-07-20');
	});

	it('recovers YYYY-MM-DD from a Date object at UTC midnight', () => {
		// A bare YAML date decodes to a JS Date at UTC midnight.
		expect(toCalendarDate(new Date('2026-07-20T00:00:00.000Z'))).toBe('2026-07-20');
	});

	it('uses the UTC date portion of a Date, not a local-shifted one', () => {
		// Same instant regardless of the machine timezone: UTC midnight on Jul 20.
		// A local-components conversion would return Jul 19 in any UTC-negative zone.
		expect(toCalendarDate(new Date(Date.UTC(2026, 6, 20, 0, 0, 0)))).toBe('2026-07-20');
	});

	it('returns null for null / undefined / empty string', () => {
		expect(toCalendarDate(null)).toBeNull();
		expect(toCalendarDate(undefined)).toBeNull();
		expect(toCalendarDate('')).toBeNull();
	});

	it('returns null for a non-date string', () => {
		expect(toCalendarDate('not a date')).toBeNull();
		expect(toCalendarDate('07/20/2026')).toBeNull();
	});

	it('returns null for an invalid Date', () => {
		expect(toCalendarDate(new Date('nonsense'))).toBeNull();
	});

	it('returns null for non-string, non-Date values', () => {
		expect(toCalendarDate(42)).toBeNull();
		expect(toCalendarDate(true)).toBeNull();
		expect(toCalendarDate({})).toBeNull();
	});
});
