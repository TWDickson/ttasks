import { describe, expect, it } from 'vitest';
import type { Task } from '../types';
import {
	AI_IMPORT_META,
	NOTES_SUMMARY_LENGTH,
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
		// Value-equal, not identity-equal: the meta is built per export so it can
		// carry a notes-policy warning (see the notesPolicy tests below).
		expect(aiDoc.meta).toEqual(AI_IMPORT_META);
		expect(aiDoc.meta?.actions).toHaveProperty('delete');
		const fullDoc = buildTaskJsonDocument([makeTask()], 'full', AT);
		expect(fullDoc.meta).toBeUndefined();
	});

	// `notes` is importable but isn't a frontmatter field, so it lives in its own
	// plan bucket (see taskImportPlan) rather than IMPORT_UPDATABLE_FIELDS. The
	// meta still has to advertise it, hence the explicit "+ notes" here.
	it('keeps the meta field list in sync with the real updatable fields', () => {
		expect(AI_IMPORT_META.updatableFields).toEqual([...IMPORT_UPDATABLE_FIELDS, 'notes']);
	});

	it('tells the AI that projects exist and how to make one', () => {
		expect(AI_IMPORT_META.projects).toContain('"type": "project"');
		expect(AI_IMPORT_META.actions.create).toContain('"type": "project"');
	});

	// The fact a model most reliably gets wrong: it reads Blocked/Hold as local,
	// so it either calls a stalled task workable or stamps Blocked down the chain.
	it('tells the AI that Blocked/Hold propagate downstream and are derived, not written', () => {
		expect(AI_IMPORT_META.impediments).toMatch(/downstream/i);
		expect(AI_IMPORT_META.impediments).toMatch(/derives/i);
		expect(AI_IMPORT_META.impediments).toMatch(/ONLY on the task/);
	});

	it('tells the AI a ref + name is a retitle, and that a new title without a ref is not', () => {
		expect(AI_IMPORT_META.rename).toMatch(/retitle/i);
		expect(AI_IMPORT_META.updatableFields).toContain('name');
		expect(AI_IMPORT_META.rename).toMatch(/without a ref/i);
	});

	// A model reads "groups tasks rather than being worked directly" as "do not
	// touch", and `rename` used to say "task" throughout — so it declined to
	// retitle projects, which is the entry whose name matters most.
	it('says projects are renameable, in both the rename and projects contracts', () => {
		expect(AI_IMPORT_META.rename).toMatch(/task OR a project/i);
		expect(AI_IMPORT_META.projects).toMatch(/can be renamed/i);
		expect(AI_IMPORT_META.projects).toMatch(/not a restriction/i);
	});

	it('warns that a notes value replaces the whole body, and no longer claims notes are ignored', () => {
		expect(AI_IMPORT_META.notes).toContain('REPLACES');
		expect(AI_IMPORT_META.ignoredOnImport).toEqual(['blocks']);
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

describe('notes policy', () => {
	const long = 'y'.repeat(NOTES_SUMMARY_LENGTH + 50);

	it('sends bodies untouched under the default policy', () => {
		const doc = buildTaskJsonDocument([makeTask({ notes: long })], 'ai', AT);
		expect(doc.tasks[0].notes).toBe(long);
		expect(doc.meta?.notesTruncated).toBeUndefined();
	});

	it('truncates to the summary length and marks the cut', () => {
		const doc = buildTaskJsonDocument([makeTask({ notes: long })], 'ai', AT, undefined, 'summary');
		expect(doc.tasks[0].notes).toBe(`${'y'.repeat(NOTES_SUMMARY_LENGTH)}…`);
	});

	it('leaves a body shorter than the limit alone, with no ellipsis', () => {
		const doc = buildTaskJsonDocument([makeTask({ notes: 'short' })], 'ai', AT, undefined, 'summary');
		expect(doc.tasks[0].notes).toBe('short');
	});

	it('drops bodies entirely under the none policy', () => {
		const doc = buildTaskJsonDocument([makeTask({ notes: long })], 'ai', AT, undefined, 'none');
		expect(doc.tasks[0].notes).toBe('');
	});

	it('applies to a full-mode export too', () => {
		const doc = buildTaskJsonDocument([makeTask({ notes: long })], 'full', AT, undefined, 'none');
		expect(doc.tasks[0].notes).toBe('');
	});

	// A shortened body must never come back as a replacement — it would overwrite
	// the real one with a fragment. The warning has to ride along with the data.
	it('warns the receiving AI not to send truncated bodies back', () => {
		for (const policy of ['summary', 'none'] as const) {
			const meta = buildTaskJsonDocument([makeTask()], 'ai', AT, undefined, policy).meta;
			// …and the default "sending notes replaces the body" contract is
			// replaced, not left to contradict it.
			expect(meta?.notes).toMatch(/Do NOT send "notes" back/i);
			expect(meta?.notes).not.toContain('REPLACES the whole body');
			expect(meta?.notesTruncated).toBeTruthy();
		}
	});

	// The warning belongs to `notes` and the state to `notesTruncated`. They used
	// to both carry the full sentence, so the payload repeated "do not send notes
	// back" three times across two adjacent keys.
	it('states the notes warning once rather than across both notes keys', () => {
		for (const policy of ['summary', 'none'] as const) {
			const meta = buildTaskJsonDocument([makeTask()], 'ai', AT, undefined, policy).meta;
			expect(meta?.notesTruncated).not.toMatch(/do not send/i);
			expect(meta?.notesTruncated).not.toContain(meta?.notes ?? '');
			expect(meta?.notes).not.toContain(meta?.notesTruncated ?? '');
		}
	});

	it('keeps notesTruncated a terse statement of what happened to the bodies', () => {
		const summary = buildTaskJsonDocument([makeTask()], 'ai', AT, undefined, 'summary').meta;
		expect(summary?.notesTruncated).toContain(String(NOTES_SUMMARY_LENGTH));
		const none = buildTaskJsonDocument([makeTask()], 'ai', AT, undefined, 'none').meta;
		expect(none?.notesTruncated).toMatch(/omitted/i);
	});
});

describe('graph framing', () => {
	it('tells the receiving AI the export is a dependency graph', () => {
		const meta = buildTaskJsonDocument([makeTask()], 'ai', AT).meta;
		expect(meta?.graph).toContain('GRAPH');
		expect(meta?.graph).toContain('depends_on');
		expect(meta?.graph).toMatch(/acyclic/i);
	});
});
