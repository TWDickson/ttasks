/**
 * Pure utilities for reminder snooze state.
 * Storage key: 'ttasks-snoozed-v1' in localStorage (per-device, not synced).
 * State shape: Record<taskPath, isoTimestamp> — task is snoozed until that time.
 */

export type SnoozedState = Record<string, string>;

export function snoozeTask(
	current: SnoozedState,
	path: string,
	hours: number,
	now: Date,
): SnoozedState {
	const until = new Date(now.getTime() + hours * 3_600_000).toISOString();
	return { ...current, [path]: until };
}

export function unsnoozeTask(current: SnoozedState, path: string): SnoozedState {
	const { [path]: _, ...rest } = current;
	return rest;
}

export function isSnoozed(snoozed: SnoozedState, path: string, now: Date): boolean {
	const until = snoozed[path];
	if (!until) return false;
	return new Date(until).getTime() > now.getTime();
}

/** Remove expired snooze entries to keep storage clean. */
export function purgeSnoozed(snoozed: SnoozedState, now: Date): SnoozedState {
	const result: SnoozedState = {};
	for (const [path, until] of Object.entries(snoozed)) {
		if (new Date(until).getTime() > now.getTime()) {
			result[path] = until;
		}
	}
	return result;
}
