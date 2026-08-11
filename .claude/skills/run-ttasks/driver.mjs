/* Interactive driver for the TTasks visual test rig.
   Opens a rig URL in headless Chrome, runs a command sequence, exits.

   Usage:
     node .claude/skills/run-ttasks/driver.mjs [--mobile] <url> <command...>

   <url> is a rig path, e.g. '/?view=kanban' or '/?view=list&theme=light'
   (params: view=list|kanban|agenda|graph|today|inbox|logbook,
    theme=light|dark, data=fixtures, detail=1, modal=1).

   Commands (run left to right):
     shot <file.png>        screenshot -> test-rig/shots/<file.png>
     click <selector>       click first match (waits for it)
     type <selector> <txt>  focus + type into first match
     text <selector>        print innerText of first match
     count <selector>       print number of matches
     eval <js>              run JS in the page, print JSON result
     wait <ms>              sleep

   Starts the vite dev server on :5199 itself if it isn't running
   (and kills it on exit only if it started it). */

import { spawn } from 'node:child_process';
import { mkdirSync, rmSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import { launchBrowser } from '../../../test-rig/localPaths.mjs';

const skillDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(skillDir, '../../..');
const rigDir = path.join(root, 'test-rig');
const shotsDir = path.join(rigDir, 'shots');
// Port is overridable because a rig started from another worktree will happily
// answer on :5199, and the driver would then drive that worktree's code — a
// silent wrong-branch verification. Set TTASKS_RIG_PORT to get your own.
const PORT = process.env.TTASKS_RIG_PORT || '5199';
const BASE = `http://localhost:${PORT}`;

const DESKTOP = { width: 1280, height: 800 };
const PHONE = { width: 390, height: 844 };

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
	console.error('starting vite dev server…');
	const child = spawn(
		process.platform === 'win32' ? 'npx.cmd' : 'npx',
		['vite', '--config', path.join(rigDir, 'vite.config.mts'), '--port', PORT, '--strictPort'],
		{ cwd: root, stdio: 'ignore', shell: true },
	);
	for (let i = 0; i < 60; i++) {
		await new Promise((r) => setTimeout(r, 500));
		if (await serverUp()) return child;
	}
	child.kill();
	throw new Error(`vite dev server did not come up on :${PORT}`);
}

async function main() {
	const argv = process.argv.slice(2);
	let viewport = DESKTOP;
	if (argv[0] === '--mobile') {
		viewport = PHONE;
		argv.shift();
	}
	const url = argv.shift();
	if (!url || !url.startsWith('/')) {
		console.error("usage: driver.mjs [--mobile] '/?view=list' <commands…>");
		process.exit(1);
	}

	mkdirSync(shotsDir, { recursive: true });
	const server = await ensureServer();
	const profileDir = path.join(shotsDir, `.chrome-profile-${Date.now()}`);
	const browser = await launchBrowser(puppeteer, { userDataDir: profileDir });

	try {
		const page = await browser.newPage();
		await page.setViewport(viewport);
		await page.goto(`${BASE}${url}`, { waitUntil: 'networkidle0', timeout: 30000 });
		await page.waitForSelector('body[data-rig-ready="1"]', { timeout: 15000 });
		await new Promise((r) => setTimeout(r, 400));

		while (argv.length) {
			const cmd = argv.shift();
			switch (cmd) {
				case 'shot': {
					const file = path.join(shotsDir, argv.shift());
					await new Promise((r) => setTimeout(r, 200));
					await page.screenshot({ path: file });
					console.log('✓ shot', path.relative(process.cwd(), file));
					break;
				}
				case 'click': {
					const sel = argv.shift();
					await page.waitForSelector(sel, { timeout: 5000 });
					await page.click(sel);
					console.log('✓ click', sel);
					break;
				}
				case 'type': {
					const sel = argv.shift();
					const txt = argv.shift();
					await page.waitForSelector(sel, { timeout: 5000 });
					await page.type(sel, txt);
					console.log('✓ type', sel);
					break;
				}
				case 'text': {
					const sel = argv.shift();
					await page.waitForSelector(sel, { timeout: 5000 });
					console.log(await page.$eval(sel, (el) => el.innerText));
					break;
				}
				case 'count': {
					const sel = argv.shift();
					console.log(await page.$$eval(sel, (els) => els.length));
					break;
				}
				case 'eval': {
					const js = argv.shift();
					const result = await page.evaluate(js);
					console.log(JSON.stringify(result));
					break;
				}
				case 'wait': {
					await new Promise((r) => setTimeout(r, Number(argv.shift())));
					break;
				}
				default:
					throw new Error(`unknown command: ${cmd}`);
			}
		}
	} finally {
		await browser.close();
		server?.kill();
		for (const entry of readdirSync(shotsDir)) {
			if (entry.startsWith('.chrome-profile-')) {
				rmSync(path.join(shotsDir, entry), { recursive: true, force: true });
			}
		}
	}
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
