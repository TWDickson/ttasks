import { describe, expect, it } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
	CORE_FIELDS, KEY_MAP, applyPlanToObject, isBlank, planMigration, verifyMigration,
} from '../../Scripts/lib/schemaMigration.mjs';
import { EXTRA_FM_KEYS, TASK_PERSISTENCE } from './taskPersistence';
import { readStoredFields } from './taskCodec';
import { REPEAT_KEYS, normalizeRepeat, repeatToFrontmatter } from '../repeat/normalize';
import { ruleFromLegacy } from '../repeat/legacy';
import type { Task } from '../types';

/**
 * The MD-4 script (`Scripts/migrate-prefixed-schema.mjs`) keeps its own legacy →
 * new mapping so it can run with plain Node. These tests tie that mapping to the
 * real schema so the two cannot drift before the vault is converted.
 */

const fm = (extra: Record<string, unknown> = {}) => ({
	type: 'task', name: 'T', cssclasses: ['ttask'], status: 'Active', created: '2026-01-01', status_changed: '2026-01-01', ...extra,
});

describe('KEY_MAP vs. the persistence table', () => {
	// `blocks` is derived (MD-3), `repeat` is converted from the recurrence trio
	// (RP) and `repeat_of` is new (RP-3); none is a plain rename.
	const renamed = (Object.keys(TASK_PERSISTENCE) as (keyof Task)[]).filter(
		(f) => TASK_PERSISTENCE[f].fmKey !== null && f !== 'blocks' && f !== 'repeat' && f !== 'repeat_of',
	);

	it('renames exactly the stored fields, each to ttask_<field>', () => {
		expect(Object.keys(KEY_MAP).filter((k) => k !== 'archive_history').sort()).toEqual([...renamed].sort());
		for (const f of renamed) {
			expect(KEY_MAP[f as keyof typeof KEY_MAP]).toBe(`ttask_${f}`);
			// …and that is the key the plugin actually reads and writes.
			expect(KEY_MAP[f as keyof typeof KEY_MAP]).toBe(TASK_PERSISTENCE[f].fmKey);
		}
		expect(KEY_MAP.archive_history).toBe(EXTRA_FM_KEYS.archiveHistory);
	});

	it('treats as core exactly the fields the table says are always written', () => {
		const always = (Object.keys(TASK_PERSISTENCE) as (keyof Task)[]).filter((f) => TASK_PERSISTENCE[f].onCreate === 'always');
		expect([...CORE_FIELDS].sort()).toEqual([...always].sort());
	});
});

describe('isBlank mirrors the plugin\'s notion of an absent key', () => {
	it.each([[null], [undefined], [''], [[]], [false]])('%j is blank', (v) => expect(isBlank('x', v)).toBe(true));
	it.each([[0], ['a'], [['a']], [true]])('%j is not', (v) => expect(isBlank('x', v)).toBe(false));
	it('priority None is blank, a real priority is not', () => {
		expect(isBlank('priority', 'None')).toBe(true);
		expect(isBlank('priority', 'High')).toBe(false);
		expect(isBlank('area', 'None')).toBe(false);
	});
});

