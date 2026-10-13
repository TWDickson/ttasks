import { describe, expect, it } from 'vitest';
import { nextOccurrence } from './next';
import type { RepeatCalendar, RepeatRule } from './types';

/** Walk `n` occurrences from `anchor`, the way successive completions would. */
function series(rule: RepeatRule, anchor: string, n: number, calendar?: RepeatCalendar): string[] {
	const out: string[] = [];
	let after = anchor;
	// The anchor itself is occurrence 0 unless the rule's own pattern skips it.
	for (let i = 0; i < n; i++) {
		const next = nextOccurrence(rule, anchor, after, calendar);
		if (next === null) break;
		out.push(next);
		after = next;
	}
	return out;
}

/** Weekends and a fixed holiday list are non-working. */
const calendar = (holidays: string[] = []): RepeatCalendar => ({
	isWorkingDay: (date) => {
		const day = new Date(`${date}T12:00:00Z`).getUTCDay();
		return day !== 0 && day !== 6 && !holidays.includes(date);
	},
});

describe('nextOccurrence — day / week', () => {
	it('every N days', () => {
		expect(series({ every: 3, unit: 'day' }, '2026-01-30', 3)).toEqual(['2026-02-02', '2026-02-05', '2026-02-08']);
	});

	it('every N weeks keeps the anchor weekday', () => {
		// 2026-01-05 is a Monday.
		expect(series({ every: 2, unit: 'week' }, '2026-01-05', 3)).toEqual(['2026-01-19', '2026-02-02', '2026-02-16']);
	});

	it('weekly on a set of weekdays', () => {
		expect(series({ every: 1, unit: 'week', weekdays: ['mon', 'wed'] }, '2026-01-05', 5))
			.toEqual(['2026-01-07', '2026-01-12', '2026-01-14', '2026-01-19', '2026-01-21']);
	});

	it('every 2 weeks on Mon/Wed skips the off-weeks', () => {
		expect(series({ every: 2, unit: 'week', weekdays: ['mon', 'wed'] }, '2026-01-05', 5))
			.toEqual(['2026-01-07', '2026-01-19', '2026-01-21', '2026-02-02', '2026-02-04']);
	});

	it('an anchor mid-week does not emit days before the anchor', () => {
		// Anchor Wednesday 2026-01-07; Monday of that week is before it.
		expect(series({ every: 1, unit: 'week', weekdays: ['mon', 'fri'] }, '2026-01-07', 3))
			.toEqual(['2026-01-09', '2026-01-12', '2026-01-16']);
	});

	it('returns the anchor when `after` precedes it', () => {
		expect(nextOccurrence({ every: 1, unit: 'day' }, '2026-03-01', '2026-02-01')).toBe('2026-03-01');
	});
});

describe('nextOccurrence — month', () => {
	it('day 31 re-derives each month instead of drifting (RP-1)', () => {
		expect(series({ every: 1, unit: 'month', monthday: 31 }, '2026-01-31', 5))
			.toEqual(['2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31', '2026-06-30']);
	});

	it('defaults to the anchor day', () => {
		expect(series({ every: 1, unit: 'month' }, '2026-01-31', 3)).toEqual(['2026-02-28', '2026-03-31', '2026-04-30']);
	});

	it('every 3 months', () => {
		expect(series({ every: 3, unit: 'month' }, '2026-01-15', 3)).toEqual(['2026-04-15', '2026-07-15', '2026-10-15']);
	});

	it('the last day of the month', () => {
		expect(series({ every: 1, unit: 'month', monthday: 'last' }, '2026-01-31', 3)).toEqual(['2026-02-28', '2026-03-31', '2026-04-30']);
	});

	it('leap February', () => {
		expect(series({ every: 1, unit: 'month', monthday: 'last' }, '2028-01-31', 1)).toEqual(['2028-02-29']);
	});

	it('first Monday of the month', () => {
		expect(series({ every: 1, unit: 'month', nth: { n: 1, target: 'mon' } }, '2026-01-05', 3))
			.toEqual(['2026-02-02', '2026-03-02', '2026-04-06']);
	});

	it('last Friday of the month', () => {
		expect(series({ every: 1, unit: 'month', nth: { n: -1, target: 'fri' } }, '2026-01-30', 3))
			.toEqual(['2026-02-27', '2026-03-27', '2026-04-24']);
	});

	it('a nonexistent nth skips the month rather than clamping', () => {
		// Tuesdays in 2026: Mar has 5 (3,10,17,24,31); Feb and Apr have 4 (Apr: 7,14,21,28).
		expect(series({ every: 1, unit: 'month', nth: { n: 5, target: 'tue' } }, '2026-03-31', 2))
			.toEqual(['2026-06-30', '2026-09-29']);
	});

	it('"last weekend" means the last weekend day', () => {
		expect(series({ every: 1, unit: 'month', nth: { n: -1, target: 'weekend-day' } }, '2026-01-31', 2))
			.toEqual(['2026-02-28', '2026-03-29']);
	});

	it('the first and last weekday', () => {
		expect(series({ every: 1, unit: 'month', nth: { n: 1, target: 'weekday' } }, '2026-01-01', 2)).toEqual(['2026-02-02', '2026-03-02']);
		expect(series({ every: 1, unit: 'month', nth: { n: -1, target: 'weekday' } }, '2026-01-30', 2)).toEqual(['2026-02-27', '2026-03-31']);
	});
});

