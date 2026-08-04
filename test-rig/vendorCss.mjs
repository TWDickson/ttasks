/* test-rig/vendor/ holds Obsidian's real app.css + the vault theme, extracted
   from a local Obsidian install by sync-css.mjs. It's gitignored, so a fresh
   clone has none of it — and main.ts imports those files statically, which used
   to make `npm run rig` die at resolve time on any machine without Obsidian.

   This writes an empty stub for whichever file is missing so the rig still
   boots: layout, structure and interaction all work, only the Obsidian-native
   look is absent. Stubs carry a marker comment so they're recognisable later
   and so sync-css.mjs's real output is never mistaken for one. */

import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { OTHER_RIG_DIRS } from './localPaths.mjs';

const MARKER = 'ttasks-rig-stub';

const STUB = `/* ${MARKER} — placeholder for CSS this machine can't vendor.

   The real file comes from a local Obsidian install:  npm run rig:sync-css
   Without it the rig renders with plugin styles only: correct structure and
   behaviour, but not Obsidian's native appearance. Don't sign off visual work
   against a stubbed rig. */
`;

export function vendorDir(rigDir) {
	return path.join(rigDir, 'vendor');
}

/** True when the file is absent or one of our placeholders. */
export function isStubbed(file) {
	if (!existsSync(file)) return true;
	return readFileSync(file, 'utf8').includes(MARKER);
}

/**
 * Ensure every vendored CSS file exists, stubbing the missing ones.
 * @returns {string[]} basenames that are stubs (empty when fully vendored)
 */
export function ensureVendorCss(rigDir, files = ['obsidian-app.css', 'theme-underwater.css']) {
	const dir = vendorDir(rigDir);
	mkdirSync(dir, { recursive: true });
	const stubbed = [];
	for (const name of files) {
		const target = path.join(dir, name);
		if (isStubbed(target)) borrowFromSiblingRig(name, target);
		if (!existsSync(target)) writeFileSync(target, STUB);
		if (isStubbed(target)) stubbed.push(name);
	}
	return stubbed;
}

/**
 * Copy a real vendored file from another worktree on this machine. vendor/ is a
 * gitignored machine-local cache, so a sibling worktree that has already run
 * rig:sync-css has exactly the file this one needs — and syncing again would
 * just re-extract it from the same local Obsidian install.
 */
function borrowFromSiblingRig(name, target) {
	for (const other of OTHER_RIG_DIRS) {
		const source = path.join(vendorDir(other), name);
		if (isStubbed(source)) continue;
		try {
			copyFileSync(source, target);
			return;
		} catch {
			/* Unreadable sibling is not fatal — fall through to the stub. */
		}
	}
}
