/**
 * Pure helpers for the status_changed field.
 * No Obsidian API dependencies — fully unit-testable.
 */

/**
 * Determines whether a `status_changed` timestamp should be written.
 *
 * Returns `today` when the status is genuinely changing (new value differs
 * from the current value stored in frontmatter). Returns `undefined` when
 * the status is not part of the update, or when it has not changed — in
 * which case the caller should leave `status_changed` untouched.
 */
export function computeStatusChanged(
	currentStatus: string | undefined,
	nextStatus: string | undefined,
	today: string,
): string | undefined {
	if (nextStatus === undefined) return undefined;       // status not being updated
	if (nextStatus === currentStatus) return undefined;   // status unchanged
	return today;                                         // status is changing
}

/**
 * Picks the best available date for the stale-in-progress reminder rule.
 *
 * Prefers `status_changed` (set whenever the status field is written) because
 * it accurately reflects when the task entered the current status. Falls back
 * to `start_date` for tasks created before the `status_changed` field existed,
 * and returns null if neither is available (the rule is silently skipped).
 */
export function resolveStaleDate(
	statusChanged: string | null | undefined,
	startDate: string | null | undefined,
): string | null {
	if (statusChanged != null) return statusChanged;
	if (startDate != null) return startDate;
	return null;
}
