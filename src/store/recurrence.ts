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
 * Advance a YYYY-MM-DD date string by one recurrence interval.
 * Parses at T12:00:00 local time to avoid DST-induced day shifts.
 * Returns the original date unchanged for unknown rules.
 */
export function advanceDate(date: string, rule: string): string {
	const d = new Date(date + 'T12:00:00Z');
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
			const day = d.getUTCDate();
			d.setUTCDate(1);
			d.setUTCMonth(d.getUTCMonth() + 1);
			const daysInTargetMonth = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0, 12)).getUTCDate();
			d.setUTCDate(Math.min(day, daysInTargetMonth));
			break;
		}
		case 'yearly': {
			const month = d.getUTCMonth();
			const day = d.getUTCDate();
			d.setUTCDate(1);
			d.setUTCFullYear(d.getUTCFullYear() + 1);
			d.setUTCMonth(month);
			const daysInTargetMonth = new Date(Date.UTC(d.getUTCFullYear(), month + 1, 0, 12)).getUTCDate();
			d.setUTCDate(Math.min(day, daysInTargetMonth));
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
 *
 * Fixed:           advance from dueDate (falls back to completionDate if no dueDate)
 * From completion: advance from completionDate
 */
export function nextDueDate(
	rule: string,
	type: RecurrenceType | null | undefined,
	dueDate: string | null,
	completionDate: string,
): string {
	if (type === 'from_completion') {
		return advanceDate(completionDate, rule);
	}
	// fixed (default) — advance from the scheduled due date, not from today
	return advanceDate(dueDate ?? completionDate, rule);
}

/**
 * Calculate the start date for the next recurring instance, preserving the
 * offset between start and due dates from the original task.
 *
 * Returns null if the original task had no start date.
 */
export function nextStartDate(
	rule: string,
	type: RecurrenceType | null | undefined,
	startDate: string | null,
	dueDate: string | null,
	completionDate: string,
): string | null {
	if (!startDate) return null;

	if (type === 'from_completion') {
		return advanceDate(completionDate, rule);
	}

	// fixed — advance the start date by the same interval to preserve the gap
	return advanceDate(startDate, rule);
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
