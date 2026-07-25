/**
 * Recurrence rule helpers.
 *
 * Two recurrence modes (matching TickTick behaviour):
 *
 *   fixed          — next due = original due_date + interval
 *                    Maintains a fixed cadence regardless of when you complete.
 *                    Example: weekly standup notes always due Monday.
 *
 *   from_completion — next due = completion_date + interval
 *                    Restarts the clock from when you actually finished.
 *                    Example: "water the plants 2 weeks after last watered."
 *
 * Pure functions only — no Obsidian or plugin dependencies.
 */

// ── Rule (interval) ──────────────────────────────────────────────────────────

export const RECURRENCE_OPTIONS = ['daily', 'weekly', 'biweekly', 'monthly', 'yearly'] as const;
export type RecurrenceRule = typeof RECURRENCE_OPTIONS[number];

export const RECURRENCE_LABELS: Record<RecurrenceRule, string> = {
	daily:     'Daily',
	weekly:    'Weekly',
	biweekly:  'Every 2 weeks',
	monthly:   'Monthly',
	yearly:    'Yearly',
};

// ── Type (schedule mode) ─────────────────────────────────────────────────────

export const RECURRENCE_TYPES = ['fixed', 'from_completion'] as const;
export type RecurrenceType = typeof RECURRENCE_TYPES[number];

export const RECURRENCE_TYPE_LABELS: Record<RecurrenceType, string> = {
	fixed:           'Fixed schedule',
	from_completion: 'After completion',
};

// ── Date math ────────────────────────────────────────────────────────────────

/**
 * Days in the month containing `year` / `monthIndex` (0-based month).
 * Day 0 of the following month *is* the last day of this one.
 */
function daysInMonth(year: number, monthIndex: number): number {
	return new Date(Date.UTC(year, monthIndex + 1, 0, 12)).getUTCDate();
}

/**
 * A usable day-of-month anchor, or null when the caller supplied nothing usable.
 * Guards against junk from a hand-edited frontmatter value reaching the math.
 */
function normalizeAnchorDay(anchorDay: number | null | undefined): number | null {
	if (typeof anchorDay !== 'number' || !Number.isFinite(anchorDay)) return null;
	const day = Math.trunc(anchorDay);
	if (day < 1) return null;
	return Math.min(day, 31);
}

/**
 * Advance a YYYY-MM-DD date string by one recurrence interval.
 *
 * Parses at T12:00:00 **UTC** and uses UTC accessors throughout: the math is
 * pure calendar arithmetic in a DST-free frame, and midday keeps a ±14h zone
 * offset from ever crossing a date boundary. Returns the original date
 * unchanged for unknown rules.
 *
 * `anchorDay` — the day-of-month the schedule is really pinned to, used by
 * `monthly` / `yearly` only (the day-based rules just add days). Without it,
 * each occurrence is derived from the previous *already-clamped* one, so a
 * month-end schedule drifts permanently to the shortest month's day:
 * Jan 31 → Feb 28 → Mar 28 → Apr 28 … (RP-1 / DT-3 in `AUDIT_2026-07.md`).
 * Passing the rule's original day makes the clamp per-occurrence instead of
 * cumulative — anchor 31 gives Jan 31 → Feb 28 → Mar 31 → Apr 30 → May 31.
 * Defaults to the date's own day, which preserves the un-anchored behaviour
 * exactly.
 */
