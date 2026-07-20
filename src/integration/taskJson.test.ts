import { describe, expect, it } from 'vitest';
import type { Task } from '../types';
import {
	AI_IMPORT_META,
	TASK_JSON_SCHEMA_VERSION,
	buildTaskJsonDocument,
	serializeTasksToJson,
} from './taskJsonExport';
import { parseTasksJson } from './taskJsonImport';
import { IMPORT_UPDATABLE_FIELDS } from './taskImportPlan';

function makeTask(overrides: Partial<Task> = {}): Task {
	return {
		id: '0a1b2c',
		slug: 'task',
		path: 'Planner/Tasks/0a1b2c-task.md',
		type: 'task',
		name: 'A task',
		area: 'Work',
		status: 'Active',
		priority: 'Medium',
		labels: ['feature'],
		parent_task: null,
		depends_on: [],
		blocks: [],
		blocked_reason: '',
		assigned_to: '',
		source: '',
		start_date: null,
		due_date: null,
		due_time: null,
		estimated_days: null,
		created: '2026-07-01',
		completed: null,
		status_changed: '2026-07-01',
		recurrence: null,
		recurrence_type: null,
		notes: '',
		is_complete: false,
		is_inbox: false,
		...overrides,
	};
}

const AT = '2026-07-19T00:00:00.000Z';

describe('buildTaskJsonDocument — full mode', () => {
	it('wraps tasks with schema metadata and keeps ids/paths/links as paths', () => {
		const parent = makeTask({ id: 'p1', path: 'Planner/Tasks/p1-proj.md', name: 'Project', type: 'project' });
		const child = makeTask({
			id: 'c1',
			path: 'Planner/Tasks/c1-child.md',
			name: 'Child',
			parent_task: 'Planner/Tasks/p1-proj.md',
			depends_on: ['Planner/Tasks/p1-proj.md'],
			blocks: ['Planner/Tasks/x.md'],
		});
		const doc = buildTaskJsonDocument([parent, child], 'full', AT);

		expect(doc.schemaVersion).toBe(TASK_JSON_SCHEMA_VERSION);
		expect(doc.generatedAt).toBe(AT);
		expect(doc.mode).toBe('full');
		expect(doc.taskCount).toBe(2);
		const exportedChild = doc.tasks[1];
		expect(exportedChild.id).toBe('c1');
		expect(exportedChild.path).toBe('Planner/Tasks/c1-child.md');
		expect(exportedChild.parent).toBe('Planner/Tasks/p1-proj.md');
		expect(exportedChild.depends_on).toEqual(['Planner/Tasks/p1-proj.md']);
		expect(exportedChild.blocks).toEqual(['Planner/Tasks/x.md']);
	});
});

describe('buildTaskJsonDocument — ai mode', () => {
	it('flattens links to human names and omits path/id/empty fields', () => {
		const parent = makeTask({ id: 'p1', path: 'Planner/Tasks/p1-proj.md', name: 'Big Project', type: 'project' });
		const child = makeTask({
			path: 'Planner/Tasks/c1-child.md',
			name: 'Design step',
			parent_task: 'Planner/Tasks/p1-proj.md',
			depends_on: ['Planner/Tasks/p1-proj.md'],
			pomodoro_count: 3,
			focused_minutes: 75,
		});
		const doc = buildTaskJsonDocument([parent, child], 'ai', AT);
		const exportedChild = doc.tasks[1] as unknown as Record<string, unknown>;

		expect(exportedChild.parent).toBe('Big Project');
		expect(exportedChild.depends_on).toEqual(['Big Project']);
		// The compact `ref` (= id) is kept for exact round-trip matching; raw id/path dropped.
		expect(exportedChild.ref).toBe(child.id);
		expect('id' in exportedChild).toBe(false);
		expect('path' in exportedChild).toBe(false);
		expect('blocks' in exportedChild).toBe(false);
		// Empty strings pruned, but present real values kept.
		expect('assigned_to' in exportedChild).toBe(false);
		expect(exportedChild.pomodoro_count).toBe(3);
		expect(exportedChild.focused_minutes).toBe(75);
	});

	it('falls back to the basename for links outside the exported set', () => {
		const child = makeTask({ depends_on: ['Planner/Tasks/zzz-external-task.md'] });
		const doc = buildTaskJsonDocument([child], 'ai', AT);
		expect(doc.tasks[0].depends_on).toEqual(['zzz-external-task']);
	});

	it('embeds the paste-back contract as meta (ai mode only)', () => {
		const aiDoc = buildTaskJsonDocument([makeTask()], 'ai', AT);
		expect(aiDoc.meta).toBe(AI_IMPORT_META);
		expect(aiDoc.meta?.actions).toHaveProperty('delete');
		const fullDoc = buildTaskJsonDocument([makeTask()], 'full', AT);
		expect(fullDoc.meta).toBeUndefined();
	});

	it('keeps the meta field list in sync with the real updatable fields', () => {
		expect(AI_IMPORT_META.updatableFields).toEqual([...IMPORT_UPDATABLE_FIELDS]);
	});

	it('embeds this vault\'s configured enum values when supplied', () => {
		const validValues = {
			statuses: ['Active', 'Done'],
			priorities: ['High', 'Low'],
			areas: ['Work', 'Home'],
			labels: ['bug', 'feature'],
		};
		const doc = buildTaskJsonDocument([makeTask()], 'ai', AT, validValues);
		expect(doc.meta?.validValues).toEqual(validValues);
		// Doesn't mutate the shared static meta used when no valid values are given.
		expect(AI_IMPORT_META.validValues).toBeUndefined();
	});
});