describe('nextOccurrence — working-day targets and roll', () => {
	it('first working day of the month skips a holiday', () => {
		// Jan 1 2027 is a holiday (Fri); Jan 2-3 is the weekend → first working day is Mon Jan 4.
		const rule: RepeatRule = { every: 1, unit: 'month', nth: { n: 1, target: 'working-day' } };
		expect(series(rule, '2026-11-02', 3, calendar(['2027-01-01'])))
			.toEqual(['2026-12-01', '2027-01-04', '2027-02-01']);
	});

	it('last working day of the month', () => {
		const rule: RepeatRule = { every: 1, unit: 'month', nth: { n: -1, target: 'working-day' } };
		expect(series(rule, '2026-01-30', 2, calendar())).toEqual(['2026-02-27', '2026-03-31']);
	});

	it('without a calendar, working-day falls back to Monday–Friday', () => {
		const rule: RepeatRule = { every: 1, unit: 'month', nth: { n: 1, target: 'working-day' } };
		expect(series(rule, '2026-01-02', 1)).toEqual(['2026-02-02']);
	});

	it('roll next moves a weekend date forward', () => {
		// 15th: Feb 15 2026 is a Sunday → Mon Feb 16.
		expect(series({ every: 1, unit: 'month', monthday: 15, roll: 'next' }, '2026-01-15', 2, calendar()))
			.toEqual(['2026-02-16', '2026-03-16']);
	});

	it('roll previous moves it back, and never returns a date not after `after`', () => {
		const rule: RepeatRule = { every: 1, unit: 'month', monthday: 15, roll: 'previous' };
		expect(series(rule, '2026-01-15', 2, calendar())).toEqual(['2026-02-13', '2026-03-13']);
		// Feb 15 rolls back to Feb 13, which is not after Feb 14 — so the next hit is March.
		expect(nextOccurrence(rule, '2026-01-15', '2026-02-14', calendar())).toBe('2026-03-13');
	});

	it('roll is a no-op without a calendar', () => {
		expect(series({ every: 1, unit: 'month', monthday: 15, roll: 'next' }, '2026-01-15', 1)).toEqual(['2026-02-15']);
	});
});

describe('nextOccurrence — year', () => {
	it('yearly keeps the anchor date', () => {
		expect(series({ every: 1, unit: 'year' }, '2026-03-14', 2)).toEqual(['2027-03-14', '2028-03-14']);
	});

	it('Feb 29 clamps to Feb 28 in non-leap years and comes back', () => {
		// Anchor-based: the clamp is per-year, so the leap day returns in 2028.
		const expected = ['2025-02-28', '2026-02-28', '2027-02-28', '2028-02-29'];
		expect(series({ every: 1, unit: 'year' }, '2024-02-29', 4)).toEqual(expected);
		expect(series({ every: 1, unit: 'year', monthday: 29 }, '2024-02-29', 4)).toEqual(expected);
	});

	it('an explicit month and day', () => {
		expect(series({ every: 1, unit: 'year', month: 12, monthday: 'last' }, '2026-12-31', 2)).toEqual(['2027-12-31', '2028-12-31']);
	});

	it('every 2 years', () => {
		expect(series({ every: 2, unit: 'year' }, '2026-06-01', 2)).toEqual(['2028-06-01', '2030-06-01']);
	});
});

describe('nextOccurrence — end conditions', () => {
	it('until is inclusive', () => {
		const rule: RepeatRule = { every: 1, unit: 'day', until: '2026-01-03' };
		expect(series(rule, '2026-01-01', 10)).toEqual(['2026-01-02', '2026-01-03']);
	});

	it('count of zero means the series is over', () => {
		expect(nextOccurrence({ every: 1, unit: 'day', count: 0 }, '2026-01-01', '2026-01-01')).toBeNull();
		expect(nextOccurrence({ every: 1, unit: 'day', count: 1 }, '2026-01-01', '2026-01-01')).toBe('2026-01-02');
	});

	it('until before the anchor ends the series immediately', () => {
		expect(nextOccurrence({ every: 1, unit: 'week', until: '2025-12-31' }, '2026-01-01', '2026-01-01')).toBeNull();
	});
});

describe('nextOccurrence — completion basis is the same maths from a new anchor', () => {
	it('every 2 weeks after completion', () => {
		const rule: RepeatRule = { every: 2, unit: 'week', basis: 'completion' };
		// The caller pins the anchor (and `after`) to the completion date.
		expect(nextOccurrence(rule, '2026-03-04', '2026-03-04')).toBe('2026-03-18');
	});
});

describe('repeatCalendarFromHolidays', () => {
	it('treats weekends, dated and yearly holidays as non-working', async () => {
		const { repeatCalendarFromHolidays } = await import('./types');
		const cal = repeatCalendarFromHolidays(['2027-01-04'], ['12-25']);
		expect(cal.isWorkingDay('2027-01-05')).toBe(true);  // Tue
		expect(cal.isWorkingDay('2027-01-02')).toBe(false); // Sat
		expect(cal.isWorkingDay('2027-01-04')).toBe(false); // dated holiday
		expect(cal.isWorkingDay('2026-12-25')).toBe(false); // yearly holiday
		expect(cal.isWorkingDay('2027-12-24')).toBe(true);
	});
});
