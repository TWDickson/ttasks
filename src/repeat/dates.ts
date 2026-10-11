/**
 * Calendar arithmetic for the repeat engine. Dates are plain YYYY-MM-DD strings
 * and every computation runs in UTC components (per `dateUtils.ts`' policy), so
 * a DST transition can never shift an occurrence by a day.
 */
import { WEEKDAYS, type Weekday } from './types';

export interface Ymd { y: number; m: number; d: number }

export function parseYmd(date: string): Ymd {
	const [y, m, d] = date.split('-').map(Number);
	return { y: y!, m: m!, d: d! };
}

export function formatYmd({ y, m, d }: Ymd): string {
	return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** 1-based month. */
export function daysInMonth(y: number, m: number): number {
	return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Days since the Unix epoch — a monotonic integer for date strings. */
export function toDayNumber(date: string): number {
	const { y, m, d } = parseYmd(date);
	return Math.round(Date.UTC(y, m - 1, d) / 86_400_000);
}

export function fromDayNumber(n: number): string {
	const dt = new Date(n * 86_400_000);
	return formatYmd({ y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() });
}

export function addDays(date: string, days: number): string {
	return fromDayNumber(toDayNumber(date) + days);
}

/** 0 = Monday … 6 = Sunday. */
export function weekdayIndex(date: string): number {
	const { y, m, d } = parseYmd(date);
	return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

export function weekdayOf(date: string): Weekday {
	return WEEKDAYS[weekdayIndex(date)]!;
}

/** The Monday on or before `date` (ISO weeks, independent of the week-start setting). */
export function mondayOf(date: string): string {
	return addDays(date, -weekdayIndex(date));
}

/** Months since year 0, so month arithmetic is plain integer maths. */
export function monthNumber(y: number, m: number): number {
	return y * 12 + (m - 1);
}

export function fromMonthNumber(n: number): { y: number; m: number } {
	return { y: Math.floor(n / 12), m: (n % 12) + 1 };
}
