import { describe, expect, it } from 'vitest';
import type { Task } from '../types';
import { buildTaskJsonDocument, type TaskJsonMode } from './taskJsonExport';
import { parseTasksJson } from './taskJsonImport';
import { AI_UPDATABLE_FIELDS, IMPORT_UPDATABLE_FIELDS, TASK_JSON_CONTRACT, type JsonFieldContract } from './taskJsonContract';

// Every field populated with a non-blank value, so 'ai' mode (which prunes
// blanks) emits everything it can.
const FULL_TASK: Task = {
	id: '0a1b2c', slug: 'task', path: 'Tasks/0a1b2c-task.md', type: 'task', name: 'A task',
	area: 'Work', status: 'Active', priority: 'High', labels: ['bug'],
	parent_task: 'Tasks/ffffff-project.md', depends_on: ['Tasks/eeeeee-dep.md'], blocks: ['Tasks/dddddd-next.md'],
	blocked_reason: 'vendor', assigned_to: 'me', source: 'email',
	start_date: '2026-07-01', due_date: '2026-07-10', due_time: '09:00', estimated_days: 2,
	workweek_only: true, holiday_dates: ['2026-07-04'],
	created: '2026-06-01', completed: '2026-07-09', status_changed: '2026-07-09',
	pomodoro_count: 3, focused_minutes: 75,
	repeat: { every: 1, unit: 'week' }, repeat_warning: null,
	notes: 'Body', reminder_override: 'urgent', repeat_of: 'Tasks/cccccc-prev.md',
	is_complete: true, is_inbox: false,
};

/** Keys the 'ai' export adds that come from the derived graph state, not a Task field. */
const DERIVED_KEYS = ['impeded', 'impeded_by', 'in_cycle', 'scheduled_start', 'scheduled_end'];

const contracts = Object.entries(TASK_JSON_CONTRACT) as [keyof Task, JsonFieldContract][];

describe('TASK_JSON_CONTRACT vs. the exporter', () => {
	for (const mode of ['full', 'ai'] as TaskJsonMode[]) {
		const emitted = Object.keys(buildTaskJsonDocument([FULL_TASK], mode, '2026-07-10T00:00:00Z').tasks[0]);

		it(`emits every field the table carries in '${mode}' mode`, () => {
			const missing = contracts
				.filter(([, c]) => c.export.includes(mode))
				.filter(([, c]) => !c.keys.some((key) => emitted.includes(key)))
				.map(([field]) => field);
			expect(missing).toEqual([]);
		});

		it(`emits nothing in '${mode}' mode the table doesn't account for`, () => {
			const known = new Set(contracts.filter(([, c]) => c.export.includes(mode)).flatMap(([, c]) => c.keys));
			expect(emitted.filter((key) => !known.has(key) && !DERIVED_KEYS.includes(key))).toEqual([]);
		});
	}
});

describe('TASK_JSON_CONTRACT vs. the parser', () => {
	it('reads every key an import uses', () => {
		const [record] = parseTasksJson(JSON.stringify({ tasks: [{ name: 'x' }] })).tasks;
		// `id` is accepted as an alias and normalised to `ref`.
		const unread = contracts
			.filter(([, c]) => c.import !== false)
			.flatMap(([, c]) => c.keys)
			.filter((key) => key !== 'id' && !(key in record));
		expect(unread).toEqual([]);
	});
});

describe('derived import lists', () => {
	it('keeps the whitelist in its long-standing order', () => {
		expect(IMPORT_UPDATABLE_FIELDS).toEqual([
			'name', 'status', 'priority', 'area', 'labels',
			'blocked_reason', 'assigned_to', 'source',
			'start_date', 'due_date', 'due_time', 'estimated_days', 'completed',
			'recurrence', 'recurrence_type', 'pomodoro_count', 'focused_minutes',
		]);
	});

	it('never lets an identity, link or derived field through as a field change', () => {
		for (const key of ['id', 'ref', 'type', 'path', 'parent', 'depends_on', 'blocks', 'notes', 'created']) {
			expect(IMPORT_UPDATABLE_FIELDS).not.toContain(key);
		}
	});

	it('advertises the note body to the AI on top of the field changes', () => {
		expect(AI_UPDATABLE_FIELDS).toEqual([...IMPORT_UPDATABLE_FIELDS, 'notes']);
	});
});
