/**
 * The repeat rule model (RP redesign). One `RepeatRule` is what a task's flat
 * `ttask_repeat_*` frontmatter keys normalize to — see `normalize.ts`. Everything
 * else in `src/repeat/` reads or produces this shape.
 *
 * Pure module — no Obsidian imports.
 */

export const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
export type Weekday = typeof WEEKDAYS[number];

export const REPEAT_UNITS = ['day', 'week', 'month', 'year'] as const;
export type RepeatUnit = typeof REPEAT_UNITS[number];

/** What "the Nth ___ of the month" counts. */
export type NthTarget = Weekday | 'day' | 'weekday' | 'weekend-day' | 'working-day';
export const NTH_CLASS_TARGETS = ['day', 'weekday', 'weekend-day', 'working-day'] as const;

export type NthIndex = 1 | 2 | 3 | 4 | 5 | -1;
export const NTH_INDEXES: readonly NthIndex[] = [1, 2, 3, 4, 5, -1];

export interface RepeatRule {
	/** ≥ 1 */
	every: number;
	unit: RepeatUnit;
	/** unit = week */
	weekdays?: Weekday[];
	/** unit = month | year; exclusive with `nth` */
	monthday?: number | 'last';
	/** unit = year, 1–12 */
	month?: number;
	/** unit = month */
	nth?: { n: NthIndex; target: NthTarget };
	/** Default `'schedule'`: advance from the scheduled date; `'completion'`: from when it was finished. */
	basis?: 'schedule' | 'completion';
	/** Working-day roll for a date that lands on a non-working day. Default: keep it. */
	roll?: 'next' | 'previous';
	/** Last allowed date, YYYY-MM-DD, inclusive. */
	until?: string;
	/** Occurrences remaining; the caller decrements on each spawn. */
	count?: number;
}

/** The slice of the working calendar the engine needs. */
export interface RepeatCalendar {
	isWorkingDay(date: string): boolean;
}

/**
 * A working calendar for repeat rules: weekends and the configured holidays are
 * non-working. (Repeat "working days" are the same for every task — the per-area
 * "skip weekends" toggle is about *scheduling* chains, not what a working day is.)
 */
export function repeatCalendarFromHolidays(holidays: readonly string[], recurringMonthDays: readonly string[]): RepeatCalendar {
	const dates = new Set(holidays);
	const yearly = new Set(recurringMonthDays);
	return {
		isWorkingDay(date: string): boolean {
			const [y, m, d] = date.split('-').map(Number);
			const dow = new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay();
			return dow !== 0 && dow !== 6 && !dates.has(date) && !yearly.has(date.slice(5));
		},
	};
}
