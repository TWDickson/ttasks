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
