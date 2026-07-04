/* Screenshot matrix for the visual test rig.
   Usage:  node test-rig/shots.mjs [nameFilter]
   Starts the vite dev server if it isn't already running on :5199, drives a
   headless local Chrome/Edge through the shot matrix, and writes PNGs to
   test-rig/shots/. Pass a substring to shoot only matching entries,
   e.g. `node test-rig/shots.mjs mobile`. */

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const rigDir = path.dirname(fileURLToPath(import.meta.url));
const shotsDir = path.join(rigDir, 'shots');
const BASE = 'http://localhost:5199';

/* Plain Chromium (installed via `npx @puppeteer/browsers install chromium@latest
   --path test-rig/.browser`) — the corporate policy that blocks remote debugging
   applies only to branded Chrome/Edge, not to Chromium builds. */
const BROWSERS = [
	path.join(rigDir, '.browser/chromium/win64-1656505/chrome-win/chrome.exe'),
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
	/* Edge before Chrome on macOS: this machine's Chrome (107) predates the
	   current headless mode that puppeteer-core 25 expects. */
	'/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
	'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
];

const DESKTOP = { width: 1280, height: 800 };
const PHONE = { width: 390, height: 844 };

const SHOTS = [
	{ name: 'list-dark', url: '/?view=list', viewport: DESKTOP },
	{ name: 'list-light', url: '/?view=list&theme=light', viewport: DESKTOP },
	{ name: 'kanban-dark', url: '/?view=kanban', viewport: DESKTOP },
	{ name: 'kanban-light', url: '/?view=kanban&theme=light', viewport: DESKTOP },
	{ name: 'agenda-dark', url: '/?view=agenda', viewport: DESKTOP },
	{ name: 'graph-dark', url: '/?view=graph', viewport: { width: 1440, height: 900 } },
	{ name: 'detail-dark', url: '/?view=list&detail=1', viewport: DESKTOP },
	{ name: 'detail-light', url: '/?view=list&detail=1&theme=light', viewport: DESKTOP },
	{ name: 'modal-dark', url: '/?view=list&modal=1', viewport: DESKTOP },
	{ name: 'modal-light', url: '/?view=list&modal=1&theme=light', viewport: DESKTOP },
	{ name: 'mobile-list-dark', url: '/?view=list', viewport: PHONE },
	{ name: 'mobile-kanban-dark', url: '/?view=kanban', viewport: PHONE },
	{ name: 'mobile-detail-dark', url: '/?view=list&detail=1', viewport: PHONE },
	{ name: 'mobile-modal-dark', url: '/?view=list&modal=1', viewport: PHONE },
	{ name: 'mobile-modal-light', url: '/?view=list&modal=1&theme=light', viewport: PHONE },
];

function findBrowser() {
	for (const p of BROWSERS) {
		if (existsSync(p)) return p;
	}
	throw new Error('No Chrome/Edge found — edit BROWSERS in shots.mjs');
}

async function serverUp() {
	try {
		const res = await fetch(BASE, { signal: AbortSignal.timeout(1500) });
		return res.ok;
	} catch {
		return false;
	}
}

async function ensureServer() {
	if (await serverUp()) return null;
	console.log('starting vite dev server…');
	const child = spawn(
		process.platform === 'win32' ? 'npx.cmd' : 'npx',
		['vite', '--config', path.join(rigDir, 'vite.config.mts')],
		{ cwd: path.join(rigDir, '..'), stdio: 'ignore', detached: false, shell: true },
	);
	for (let i = 0; i < 60; i++) {
		await new Promise((r) => setTimeout(r, 500));
		if (await serverUp()) return child;
	}
	child.kill();
	throw new Error('vite dev server did not come up on :5199');
}

async function main() {
	const filter = process.argv[2] ?? '';
	const shots = SHOTS.filter((s) => s.name.includes(filter));
	if (shots.length === 0) {
		console.error(`no shots match "${filter}"`);
		process.exit(1);
	}

	mkdirSync(shotsDir, { recursive: true });
	const server = await ensureServer();
	const profileDir = path.join(shotsDir, `.chrome-profile-${Date.now()}`);
	const browser = await puppeteer.launch({
		executablePath: findBrowser(),
		headless: true,
		userDataDir: profileDir,
		args: ['--hide-scrollbars', '--force-device-scale-factor=1', '--no-first-run'],
	});

	try {
		for (const shot of shots) {
			const page = await browser.newPage();
			await page.setViewport(shot.viewport);
			await page.goto(`${BASE}${shot.url}`, { waitUntil: 'networkidle0', timeout: 30000 });
			await page.waitForSelector('body[data-rig-ready="1"]', { timeout: 15000 });
			await new Promise((r) => setTimeout(r, 400)); // let fonts/transitions settle
			const file = path.join(shotsDir, `${shot.name}.png`);
			await page.screenshot({ path: file });
			console.log('✓', path.relative(process.cwd(), file));
			await page.close();
		}
	} finally {
		await browser.close();
		server?.kill();
		// Remove this run's profile plus any left behind by crashed runs
		const { readdirSync } = await import('node:fs');
		for (const entry of readdirSync(shotsDir)) {
			if (entry.startsWith('.chrome-profile-') || entry.startsWith('.dbg-')) {
				rmSync(path.join(shotsDir, entry), { recursive: true, force: true });
			}
		}
	}
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
