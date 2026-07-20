/**
 * Date utilities for TTasks.
 *
 * All functions here operate on **local calendar dates** (YYYY-MM-DD strings).
 *
 * Design rationale (Option 3 — Hybrid model):
 *
 *   • Date-only fields (due_date, start_date, completed, "today") use the
 *     user's local calendar date.  This matches what Obsidian's calendar views
 *     show and what users mean when they write a date in a note.
 *
 *   • Arithmetic between two YYYY-MM-DD strings uses UTC component parsing
 *     so it is immune to DST transitions.  A spring-forward day (23 h) and a
 *     fall-back day (25 h) both count as exactly 1 calendar day.
 *
 *   • Time-of-day reminders (future Phase 3) should store an absolute instant
 *     plus an explicit timezone policy and NOT rely on these helpers.
 *
 * None of these functions call `toISOString()` or `toUTCString()` because
 * those methods return UTC-based representations that differ from local dates
 * for users in any non-UTC timezone near midnight.
 */

/**
 * Return the current (or given) local calendar date as a YYYY-MM-DD string.
 *
 * @param now — inject for testing; defaults to `new Date()`
 */
export function localDateString(now: Date = new Date()): string {
	const y = now.getFullYear();
	const m = String(now.getMonth() + 1).padStart(2, '0');
	const d = String(now.getDate()).padStart(2, '0');
	return `${y}-${m}-${d}`;
}

/**
 * Number of calendar days from `from` to `to` (both YYYY-MM-DD strings).
 *
 * The result is an exact integer regardless of DST transitions because the
 * date strings are parsed as UTC components rather than local midnight.  This
 * avoids the fractional-day problem that appears when local midnight falls in
 * an ambiguous DST hour.
 *
 * Positive  → `to` is after `from`
 * Zero      → same calendar date
 * Negative  → `to` is before `from`
 */
export function daysBetweenLocal(from: string, to: string): number {
	const parseUTC = (s: string): number => {
		const parts = s.split('-');
		return Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
	};
	return Math.round((parseUTC(to) - parseUTC(from)) / (24 * 60 * 60 * 1000));
}

/**
 * Add `days` calendar days to a YYYY-MM-DD string and return a new YYYY-MM-DD
 * string.  `days` can be negative.
 *
 * Uses local `Date` arithmetic (new Date(y, m, d + n)) so month/year rollover
 * is handled correctly by the JS calendar engine without DST interference.
 */
export function addDaysLocal(date: string, days: number): string {
	const parts = date.split('-');
	// Construct in local time — month/day overflow is resolved automatically
	const result = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]) + days);
	return localDateString(result);
}

/**
 * Coerce a frontmatter date value into a canonical YYYY-MM-DD **calendar date**
 * string, or null when it isn't a usable date.
 *
 * Why this exists: every date helper in the app assumes date-only fields are
 * plain "YYYY-MM-DD" strings and splits them on "-". But an unquoted YAML date
 * scalar (`due_date: 2026-07-20`) is a *timestamp* per the YAML spec, so the
 * parser (Obsidian's metadata cache / js-yaml) hands us either a `Date` object
 * or a full ISO datetime string at **UTC midnight** instead of the bare string.
 * Obsidian's `processFrontMatter` re-dumps frontmatter unquoted, so even values
 * we originally wrote as `'2026-07-20'` come back in this coerced form after any
 * later frontmatter mutation. Left unnormalized, the day-arithmetic misfires
 * (e.g. a task due today renders as "Tomorrow").
 *
 * The calendar date is recovered from the **UTC** date portion, never the local
 * one: a bare YAML date is UTC midnight, so its UTC Y-M-D equals the day the user
 * wrote — converting through local time would shift it a day for anyone in a
 * negative-offset timezone.
 */
export function toCalendarDate(value: unknown): string | null {
	if (value == null) return null;
	if (value instanceof Date) {
		return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10);
	}
	if (typeof value === 'string') {
		const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
		return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
	}
	return null;
}

/** Shared month abbreviations for human-readable date labels. */
export const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

// ── Date-object helpers ───────────────────────────────────────────────────────
//
// The helpers above operate on YYYY-MM-DD strings. The ones below operate on
// `Date` objects at local midnight, used by the graph/timeline layout code which
// needs to do pixel math over a continuous range of days. Prefer the string
// family for frontmatter values and "today"; use these only when you already
// hold `Date` objects (timeline ranges, tick generation).

export const DAY_MS = 24 * 60 * 60 * 1000;

/** Add `days` to a `Date`, returning a new `Date` (local calendar arithmetic). */
export function addDays(date: Date, days: number): Date {
	const next = new Date(date.getTime());
	next.setDate(next.getDate() + days);
	return next;
}

/** Whole calendar days from `start` to `end` (rounded; DST-tolerant via ms). */
export function diffDays(start: Date, end: Date): number {
	return Math.round((end.getTime() - start.getTime()) / DAY_MS);
}

/** Today at local midnight. */
export function startOfToday(): Date {
	const today = new Date();
	today.setHours(0, 0, 0, 0);
	return today;
}

/**
 * Format a `Date` as a local YYYY-MM-DD string. Uses local components, not
 * toISOString(), because these are local midnights and UTC conversion shifts
 * them to the previous day in UTC+ timezones.
 */
export function formatDateISO(date: Date): string {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	return `${year}-${month}-${day}`;
}

/** True for Saturday/Sunday. */
export function isWeekend(date: Date): boolean {
	const day = date.getDay();
	return day === 0 || day === 6;
}

/**
 * Parse a YYYY-MM-DD string into a local-midnight `Date`, or null when the
 * string is malformed or not a real calendar date. This is the single canonical
 * ISO-date parser — the string↔Date boundary for the whole app.
 */
export function parseIsoDate(value: string | null | undefined): Date | null {
	if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
	const parsed = new Date(`${value}T00:00:00`);
	if (Number.isNaN(parsed.getTime())) return null;
	parsed.setHours(0, 0, 0, 0);
	return parsed;
}
