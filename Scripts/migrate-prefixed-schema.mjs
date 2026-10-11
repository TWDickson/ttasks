#!/usr/bin/env node
/**
 * One-shot vault migration to the `ttask_*` schema (MD-1 / MD-2 / MD-3 / RP).
 *
 *   node Scripts/migrate-prefixed-schema.mjs <folder> [<folder>…] [--apply] [--verbose]
 *                                            [--backup <dir>]
 *
 * Point it at the folder(s) that hold task notes — typically the tasks folder AND
 * the archive folder, e.g. `…/Vault/Planner/Tasks …/Vault/Planner/Archive`.
 * Subfolders are included. Run it with **Obsidian closed**.
 *
 * It is a DRY RUN unless you pass `--apply`. A dry run prints what would change
 * and touches nothing. With `--apply`, every note it changes is first copied to a
 * backup folder, then rewritten, then re-read and checked; a note that fails the
 * check is restored from its backup.
 *
 * What it does to each task note:
 *   - renames every plugin key to `ttask_<name>` (`cssclasses` stays; unknown
 *     properties from other tools are left alone),
 *   - removes keys that are blank — they're optional now (MD-2),
 *   - removes `blocks` — the plugin derives it (MD-3),
 *   - converts `recurrence` / `recurrence_type` / `recurrence_anchor_day` to the
 *     `ttask_repeat_*` keys, and drops an anchor with no rule behind it.
 * It preserves comments, quoting, key order and the note body.
 *
 * Safe to re-run: an already-migrated note is skipped, so a device that syncs an
 * old-format note back in is fixed by running it again.
 *
 * Remove this script (and the dev-phase migration commands) after the vault has
 * been converted — see SCHEMA_BREAK_PLAN.md.
 */
import { copyFileSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import YAML from 'yaml';
import { applyPlanToObject, planMigration, verifyMigration } from './lib/schemaMigration.mjs';

// ── CLI ──────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const backupFlag = args.indexOf('--backup');
const backupRoot = backupFlag >= 0 ? args[backupFlag + 1] : null;
const folders = args.filter((a, i) => !a.startsWith('--') && !(backupFlag >= 0 && i === backupFlag + 1));
const APPLY = flag('--apply');
const VERBOSE = flag('--verbose');

if (folders.length === 0 || flag('--help')) {
	console.log('Usage: node Scripts/migrate-prefixed-schema.mjs <folder> [<folder>…] [--apply] [--verbose] [--backup <dir>]');
	process.exit(folders.length === 0 && !flag('--help') ? 1 : 0);
}

// ── Files ────────────────────────────────────────────────────────────────────

function* walk(dir) {
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		if (entry.name.startsWith('.')) continue;
		const full = join(dir, entry.name);
		if (entry.isDirectory()) yield* walk(full);
		else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) yield full;
	}
}

const FRONTMATTER = /^(---\r?\n)([\s\S]*?)(\r?\n---)(?=\r?\n|$)/;

/** Apply a plan to the live YAML document, keeping everything it doesn't touch. */
function applyPlanToDocument(doc, plan) {
	const map = doc.contents;
	const renames = new Map();
	const drops = new Set();
	const replaces = new Map();
	for (const op of plan.ops) {
		if (op.op === 'rename') renames.set(op.from, op.to);
		else if (op.op === 'drop') drops.add(op.key);
		else replaces.set(op.key, op.with);
	}

	const items = [];
	for (const pair of map.items) {
		const key = String(pair.key?.value ?? pair.key);
		if (drops.has(key)) continue;
		if (replaces.has(key)) {
			for (const [k, v] of Object.entries(replaces.get(key))) {
				items.push(new YAML.Pair(doc.createNode(k), doc.createNode(v)));
			}
			continue;
		}
		if (renames.has(key)) {
			if (YAML.isScalar(pair.key)) pair.key.value = renames.get(key);
			else pair.key = doc.createNode(renames.get(key));
		}
		items.push(pair);
	}
	map.items = items;
}

/** @returns {{ kind: 'skip', reason: string } | { kind: 'migrate', plan, before, after, original, next }} */
function processFile(path) {
	const text = readFileSync(path, 'utf8');
	const match = FRONTMATTER.exec(text);
	if (!match) return { kind: 'skip', reason: 'no frontmatter' };

	const crlf = match[1].includes('\r\n');
	const doc = YAML.parseDocument(match[2], { prettyErrors: true });
	if (doc.errors.length > 0) return { kind: 'skip', reason: `unparseable frontmatter: ${doc.errors[0].message.split('\n')[0]}` };
	if (!YAML.isMap(doc.contents)) return { kind: 'skip', reason: 'frontmatter is not a mapping' };

	const before = doc.toJS();
	const plan = planMigration(before);
	if (plan.status !== 'migrate') return { kind: 'skip', reason: plan.status, plan };

	applyPlanToDocument(doc, plan);
	let fmText = doc.toString({ lineWidth: 0, flowCollectionPadding: false }).replace(/\n+$/, '');
	if (crlf) fmText = fmText.replace(/\r?\n/g, '\r\n');
	const next = match[1] + fmText + match[3] + text.slice(match[0].length);

	// Check the result before it can reach disk: it must re-parse to exactly the
	// object the plan predicts, with every surviving value untouched.
	const after = YAML.parse(fmText);
	const expected = applyPlanToObject(before, plan);
	const problems = verifyMigration(before, after, plan);
	if (JSON.stringify(after) !== JSON.stringify(expected)) problems.push('result differs from the planned frontmatter');
	if (!next.endsWith(text.slice(match[0].length))) problems.push('note body changed');
	if (problems.length > 0) return { kind: 'skip', reason: `verification failed: ${problems.join('; ')}`, plan, failed: true };

	return { kind: 'migrate', plan, before, after, original: text, next };
}

