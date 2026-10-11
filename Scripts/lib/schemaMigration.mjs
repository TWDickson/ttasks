/**
 * Pure planning for the `ttask_*` schema migration (MD-1 / MD-2 / MD-3 / RP).
 *
 * `planMigration(frontmatter)` takes one note's *parsed* frontmatter and returns
 * what to do to it — no I/O, no YAML. The CLI (`migrate-prefixed-schema.mjs`)
 * applies a plan to the real YAML document so comments, quoting and key order
 * survive; the tests and the dry-run tooling exercise this module directly.
 *
 * One-off by design: it is deleted, with the dev-phase migration commands, once
 * the vault has been converted (MD-4). The legacy → new mapping lives *only*
 * here; the plugin itself never reads an old key.
 */

/** Legacy field name → new frontmatter key. `cssclasses` is Obsidian-native and stays. */
export const KEY_MAP = Object.freeze({
	type: 'ttask_type',
	name: 'ttask_name',
	area: 'ttask_area',
	status: 'ttask_status',
	priority: 'ttask_priority',
	labels: 'ttask_labels',
	parent_task: 'ttask_parent_task',
	depends_on: 'ttask_depends_on',
	blocked_reason: 'ttask_blocked_reason',
	assigned_to: 'ttask_assigned_to',
	source: 'ttask_source',
	start_date: 'ttask_start_date',
	due_date: 'ttask_due_date',
	due_time: 'ttask_due_time',
	estimated_days: 'ttask_estimated_days',
	workweek_only: 'ttask_workweek_only',
	holiday_dates: 'ttask_holiday_dates',
	created: 'ttask_created',
	completed: 'ttask_completed',
	status_changed: 'ttask_status_changed',
	pomodoro_count: 'ttask_pomodoro_count',
	focused_minutes: 'ttask_focused_minutes',
	reminder_override: 'ttask_reminder_override',
	archive_history: 'ttask_archive_history',
});

/** Always written, even when empty (MD-2). Everything else is dropped when blank. */
export const CORE_FIELDS = Object.freeze(['type', 'name', 'status', 'created', 'status_changed']);

/** Reverse index, derived in memory by the plugin (MD-3) — never stored. */
export const DROPPED_ALWAYS = Object.freeze(['blocks']);

/** Replaced by `ttask_repeat_*` (RP). */
export const LEGACY_RECURRENCE_KEYS = Object.freeze(['recurrence', 'recurrence_type', 'recurrence_anchor_day']);

const RECURRENCE_RULES = {
	daily: { every: 1, unit: 'day' },
	weekly: { every: 1, unit: 'week' },
	biweekly: { every: 2, unit: 'week' },
	monthly: { every: 1, unit: 'month' },
	yearly: { every: 1, unit: 'year' },
};

const has = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

/** Would the plugin's reader give this value back for an *absent* key? (MD-2) */
export function isBlank(field, value) {
	if (value === null || value === undefined || value === '') return true;
	if (Array.isArray(value)) return value.length === 0;
	if (field === 'priority') return value === 'None';
	return value === false;
}

/** A note carrying the pre-cutover plugin's keys: a task/project with an unprefixed name. */
export function isLegacyTaskNote(fm) {
	return (fm.type === 'task' || fm.type === 'project') && has(fm, 'name');
}

export function hasPrefixedKeys(fm) {
	return Object.keys(fm).some((k) => k.startsWith('ttask_'));
}

function dayOfMonth(value) {
	const m = typeof value === 'string' ? /^\d{4}-\d{2}-(\d{2})/.exec(value) : null;
	return m ? Number(m[1]) : null;
}

/**
 * Convert the legacy recurrence trio to final-shape repeat keys.
 * Returns `{ keys }` (possibly empty), or `{ unknown: true }` for a rule value we
 * don't recognise — which is left untouched rather than guessed at.
 */
export function convertRecurrence(fm) {
	const rule = fm.recurrence;
	if (rule === null || rule === undefined || rule === '') return { keys: {} };
	const base = typeof rule === 'string' ? RECURRENCE_RULES[rule] : undefined;
	if (!base) return { unknown: true };

	const keys = { ttask_repeat_every: base.every, ttask_repeat_unit: base.unit };
	if (fm.recurrence_type === 'from_completion') {
		keys.ttask_repeat_basis = 'completion';
	} else if (base.unit === 'month' || base.unit === 'year') {
		// Pin the day-of-month so a month-end schedule keeps its day (RP-1): the
		// stored anchor wins, else the day the due date is on — exactly what the
		// old engine derived at completion time.
		const anchor = typeof fm.recurrence_anchor_day === 'number' ? Math.trunc(fm.recurrence_anchor_day) : null;
		const day = anchor !== null && anchor >= 1 && anchor <= 31 ? anchor : dayOfMonth(fm.due_date);
		if (day !== null) keys.ttask_repeat_monthday = day;
	}
	return { keys };
}

