import { describe, expect, it } from 'vitest';
import {
	normalizeHolidayEntries,
	normalizeHolidayEntry,
	splitHolidayCalendar,
} from './holidays';

describe('normalizeHolidayEntry', () => {
	it('coerces a legacy bare date string', () => {
		expect(normalizeHolidayEntry('2026-12-25')).toEqual({ date: '2026-12-25', name: '', repeatYearly: false });
	});

	it('rejects invalid dates', () => {
		expect(normalizeHolidayEntry('2026/12/25')).toBeNull();
		expect(normalizeHolidayEntry({ date: 'nope' })).toBeNull();
		expect(normalizeHolidayEntry(null)).toBeNull();
	});

	it('trims names and coerces the repeat flag', () => {
		expect(normalizeHolidayEntry({ date: '2026-07-04', name: '  July 4  ', repeatYearly: true }))
			.toEqual({ date: '2026-07-04', name: 'July 4', repeatYearly: true });
		expect(normalizeHolidayEntry({ date: '2026-07-04' }))
			.toEqual({ date: '2026-07-04', name: '', repeatYearly: false });
	});
});

describe('normalizeHolidayEntries', () => {
	it('drops invalid entries and sorts recurring by MM-DD, one-off by full date', () => {
		expect(normalizeHolidayEntries([
			{ date: '2026-12-25', name: 'Christmas', repeatYearly: true },
			'garbage',
			{ date: '2026-01-15', name: 'One-off' },
		])).toEqual([
			{ date: '2026-12-25', name: 'Christmas', repeatYearly: true },
			{ date: '2026-01-15', name: 'One-off', repeatYearly: false },
		]);
	});

	it('returns empty for non-arrays', () => {
		expect(normalizeHolidayEntries(undefined)).toEqual([]);
	});
});

describe('splitHolidayCalendar', () => {
	it('separates one-off dates from recurring MM-DD', () => {
		expect(splitHolidayCalendar([
			{ date: '2026-07-04', name: '', repeatYearly: false },
			{ date: '2026-12-25', name: 'Christmas', repeatYearly: true },
		])).toEqual({ holidays: ['2026-07-04'], recurringHolidays: ['12-25'] });
	});

	it('tolerates loosely-typed/legacy input', () => {
		expect(splitHolidayCalendar(['2026-07-04'] as unknown as never))
			.toEqual({ holidays: ['2026-07-04'], recurringHolidays: [] });
		expect(splitHolidayCalendar(undefined as unknown as never))
			.toEqual({ holidays: [], recurringHolidays: [] });
	});
});
