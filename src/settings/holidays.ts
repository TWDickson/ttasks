import type { HolidayEntry } from './types';

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Coerce arbitrary stored/legacy data into a valid HolidayEntry, or null. */
export function normalizeHolidayEntry(raw: unknown): HolidayEntry | null {
	// Legacy shape: a bare "YYYY-MM-DD" string (pre name/repeat).
	if (typeof raw === 'string') {
		return ISO_DATE_RE.test(raw) ? { date: raw, name: '', repeatYearly: false } : null;
	}
	if (raw === null || typeof raw !== 'object') return null;

	const record = raw as Record<string, unknown>;
	const date = record.date;
	if (typeof date !== 'string' || !ISO_DATE_RE.test(date)) return null;

	return {
		date,
		name: typeof record.name === 'string' ? record.name.trim() : '',
		repeatYearly: record.repeatYearly === true,
	};
}

/** Normalize a list of entries, dropping invalid ones and sorting by MM-DD then year. */
export function normalizeHolidayEntries(raw: unknown): HolidayEntry[] {
	if (!Array.isArray(raw)) return [];
	const entries = raw
		.map(normalizeHolidayEntry)
		.filter((entry): entry is HolidayEntry => entry !== null);
	return sortHolidayEntries(entries);
}

/** Sort recurring holidays by MM-DD, one-off holidays by full date. */
export function sortHolidayEntries(entries: HolidayEntry[]): HolidayEntry[] {
	return [...entries].sort((a, b) => {
		const aKey = a.repeatYearly ? a.date.slice(5) : a.date;
		const bKey = b.repeatYearly ? b.date.slice(5) : b.date;
		return aKey.localeCompare(bKey);
	});
}

export interface HolidayCalendar {
	/** Exact one-off holiday dates (YYYY-MM-DD). */
	holidays: string[];
	/** Recurring holidays as MM-DD, matched against any year. */
	recurringHolidays: string[];
}

/**
 * Split holiday entries into the two primitive lists the calendar date math
 * consumes, keeping that pure module decoupled from the settings shape.
 */
export function splitHolidayCalendar(entries: HolidayEntry[]): HolidayCalendar {
	const holidays: string[] = [];
	const recurringHolidays: string[] = [];
	for (const raw of Array.isArray(entries) ? entries : []) {
		const entry = normalizeHolidayEntry(raw);
		if (entry === null) continue;
		if (entry.repeatYearly) recurringHolidays.push(entry.date.slice(5));
		else holidays.push(entry.date);
	}
	return { holidays, recurringHolidays };
}