export function advanceDate(date: string, rule: string, anchorDay?: number | null): string {
	const d = new Date(date + 'T12:00:00Z');
	const anchor = normalizeAnchorDay(anchorDay);
	switch (rule) {
		case 'daily':
			d.setUTCDate(d.getUTCDate() + 1);
			break;
		case 'weekly':
			d.setUTCDate(d.getUTCDate() + 7);
			break;
		case 'biweekly':
			d.setUTCDate(d.getUTCDate() + 14);
			break;
		case 'monthly': {
			const day = anchor ?? d.getUTCDate();
			// Move to the 1st first: setUTCMonth on the 31st would overflow past
			// a short target month (Jan 31 + 1 month → Mar 3).
			d.setUTCDate(1);
			d.setUTCMonth(d.getUTCMonth() + 1);
			d.setUTCDate(Math.min(day, daysInMonth(d.getUTCFullYear(), d.getUTCMonth())));
			break;
		}
		case 'yearly': {
			const month = d.getUTCMonth();
			const day = anchor ?? d.getUTCDate();
			d.setUTCDate(1);
			d.setUTCFullYear(d.getUTCFullYear() + 1);
			d.setUTCMonth(month);
			d.setUTCDate(Math.min(day, daysInMonth(d.getUTCFullYear(), month)));
			break;
		}
	}
	const y = d.getUTCFullYear();
	const m = String(d.getUTCMonth() + 1).padStart(2, '0');
	const day = String(d.getUTCDate()).padStart(2, '0');
	return `${y}-${m}-${day}`;
}

/**
 * Calculate the due date for the next recurring instance.
 *
 * @param rule       - recurrence interval (e.g. 'weekly')
 * @param type       - 'fixed' | 'from_completion' (default: 'fixed')
 * @param dueDate    - current task's due_date (null if not set)
 * @param completionDate - the date the task was completed (today)
 * @param anchorDay  - day-of-month the schedule is pinned to (see `advanceDate`)
 *
 * Fixed:           advance from dueDate (falls back to completionDate if no dueDate)
 * From completion: advance from completionDate
 *
 * The anchor applies to **fixed** mode only: that's the mode where each
 * occurrence is computed from the previous one and so accumulates clamp drift.
 * `from_completion` restarts from a fresh completion date every time, so there
 * is no chain to drift.
 */
export function nextDueDate(
	rule: string,
	type: RecurrenceType | null | undefined,
	dueDate: string | null,
	completionDate: string,
	anchorDay?: number | null,
): string {
	if (type === 'from_completion') {
		return advanceDate(completionDate, rule);
	}
	// fixed (default) — advance from the scheduled due date, not from today
	return advanceDate(dueDate ?? completionDate, rule, anchorDay);
}

/**
 * Calculate the start date for the next recurring instance, preserving the
 * offset between start and due dates from the original task.
 *
 * Returns null if the original task had no start date.
 *
 * `anchorDay` is the *start* date's own anchor, not the due date's — the two can
 * sit on different days of the month, and the caller owns that distinction.
 */
export function nextStartDate(
	rule: string,
	type: RecurrenceType | null | undefined,
	startDate: string | null,
	dueDate: string | null,
	completionDate: string,
	anchorDay?: number | null,
): string | null {
	if (!startDate) return null;

	if (type === 'from_completion') {
		return advanceDate(completionDate, rule);
	}

	// fixed — advance the start date by the same interval to preserve the gap
	return advanceDate(startDate, rule, anchorDay);
}

/**
 * The anchor day a schedule should be pinned to, given the due date the user set.
 *
 * Called whenever `due_date` is written *without* an explicit anchor, so setting
 * or rescheduling a due date (re)defines the anchor, while a recurrence spawn —
 * which passes the inherited anchor explicitly — preserves it. Returns null for a
 * missing/malformed date, which leaves the schedule un-anchored (previous
 * behaviour) rather than guessing.
 *
 * Only the day-of-month matters: `monthly`/`yearly` are the only rules that clamp.
 */
export function deriveAnchorDay(dueDate: string | null | undefined): number | null {
	if (typeof dueDate !== 'string') return null;
	const match = /^\d{4}-\d{2}-(\d{2})$/.exec(dueDate);
	if (!match) return null;
	const day = Number(match[1]);
	return day >= 1 && day <= 31 ? day : null;
}

// ── Guards ───────────────────────────────────────────────────────────────────

/** True if the value is a known recurrence rule string. */
export function isValidRecurrenceRule(val: unknown): val is RecurrenceRule {
	return typeof val === 'string' && (RECURRENCE_OPTIONS as readonly string[]).includes(val);
}

/** True if the value is a known recurrence type string. */
export function isValidRecurrenceType(val: unknown): val is RecurrenceType {
	return typeof val === 'string' && (RECURRENCE_TYPES as readonly string[]).includes(val);
}