describe('planMigration', () => {
	it('classifies notes', () => {
		expect(planMigration(fm()).status).toBe('migrate');
		expect(planMigration({ ttask_type: 'task', ttask_name: 'x' }).status).toBe('already-migrated');
		expect(planMigration({ title: 'meeting notes' }).status).toBe('not-a-task');
		expect(planMigration(fm({ ttask_name: 'x' })).status).toBe('conflict');
	});

	it('renames values it keeps, leaves foreign keys alone, and reports them', () => {
		const original = fm({ area: 'db', labels: ['bug'], tags: ['x'], 'creation date': '2026-08-23 13:11' });
		const plan = planMigration(original);
		const out = applyPlanToObject(original, plan);
		expect(out).toMatchObject({ ttask_area: 'db', ttask_labels: ['bug'], tags: ['x'], 'creation date': '2026-08-23 13:11', cssclasses: ['ttask'] });
		expect(plan.foreignKeys.sort()).toEqual(['creation date', 'tags']);
		expect(verifyMigration(original, out, plan)).toEqual([]);
	});

	it('drops blank optional keys but always keeps the core five, even empty', () => {
		const original = fm({ status_changed: null, area: null, labels: [], priority: 'None', workweek_only: false, estimated_days: 0 });
		const out = applyPlanToObject(original, planMigration(original));
		expect(out).not.toHaveProperty('ttask_area');
		expect(out).not.toHaveProperty('ttask_labels');
		expect(out).not.toHaveProperty('ttask_priority');
		expect(out).not.toHaveProperty('ttask_workweek_only');
		expect(out).toHaveProperty('ttask_status_changed', null);
		expect(out).toHaveProperty('ttask_estimated_days', 0);
	});

	it('removes the derived blocks key whatever it holds', () => {
		const original = fm({ blocks: ['[[a]]'] });
		expect(applyPlanToObject(original, planMigration(original))).not.toHaveProperty('blocks');
	});

	it('drops an orphan recurrence anchor and a type with no rule', () => {
		const original = fm({ recurrence: null, recurrence_type: 'fixed', recurrence_anchor_day: 1 });
		const out = applyPlanToObject(original, planMigration(original));
		expect(Object.keys(out).filter((k) => k.includes('recurrence') || k.includes('repeat'))).toEqual([]);
	});

	it('leaves an unrecognised recurrence untouched and warns', () => {
		const original = fm({ recurrence: 'fortnightly', recurrence_type: 'fixed' });
		const plan = planMigration(original);
		expect(plan.warnings).toHaveLength(1);
		expect(applyPlanToObject(original, plan)).toMatchObject({ recurrence: 'fortnightly', recurrence_type: 'fixed' });
	});

	it('keeps converted repeat keys at the position of the old recurrence key', () => {
		const original = fm({ area: 'a', due_date: '2026-01-31', recurrence: 'weekly', recurrence_type: 'fixed' });
		const keys = Object.keys(applyPlanToObject(original, planMigration(original)));
		expect(keys.indexOf('ttask_repeat_every')).toBeGreaterThan(keys.indexOf('ttask_due_date'));
		expect(keys.indexOf('ttask_repeat_every')).toBeGreaterThan(keys.indexOf('ttask_area'));
	});
});

describe('recurrence conversion agrees with the repeat engine', () => {
	const rules = ['daily', 'weekly', 'biweekly', 'monthly', 'yearly'];
	const types = ['fixed', 'from_completion', undefined];
	const anchors = [null, undefined, 1, 15, 29, 30, 31];
	const dues = [null, '2026-01-31', '2026-02-28', '2026-03-15'];

	it('produces keys that normalize to the same rule the legacy bridge builds', () => {
		for (const recurrence of rules) for (const recurrence_type of types) for (const recurrence_anchor_day of anchors) for (const due_date of dues) {
			const original = fm({ recurrence, recurrence_type, recurrence_anchor_day, due_date });
			const out = applyPlanToObject(original, planMigration(original));
			const { rule, warning } = normalizeRepeat(out as Record<string, unknown>);
			expect(warning, JSON.stringify(original)).toBeNull();

			// The anchor the old engine would have used at completion time.
			const dueDay = due_date ? Number(due_date.slice(8, 10)) : null;
			const anchor = recurrence_type === 'from_completion' ? null : (recurrence_anchor_day ?? dueDay);
			expect(rule, JSON.stringify(original)).toEqual(ruleFromLegacy(recurrence, recurrence_type, anchor));
		}
	});

	it('uses the engine\'s own key names and writes them sparsely', () => {
		const original = fm({ recurrence: 'weekly', recurrence_type: 'fixed' });
		const out = applyPlanToObject(original, planMigration(original));
		expect(out).toMatchObject(repeatToFrontmatter({ every: 1, unit: 'week' }));
		expect(Object.keys(out).filter((k) => k.startsWith('ttask_repeat_')).sort())
			.toEqual([REPEAT_KEYS.every, REPEAT_KEYS.unit].sort());
	});
});

