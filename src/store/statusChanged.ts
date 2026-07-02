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
 * Derives the `completed` date to write when a task's status transitions
 * into or out of the completion status.
 *
 * - Transition **into** completion → returns `today` (stamp completion date).
 * - Transition **out of** completion → returns `null` (clear stale date).
 * - Status not changing, not being updated, or moving between two non-completion
 *   statuses → returns `undefined` (leave `completed` untouched).
 *
 * Callers should only apply the result when the update does not explicitly set
 * `completed` — an explicit value always wins.
 */
export function computeCompletedOnStatusChange(
	previousStatus: string | undefined,
	nextStatus: string | undefined,
	completionStatus: string,
	today: string,
): string | null | undefined {
	if (nextStatus === undefined) return undefined;       // status not being updated
	if (nextStatus === previousStatus) return undefined;  // status unchanged
	if (nextStatus === completionStatus) return today;    // transitioned into completion
	if (previousStatus === completionStatus) return null; // transitioned out of completion
	return undefined;                                     // neither in nor out of completion
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
