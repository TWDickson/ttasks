/* Machine-local paths the rig would like but can't assume: the Obsidian vault,
   the Obsidian install, and a Chromium to drive. Nothing here is required — a
   server or CI box has none of it, and every consumer degrades instead of
   throwing (except findBrowser, which has nothing to fall back to).

   Every value takes an env override so a new machine needs no code edit:
     TTASKS_VAULT          vault root (contains .obsidian/)
     TTASKS_OBSIDIAN_ASAR  path to obsidian.asar
     TTASKS_THEME_CSS      theme stylesheet to vendor
     CHROME_PATH           browser binary (PUPPETEER_EXECUTABLE_PATH also read)

   An override wins outright even when the path doesn't exist, so a typo fails
   loudly instead of silently falling through to someone else's machine. Setting
   one to the empty string declares the resource absent. */

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const home = os.homedir();
export const rigDir = path.dirname(fileURLToPath(import.meta.url));

/* A linked git worktree gets its own test-rig/, but .browser/ and vendor/ are
   gitignored machine-local caches: the same Chromium and the same Obsidian CSS
   serve every worktree on the box. Without this a fresh worktree has to
   re-download a browser and re-run rig:sync-css before it can take a usable
   screenshot — and the failure mode for the CSS is silent, producing unstyled
   shots that look plausible enough to sign off. */
function mainWorktreeRigDir() {
	try {
		const common = execFileSync('git', ['rev-parse', '--git-common-dir'], {
			cwd: rigDir,
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'ignore'],
		}).trim();
		if (!common) return null;
		/* Absolute from a linked worktree, relative to cwd from the main one. */
		const dir = path.join(path.dirname(path.resolve(rigDir, common)), 'test-rig');
		return dir === rigDir ? null : dir;
	} catch {
		/* Not a git checkout, or no git on PATH — the rig degrades, as ever. */
		return null;
	}
}

/** Other rig dirs on this machine worth borrowing machine-local caches from. */
export const OTHER_RIG_DIRS = [mainWorktreeRigDir()].filter((d) => d && existsSync(d));

/** First candidate that exists on disk; null when none do. */
export function firstExisting(candidates) {
	return candidates.find((p) => p && existsSync(p)) ?? null;
}

function resolveWithOverride(envVars, candidates) {
	for (const name of envVars) {
		if (!(name in process.env)) continue;
		/* Set-but-empty means "this machine has none" — lets a box that does have
		   a vault or Obsidian reproduce the server's behaviour on demand. */
		return process.env[name] || null;
	}
	return firstExisting(candidates);
}

/** Vault root, or null when this machine has no vault (server/CI). */
export const VAULT = resolveWithOverride(['TTASKS_VAULT'], [
	'C:/Users/DICKSOTAYL/Projects/Obsidian/Taylor',
	path.join(home, 'Obsidian/Taylor'),
	path.join(home, 'obsidian/Taylor'),
]);

/** Obsidian's asar, source of the real app.css. Null when Obsidian isn't installed. */
export const OBSIDIAN_ASAR = resolveWithOverride(['TTASKS_OBSIDIAN_ASAR'], [
	path.join(home, 'AppData/Local/Programs/obsidian/resources/obsidian.asar'),
	'/Applications/Obsidian.app/Contents/Resources/obsidian.asar',
	'/opt/Obsidian/resources/obsidian.asar',
	'/usr/lib/obsidian/resources/obsidian.asar',
	'/var/lib/flatpak/app/md.obsidian.Obsidian/current/active/files/obsidian/resources/obsidian.asar',
	path.join(home, '.local/share/flatpak/app/md.obsidian.Obsidian/current/active/files/obsidian/resources/obsidian.asar'),
]);

/* Derived from VAULT rather than hardcoded, so pointing TTASKS_VAULT at a new
   vault moves the theme with it. */
export const VAULT_THEME = resolveWithOverride(['TTASKS_THEME_CSS'], [
	VAULT && path.join(VAULT, '.obsidian/themes/Underwater/theme.css'),
]);

/* Chromium downloaded into test-rig/.browser via
   `npx @puppeteer/browsers install chromium@latest --path test-rig/.browser`.
   Scanned rather than pinned to a build number so a reinstall keeps working;
   the three layouts are @puppeteer/browsers' per-platform ones. */
function localChromiumBuilds() {
	const layouts = [
		'chrome-win/chrome.exe',
		'chrome-linux/chrome',
		'chrome-mac/Chromium.app/Contents/MacOS/Chromium',
	];
	/* This worktree first, then any sibling worktree that already downloaded one. */
	return [rigDir, ...OTHER_RIG_DIRS].flatMap((dir) => {
		const root = path.join(dir, '.browser/chromium');
		if (!existsSync(root)) return [];
		return readdirSync(root).flatMap((build) =>
			layouts.map((layout) => path.join(root, build, layout)),
		);
	});
}

/* Corporate policy blocks remote debugging on branded Chrome/Edge but not on
   plain Chromium builds, which is why the downloaded one is probed first. */
function browserCandidates() {
	return [
		...localChromiumBuilds(),
		'C:/Program Files/Google/Chrome/Application/chrome.exe',
		'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
		/* Edge before Chrome on macOS: that machine's Chrome (107) predates the
		   headless mode puppeteer-core 25 expects. */
		'/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
		'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
		'/usr/bin/chromium',
		'/usr/bin/chromium-browser',
		'/usr/bin/google-chrome',
		'/usr/bin/google-chrome-stable',
		'/snap/bin/chromium',
		'/usr/bin/microsoft-edge',
	];
}

/* Headless Chromium in a container usually runs as root, where the sandbox
   refuses to start, and /dev/shm is capped at 64 MB. Linux-only so desktop
   runs keep the sandbox. */
export const BROWSER_ARGS = [
	'--hide-scrollbars',
	'--force-device-scale-factor=1',
	'--no-first-run',
	...(process.platform === 'linux' ? ['--no-sandbox', '--disable-dev-shm-usage'] : []),
];

/** Browser binary for puppeteer-core. Throws with install instructions. */
export function findBrowser() {
	const found = resolveWithOverride(
		['CHROME_PATH', 'PUPPETEER_EXECUTABLE_PATH'],
		browserCandidates(),
	);
	if (!found) {
		throw new Error(
			'No Chrome/Chromium/Edge found. Install one into the rig with:\n' +
			'  npx @puppeteer/browsers install chromium@latest --path test-rig/.browser\n' +
			'or point CHROME_PATH at an existing binary.',
		);
	}
	if (!existsSync(found)) {
		throw new Error(`Browser override points at a missing path: ${found}`);
	}
	return found;
}
