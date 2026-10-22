// Best-effort switch for Electron's background throttling of this window. NO
// Obsidian imports — enforced by architectureBoundaries.test.ts.
//
// `webContents.setBackgroundThrottling(false)` stops Chromium slowing timers in
// a hidden window at all. Obsidian doesn't document a route to it: it's reached
// through Electron's `remote` module, which newer Electron dropped from core
// (`@electron/remote` is the shim). So every step is feature-detected, and a
// miss is a silent no-op — the worker heartbeat and audio-clock chime already
// cover the timer; this is only the belt to their braces.

interface ThrottleTarget {
	setBackgroundThrottling(allowed: boolean): void;
}

interface RemoteLike {
	getCurrentWebContents?: () => Partial<ThrottleTarget> | null | undefined;
}

type RequireFn = (id: string) => unknown;

function findRemote(req: RequireFn): RemoteLike | null {
	for (const load of [
		() => (req('electron') as { remote?: RemoteLike } | null)?.remote,
		() => req('@electron/remote') as RemoteLike | null,
	]) {
		try {
			const remote = load();
			if (remote?.getCurrentWebContents) return remote;
		} catch {
			// Module absent in this build — try the next route.
		}
	}
	return null;
}

/**
 * Allow or stop background throttling for the current window. Returns true when
 * the call reached Electron, false when no route exists (mobile, a locked-down
 * build, tests). Never throws.
 */
export function setBackgroundThrottling(allowed: boolean, req?: RequireFn): boolean {
	const requireFn = req ?? (globalThis as { require?: RequireFn }).require;
	if (typeof requireFn !== 'function') return false;
	try {
		const contents = findRemote(requireFn)?.getCurrentWebContents?.();
		if (typeof contents?.setBackgroundThrottling !== 'function') return false;
		contents.setBackgroundThrottling(allowed);
		return true;
	} catch {
		return false;
	}
}
