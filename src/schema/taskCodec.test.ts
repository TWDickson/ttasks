import { describe, expect, it } from 'vitest';
import { load } from 'js-yaml';
import { readStoredFields, serializeNewTaskFrontmatter, type ReadContext } from './taskCodec';
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

const ctx: ReadContext = {
	statuses: ['Active', 'In Progress', 'Done'],
	initialStatus: 'Active',
	// Mirrors the store's fallback for an unresolved link: the raw path plus `.md`.
	resolveLink: (raw) => {
		const m = /\[\[([^\]|]+)/.exec(String(raw ?? ''));
		return m ? `${m[1]}.md` : null;
	},
};

const noName = () => null;
const body = (fm: string) => load(fm.replace(/^---\n/, '').replace(/\n---$/, '')) as Record<string, unknown>;

describe('serializeNewTaskFrontmatter', () => {
	it('emits keys in table order with cssclasses right after name', () => {
		const keys = Object.keys(body(serializeNewTaskFrontmatter(makeTask(), noName)));
		expect(keys.slice(0, 4)).toEqual(['type', 'name', 'cssclasses', 'area']);
	});

	it('writes a blank reverse index and an incomplete state regardless of the input task', () => {
		const fm = body(serializeNewTaskFrontmatter(makeTask({ blocks: ['x.md'], completed: '2026-06-01' }), noName));
		expect(fm.blocks).toEqual([]);
		expect(fm.completed).toBeNull();
	});

	it('seeds status_changed from created', () => {
		const fm = body(serializeNewTaskFrontmatter(makeTask({ created: '2026-05-20', status_changed: '2030-01-01' }), noName));
		expect(fm.status_changed).toBe('2026-05-20');
	});

	it('emits the anchor key only when the task carries one', () => {
		expect(body(serializeNewTaskFrontmatter(makeTask(), noName))).not.toHaveProperty('recurrence_anchor_day');
		expect(body(serializeNewTaskFrontmatter(makeTask({ recurrence_anchor_day: 31 }), noName))).toHaveProperty('recurrence_anchor_day', 31);
	});
});

describe('write → read round-trip', () => {
	it('recovers every user-set field from a freshly written note', () => {
		const task = makeTask({
			type: 'project', name: 'Ship "it"', area: 'Work', status: 'In Progress', priority: 'High',
			labels: ['feature', 'bug'], parent_task: 'Tasks/p-1', depends_on: ['Tasks/a-1', 'Tasks/b-2'],
			blocked_reason: 'waiting', assigned_to: 'me', source: 'email',
			start_date: '2026-01-02', due_date: '2026-02-03', due_time: '09:30', estimated_days: 2.5,
			workweek_only: true, holiday_dates: ['2026-07-04'],
			recurrence: 'monthly', recurrence_type: 'fixed', recurrence_anchor_day: 31,
		});
		const read = readStoredFields(body(serializeNewTaskFrontmatter(task, noName)), ctx);
		expect(read).toMatchObject({
			type: 'project', name: 'Ship "it"', area: 'Work', status: 'In Progress', priority: 'High',
			labels: ['feature', 'bug'], parent_task: 'Tasks/p-1.md', depends_on: ['Tasks/a-1.md', 'Tasks/b-2.md'],
			blocked_reason: 'waiting', assigned_to: 'me', source: 'email',
			start_date: '2026-01-02', due_date: '2026-02-03', due_time: '09:30', estimated_days: 2.5,
			workweek_only: true, holiday_dates: ['2026-07-04'],
			recurrence: 'monthly', recurrence_type: 'fixed', recurrence_anchor_day: 31,
			created: '2026-05-20', completed: null, status_changed: '2026-05-20', blocks: [],
		});
	});
});

describe('readStoredFields', () => {
	it('falls back for unknown enum values and tolerates a missing key', () => {
		const read = readStoredFields({ type: 'weird', status: 'Nope', priority: 'urgent!' }, ctx);
		expect(read).toMatchObject({ type: 'task', status: 'Active', priority: 'None', labels: [], depends_on: [], estimated_days: null });
	});

	it('accepts a bare scalar where a list is expected', () => {
		const read = readStoredFields({ labels: 'feature', depends_on: '[[Tasks/a-1]]' }, ctx);
		expect(read.labels).toEqual(['feature']);
		expect(read.depends_on).toEqual(['Tasks/a-1.md']);
	});
});
