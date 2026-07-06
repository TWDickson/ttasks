import { describe, expect, it } from 'vitest';
import { addCalendarDays, type WorkingCalendar } from './taskGraphDates';
import { formatDateISO } from './graphTimeline';

function calendar(overrides: Partial<WorkingCalendar> = {}): WorkingCalendar {
	return {
		workweekOnly: false,
		holidayDates: new Set<string>(),
		recurringHolidays: new Set<string>(),
		...overrides,
	};
}

function iso(date: string): Date {
	return new Date(`${date}T00:00:00`);
}

describe('addCalendarDays with recurring holidays', () => {
	it('skips a recurring MM-DD holiday regardless of year', () => {
		const cal = calendar({ recurringHolidays: new Set(['12-25']) });
		// From 2026-12-24, one calendar day forward should skip 2026-12-25.
		expect(formatDateISO(addCalendarDays(iso('2026-12-24'), 1, cal))).toBe('2026-12-26');
		// And the same recurring rule applies in a different year.
		expect(formatDateISO(addCalendarDays(iso('2030-12-24'), 1, cal))).toBe('2030-12-26');
	});

	it('still skips a one-off holiday date', () => {
		const cal = calendar({ holidayDates: new Set(['2026-07-04']) });
		expect(formatDateISO(addCalendarDays(iso('2026-07-03'), 1, cal))).toBe('2026-07-05');
	});

	it('takes the fast path when nothing is skipped', () => {
		expect(formatDateISO(addCalendarDays(iso('2026-12-24'), 1, calendar()))).toBe('2026-12-25');
	});
});
