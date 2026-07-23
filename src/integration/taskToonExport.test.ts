import { describe, expect, it } from 'vitest';
import { decode as toonDecode } from '@toon-format/toon';
import type { Task } from '../types';
import { buildTaskJsonDocument } from './taskJsonExport';
import {
	TOON_LIST_SEPARATOR,
	TOON_TASK_COLUMNS,
	serializeTasksToToon,
	toToonPayload,
} from './taskToonExport';

const AT = '2026-07-22T10:00:00.000Z';

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
		labels: [],
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
		reminder_override: null,
		...overrides,
	};
}

const docOf = (tasks: Task[]) => buildTaskJsonDocument(tasks, 'ai', AT);

describe('toToonPayload', () => {
	it('gives every row the same columns, in the fixed order', () => {
		const payload = toToonPayload(docOf([
			makeTask(),
			makeTask({ id: 'ffffff', path: 'Planner/Tasks/ffffff-b.md', name: 'B', assigned_to: 'Taylor' }),
		]));

		for (const row of payload.tasks) {
			expect(Object.keys(row)).toEqual([...TOON_TASK_COLUMNS]);
		}
		// A field only one task sets is still a column on the other, as null.
		expect(payload.tasks[0].assigned_to).toBeNull();
		expect(payload.tasks[1].assigned_to).toBe('Taylor');
	});

	it('flattens the two list fields into one cell each', () => {
		const dep = makeTask({ id: 'aaaaaa', path: 'Planner/Tasks/aaaaaa-dep.md', name: 'Dependency' });
		const task = makeTask({ labels: ['feature', 'bug'], depends_on: [dep.path] });
		const payload = toToonPayload(docOf([task, dep]));

		expect(payload.tasks[0].labels).toBe(`feature${TOON_LIST_SEPARATOR}bug`);
		expect(payload.tasks[0].depends_on).toBe('Dependency');
		// Empty lists read as an empty cell, not as "null".
		expect(payload.tasks[1].labels).toBe('');
		expect(payload.tasks[1].depends_on).toBe('');
	});

	it('moves note bodies out of the table into a ref-keyed sidecar', () => {
		const payload = toToonPayload(docOf([
			makeTask({ notes: 'Line one.\n\nLine two.' }),
			makeTask({ id: 'bbbbbb', path: 'Planner/Tasks/bbbbbb-b.md', name: 'No body' }),
		]));

		expect(payload.notes).toEqual({ '0a1b2c': 'Line one.\n\nLine two.' });
		expect(Object.keys(payload.tasks[0])).not.toContain('notes');
	});

	it('omits the notes sidecar entirely when nothing has a body', () => {
		expect(toToonPayload(docOf([makeTask()])).notes).toBeUndefined();
	});

	it('tells the receiving AI how to read the shape and what to reply in', () => {
		const format = String(toToonPayload(docOf([makeTask()])).meta?.format);
		expect(format).toContain('TOON');
		expect(format).toContain(TOON_LIST_SEPARATOR.trim());
		expect(format).toContain('REPLY IN JSON');
	});
});

describe('serializeTasksToToon', () => {
	it('emits the tabular header — the whole reason for the format', () => {
		const toon = serializeTasksToToon([makeTask(), makeTask({ id: 'ffffff', path: 'Planner/Tasks/ffffff-b.md', name: 'B' })], AT);
		expect(toon).toContain(`tasks[2]{${TOON_TASK_COLUMNS.join(',')}}:`);
	});

	it('round-trips back through a TOON decoder', () => {
		const tasks = [
			makeTask({ labels: ['feature'], notes: 'Body with a, comma and "quotes".' }),
			makeTask({ id: 'ffffff', path: 'Planner/Tasks/ffffff-b.md', name: 'Name, with a comma' }),
		];
		const decoded = toonDecode(serializeTasksToToon(tasks, AT)) as { tasks: Array<Record<string, unknown>> };

		expect(decoded.tasks).toHaveLength(2);
		expect(decoded.tasks[0].name).toBe('A task');
		// The escaping is the library's job, but a comma inside a value is exactly
		// what would silently shift every column if it weren't handled.
		expect(decoded.tasks[1].name).toBe('Name, with a comma');
	});

	it('is materially smaller than the JSON it replaces', () => {
		const tasks = Array.from({ length: 40 }, (_, i) =>
			makeTask({
				id: `id${i}`.padEnd(6, '0'),
				path: `Planner/Tasks/task-${i}.md`,
				name: `Task number ${i}`,
				labels: ['feature', 'bug'],
			}),
		);
		const toon = serializeTasksToToon(tasks, AT);
		const json = JSON.stringify(buildTaskJsonDocument(tasks, 'ai', AT), null, 2);
		expect(toon.length).toBeLessThan(json.length * 0.9);
	});

	it('honours the notes policy', () => {
		const tasks = [makeTask({ notes: 'x'.repeat(500) })];
		const dropped = toToonPayload(buildTaskJsonDocument(tasks, 'ai', AT, undefined, 'none'));
		expect(dropped.notes).toBeUndefined();

		const summarized = toToonPayload(buildTaskJsonDocument(tasks, 'ai', AT, undefined, 'summary'));
		expect(summarized.notes?.['0a1b2c']).toMatch(/…$/);
	});

	it('shrinks the payload once the policy has more than one body to work on', () => {
		// Measured across a set, not a single task: a non-full policy adds a fixed
		// ~300-character warning to the meta, which costs more than it saves until
		// there are a few bodies to trim.
		const tasks = Array.from({ length: 20 }, (_, i) =>
			makeTask({ id: `id${i}`.padEnd(6, '0'), path: `Planner/Tasks/t${i}.md`, name: `T${i}`, notes: 'x'.repeat(500) }),
		);
		const full = serializeTasksToToon(tasks, AT, undefined, 'full').length;
		const summary = serializeTasksToToon(tasks, AT, undefined, 'summary').length;
		const none = serializeTasksToToon(tasks, AT, undefined, 'none').length;

		expect(summary).toBeLessThan(full);
		expect(none).toBeLessThan(summary);
	});
});
