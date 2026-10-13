import { describe, expect, it } from 'vitest';
import { load } from 'js-yaml';
import { readStoredFields, serializeNewTaskFrontmatter, writeStoredField, type ReadContext } from './taskCodec';
import type { Task } from '../types';
import { toStoredFrontmatter } from './taskPersistence';

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
		const keys = Object.keys(body(serializeNewTaskFrontmatter(makeTask({ area: 'Work' }), noName)));
		expect(keys.slice(0, 4)).toEqual(['ttask_type', 'ttask_name', 'cssclasses', 'ttask_area']);
	});

	it('is sparse: a bare task carries only the always-written keys', () => {
		const keys = Object.keys(body(serializeNewTaskFrontmatter(makeTask(), noName)));
		expect(keys).toEqual(['ttask_type', 'ttask_name', 'cssclasses', 'ttask_status', 'ttask_created', 'ttask_status_changed']);
	});

	it('a task is born incomplete with no dependents, whatever the input says', () => {
		const fm = body(serializeNewTaskFrontmatter(makeTask({ blocks: ['x.md'], completed: '2026-06-01' }), noName));
		expect(fm).not.toHaveProperty('blocks');
		expect(fm).not.toHaveProperty('ttask_blocks');
		expect(fm).not.toHaveProperty('ttask_completed');
	});

	it('omits the neutral priority but keeps a real one', () => {
		expect(body(serializeNewTaskFrontmatter(makeTask({ priority: 'None' }), noName))).not.toHaveProperty('ttask_priority');
		expect(body(serializeNewTaskFrontmatter(makeTask({ priority: 'High' }), noName))).toHaveProperty('ttask_priority', 'High');
	});

	it('seeds status_changed from created', () => {
		const fm = body(serializeNewTaskFrontmatter(makeTask({ created: '2026-05-20', status_changed: '2030-01-01' }), noName));
		expect(fm.ttask_status_changed).toBe('2026-05-20');
	});

	it('emits repeat keys only when the task repeats', () => {
		expect(Object.keys(body(serializeNewTaskFrontmatter(makeTask(), noName))).some((k) => k.startsWith('ttask_repeat_'))).toBe(false);
		expect(body(serializeNewTaskFrontmatter(makeTask({ repeat: { every: 1, unit: 'month', monthday: 31 } }), noName)))
			.toMatchObject({ ttask_repeat_every: 1, ttask_repeat_unit: 'month', ttask_repeat_monthday: 31 });
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
			repeat: { every: 2, unit: 'week', weekdays: ['mon', 'wed'], basis: 'completion', until: '2026-12-31', count: 4 },
			repeat_of: 'Tasks/prev-1',
		});
		const read = readStoredFields(body(serializeNewTaskFrontmatter(task, noName)), ctx);
		expect(read).toMatchObject({
			type: 'project', name: 'Ship "it"', area: 'Work', status: 'In Progress', priority: 'High',
			labels: ['feature', 'bug'], parent_task: 'Tasks/p-1.md', depends_on: ['Tasks/a-1.md', 'Tasks/b-2.md'],
			blocked_reason: 'waiting', assigned_to: 'me', source: 'email',
			start_date: '2026-01-02', due_date: '2026-02-03', due_time: '09:30', estimated_days: 2.5,
			workweek_only: true, holiday_dates: ['2026-07-04'],
			repeat: { every: 2, unit: 'week', weekdays: ['mon', 'wed'], basis: 'completion', until: '2026-12-31', count: 4 },
			repeat_warning: null,
			repeat_of: 'Tasks/prev-1.md',
			created: '2026-05-20', completed: null, status_changed: '2026-05-20',
		});
	});
});

describe('writeStoredField', () => {
	it('removes the key when the value is blank, sets it otherwise', () => {
		const fm = toStoredFrontmatter({ due_date: '2026-01-01', labels: ['a'], priority: 'High', workweek_only: true });
		writeStoredField(fm, 'due_date', null);
		writeStoredField(fm, 'labels', []);
		writeStoredField(fm, 'priority', 'None');
		writeStoredField(fm, 'workweek_only', false);
		expect(fm).toEqual({});
		writeStoredField(fm, 'due_date', '2026-02-02');
		writeStoredField(fm, 'priority', 'Low');
		expect(fm).toEqual(toStoredFrontmatter({ due_date: '2026-02-02', priority: 'Low' }));
	});

	it('keeps an always-written key, taking null instead of vanishing', () => {
		const fm = toStoredFrontmatter({ status_changed: '2026-01-01' });
		writeStoredField(fm, 'status_changed', null);
		expect(fm).toEqual(toStoredFrontmatter({ status_changed: null }));
	});

	it('treats zero as a value, not blank', () => {
		const fm: Record<string, unknown> = {};
		writeStoredField(fm, 'estimated_days', 0);
		expect(fm).toEqual(toStoredFrontmatter({ estimated_days: 0 }));
	});
});

describe('sparse notes read back as the blank task', () => {
	it('a note with only the core keys decodes to every default', () => {
		const read = readStoredFields(toStoredFrontmatter({ type: 'task', name: 'Bare', status: 'Active', created: '2026-05-20', status_changed: '2026-05-20' }), ctx);
		expect(read).toMatchObject({
			area: null, priority: 'None', labels: [], parent_task: null, depends_on: [],
			blocked_reason: '', assigned_to: '', source: '', start_date: null, due_date: null, due_time: null,
			estimated_days: null, workweek_only: false, holiday_dates: [], completed: null,
			repeat: null, repeat_warning: null,
		});
	});
});

describe('readStoredFields', () => {
	it('falls back for unknown enum values and tolerates a missing key', () => {
		const read = readStoredFields(toStoredFrontmatter({ type: 'weird', status: 'Nope', priority: 'urgent!' }), ctx);
		expect(read).toMatchObject({ type: 'task', status: 'Active', priority: 'None', labels: [], depends_on: [], estimated_days: null });
	});

	it('accepts a bare scalar where a list is expected', () => {
		const read = readStoredFields(toStoredFrontmatter({ labels: 'feature', depends_on: '[[Tasks/a-1]]' }), ctx);
		expect(read.labels).toEqual(['feature']);
		expect(read.depends_on).toEqual(['Tasks/a-1.md']);
	});
});
