import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get, writable } from 'svelte/store';
import { createTaskQuery } from './useTaskQuery';
import type { Task } from '../types';
import type { QuerySpec } from './types';

// ── Fixture ───────────────────────────────────────────────────────────────────

function makeTask(overrides: Partial<Task> = {}): Task {
	return {
		id: 'abc123',
		slug: 'task',
		path: 'Tasks/abc123-task.md',
		type: 'task',
		name: 'Default task',
		area: 'engineering',
		status: 'Active',
		priority: 'None',
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
		created: '2026-04-01',
		completed: null,
		recurrence: null,
		recurrence_type: null,
		notes: '',
		is_complete: false,
		is_inbox: false,
		status_changed: null,
		...overrides,
	};
}

const BASE_QUERY: QuerySpec = {
	filter: { logic: 'and', conditions: [] },
	sort: [],
	group: { kind: 'none' },
};

beforeEach(() => {
	vi.useRealTimers();
});

afterEach(() => {
	vi.useRealTimers();
});

// ── createTaskQuery ───────────────────────────────────────────────────────────

describe('createTaskQuery', () => {
	it('returns all tasks when filter is empty', () => {
		const tasks = writable([makeTask({ name: 'A' }), makeTask({ name: 'B' })]);
		const { result } = createTaskQuery(tasks, BASE_QUERY);
		const groups = get(result);
		expect(groups).toHaveLength(1); // kind: none → single 'all' group
		expect(groups[0].tasks).toHaveLength(2);
	});

	it('updates reactively when tasks change', () => {
		const tasks = writable([makeTask({ name: 'A' })]);
		const { result } = createTaskQuery(tasks, BASE_QUERY);

		expect(get(result)[0].tasks).toHaveLength(1);

		tasks.update(ts => [...ts, makeTask({ name: 'B' })]);
		expect(get(result)[0].tasks).toHaveLength(2);
	});

	it('updates reactively when query changes', () => {
		const tasks = writable([
			makeTask({ area: 'engineering' }),
			makeTask({ area: 'general' }),
		]);
		const { result, query } = createTaskQuery(tasks, BASE_QUERY);

		expect(get(result)[0].tasks).toHaveLength(2);

		query.update(q => ({
			...q,
			filter: { logic: 'and', conditions: [{ field: 'area', operator: 'is', value: 'engineering' }] },
		}));

		expect(get(result)[0].tasks).toHaveLength(1);
		expect(get(result)[0].tasks[0].area).toBe('engineering');
	});

	it('applies search reactively', () => {
		const tasks = writable([makeTask({ name: 'Fix auth bug' }), makeTask({ name: 'Write docs' })]);
		const { result, query } = createTaskQuery(tasks, BASE_QUERY);

		query.update(q => ({ ...q, search: 'auth' }));
		expect(get(result)[0].tasks).toHaveLength(1);
		expect(get(result)[0].tasks[0].name).toBe('Fix auth bug');
	});

	it('groups by status when a field grouping is set', () => {
		const tasks = writable([
			makeTask({ status: 'Active' }),
			makeTask({ status: 'Blocked' }),
			makeTask({ status: 'Active' }),
		]);
		const { result, query } = createTaskQuery(tasks, BASE_QUERY);

		query.update(q => ({ ...q, group: { kind: 'field', field: 'status' } }));
		const groups = get(result);
		expect(groups.find(g => g.key === 'Active')?.tasks).toHaveLength(2);
		expect(groups.find(g => g.key === 'Blocked')?.tasks).toHaveLength(1);
	});

	it('supports semantic date bucket grouping reactively', () => {
		vi.setSystemTime(new Date('2026-04-29T12:00:00'));
		const tasks = writable([
			makeTask({ due_date: '2026-04-29' }),
			makeTask({ due_date: '2026-05-20' }),
		]);
		const { result, query } = createTaskQuery(tasks, BASE_QUERY);

		query.update(q => ({ ...q, group: { kind: 'date_buckets', field: 'due_date', preset: 'agenda' } }));
		const groups = get(result);
		expect(groups.map(group => group.key)).toEqual(['today', 'later']);
	});

	it('applies sort reactively', () => {
		const tasks = writable([
			makeTask({ name: 'Z', due_date: '2026-05-01' }),
			makeTask({ name: 'A', due_date: '2026-04-01' }),
		]);
		const { result, query } = createTaskQuery(tasks, BASE_QUERY);

		query.update(q => ({ ...q, sort: [{ field: 'due_date', direction: 'asc' }] }));
		const names = get(result)[0].tasks.map(t => t.name);
		expect(names).toEqual(['A', 'Z']);
	});

	it('exposes query as a writable store', () => {
		const tasks = writable<Task[]>([]);
		const { query } = createTaskQuery(tasks, BASE_QUERY);

		query.set({ ...BASE_QUERY, search: 'hello' });
		expect(get(query).search).toBe('hello');
	});
});
