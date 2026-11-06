/* Boot the rig and prove every view actually mounts.
   Usage:  node test-rig/smoke.mjs        (npm run rig:smoke)

   Why this exists, and why the type-check isn't enough:

   The rig builds its own plugin mock (`buildRigPlugin`), and every hand-off to a
   real component goes through `plugin as never` — the mock cannot structurally
   implement TTasksPlugin, which extends Obsidian's Plugin. That cast severs the
   link, so when the plugin surface grows a member the components read, `src`
   stays green, `tsc` over test-rig stays green, and the rig renders a **blank
   page**. That is not hypothetical: it happened on 2026-08-06 (`statusPolicy`),
   and the only thing that caught it was running the rig by hand.

   So this asserts the one property a cast can't erase: the components really do
   mount against the mock. `body[data-rig-ready="1"]` is set by main.ts after the
   last component is constructed, so reaching it means nothing threw on the way.

   Unlike `rig:shots`, this deliberately tolerates stubbed CSS — mounting is a JS
   property, not a visual one, so it runs on any machine and on CI, where no
   Obsidian install exists to vendor real CSS from. */

import { spawn } from 'node:child_process';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import { launchBrowser, rigDir } from './localPaths.mjs';
import { ensureVendorCss } from './vendorCss.mjs';

const PORT = process.env.TTASKS_RIG_PORT || '5199';
const BASE = `http://localhost:${PORT}`;

/* One per renderer plus the two overlays — each mounts a different component
   tree, so a mock member read by only one of them still gets caught. Fixtures,
   never vault data: CI has no vault, and a smoke test must not depend on one. */
const SCENES = [
	{ name: 'list', url: '/?view=list', popover: '.tt-filter-trigger' },
	{ name: 'kanban', url: '/?view=kanban' },
	{ name: 'agenda', url: '/?view=agenda' },
	{ name: 'graph', url: '/?view=graph', popover: '.tt-graph-project-filter > button' },
	{ name: 'timeline', url: '/?view=timeline' },
	{ name: 'logbook', url: '/?view=logbook' },
	{ name: 'detail', url: '/?view=list&detail=1', formRoot: '.tt-detail' },
	{ name: 'modal', url: '/?view=list&modal=1', formRoot: '.tt-create-modal' },
	{ name: 'pomodoro', url: '/?pomo=focus' },
	/* The Share/Sync modal reads more of the plugin surface than any other
	   overlay (settings.shareSync, the prompt library, the task store) and was
	   NOT covered here — a stale fixture crashed it while every scene above and
	   the whole test suite stayed green. Both tabs, because Import mounts a
	   different tree from Export. */
	{ name: 'share-export', url: '/?share=1' },
	{ name: 'share-import', url: '/?share=import' },
];

/* The two form surfaces also get an accessibility floor: every visible control
   has an accessible name, and no two elements share an id (a duplicate id
   silently re-targets a `<label for>`). Found 2026-10-23: the detail pane's
   project/dependency pickers were unnamed, "Repeat Type" labelled the Repeats
   menu, and most Create-modal labels pointed at nothing. Returns problems. */
async function formA11yProblems(page, root) {
	const problems = [];
	for (const h of await page.$$(`${root} input, ${root} select, ${root} textarea, ${root} [role=group]`)) {
		if (!(await h.evaluate((el) => el.checkVisibility()))) continue;
		const node = await page.accessibility.snapshot({ root: h, interestingOnly: false });
		if (!node?.name?.trim()) {
			problems.push(`unnamed ${await h.evaluate((el) => `<${el.tagName.toLowerCase()} class="${el.className}">`)}`);
		}
	}
	const ids = await page.$$eval(`${root} [id]`, (els) => els.map((el) => el.id));
	for (const id of new Set(ids.filter((id, i) => ids.indexOf(id) !== i))) problems.push(`duplicate id "${id}"`);
	return problems;
}

/* The anchored menus (src/utils/popover.ts) take the native-popover path in a
   real browser and the fallback in jsdom, so the component tests only ever see
   the fallback. This drives the native one: the trigger opens the menu in the
   top layer, under its trigger and inside the viewport, nothing paints over it,
   Escape closes it *without* reaching a document-level listener (the board's
   shortcut handler lives there and would also clear the search), and a click
   elsewhere light-dismisses it. Returns problems. */
