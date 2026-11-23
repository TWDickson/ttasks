/**
 * Returns true when a status value should be treated as blocked.
 *
 * Supports configured block status values while preserving backward
 * compatibility with canonical "Blocked" tasks already in user data.
 */
export function isBlockedStatus(status: unknown, configuredBlockStatus?: string | null): boolean {
	if (typeof status !== 'string') return false;

	const normalizedStatus = status.trim().toLowerCase();
	if (!normalizedStatus) return false;

	const normalizedConfigured = (configuredBlockStatus ?? '').trim().toLowerCase();
	if (normalizedConfigured && normalizedStatus === normalizedConfigured) {
		return true;
	}

	return normalizedStatus === 'blocked';
}

/**
 * True when a status carries a reason (`blocked_reason`): the blocked status or
 * the hold status. Both are a task waiting on something — escalation for
 * Blocked, a deliberate pause for Hold — and "waiting on what?" applies to
 * either. The key keeps its `blocked_` name so stored notes and Share/Sync
 * don't change. `holdStatus` is `null` in a vault with no Hold.
 */
export function takesReason(
	status: unknown,
	configuredBlockStatus?: string | null,
	configuredHoldStatus?: string | null,
): boolean {
	if (isBlockedStatus(status, configuredBlockStatus)) return true;
	if (typeof status !== 'string') return false;
	const hold = (configuredHoldStatus ?? '').trim().toLowerCase();
	return !!hold && status.trim().toLowerCase() === hold;
}
