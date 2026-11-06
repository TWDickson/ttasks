#!/usr/bin/env node
/* Set the recommended ttask_* property types in a vault's .obsidian/types.json
   (MD-5; the README's "Recommended property types" table).

   Close Obsidian everywhere first: it rewrites types.json while it runs.

     node Scripts/set-property-types.mjs "<vault>"                    # look first
     node Scripts/set-property-types.mjs "<vault>" --apply            # write (keeps types.json.bak)
     node Scripts/set-property-types.mjs "<vault>" --apply --prune    # also drop old unprefixed keys

   --prune removes the pre-0.2.1 TTasks names (status, name, type, …). Some of
   those are generic, so only prune if no other notes in the vault use them —
   the dry run lists which ones are present. */

import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** `multitext` is what types.json calls Obsidian's "List" type. */
export const RECOMMENDED = {
	text: [
		'type', 'name', 'area', 'status', 'priority', 'parent_task', 'blocked_reason',
		'assigned_to', 'source', 'due_time', 'reminder_override', 'repeat_of', 'repeat_unit',
		'repeat_monthday', 'repeat_nth_target', 'repeat_basis', 'repeat_roll',
	],
	multitext: ['labels', 'depends_on', 'holiday_dates', 'repeat_weekdays'],
	date: ['created', 'status_changed', 'start_date', 'due_date', 'completed', 'repeat_until'],
	number: [
		'estimated_days', 'pomodoro_count', 'focused_minutes', 'repeat_every', 'repeat_month',
		'repeat_nth', 'repeat_count',
	],
	checkbox: ['workweek_only'],
};

/** Pre-0.2.1 property names (MD-1 prefixed them). */
export const LEGACY = [
	'type', 'name', 'area', 'status', 'priority', 'labels', 'parent_task', 'depends_on', 'blocks',
	'blocked_reason', 'assigned_to', 'source', 'start_date', 'due_date', 'due_time',
	'estimated_days', 'workweek_only', 'holiday_dates', 'created', 'completed', 'status_changed',
	'pomodoro_count', 'focused_minutes', 'reminder_override', 'archive_history', 'recurrence',
	'recurrence_type', 'recurrence_anchor', 'repeat_of',
];

export function recommendedTypes() {
	const out = {};
	for (const [kind, fields] of Object.entries(RECOMMENDED)) {
		for (const field of fields) out[`ttask_${field}`] = kind;
	}
	return out;
}

/** Apply to a parsed types.json; returns the change lines. Mutates `data`. */
export function applyTypes(data, { prune = false } = {}) {
	const types = (data.types ??= {});
	const changes = [];
	for (const [key, kind] of Object.entries(recommendedTypes())) {
		if (types[key] !== kind) {
			changes.push(`  set    ${key}: ${types[key] ?? '(unset)'} -> ${kind}`);
			types[key] = kind;
		}
	}
	for (const key of LEGACY) {
		if (!(key in types)) continue;
		changes.push(`  ${prune ? 'drop ' : 'stale'}  ${key} (${types[key]})`);
		if (prune) delete types[key];
	}
	return changes;
}

function main(args) {
	const vault = args.find((arg) => !arg.startsWith('--'));
	if (!vault) {
		console.error('usage: node Scripts/set-property-types.mjs "<vault>" [--apply] [--prune]');
		process.exit(1);
	}
	const path = join(resolve(vault), '.obsidian', 'types.json');
	if (!existsSync(join(resolve(vault), '.obsidian'))) {
		console.error(`No .obsidian folder in ${resolve(vault)} — is that the vault root?`);
		process.exit(1);
	}
	const apply = args.includes('--apply');
	const data = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : { types: {} };
	const changes = applyTypes(data, { prune: args.includes('--prune') });

	console.log(changes.length ? changes.join('\n') : '  nothing to change');
	if (!apply) {
		console.log('\nDry run. Re-run with --apply to write.');
		return;
	}
	if (existsSync(path)) copyFileSync(path, `${path}.bak`);
	writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
	console.log(`\nWrote ${path} (backup: types.json.bak)`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	main(process.argv.slice(2));
}