async function popoverProblems(page, triggerSelector) {
	const trigger = await page.$(triggerSelector);
	if (!trigger) return [`no ${triggerSelector} to open`];
	const menuId = await trigger.evaluate((el) => el.getAttribute('popovertarget'));
	if (!menuId) return [`${triggerSelector} has no popovertarget — the native path didn't engage`];
	const menu = `[id="${menuId}"]`;
	const problems = [];

	await page.evaluate(() => {
		window.__ttEscapes = 0;
		document.addEventListener('keydown', (e) => { if (e.key === 'Escape') window.__ttEscapes += 1; });
	});
	await trigger.click();
	await page.waitForSelector(`${menu}:popover-open`, { timeout: 3000 }).catch(() => problems.push('trigger did not open the menu'));
	if (problems.length) return problems;
	await new Promise((r) => setTimeout(r, 50)); // the toggle event positions it

	const geometry = await page.evaluate((triggerSel, menuSel) => {
		const t = document.querySelector(triggerSel).getBoundingClientRect();
		const m = document.querySelector(menuSel);
		const r = m.getBoundingClientRect();
		const hit = document.elementFromPoint(r.left + r.width / 2, r.top + Math.min(20, r.height / 2));
		return {
			below: r.top >= t.bottom - 1, above: r.bottom <= t.top + 1,
			inside: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight,
			onTop: !!hit && m.contains(hit),
			expanded: document.querySelector(triggerSel).getAttribute('aria-expanded'),
		};
	}, triggerSelector, menu);
	if (!geometry.below && !geometry.above) problems.push('menu is not under (or flipped above) its trigger');
	if (!geometry.inside) problems.push('menu runs outside the viewport');
	if (!geometry.onTop) problems.push('something paints over the open menu');
	if (geometry.expanded !== 'true') problems.push(`aria-expanded is "${geometry.expanded}" while open`);

	await page.keyboard.press('Escape');
	await new Promise((r) => setTimeout(r, 50));
	if (await page.$(`${menu}:popover-open`)) problems.push('Escape did not close the menu');
	if (await page.evaluate(() => window.__ttEscapes) !== 0) problems.push('Escape reached document — the board would also clear its search');

	await trigger.click();
	await page.waitForSelector(`${menu}:popover-open`, { timeout: 3000 }).catch(() => problems.push('trigger did not reopen the menu'));
	await page.mouse.click(4, 790);
	await new Promise((r) => setTimeout(r, 50));
	if (await page.$(`${menu}:popover-open`)) problems.push('a click elsewhere did not dismiss the menu');
	return problems;
}

function sceneUrl(url) {
	const u = new URL(url, BASE);
	u.searchParams.set('data', 'fixtures');
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
	const child = spawn(
		process.platform === 'win32' ? 'npx.cmd' : 'npx',
		['vite', '--config', path.join(rigDir, 'vite.config.mts'), '--port', PORT, '--strictPort'],
		{ cwd: path.join(rigDir, '..'), stdio: 'ignore', shell: true },
	);
	for (let i = 0; i < 60; i++) {
		await new Promise((r) => setTimeout(r, 500));
		if (await serverUp()) return child;
	}
	child.kill();
	throw new Error(`vite dev server did not come up on :${PORT}`);
}

async function main() {
	// Stubs are fine here (see header) — this only needs the rig to boot.
	ensureVendorCss(rigDir);

	const server = await ensureServer();
	const browser = await launchBrowser(puppeteer);

	const failures = [];
	try {
		for (const scene of SCENES) {
			const page = await browser.newPage();
			await page.setViewport({ width: 1280, height: 800 });

			/* Only an *uncaught exception* is treated as a failure. It's the precise
			   signal for a mount that broke, and it catches the case where a
			   component throws after `data-rig-ready` is already set. Console
			   errors are deliberately not fatal — they include resource 404s (a
			   missing favicon fails an otherwise perfect boot) and third-party
			   noise, so they're reported for diagnosis and nothing more. */
			const fatal = [];
			const noise = [];
			page.on('pageerror', (err) => fatal.push(String(err.message ?? err)));
			page.on('console', (msg) => {
				if (msg.type() === 'error') noise.push(msg.text());
			});

			try {
				await page.goto(`${BASE}${sceneUrl(scene.url)}`, { waitUntil: 'networkidle0', timeout: 30000 });
				await page.waitForSelector('body[data-rig-ready="1"]', { timeout: 15000 });
				if (fatal.length) throw new Error(fatal.join(' | '));
				if (scene.popover) {
					const problems = await popoverProblems(page, scene.popover);
					if (problems.length) throw new Error(`popover: ${problems.join('; ')}`);
				}
				if (scene.formRoot) {
					const problems = await formA11yProblems(page, scene.formRoot);
					if (problems.length) throw new Error(`accessibility: ${problems.join('; ')}`);
				}
				console.log('✓', scene.name, noise.length ? `(${noise.length} console error(s), not fatal)` : '');
				for (const line of noise) console.log('    console.error:', line.slice(0, 300));
			} catch (err) {
				const detail = fatal.length ? fatal.join(' | ') : (err.message ?? String(err));
				console.error('✗', scene.name, '—', detail);
				if (noise.length) console.error('   console:', noise.join(' | '));
				failures.push(`${scene.name}: ${detail}`);
			}
			await page.close();
		}
	} finally {
		await browser.close();
		server?.kill();
	}

	if (failures.length) {
		console.error(
			`\n  ✗ ${failures.length} of ${SCENES.length} rig scenes failed.\n` +
			'    An "accessibility:" failure names the control to label; a "popover:" one\n' +
			'    is the native anchored-menu path (src/utils/popover.ts). Otherwise:\n' +
			'    The rig plugin mock (test-rig/fixtures.ts) is probably missing something\n' +
			'    the components now read off TTasksPlugin. `npm run check` cannot catch\n' +
			'    this — the mount sites cast through `as never`.\n',
		);
		process.exit(1);
	}
	console.log(`\n  ✓ all ${SCENES.length} rig scenes mount.`);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
