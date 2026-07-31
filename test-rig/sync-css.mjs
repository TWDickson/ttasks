/* Refreshes test-rig/vendor/ with the CSS the rig renders against: Obsidian's
   real app.css and the vault's Underwater theme.

   Two sources per file, local first, git second — so this works both on a
   machine with Obsidian installed and on a headless server that has neither
   Obsidian nor the vault:

     app.css  ← local obsidian.asar, else obsidian-releases' asar.gz
     theme    ← the vault's theme.css, else the seniblue/Underwater repo

   Usage: node test-rig/sync-css.mjs
   Env:   TTASKS_OBSIDIAN_ASAR / TTASKS_THEME_CSS  local source overrides
          TTASKS_OBSIDIAN_VERSION                  release to pull (default: latest)
          TTASKS_THEME_URL                         raw theme.css URL */

import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { gunzipSync } from 'node:zlib';
import path from 'node:path';
import { OBSIDIAN_ASAR, VAULT_THEME, rigDir } from './localPaths.mjs';
import { vendorDir } from './vendorCss.mjs';

const vendor = vendorDir(rigDir);
const cacheDir = path.join(rigDir, '.cache');

/* Used only when the releases API can't be reached (rate limit, offline).
   Bump when it drifts far from current — the API path is the normal one. */
const FALLBACK_OBSIDIAN_VERSION = '1.13.4';
const THEME_URL = process.env.TTASKS_THEME_URL
	?? 'https://raw.githubusercontent.com/seniblue/Underwater/main/theme.css';

mkdirSync(vendor, { recursive: true });

async function latestObsidianVersion() {
	if (process.env.TTASKS_OBSIDIAN_VERSION) return process.env.TTASKS_OBSIDIAN_VERSION;
	try {
		const res = await fetch(
			'https://api.github.com/repos/obsidianmd/obsidian-releases/releases/latest',
			{ headers: { accept: 'application/vnd.github+json' } },
		);
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		const { tag_name: tag } = await res.json();
		return String(tag).replace(/^v/, '');
	} catch (error) {
		console.warn(`! Couldn't read the latest Obsidian release (${error.message}); using ${FALLBACK_OBSIDIAN_VERSION}`);
		return FALLBACK_OBSIDIAN_VERSION;
	}
}

async function download(url, label) {
	const res = await fetch(url, { redirect: 'follow' });
	if (!res.ok) throw new Error(`${label}: HTTP ${res.status} from ${url}`);
	return Buffer.from(await res.arrayBuffer());
}

/* The asar.gz is ~8.7 MB; cache it per version so repeat syncs are free. */
async function fetchRemoteAsar() {
	const version = await latestObsidianVersion();
	const cached = path.join(cacheDir, `obsidian-${version}.asar`);
	if (existsSync(cached)) {
		console.log(`· using cached obsidian-${version}.asar`);
		return cached;
	}
	const url = `https://github.com/obsidianmd/obsidian-releases/releases/download/v${version}/obsidian-${version}.asar.gz`;
	console.log(`· downloading obsidian-${version}.asar.gz …`);
	const gz = await download(url, 'obsidian asar');
	mkdirSync(cacheDir, { recursive: true });
	writeFileSync(cached, gunzipSync(gz));
	return cached;
}

/* @electron/asar writes the extracted file to cwd under its own basename. */
function extractAppCss(asarPath) {
	execFileSync('npx', ['--yes', '@electron/asar', 'extract-file', asarPath, 'app.css'], {
		cwd: vendor, shell: true, stdio: 'inherit',
	});
	const extracted = path.join(vendor, 'app.css');
	if (!existsSync(extracted)) throw new Error('asar extract produced no app.css');
	rmSync(path.join(vendor, 'obsidian-app.css'), { force: true });
	renameSync(extracted, path.join(vendor, 'obsidian-app.css'));
}

async function syncAppCss() {
	if (OBSIDIAN_ASAR && existsSync(OBSIDIAN_ASAR)) {
		extractAppCss(OBSIDIAN_ASAR);
		console.log('✓ vendor/obsidian-app.css ← local Obsidian install');
		return;
	}
	extractAppCss(await fetchRemoteAsar());
	console.log('✓ vendor/obsidian-app.css ← obsidian-releases');
}

async function syncTheme() {
	const target = path.join(vendor, 'theme-underwater.css');
	if (VAULT_THEME && existsSync(VAULT_THEME)) {
		copyFileSync(VAULT_THEME, target);
		console.log('✓ vendor/theme-underwater.css ← vault');
		return;
	}
	writeFileSync(target, await download(THEME_URL, 'Underwater theme'));
	console.log('✓ vendor/theme-underwater.css ← seniblue/Underwater');
}

let failed = false;
for (const [label, task] of [['app.css', syncAppCss], ['theme', syncTheme]]) {
	try {
		await task();
	} catch (error) {
		failed = true;
		console.error(`✗ ${label}: ${error.message}`);
	}
}

if (failed) {
	console.error('\nSync incomplete — the rig still runs, but stubbed CSS means it');
	console.error('will not match Obsidian. Do not sign off visual work against it.');
	process.exit(1);
}

/* Leftover stubs would silently outrank a successful sync. */
for (const name of ['obsidian-app.css', 'theme-underwater.css']) {
	const file = path.join(vendor, name);
	if (existsSync(file) && readFileSync(file, 'utf8').includes('ttasks-rig-stub')) {
		console.warn(`! ${name} is still a stub`);
	}
}