describe('a migrated note reads back through the plugin\'s own codec', () => {
	const ctx = {
		statuses: ['Active', 'Hold', 'Completed'],
		initialStatus: 'Active',
		resolveLink: (raw: unknown) => {
			const m = /\[\[([^\]|]+)/.exec(String(raw ?? ''));
			return m ? `${m[1]}.md` : null;
		},
	};

	it('every value the old note carried is what the plugin now reads', () => {
		const legacy = {
			type: 'project', name: 'Ship it', cssclasses: ['ttask'], area: 'database', status: 'Hold', priority: 'High',
			labels: ['feature'], parent_task: '[[p-1|P]]', depends_on: ['[[a-1|A]]'], blocks: ['[[z-9|Z]]'],
			blocked_reason: 'waiting', assigned_to: 'me', source: 'email', start_date: '2026-01-02', due_date: '2026-01-31',
			due_time: '09:30', estimated_days: 0, workweek_only: true, holiday_dates: ['2026-07-04'],
			created: '2026-01-01', completed: null, status_changed: '2026-01-05',
			recurrence: 'monthly', recurrence_type: 'fixed', recurrence_anchor_day: 31,
			pomodoro_count: 3, focused_minutes: 75, reminder_override: 'urgent', 'creation date': 'x',
		};
		const read = readStoredFields(applyPlanToObject(legacy, planMigration(legacy)) as Record<string, unknown>, ctx);
		expect(read).toEqual({
			type: 'project', name: 'Ship it', area: 'database', status: 'Hold', priority: 'High',
			labels: ['feature'], parent_task: 'p-1.md', depends_on: ['a-1.md'],
			blocked_reason: 'waiting', assigned_to: 'me', source: 'email', start_date: '2026-01-02', due_date: '2026-01-31',
			due_time: '09:30', estimated_days: 0, workweek_only: true, holiday_dates: ['2026-07-04'],
			created: '2026-01-01', completed: null, status_changed: '2026-01-05',
			repeat: { every: 1, unit: 'month', monthday: 31 }, repeat_warning: null, repeat_of: null,
			pomodoro_count: 3, focused_minutes: 75, reminder_override: 'urgent',
		});
	});

	it('a sparse note reads back as the blank task', () => {
		const legacy = { type: 'task', name: 'Bare', status: 'Active', created: '2026-01-01', status_changed: '2026-01-01',
			area: null, labels: [], priority: 'None', recurrence: null, recurrence_type: null, recurrence_anchor_day: 1, blocks: [] };
		const migrated = applyPlanToObject(legacy, planMigration(legacy));
		expect(Object.keys(migrated)).toEqual(['ttask_type', 'ttask_name', 'ttask_status', 'ttask_created', 'ttask_status_changed']);
		expect(readStoredFields(migrated as Record<string, unknown>, ctx)).toMatchObject({ area: null, labels: [], priority: 'None', repeat: null });
	});
});

describe('the CLI', () => {
	const script = resolve(process.cwd(), 'Scripts/migrate-prefixed-schema.mjs');
	const run = (...args: string[]) => spawnSync('node', [script, ...args], { encoding: 'utf8' });

	function fixture(): { root: string; tasks: string } {
		const root = mkdtempSync(join(tmpdir(), 'ttasks-mig-'));
		const tasks = join(root, 'Tasks');
		mkdirSync(join(tasks, 'sub'), { recursive: true });
		writeFileSync(join(tasks, 'a.md'), [
			'---', 'type: task', 'name: "A"', 'cssclasses: [ttask]', 'status: Active', 'priority: None', 'blocks: []',
			'tags: [keep]', 'recurrence: monthly', 'recurrence_type: fixed', 'recurrence_anchor_day: 31', "due_date: '2026-01-31'",
			'created: "2026-01-01"', 'status_changed: "2026-01-01" # note', '---', '', 'Body', '', '---', 'more', '',
		].join('\n'));
		writeFileSync(join(tasks, 'sub', 'b.md'), '---\r\ntype: project\r\nname: B\r\nstatus: Active\r\n---\r\nbody\r\n');
		writeFileSync(join(tasks, 'plain.md'), '# no frontmatter\n');
		return { root, tasks };
	}

	it('a dry run changes nothing', () => {
		const { root, tasks } = fixture();
		try {
			const before = readFileSync(join(tasks, 'a.md'), 'utf8');
			const res = run(tasks);
			expect(res.status).toBe(0);
			expect(res.stdout).toContain('DRY RUN');
			expect(res.stdout).toContain('would migrate');
			expect(readFileSync(join(tasks, 'a.md'), 'utf8')).toBe(before);
			expect(readdirSync(root)).toEqual(['Tasks']); // no backup folder either
		} finally { rmSync(root, { recursive: true, force: true }); }
	});

	it('--apply rewrites, backs up, preserves the rest, and is idempotent', () => {
		const { root, tasks } = fixture();
		try {
			const original = readFileSync(join(tasks, 'a.md'), 'utf8');
			expect(run(tasks, '--apply').status).toBe(0);

			const migrated = readFileSync(join(tasks, 'a.md'), 'utf8');
			expect(migrated).toContain('ttask_type: task');
			expect(migrated).toContain('ttask_repeat_monthday: 31');
			expect(migrated).toContain('tags: [keep]');
			expect(migrated).toContain('cssclasses: [ttask]');
			expect(migrated).toContain('# note');
			expect(migrated).not.toMatch(/^blocks:|^recurrence|^priority:/m);
			expect(migrated.endsWith('Body\n\n---\nmore\n')).toBe(true);
			expect(readFileSync(join(tasks, 'sub', 'b.md'), 'utf8')).toContain('\r\nttask_name: B\r\n');
			expect(readFileSync(join(tasks, 'plain.md'), 'utf8')).toBe('# no frontmatter\n');

			const backups = join(root, '.ttasks-migration-backup');
			const [stamp] = readdirSync(backups);
			expect(readFileSync(join(backups, stamp!, 'Tasks', 'a.md'), 'utf8')).toBe(original);

			const again = run(tasks, '--apply');
			expect(again.status).toBe(0);
			expect(again.stdout).toMatch(/migrated\s+0/);
			expect(readFileSync(join(tasks, 'a.md'), 'utf8')).toBe(migrated);
		} finally { rmSync(root, { recursive: true, force: true }); }
	});

	it('migrates the shapes found in a real vault, byte for byte', () => {
		// Obsidian writes blank values as a bare `key:`; archive_history is a list of
		// maps; a pomodoro count of 0 is a value, not a blank.
		const { root, tasks } = fixture();
		try {
			const input = [
				'---', 'type: task', 'name: Task with history', 'cssclasses:', '  - ttask', 'status: Hold', 'priority: High',
				'parent_task: "[[b3c7e1-incremental-scd|Incremental]]"', 'depends_on:', '  - "[[a|A]]"', 'blocks:', '  - "[[b|B]]"',
				'blocked_reason: Blocked pending refactor.', 'due_date:', 'estimated_days: 5', "created: '2026-06-26'", 'completed:',
				"status_changed: '2026-08-21'", 'recurrence:', 'recurrence_type:', 'archive_history:', '  - action: archived',
				'    date: 2026-07-14T17:36:50.785Z', '    reason: manual', 'recurrence_anchor_day:', 'pomodoro_count: 0', '---', 'Notes', '',
			].join('\n');
			const expected = [
				'---', 'ttask_type: task', 'ttask_name: Task with history', 'cssclasses:', '  - ttask', 'ttask_status: Hold',
				'ttask_priority: High', 'ttask_parent_task: "[[b3c7e1-incremental-scd|Incremental]]"', 'ttask_depends_on:', '  - "[[a|A]]"',
				'ttask_blocked_reason: Blocked pending refactor.', 'ttask_estimated_days: 5', "ttask_created: '2026-06-26'",
				"ttask_status_changed: '2026-08-21'", 'ttask_archive_history:', '  - action: archived',
				'    date: 2026-07-14T17:36:50.785Z', '    reason: manual', 'ttask_pomodoro_count: 0', '---', 'Notes', '',
			].join('\n');
			writeFileSync(join(tasks, 'history.md'), input);
			expect(run(tasks, '--apply').status).toBe(0);
			expect(readFileSync(join(tasks, 'history.md'), 'utf8')).toBe(expected);
		} finally { rmSync(root, { recursive: true, force: true }); }
	});

	it('exits non-zero and skips a note with both old and new keys', () => {
		const { root, tasks } = fixture();
		try {
			const conflicted = '---\ntype: task\nname: X\nttask_name: X\n---\n';
			writeFileSync(join(tasks, 'conflict.md'), conflicted);
			const res = run(tasks, '--apply');
			expect(res.status).toBe(2);
			expect(res.stdout).toContain('conflict.md');
			expect(readFileSync(join(tasks, 'conflict.md'), 'utf8')).toBe(conflicted);
		} finally { rmSync(root, { recursive: true, force: true }); }
	});

	it('prints usage and exits 1 without a folder', () => {
		expect(execFileSync('node', [script, '--help'], { encoding: 'utf8' })).toContain('Usage');
		expect(run().status).toBe(1);
	});
});
