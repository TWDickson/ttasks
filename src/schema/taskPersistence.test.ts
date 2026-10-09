import { describe, expect, it } from 'vitest';
import { TASK_PERSISTENCE, UPDATABLE_TASK_FIELDS, createTimeFrontmatterKeys } from './taskPersistence';
import { buildTaskFrontmatter } from '../store/TaskWriter';
import { TASK_FIELD_DEFINITIONS } from './taskFields';
import type { Task } from '../types';

function makeTask(overrides: Partial<Task> = {}): Task {
	return {
		id: 'abc123', slug: 'test-task', path: 'Tasks/abc123-test-task.md',
		type: 'task', name: 'Test Task', area: null, status: 'Active', priority: 'None',
		labels: [], parent_task: null, depends_on: [], blocks: [], blocked_reason: '',
		assigned_to: '', source: '', start_date: null, due_date: null, due_time: null,
		estimated_days: null, workweek_only: false, holiday_dates: [], created: '2026-05-20',
		completed: null, notes: '', recurrence: null, recurrence_type: null,
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
			.filter((name) => TASK_PERSISTENCE[name as keyof Task]?.fmKey == null && name !== 'notes');
		expect(unstored).toEqual([]);
	});
});

describe('creation frontmatter vs. the descriptor table', () => {
	const noName = () => null;

	it('emits exactly the keys the table says it will, for a recurring task', () => {
		const fm = buildTaskFrontmatter(makeTask({ recurrence: 'weekly', due_date: '2026-05-25' }), noName);
		expect(keysOf(fm).filter((k) => k !== 'cssclasses').sort()).toEqual([...createTimeFrontmatterKeys()].sort());
	});

	it('omits only the when-set keys for a non-recurring task', () => {
		const fm = buildTaskFrontmatter(makeTask(), noName);
		const expected = Object.values(TASK_PERSISTENCE)
			.filter((p) => p.fmKey !== null && p.onCreate === 'always')
			.map((p) => p.fmKey as string);
		expect(keysOf(fm).filter((k) => k !== 'cssclasses').sort()).toEqual(expected.sort());
	});
});