describe('serializeTasksToJson', () => {
	it('produces valid pretty JSON', () => {
		const json = serializeTasksToJson([makeTask()], 'ai', AT);
		expect(json).toContain('\n  ');
		expect(() => JSON.parse(json)).not.toThrow();
	});
});

describe('parseTasksJson', () => {
	it('parses a wrapped document', () => {
		const json = serializeTasksToJson([makeTask({ name: 'Hello' })], 'full', AT);
		const result = parseTasksJson(json);
		expect(result.ok).toBe(true);
		expect(result.schemaVersion).toBe(TASK_JSON_SCHEMA_VERSION);
		expect(result.tasks).toHaveLength(1);
		expect(result.tasks[0].name).toBe('Hello');
	});

	it('accepts a bare array of task objects', () => {
		const result = parseTasksJson(JSON.stringify([{ name: 'Bare' }]));
		expect(result.ok).toBe(true);
		expect(result.tasks[0].name).toBe('Bare');
		expect(result.tasks[0].type).toBe('task');
	});

	it('reports invalid JSON as a fatal error', () => {
		const result = parseTasksJson('{ not json');
		expect(result.ok).toBe(false);
		expect(result.errors[0]).toMatch(/Invalid JSON/);
	});

	it('errors when there is no tasks array', () => {
		const result = parseTasksJson(JSON.stringify({ foo: 'bar' }));
		expect(result.ok).toBe(false);
		expect(result.errors.join(' ')).toMatch(/tasks/);
	});

	it('skips entries without a name and non-objects, with warnings', () => {
		const result = parseTasksJson(JSON.stringify({ tasks: [{ name: 'Keep' }, { area: 'Work' }, 42] }));
		expect(result.ok).toBe(true);
		expect(result.tasks).toHaveLength(1);
		expect(result.warnings).toHaveLength(2);
	});

	it('keeps a ref-only entry with no name — the AI meta promises this is enough to target a task', () => {
		const result = parseTasksJson(JSON.stringify({ tasks: [{ ref: '0a1b2c', status: 'Done' }] }));
		expect(result.ok).toBe(true);
		expect(result.tasks).toHaveLength(1);
		expect(result.tasks[0].ref).toBe('0a1b2c');
		expect(result.tasks[0].name).toBe('');
		expect(result.warnings).toHaveLength(0);
	});

	it('warns on a newer schemaVersion but still imports', () => {
		const result = parseTasksJson(JSON.stringify({ schemaVersion: 99, tasks: [{ name: 'Future' }] }));
		expect(result.ok).toBe(true);
		expect(result.tasks).toHaveLength(1);
		expect(result.warnings.join(' ')).toMatch(/newer than supported/);
	});

	it('reads the action key, defaulting to auto', () => {
		const result = parseTasksJson(JSON.stringify({ tasks: [
			{ name: 'Del', action: 'delete' },
			{ name: 'New', action: 'create' },
			{ name: 'Plain' },
			{ name: 'Bogus', action: 'nonsense' },
		] }));
		expect(result.tasks.map((t) => t.action)).toEqual(['delete', 'create', 'auto', 'auto']);
	});

	it('reads ref, falling back to the id field', () => {
		const a = parseTasksJson(JSON.stringify({ tasks: [{ name: 'A', ref: 'r1' }] }));
		const b = parseTasksJson(JSON.stringify({ tasks: [{ name: 'B', id: 'i2' }] }));
		const c = parseTasksJson(JSON.stringify({ tasks: [{ name: 'C' }] }));
		expect(a.tasks[0].ref).toBe('r1');
		expect(b.tasks[0].ref).toBe('i2');
		expect(c.tasks[0].ref).toBeNull();
	});

	it('reads remove_depends_on as a string array', () => {
		const r = parseTasksJson(JSON.stringify({ tasks: [{ name: 'A', remove_depends_on: ['X', 'Y'] }] }));
		expect(r.tasks[0].remove_depends_on).toEqual(['X', 'Y']);
	});

	it('reads remove_parent as a strict boolean', () => {
		const yes = parseTasksJson(JSON.stringify({ tasks: [{ name: 'A', remove_parent: true }] }));
		const no = parseTasksJson(JSON.stringify({ tasks: [{ name: 'B', remove_parent: 'yes' }] }));
		expect(yes.tasks[0].remove_parent).toBe(true);
		expect(no.tasks[0].remove_parent).toBe(false);
	});

	it('accepts both parent and parent_task spellings', () => {
		const a = parseTasksJson(JSON.stringify({ tasks: [{ name: 'A', parent: 'P' }] }));
		const b = parseTasksJson(JSON.stringify({ tasks: [{ name: 'B', parent_task: 'P' }] }));
		expect(a.tasks[0].parent).toBe('P');
		expect(b.tasks[0].parent).toBe('P');
	});
});

describe('round-trip (full export → import)', () => {
	it('preserves core scalar fields through a full-mode round trip', () => {
		const task = makeTask({
			name: 'Round trip',
			area: 'Home',
			status: 'In Progress',
			priority: 'High',
			labels: ['bug', 'research'],
			due_date: '2026-08-01',
			estimated_days: 4,
			notes: 'some notes',
			pomodoro_count: 2,
			focused_minutes: 50,
		});
		const json = serializeTasksToJson([task], 'full', AT);
		const result = parseTasksJson(json);
		const back = result.tasks[0];
		expect(back.name).toBe('Round trip');
		expect(back.area).toBe('Home');
		expect(back.status).toBe('In Progress');
		expect(back.priority).toBe('High');
		expect(back.labels).toEqual(['bug', 'research']);
		expect(back.due_date).toBe('2026-08-01');
		expect(back.estimated_days).toBe(4);
		expect(back.notes).toBe('some notes');
		expect(back.pomodoro_count).toBe(2);
		expect(back.focused_minutes).toBe(50);
	});
});
