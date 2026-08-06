/**
 * The resolved status pointers.
 *
 * Statuses are user-configurable, so settings holds a `statuses` list plus a set
 * of *pointers* into it — `completionStatus`, and the quick-action start / block
 * / hold names. Every one of those pointers can go stale when the list is edited,
 * so the codebase grew a family of resolvers (`resolveCompletionStatus`,
 * `resolveConfiguredStatus`, `resolveOptionalStatus`, `resolveEmergencyStatus`)
 * and then called them at the point of use — `resolveCompletionStatus(settings.
 * statuses, settings.completionStatus)` appeared verbatim at eight sites, and
 * `statuses[0] ?? 'Active'` was hand-inlined at seven more *despite*
 * `resolveEmergencyStatus` existing for exactly that.
 *
 * The tell that nobody knew what was authoritative: some sites read
 * `settings.completionStatus` raw while others didn't trust it enough to skip the
 * resolver — even though `normalizeSettingsFromSources` already re-resolves every
 * pointer, and runs on load, on **every** `saveSettings()`, and on external
 * settings change.
 *
 * A `StatusPolicy` resolves the whole set once. Once you hold one, `policy.
 * completion` *is* the completion status — no `statuses` argument to remember to
 * pass, no per-site fallback to get subtly wrong. Same move as `taskRef.ts` and
 * `badgePalette.ts`: resolve at the edge, hand the UI an object.
 *
 * Pure: no Obsidian or plugin dependencies.
 */

import {
	DEFAULT_SETTINGS,
	resolveCompletionStatus,
	resolveConfiguredStatus,
	resolveEmergencyStatus,
	resolveOptionalStatus,
} from './defaults';

/**
 * The slice of settings a policy reads. Deliberately loose — the call sites this
 * replaced all guarded with `?? []` / `?? {}`, so a partially-formed settings
 * object has to stay survivable.
 */
export interface StatusPolicySettings {
	statuses?: string[] | null;
	completionStatus?: string | null;
	quickActions?: {
		startStatus?: string | null;
		blockStatus?: string | null;
		holdStatus?: string | null;
	} | null;
}

export interface StatusPolicy {
	/** Every configured status, in display order. */
	readonly all: readonly string[];
	/**
	 * The status a new task starts in, and the last-resort fallback when a stored
	 * status isn't in the list at all. The first configured status.
	 */
	readonly initial: string;
	/** The status that means "done". */
	readonly completion: string;
	/** Quick-action "start working on this". */
	readonly start: string;
	/** Quick-action "this is blocked". */
	readonly block: string;
	/**
	 * Quick-action "park this", or `null` when the vault has no Hold status.
	 *
	 * `null` rather than a fallback, and a variant rather than a bare `''`: a
	 * vault with no Hold that resolved this to the first status would then treat
	 * every Active task as impeded and cascade a bogus Hold across the whole
	 * dependency graph. Absence is meaningful here, so it has to be visible in
	 * the type. See `resolveOptionalStatus`.
	 */
	readonly hold: string | null;
	/** Whether a status means the task is complete. */
	isComplete(status: string): boolean;
	/**
	 * Whether a status is a system pointer that must not be deleted. Not the
	 * hardcoded string 'Completed' — whatever the user has pointed it at now.
	 */
	isSystem(status: string): boolean;
}

/**
 * Resolve every status pointer at once.
 *
 * Cheap enough to call per operation, but `TTasksPlugin.statusPolicy` caches it
 * on settings identity — `fileToTask` needs it once per file, and a vault load
 * runs that thousands of times.
 */
export function buildStatusPolicy(settings: StatusPolicySettings | null | undefined): StatusPolicy {
	const all = settings?.statuses ?? [];
	const quickActions = settings?.quickActions ?? {};

	const initial = resolveEmergencyStatus(all);
	const completion = resolveCompletionStatus(all, settings?.completionStatus);
	const start = resolveConfiguredStatus(all, quickActions.startStatus, DEFAULT_SETTINGS.quickActions.startStatus);
	const block = resolveConfiguredStatus(all, quickActions.blockStatus, DEFAULT_SETTINGS.quickActions.blockStatus);
	// `resolveOptionalStatus` signals "not configured" with '', which is the same
	// sentinel a blank setting uses. Normalise it to null so the absence is a
	// value callers can't confuse with a real status name.
	const hold = resolveOptionalStatus(all, quickActions.holdStatus, DEFAULT_SETTINGS.quickActions.holdStatus) || null;

	return {
		all,
		initial,
		completion,
		start,
		block,
		hold,
		isComplete: (status) => status === completion,
		isSystem: (status) => status === completion,
	};
}
