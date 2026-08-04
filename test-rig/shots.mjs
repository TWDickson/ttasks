/* Screenshot matrix for the visual test rig.
   Usage:  node test-rig/shots.mjs [nameFilter]
   Starts the vite dev server if it isn't already running on :5199, drives a
   headless local Chrome/Edge through the shot matrix, and writes PNGs to
   test-rig/shots/. Pass a substring to shoot only matching entries,
   e.g. `node test-rig/shots.mjs mobile`. */

import { spawn } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import { BROWSER_ARGS, findBrowser, rigDir } from './localPaths.mjs';
import { ensureVendorCss } from './vendorCss.mjs';

const shotsDir = path.join(rigDir, 'shots');
const BASE = 'http://localhost:5199';

const DESKTOP = { width: 1280, height: 800 };
const PHONE = { width: 390, height: 844 };

/* Every shot renders the built-in Bikini Bottom fixtures, never vault data —
   `forceFixtures` below appends `data=fixtures` to each URL. Screenshots get
   shared and committed, so a matrix that silently picked up whatever was in the
   developer's own vault would leak real tasks. Don't remove the guard. */
const SHOTS = [
	{ name: 'list-dark', url: '/?view=list', viewport: DESKTOP },
	{ name: 'list-light', url: '/?view=list&theme=light', viewport: DESKTOP },
	{ name: 'kanban-dark', url: '/?view=kanban', viewport: DESKTOP },
	{ name: 'kanban-light', url: '/?view=kanban&theme=light', viewport: DESKTOP },
	{ name: 'agenda-dark', url: '/?view=agenda', viewport: DESKTOP },
	{ name: 'agenda-light', url: '/?view=agenda&theme=light', viewport: DESKTOP },
	{ name: 'graph-dark', url: '/?view=graph', viewport: { width: 1440, height: 900 } },
	{ name: 'graph-light', url: '/?view=graph&theme=light', viewport: { width: 1440, height: 900 } },
	{ name: 'timeline-dark', url: '/?view=timeline', viewport: { width: 1440, height: 900 } },
	{ name: 'detail-dark', url: '/?view=list&detail=1', viewport: DESKTOP },
	{ name: 'detail-light', url: '/?view=list&detail=1&theme=light', viewport: DESKTOP },
	{ name: 'modal-dark', url: '/?view=list&modal=1', viewport: DESKTOP },
	{ name: 'modal-light', url: '/?view=list&modal=1&theme=light', viewport: DESKTOP },
	{ name: 'mobile-list-dark', url: '/?view=list', viewport: PHONE },
	{ name: 'mobile-list-light', url: '/?view=list&theme=light', viewport: PHONE },
	{ name: 'mobile-kanban-dark', url: '/?view=kanban', viewport: PHONE },
	{ name: 'mobile-graph-dark', url: '/?view=graph', viewport: PHONE },
	{ name: 'mobile-timeline-dark', url: '/?view=timeline', viewport: PHONE },
	{ name: 'mobile-detail-dark', url: '/?view=list&detail=1', viewport: PHONE },
	{ name: 'mobile-modal-dark', url: '/?view=list&modal=1', viewport: PHONE },
	{ name: 'mobile-modal-light', url: '/?view=list&modal=1&theme=light', viewport: PHONE },
];

/** Pin every shot to fixture data so a populated vault can never reach a PNG,
    and hide the rig's own toolbar so the image shows only the plugin. */
function shotUrl(url) {
	const u = new URL(url, BASE);
	u.searchParams.set('data', 'fixtures');
	u.searchParams.set('chrome', '0');
	return `${u.pathname}${u.search}`;
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

	/* Stubbed CSS renders structurally correct but visually unstyled shots — they
	   look plausible enough to sign off, which is worse than having none. The vite
	   config warns, but that goes to the dev server's output and is easily missed
	   here. Refuse instead, unless someone is deliberately capturing layout only. */
	const stubbed = ensureVendorCss(rigDir);
	if (stubbed.length && !process.env.TTASKS_ALLOW_STUBBED_SHOTS) {
		console.error(
			`\n  ✗ Refusing to screenshot without Obsidian CSS (${stubbed.join(', ')}).\n` +
			'    Shots would render unstyled — don\'t sign off visual work against them.\n\n' +
			'    Fix with:  npm run rig:sync-css\n' +
			'    Override:  TTASKS_ALLOW_STUBBED_SHOTS=1 npm run rig:shots\n',
		);
		process.exit(1);
	}

	mkdirSync(shotsDir, { recursive: true });
	const server = await ensureServer();
	const profileDir = path.join(shotsDir, `.chrome-profile-${Date.now()}`);
	const browser = await puppeteer.launch({
		executablePath: findBrowser(),
		headless: true,
		userDataDir: profileDir,
		args: BROWSER_ARGS,
	});

	try {
		for (const shot of shots) {
			const page = await browser.newPage();
			await page.setViewport(shot.viewport);
			await page.goto(`${BASE}${shotUrl(shot.url)}`, { waitUntil: 'networkidle0', timeout: 30000 });
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