// ── Run ──────────────────────────────────────────────────────────────────────

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const stats = {
	scanned: 0, migrated: 0, alreadyMigrated: 0, notTasks: 0, conflicts: 0, failed: 0, unparseable: 0,
	renamed: 0, blanksDropped: {}, derivedDropped: 0, converted: {}, orphanRecurrence: 0,
	foreign: {}, warnings: [], conflictFiles: [], failedFiles: [],
};

for (const folderArg of folders) {
	const folder = resolve(folderArg);
	if (!statSync(folder, { throwIfNoEntry: false })?.isDirectory()) {
		console.error(`Not a folder: ${folder}`);
		process.exit(1);
	}
	const backupBase = resolve(backupRoot ?? join(dirname(folder), '.ttasks-migration-backup'), stamp, basename(folder));

	for (const path of walk(folder)) {
		stats.scanned++;
		const rel = relative(folder, path);
		const result = processFile(path);

		if (result.kind === 'skip') {
			if (result.reason === 'already-migrated') stats.alreadyMigrated++;
			else if (result.reason === 'not-a-task' || result.reason === 'no frontmatter') stats.notTasks++;
			else if (result.reason === 'conflict') { stats.conflicts++; stats.conflictFiles.push(rel); }
			else if (result.failed) { stats.failed++; stats.failedFiles.push(`${rel}: ${result.reason}`); }
			else { stats.unparseable++; stats.failedFiles.push(`${rel}: ${result.reason}`); }
			continue;
		}

		const { plan } = result;
		stats.migrated++;
		for (const op of plan.ops) {
			if (op.op === 'rename') stats.renamed++;
			else if (op.op === 'replace') stats.converted[op.with.ttask_repeat_unit] = (stats.converted[op.with.ttask_repeat_unit] ?? 0) + 1;
			else if (op.why === 'blank') stats.blanksDropped[op.key] = (stats.blanksDropped[op.key] ?? 0) + 1;
			else if (op.why === 'derived') stats.derivedDropped++;
			else if (op.why === 'orphan-recurrence') stats.orphanRecurrence++;
		}
		for (const key of plan.foreignKeys) stats.foreign[key] = (stats.foreign[key] ?? 0) + 1;
		for (const w of plan.warnings) stats.warnings.push(`${rel}: ${w}`);

		if (VERBOSE) {
			console.log(`\n${rel}`);
			for (const op of plan.ops) {
				if (op.op === 'rename') console.log(`  rename  ${op.from} → ${op.to}`);
				else if (op.op === 'replace') console.log(`  convert ${op.key} → ${Object.entries(op.with).map(([k, v]) => `${k}=${v}`).join(' ')}`);
				else console.log(`  drop    ${op.key} (${op.why})`);
			}
		}

		if (APPLY) {
			const backupPath = join(backupBase, rel);
			mkdirSync(dirname(backupPath), { recursive: true });
			copyFileSync(path, backupPath);
			const tmp = `${path}.ttasks-migrating`;
			writeFileSync(tmp, result.next);
			renameSync(tmp, path);

			// Re-read from disk and confirm; restore on any doubt.
			const again = processFile(path);
			if (again.kind !== 'skip' || again.reason !== 'already-migrated') {
				copyFileSync(backupPath, path);
				stats.migrated--;
				stats.failed++;
				stats.failedFiles.push(`${rel}: post-write check failed; restored from backup`);
			}
		}
	}
	if (APPLY && stats.migrated > 0) console.log(`Backups: ${backupBase}`);
}

// ── Report ───────────────────────────────────────────────────────────────────

const top = (obj) => Object.entries(obj).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ×${n}`).join(', ') || '—';
const line = (label, value) => console.log(`  ${label.padEnd(26)}${value}`);

console.log(`\n${APPLY ? 'APPLIED' : 'DRY RUN (nothing written — pass --apply to migrate)'}`);
line('notes scanned', stats.scanned);
line(APPLY ? 'migrated' : 'would migrate', stats.migrated);
line('already migrated', stats.alreadyMigrated);
line('not task notes', stats.notTasks);
line('keys renamed', stats.renamed);
line('blank keys removed', `${Object.values(stats.blanksDropped).reduce((a, b) => a + b, 0)}  (${top(stats.blanksDropped)})`);
line('blocks removed', stats.derivedDropped);
line('recurrence converted', top(stats.converted));
line('orphan recurrence dropped', stats.orphanRecurrence);
line('foreign properties kept', top(stats.foreign));
if (stats.warnings.length) { console.log('\nWarnings:'); stats.warnings.forEach((w) => console.log(`  ${w}`)); }
if (stats.conflictFiles.length) { console.log('\nSkipped (both old and new keys — fix by hand):'); stats.conflictFiles.forEach((f) => console.log(`  ${f}`)); }
if (stats.failedFiles.length) { console.log('\nSkipped / failed:'); stats.failedFiles.forEach((f) => console.log(`  ${f}`)); }

process.exit(stats.failed > 0 || stats.conflicts > 0 || stats.unparseable > 0 ? 2 : 0);
