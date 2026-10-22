import { describe, expect, it } from 'vitest';
import { PERSISTENCE_ENTRIES, TASK_PERSISTENCE, UPDATABLE_TASK_FIELDS } from './taskPersistence';

/** Frontmatter keys `buildTaskFrontmatter` can emit for a field, in table order. */
function createTimeFrontmatterKeys(): string[] {
	return PERSISTENCE_ENTRIES.flatMap(([, p]) => (p.fmKey !== null && p.onCreate !== false ? [p.fmKey] : []));
}
import { buildTaskFrontmatter } from '../store/TaskWriter';
import { TASK_FIELD_DEFINITIONS } from './taskFields';
import type { Task } from '../types';
import { REPEAT_KEYS } from '../repeat/normalize';

function makeTask(overrides: Partial<Task> = {}): Task {
	return {
		id: 'abc123', slug: 'test-task', path: 'Tasks/abc123-test-task.md',
		type: 'task', name: 'Test Task', area: null, status: 'Active', priority: 'None',
		labels: [], parent_task: null, depends_on: [], blocks: [], blocked_reason: '',
		assigned_to: '', source: '', start_date: null, due_date: null, due_time: null,
		estimated_days: null, workweek_only: false, holiday_dates: [], created: '2026-05-20',
		completed: null, notes: '', repeat: null,
		is_complete: false, is_inbox: true, status_changed: null,
		...overrides,
	};
}

/** Top-level keys of a frontmatter block, in order. */
function keysOf(fm: string): string[] {
	return fm.split('\n').flatMap((line) => {
		const match = /^([A-Za-z_][\w]*):/.exec(line);
		return match ? [match[1]] : [];
	});
}

describe('TASK_PERSISTENCE', () => {
	it('uses a distinct frontmatter key per stored field', () => {
		const keys = Object.values(TASK_PERSISTENCE).flatMap((p) => (p.fmKey ? [p.fmKey] : []));
		expect(new Set(keys).size).toBe(keys.length);
	});

	it('never lets an unstored field be updatable or written on create', () => {
		for (const [field, p] of Object.entries(TASK_PERSISTENCE)) {
			if (p.fmKey === null) {
				expect(p.updatable, field).toBe(false);
				expect(p.onCreate, field).toBe(false);
			}
		}
	});

	it('keeps update() off the relationship and identity fields', () => {
		for (const field of ['id', 'path', 'type', 'parent_task', 'depends_on', 'blocks', 'created', 'status_changed'] as const) {
			expect(UPDATABLE_TASK_FIELDS).not.toContain(field);
		}
	});
});

describe('UI field definitions vs. the descriptor table', () => {
	it('only describes fields that are stored in frontmatter', () => {
		const unstored = TASK_FIELD_DEFINITIONS
			.map((def) => def.name)
			// `blocks` is shown read-only but derived (MD-3); `notes` is the note body.
			.filter((name) => TASK_PERSISTENCE[name as keyof Task]?.fmKey == null && name !== 'notes' && name !== 'blocks');
		expect(unstored).toEqual([]);
	});
});

describe('creation frontmatter vs. the descriptor table', () => {
	const noName = () => null;

	it('emits exactly the keys the table says it will, for a fully populated task', () => {
		const fm = buildTaskFrontmatter(makeTask({
			area: 'Work', priority: 'High', labels: ['bug'], parent_task: 'Tasks/p-1.md', depends_on: ['Tasks/a-1.md'],
			blocked_reason: 'x', assigned_to: 'me', source: 'src', start_date: '2026-05-01', due_date: '2026-05-25',
			due_time: '09:00', estimated_days: 2, workweek_only: true, holiday_dates: ['2026-07-04'],
			repeat: { every: 1, unit: 'week' }, repeat_of: 'Tasks/prev.md',
		}), noName);
		// The repeat group writes only the keys its rule needs; count the main one.
		const present = new Set(keysOf(fm).filter((k) => !(Object.values(REPEAT_KEYS) as string[]).includes(k) || k === REPEAT_KEYS.every));
		// `completed` is seeded blank, so even a full task omits it.
		const expected = createTimeFrontmatterKeys().filter((k) => k !== TASK_PERSISTENCE.completed.fmKey);
		expect([...present].filter((k) => k !== 'cssclasses').sort()).toEqual(expected.sort());
	});

	it('writes only the always-keys for a bare task (sparse)', () => {
		const fm = buildTaskFrontmatter(makeTask(), noName);
		const expected = Object.values(TASK_PERSISTENCE)
			.filter((p) => p.fmKey !== null && p.onCreate === 'always')
			.map((p) => p.fmKey as string);
		expect(keysOf(fm).filter((k) => k !== 'cssclasses').sort()).toEqual(expected.sort());
	});
});