/**
 * @returns {{
 *   status: 'migrate' | 'already-migrated' | 'not-a-task' | 'conflict',
 *   ops: Array<
 *     | { op: 'rename'; from: string; to: string }
 *     | { op: 'drop'; key: string; why: 'blank' | 'derived' | 'converted' | 'orphan-recurrence' }
 *     | { op: 'replace'; key: string; with: Record<string, unknown> }
 *   >,
 *   foreignKeys: string[],
 *   warnings: string[],
 * }}
 */
export function planMigration(fm) {
	const none = (status, warnings = []) => ({ status, ops: [], foreignKeys: [], warnings });

	const legacy = isLegacyTaskNote(fm);
	const prefixed = hasPrefixedKeys(fm);
	if (legacy && prefixed) {
		return none('conflict', ['Has both unprefixed and ttask_* keys; fix by hand, then re-run.']);
	}
	if (!legacy) return none(prefixed ? 'already-migrated' : 'not-a-task');

	const ops = [];
	const foreignKeys = [];
	const warnings = [];
	const conversion = convertRecurrence(fm);
	const converted = !conversion.unknown && Object.keys(conversion.keys).length > 0;

	for (const key of Object.keys(fm)) {
		if (key === 'cssclasses') continue;

		if (has(KEY_MAP, key)) {
			if (!CORE_FIELDS.includes(key) && isBlank(key, fm[key])) ops.push({ op: 'drop', key, why: 'blank' });
			else ops.push({ op: 'rename', from: key, to: KEY_MAP[key] });
		} else if (DROPPED_ALWAYS.includes(key)) {
			ops.push({ op: 'drop', key, why: 'derived' });
		} else if (LEGACY_RECURRENCE_KEYS.includes(key)) {
			if (conversion.unknown) {
				if (key === 'recurrence') warnings.push(`Unrecognised recurrence "${String(fm.recurrence)}"; left as-is.`);
				continue; // keep all three untouched
			}
			if (key === 'recurrence' && converted) ops.push({ op: 'replace', key, with: conversion.keys });
			else if (key === 'recurrence') ops.push({ op: 'drop', key, why: 'blank' });
			else ops.push({ op: 'drop', key, why: converted ? 'converted' : 'orphan-recurrence' });
		} else {
			foreignKeys.push(key);
		}
	}

	return { status: 'migrate', ops, foreignKeys, warnings };
}

/**
 * Apply a plan to a plain object (key order preserved). The CLI applies the same
 * plan to the YAML document; this twin exists so the dry run and the tests can
 * show exactly what a note will look like without touching YAML.
 */
export function applyPlanToObject(fm, plan) {
	const out = {};
	const renames = new Map();
	const drops = new Set();
	const replaces = new Map();
	for (const op of plan.ops) {
		if (op.op === 'rename') renames.set(op.from, op.to);
		else if (op.op === 'drop') drops.add(op.key);
		else replaces.set(op.key, op.with);
	}
	for (const [key, value] of Object.entries(fm)) {
		if (drops.has(key)) continue;
		if (replaces.has(key)) Object.assign(out, replaces.get(key));
		else out[renames.get(key) ?? key] = value;
	}
	return out;
}

/**
 * Check a migrated object against its original. Returns problems (empty = good):
 * every surviving value must be unchanged, no mapped legacy key may remain, and
 * the core keys must all be present.
 */
export function verifyMigration(original, migrated, plan) {
	const problems = [];
	const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
	for (const op of plan.ops) {
		if (op.op === 'rename' && !same(original[op.from], migrated[op.to])) {
			problems.push(`${op.from} → ${op.to}: value changed`);
		}
		if (op.op === 'rename' && has(migrated, op.from)) problems.push(`${op.from}: still present`);
		if (op.op === 'drop' && has(migrated, op.key)) problems.push(`${op.key}: should have been removed`);
	}
	for (const field of CORE_FIELDS) {
		if (has(original, field) && !has(migrated, KEY_MAP[field])) problems.push(`${KEY_MAP[field]}: missing`);
	}
	if (has(original, 'cssclasses') && !same(original.cssclasses, migrated.cssclasses)) problems.push('cssclasses: changed');
	return problems;
}
