/**
 * `nextOccurrence` — the repeat engine.
 *
 * Anchor-based, never last-occurrence-based: every occurrence is derived from the
 * series `anchor` and the rule, so a clamped date can't poison the next one
 * (monthly on day 31: Jan 31 → Feb 28 → **Mar 31** → Apr 30). That is RP-1's fix
 * by construction rather than by a persisted workaround.
 *
 * `anchor` is where the series is pinned: the original scheduled date for a
 * `schedule` basis, or the completion date for a `completion` basis. `after` is
 * the date to move past; the result is the first occurrence strictly after it.
 *
 * Settled edge semantics (pinned in `next.test.ts`):
 *  - "last weekend" means the last weekend *day* (Things / Apple semantics).
 *  - An nth that doesn't exist ("5th Tuesday" in a 4-Tuesday month) skips that
 *    month; clamping would reintroduce drift-shaped surprises.
 *  - A day-of-month beyond a short month clamps to its last day, and yearly
 *    Feb 29 clamps to Feb 28 in non-leap years.
 *  - Weeks for "every N weeks" are Monday-based and counted from the anchor's week.
 *
 * Pure module — no Obsidian imports.
 */
import type { NthTarget, RepeatCalendar, RepeatRule, Weekday } from './types';
import { WEEKDAYS } from './types';
import {
	addDays, daysInMonth, formatYmd, fromMonthNumber, mondayOf, monthNumber,
	parseYmd, toDayNumber, weekdayIndex,
} from './dates';

/** A safety net: no rule needs more than this many periods to find its next date. */
const MAX_PERIODS = 20_000;

function matchesTarget(date: string, target: NthTarget, calendar?: RepeatCalendar): boolean {
	const idx = weekdayIndex(date);
	switch (target) {
		case 'day': return true;
		case 'weekday': return idx <= 4;
		case 'weekend-day': return idx >= 5;
		case 'working-day': return calendar ? calendar.isWorkingDay(date) : idx <= 4;
		default: return WEEKDAYS[idx] === target;
	}
}

/** The nth matching day of the month, or null when the month has no such day. */
function nthOfMonth(
	y: number, m: number, n: number, target: NthTarget, calendar?: RepeatCalendar,
): string | null {
	const matches: string[] = [];
	for (let d = 1, last = daysInMonth(y, m); d <= last; d++) {
		const date = formatYmd({ y, m, d });
		if (matchesTarget(date, target, calendar)) matches.push(date);
	}
	return n === -1 ? (matches[matches.length - 1] ?? null) : (matches[n - 1] ?? null);
}

/** Unrolled occurrences in ascending order, starting at the anchor. */
function* occurrences(rule: RepeatRule, anchor: string, calendar?: RepeatCalendar): Generator<string> {
	const a = parseYmd(anchor);
	const every = rule.every;

	if (rule.unit === 'day') {
		for (let k = 0; k < MAX_PERIODS; k++) yield addDays(anchor, k * every);
		return;
	}

	if (rule.unit === 'week') {
		const days = rule.weekdays && rule.weekdays.length > 0
			? [...new Set(rule.weekdays)].map((w: Weekday) => WEEKDAYS.indexOf(w)).sort((x, y) => x - y)
			: null;
		if (!days) {
			for (let k = 0; k < MAX_PERIODS; k++) yield addDays(anchor, k * 7 * every);
			return;
		}
		const base = mondayOf(anchor);
		for (let w = 0; w < MAX_PERIODS; w++) {
			const weekStart = addDays(base, w * 7 * every);
			for (const offset of days) {
				const date = addDays(weekStart, offset);
				if (date >= anchor) yield date;
			}
		}
		return;
	}

	if (rule.unit === 'month') {
		const start = monthNumber(a.y, a.m);
		for (let k = 0; k < MAX_PERIODS; k++) {
			const { y, m } = fromMonthNumber(start + k * every);
			let date: string | null;
			if (rule.nth) {
				date = nthOfMonth(y, m, rule.nth.n, rule.nth.target, calendar);
			} else {
				const want = rule.monthday ?? a.d;
				const last = daysInMonth(y, m);
				date = formatYmd({ y, m, d: want === 'last' ? last : Math.min(want, last) });
			}
			if (date !== null && date >= anchor) yield date;
		}
		return;
	}

	// year
	const m = rule.month ?? a.m;
	const want = rule.monthday ?? a.d;
	for (let k = 0; k < MAX_PERIODS; k++) {
		const y = a.y + k * every;
		const last = daysInMonth(y, m);
		const date = formatYmd({ y, m, d: want === 'last' ? last : Math.min(want, last) });
		if (date >= anchor) yield date;
	}
}

/** Move a date off a non-working day, if the rule asks for it and a calendar is supplied. */
function rolled(date: string, rule: RepeatRule, calendar?: RepeatCalendar): string {
	if (!rule.roll || !calendar) return date;
	const step = rule.roll === 'next' ? 1 : -1;
	let current = date;
	for (let i = 0; i < 400 && !calendar.isWorkingDay(current); i++) current = addDays(current, step);
	return current;
}

/**
 * The first occurrence of `rule` strictly after `after`, or `null` when the series
 * has ended (`until` passed, or no `count` left). Without a `calendar`, working
 * days are plain Monday–Friday and `roll` is a no-op.
 */
export function nextOccurrence(
	rule: RepeatRule,
	anchor: string,
	after: string,
	calendar?: RepeatCalendar,
): string | null {
	if (rule.count !== undefined && rule.count <= 0) return null;

	const afterDay = toDayNumber(after);
	for (const raw of occurrences(rule, anchor, calendar)) {
		const date = rolled(raw, rule, calendar);
		if (toDayNumber(date) > afterDay) {
			return rule.until !== undefined && date > rule.until ? null : date;
		}
		// Past the end of the series before reaching `after` — nothing to find.
		if (rule.until !== undefined && raw > rule.until) return null;
	}
	return null;
}
