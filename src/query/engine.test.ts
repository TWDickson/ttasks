import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyFilter, applySort, applyGroup, applyQuery } from './engine';
import type { Task } from '../types';
import type { FilterSpec, QuerySpec, SortSpec } from './types';

beforeEach(() => {
	vi.useRealTimers();
});

afterEach(() => {
	vi.useRealTimers();
});

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

// ── applyFilter ───────────────────────────────────────────────────────────────

describe('applyFilter', () => {
	describe('is / is_not', () => {
		it('filters by exact area match', () => {
			const tasks = [
				makeTask({ area: 'engineering' }),
				makeTask({ area: 'general' }),
				makeTask({ area: null }),
			];
			const spec: FilterSpec = { logic: 'and', conditions: [{ field: 'area', operator: 'is', value: 'engineering' }] };
			expect(applyFilter(tasks, spec).map(t => t.area)).toEqual(['engineering']);
		});

		it('filters by is_not', () => {
			const tasks = [makeTask({ status: 'Active' }), makeTask({ status: 'Blocked' })];
			const spec: FilterSpec = { logic: 'and', conditions: [{ field: 'status', operator: 'is_not', value: 'Blocked' }] };
			expect(applyFilter(tasks, spec)).toHaveLength(1);
			expect(applyFilter(tasks, spec)[0].status).toBe('Active');
		});

		it('filters booleans — is_complete', () => {
			const tasks = [makeTask({ is_complete: false }), makeTask({ is_complete: true })];
			const spec: FilterSpec = { logic: 'and', conditions: [{ field: 'is_complete', operator: 'is', value: true }] };
			expect(applyFilter(tasks, spec)).toHaveLength(1);
		});

		it('filters by type', () => {
			const tasks = [makeTask({ type: 'task' }), makeTask({ type: 'project' })];
			const spec: FilterSpec = { logic: 'and', conditions: [{ field: 'type', operator: 'is', value: 'project' }] };
			expect(applyFilter(tasks, spec)[0].type).toBe('project');
		});
	});

	describe('is_null / is_not_null', () => {
		it('finds tasks with no area (inbox)', () => {
			const tasks = [makeTask({ area: null }), makeTask({ area: 'engineering' })];
			const spec: FilterSpec = { logic: 'and', conditions: [{ field: 'area', operator: 'is_null' }] };
			expect(applyFilter(tasks, spec)).toHaveLength(1);
			expect(applyFilter(tasks, spec)[0].area).toBeNull();
		});

		it('finds tasks with a parent', () => {
			const tasks = [makeTask({ parent_task: null }), makeTask({ parent_task: 'Tasks/proj.md' })];
			const spec: FilterSpec = { logic: 'and', conditions: [{ field: 'parent_task', operator: 'is_not_null' }] };
			expect(applyFilter(tasks, spec)).toHaveLength(1);
		});

		it('finds tasks with no dependencies', () => {
			const tasks = [makeTask({ depends_on: [] }), makeTask({ depends_on: ['Tasks/other.md'] })];
			const spec: FilterSpec = { logic: 'and', conditions: [{ field: 'depends_on', operator: 'is_null' }] };
			expect(applyFilter(tasks, spec)).toHaveLength(1);
		});

		it('finds tasks that are blocking others', () => {
			const tasks = [makeTask({ blocks: [] }), makeTask({ blocks: ['Tasks/other.md'] })];
			const spec: FilterSpec = { logic: 'and', conditions: [{ field: 'blocks', operator: 'is_not_null' }] };
			expect(applyFilter(tasks, spec)).toHaveLength(1);
		});
	});

	describe('contains / not_contains', () => {
		it('filters tasks that depend on a specific task', () => {
			const tasks = [
				makeTask({ depends_on: ['Tasks/proj.md', 'Tasks/other.md'] }),
				makeTask({ depends_on: ['Tasks/unrelated.md'] }),
			];
			const spec: FilterSpec = { logic: 'and', conditions: [{ field: 'depends_on', operator: 'contains', value: 'Tasks/proj.md' }] };
			expect(applyFilter(tasks, spec)).toHaveLength(1);
		});

		it('not_contains excludes tasks with a label', () => {
			const tasks = [makeTask({ labels: ['bug'] }), makeTask({ labels: ['feature'] })];
			const spec: FilterSpec = { logic: 'and', conditions: [{ field: 'labels', operator: 'not_contains', value: 'bug' }] };
			expect(applyFilter(tasks, spec)).toHaveLength(1);
			expect(applyFilter(tasks, spec)[0].labels).toEqual(['feature']);
		});
	});

	describe('contains_any / contains_all', () => {
		it('contains_any — at least one label matches', () => {
			const tasks = [
				makeTask({ labels: ['bug', 'urgent'] }),
				makeTask({ labels: ['feature'] }),
				makeTask({ labels: ['docs'] }),
			];
			const spec: FilterSpec = { logic: 'and', conditions: [{ field: 'labels', operator: 'contains_any', value: ['bug', 'docs'] }] };
			expect(applyFilter(tasks, spec)).toHaveLength(2);
		});

		it('contains_all — must have every specified label', () => {
			const tasks = [
				makeTask({ labels: ['bug', 'urgent'] }),
				makeTask({ labels: ['bug'] }),
			];
			const spec: FilterSpec = { logic: 'and', conditions: [{ field: 'labels', operator: 'contains_all', value: ['bug', 'urgent'] }] };
			expect(applyFilter(tasks, spec)).toHaveLength(1);
		});
	});

	describe('before / after (date comparisons)', () => {
		it('filters tasks due before an absolute date', () => {
			const tasks = [
				makeTask({ due_date: '2026-04-10' }),
				makeTask({ due_date: '2026-05-01' }),
				makeTask({ due_date: null }),
			];
			const spec: FilterSpec = { logic: 'and', conditions: [{ field: 'due_date', operator: 'before', value: '2026-04-15' }] };
			expect(applyFilter(tasks, spec)).toHaveLength(1);
			expect(applyFilter(tasks, spec)[0].due_date).toBe('2026-04-10');
		});

		it('filters tasks due after an absolute date', () => {
			const tasks = [makeTask({ due_date: '2026-04-10' }), makeTask({ due_date: '2026-05-01' })];
			const spec: FilterSpec = { logic: 'and', conditions: [{ field: 'due_date', operator: 'after', value: '2026-04-15' }] };
			expect(applyFilter(tasks, spec)).toHaveLength(1);
			expect(applyFilter(tasks, spec)[0].due_date).toBe('2026-05-01');
		});

		it('resolves relative date "today"', () => {
			const today = '2026-04-24';
			vi.setSystemTime(new Date('2026-04-24T12:00:00'));
			const tasks = [makeTask({ due_date: '2026-04-23' }), makeTask({ due_date: '2026-04-25' })];
			const spec: FilterSpec = { logic: 'and', conditions: [{ field: 'due_date', operator: 'before', value: 'today' }] };
			expect(applyFilter(tasks, spec)).toHaveLength(1);
			vi.useRealTimers();
		});

		it('resolves relative date "+7d"', () => {
			const today = '2026-04-24';
			vi.setSystemTime(new Date('2026-04-24T12:00:00'));
			const tasks = [
				makeTask({ due_date: '2026-04-28' }), // +4d — within range
				makeTask({ due_date: '2026-05-05' }), // +11d — outside
			];
			const spec: FilterSpec = { logic: 'and', conditions: [{ field: 'due_date', operator: 'before', value: '+7d' }] };
			expect(applyFilter(tasks, spec)).toHaveLength(1);
			vi.useRealTimers();
		});
	});

	describe('within_days', () => {
		it('matches tasks due within N days from today', () => {
			const today = '2026-04-24';
			vi.setSystemTime(new Date('2026-04-24T12:00:00'));
			const tasks = [
				makeTask({ due_date: '2026-04-26' }), // +2d — in range
				makeTask({ due_date: '2026-05-10' }), // +16d — out of range
				makeTask({ due_date: null }),           // no date — excluded
			];
			const spec: FilterSpec = { logic: 'and', conditions: [{ field: 'due_date', operator: 'within_days', value: 7 }] };
			expect(applyFilter(tasks, spec)).toHaveLength(1);
			vi.useRealTimers();
		});
	});

	describe('AND / OR logic', () => {
		it('AND — all conditions must pass', () => {
			const tasks = [
				makeTask({ area: 'engineering', status: 'Active' }),
				makeTask({ area: 'engineering', status: 'Blocked' }),
				makeTask({ area: 'general', status: 'Active' }),
			];
			const spec: FilterSpec = {
				logic: 'and',
				conditions: [
					{ field: 'area', operator: 'is', value: 'engineering' },
					{ field: 'status', operator: 'is', value: 'Active' },
				],
			};
			expect(applyFilter(tasks, spec)).toHaveLength(1);
		});

		it('OR — any condition may pass', () => {
			const tasks = [
				makeTask({ status: 'Active' }),
				makeTask({ status: 'Blocked' }),
				makeTask({ status: 'Done' }),
			];
			const spec: FilterSpec = {
				logic: 'or',
				conditions: [
					{ field: 'status', operator: 'is', value: 'Active' },
					{ field: 'status', operator: 'is', value: 'Done' },
				],
			};
			expect(applyFilter(tasks, spec)).toHaveLength(2);
		});

		it('nested groups — AND containing an OR', () => {
			const tasks = [
				makeTask({ area: 'engineering', status: 'Active' }),
				makeTask({ area: 'engineering', status: 'Blocked' }),
				makeTask({ area: 'general', status: 'Active' }),
			];
			const spec: FilterSpec = {
				logic: 'and',
				conditions: [
					{ field: 'area', operator: 'is', value: 'engineering' },
					{
						logic: 'or',
						conditions: [
							{ field: 'status', operator: 'is', value: 'Active' },
							{ field: 'status', operator: 'is', value: 'Blocked' },
						],
					},
				],
			};
			expect(applyFilter(tasks, spec)).toHaveLength(2);
		});

		it('empty conditions group matches everything', () => {
			const tasks = [makeTask(), makeTask()];
			const spec: FilterSpec = { logic: 'and', conditions: [] };
			expect(applyFilter(tasks, spec)).toHaveLength(2);
		});
	});

	describe('search pre-filter', () => {
		it('filters by name substring (case-insensitive)', () => {
			const tasks = [makeTask({ name: 'Fix auth bug' }), makeTask({ name: 'Write tests' })];
			expect(applyFilter(tasks, { logic: 'and', conditions: [] }, 'auth')).toHaveLength(1);
		});

		it('filters by notes substring', () => {
			const tasks = [makeTask({ notes: 'See ticket #123' }), makeTask({ notes: '' })];
			expect(applyFilter(tasks, { logic: 'and', conditions: [] }, 'ticket')).toHaveLength(1);
		});
	});
});

// ── applySort ─────────────────────────────────────────────────────────────────

describe('applySort', () => {
	it('sorts by due_date ascending (nulls last)', () => {
		const tasks = [
			makeTask({ due_date: '2026-05-01' }),
			makeTask({ due_date: null }),
			makeTask({ due_date: '2026-04-10' }),
		];
		const sort: SortSpec = [{ field: 'due_date', direction: 'asc' }];
		const result = applySort(tasks, sort).map(t => t.due_date);
		expect(result).toEqual(['2026-04-10', '2026-05-01', null]);
	});

	it('sorts by due_date descending (nulls last)', () => {
		const tasks = [
			makeTask({ due_date: '2026-04-10' }),
			makeTask({ due_date: null }),
			makeTask({ due_date: '2026-05-01' }),
		];
		const sort: SortSpec = [{ field: 'due_date', direction: 'desc' }];
		const result = applySort(tasks, sort).map(t => t.due_date);
		expect(result).toEqual(['2026-05-01', '2026-04-10', null]);
	});

	it('sorts priority High → Medium → Low → None regardless of direction', () => {
		const tasks = [
			makeTask({ priority: 'None' }),
			makeTask({ priority: 'Medium' }),
			makeTask({ priority: 'High' }),
			makeTask({ priority: 'Low' }),
		];
		const sort: SortSpec = [{ field: 'priority', direction: 'asc' }];
		const result = applySort(tasks, sort).map(t => t.priority);
		expect(result).toEqual(['High', 'Medium', 'Low', 'None']);
	});

	it('applies secondary sort when primary values are equal', () => {
		const tasks = [
			makeTask({ due_date: '2026-04-10', name: 'Z task' }),
			makeTask({ due_date: '2026-04-10', name: 'A task' }),
		];
		const sort: SortSpec = [
			{ field: 'due_date', direction: 'asc' },
			{ field: 'name', direction: 'asc' },
		];
		const result = applySort(tasks, sort).map(t => t.name);
		expect(result).toEqual(['A task', 'Z task']);
	});

	it('sorts by name alphabetically', () => {
		const tasks = [makeTask({ name: 'Zebra' }), makeTask({ name: 'Apple' })];
		const sort: SortSpec = [{ field: 'name', direction: 'asc' }];
		expect(applySort(tasks, sort)[0].name).toBe('Apple');
	});

	it('sorts by completed date descending — most recently completed first, nulls last', () => {
		const tasks = [
			makeTask({ completed: '2026-04-10', is_complete: true }),
			makeTask({ completed: null,         is_complete: false }),
			makeTask({ completed: '2026-04-28', is_complete: true }),
		];
		const sort: SortSpec = [{ field: 'completed', direction: 'desc' }];
		const result = applySort(tasks, sort).map(t => t.completed);
		expect(result).toEqual(['2026-04-28', '2026-04-10', null]);
	});

	it('returns original order when sort spec is empty', () => {
		const tasks = [makeTask({ name: 'B' }), makeTask({ name: 'A' })];
		expect(applySort(tasks, []).map(t => t.name)).toEqual(['B', 'A']);
	});
});

// ── applyGroup ────────────────────────────────────────────────────────────────

describe('applyGroup', () => {
	it('groups by status', () => {
		const tasks = [
			makeTask({ status: 'Active' }),
			makeTask({ status: 'Blocked' }),
			makeTask({ status: 'Active' }),
		];
		const groups = applyGroup(tasks, { kind: 'field', field: 'status' });
		expect(groups).toHaveLength(2);
		expect(groups.find(g => g.key === 'Active')?.tasks).toHaveLength(2);
		expect(groups.find(g => g.key === 'Blocked')?.tasks).toHaveLength(1);
	});

	it('groups by area, using "No Area" for null', () => {
		const tasks = [
			makeTask({ area: 'engineering' }),
			makeTask({ area: null }),
			makeTask({ area: 'engineering' }),
		];
		const groups = applyGroup(tasks, { kind: 'field', field: 'area' });
		expect(groups.find(g => g.key === 'engineering')?.tasks).toHaveLength(2);
		expect(groups.find(g => g.key === 'No Area')?.tasks).toHaveLength(1);
	});

	it('groups by priority in correct order (High → Medium → Low → None)', () => {
		const tasks = [
			makeTask({ priority: 'None' }),
			makeTask({ priority: 'High' }),
			makeTask({ priority: 'Low' }),
		];
		const groups = applyGroup(tasks, { kind: 'field', field: 'priority' });
		expect(groups.map(g => g.key)).toEqual(['High', 'Low', 'None']);
	});

	it('returns a single group when grouping kind is none', () => {
		const tasks = [makeTask(), makeTask()];
		const groups = applyGroup(tasks, { kind: 'none' });
		expect(groups).toHaveLength(1);
		expect(groups[0].key).toBe('all');
		expect(groups[0].tasks).toHaveLength(2);
	});

	it('groups by parent_task path, "No Parent" for null', () => {
		const tasks = [
			makeTask({ parent_task: 'Tasks/proj.md' }),
			makeTask({ parent_task: null }),
		];
		const groups = applyGroup(tasks, { kind: 'field', field: 'parent_task' });
		expect(groups.find(g => g.key === 'Tasks/proj.md')).toBeDefined();
		expect(groups.find(g => g.key === 'No Parent')).toBeDefined();
	});

	it('groups due dates into agenda buckets in semantic order', () => {
		vi.setSystemTime(new Date('2026-04-29T12:00:00'));
		const tasks = [
			makeTask({ path: 'Tasks/overdue.md', due_date: '2026-04-28' }),
			makeTask({ path: 'Tasks/today.md', due_date: '2026-04-29' }),
			makeTask({ path: 'Tasks/tomorrow.md', due_date: '2026-04-30' }),
			makeTask({ path: 'Tasks/this-week.md', due_date: '2026-05-03' }),
			makeTask({ path: 'Tasks/next-week.md', due_date: '2026-05-08' }),
			makeTask({ path: 'Tasks/later.md', due_date: '2026-05-20' }),
			makeTask({ path: 'Tasks/no-date.md', due_date: null }),
		];

		const groups = applyGroup(tasks, { kind: 'date_buckets', field: 'due_date', preset: 'agenda' });

		expect(groups.map(g => g.key)).toEqual([
			'overdue',
			'today',
			'tomorrow',
			'this-week',
			'next-week',
			'later',
			'no-date',
		]);
	});

	it('sorts tasks within agenda buckets by due_date then priority', () => {
		vi.setSystemTime(new Date('2026-04-29T12:00:00'));
		const tasks = [
			makeTask({ path: 'Tasks/b.md', due_date: '2026-05-02', priority: 'Low', name: 'B' }),
			makeTask({ path: 'Tasks/a.md', due_date: '2026-05-01', priority: 'None', name: 'A' }),
			makeTask({ path: 'Tasks/c.md', due_date: '2026-05-01', priority: 'High', name: 'C' }),
		];

		const groups = applyGroup(tasks, { kind: 'date_buckets', field: 'due_date', preset: 'agenda' });
		const thisWeek = groups.find(group => group.key === 'this-week');

		expect(thisWeek?.tasks.map(task => task.name)).toEqual(['C', 'A', 'B']);
	});
});

// ── applyQuery ────────────────────────────────────────────────────────────────

describe('applyQuery', () => {
	it('applies filter + sort + grouping together', () => {
		const tasks = [
			makeTask({ area: 'engineering', status: 'Active',  due_date: '2026-05-01' }),
			makeTask({ area: 'engineering', status: 'Blocked', due_date: '2026-04-10' }),
			makeTask({ area: 'general',     status: 'Active',  due_date: null }),
		];
		const query: QuerySpec = {
			filter: { logic: 'and', conditions: [{ field: 'area', operator: 'is', value: 'engineering' }] },
			sort:   [{ field: 'due_date', direction: 'asc' }],
			group:  { kind: 'field', field: 'status' },
		};
		const groups = applyQuery(tasks, query);
		// Only engineering tasks, grouped by status
		const total = groups.reduce((n, g) => n + g.tasks.length, 0);
		expect(total).toBe(2);
		expect(groups.map(g => g.key).sort()).toEqual(['Active', 'Blocked']);
	});

	it('respects limit — caps total results', () => {
		const tasks = [makeTask(), makeTask(), makeTask(), makeTask()];
		const query: QuerySpec = {
			filter:  { logic: 'and', conditions: [] },
			sort:    [],
			group:   { kind: 'none' },
			limit:   2,
		};
		const groups = applyQuery(tasks, query);
		expect(groups[0].tasks).toHaveLength(2);
	});

	it('respects limitPerGroup — caps results within each group', () => {
		const tasks = [
			makeTask({ area: 'engineering', priority: 'High',   name: 'A' }),
			makeTask({ area: 'engineering', priority: 'Low',    name: 'B' }),
			makeTask({ area: 'general',     priority: 'Medium', name: 'C' }),
		];
		const query: QuerySpec = {
			filter:       { logic: 'and', conditions: [] },
			sort:         [{ field: 'priority', direction: 'asc' }],
			group:        { kind: 'field', field: 'area' },
			limitPerGroup: 1,
		};
		const groups = applyQuery(tasks, query);
		for (const group of groups) {
			expect(group.tasks).toHaveLength(1);
		}
		// Within engineering, High priority wins
		expect(groups.find(g => g.key === 'engineering')?.tasks[0].name).toBe('A');
	});

	it('applies search before filter conditions', () => {
		const tasks = [
			makeTask({ name: 'Fix auth bug', area: 'engineering' }),
			makeTask({ name: 'Write docs',   area: 'engineering' }),
		];
		const query: QuerySpec = {
			filter:  { logic: 'and', conditions: [{ field: 'area', operator: 'is', value: 'engineering' }] },
			sort:    [],
			group:   { kind: 'none' },
			search:  'auth',
		};
		expect(applyQuery(tasks, query)[0].tasks).toHaveLength(1);
	});

	it('supports agenda bucket grouping through QuerySpec', () => {
		vi.setSystemTime(new Date('2026-04-29T12:00:00'));
		const tasks = [
			makeTask({ path: 'Tasks/today.md', due_date: '2026-04-29' }),
			makeTask({ path: 'Tasks/later.md', due_date: '2026-05-20' }),
		];
		const query: QuerySpec = {
			filter: { logic: 'and', conditions: [] },
			sort: [],
			group: { kind: 'date_buckets', field: 'due_date', preset: 'agenda' },
		};

		const groups = applyQuery(tasks, query);

		expect(groups.map(group => group.key)).toEqual(['today', 'later']);
	});

	it('defaults grouped queries to sort within each group', () => {
		const tasks = [
			makeTask({ name: 'eng-low', area: 'engineering', priority: 'Low' }),
			makeTask({ name: 'gen-high', area: 'general', priority: 'High' }),
			makeTask({ name: 'eng-high', area: 'engineering', priority: 'High' }),
			makeTask({ name: 'gen-low', area: 'general', priority: 'Low' }),
		];

		const query: QuerySpec = {
			filter: { logic: 'and', conditions: [] },
			sort: [{ field: 'priority', direction: 'asc' }],
			group: { kind: 'field', field: 'area' },
		};

		const groups = applyQuery(tasks, query);
		expect(groups.find((g) => g.key === 'engineering')?.tasks.map((t) => t.name)).toEqual(['eng-high', 'eng-low']);
		expect(groups.find((g) => g.key === 'general')?.tasks.map((t) => t.name)).toEqual(['gen-high', 'gen-low']);
	});

	it('supports global sort scope for grouped queries', () => {
		const tasks = [
			makeTask({ name: 'eng-low', area: 'engineering', priority: 'Low' }),
			makeTask({ name: 'gen-high', area: 'general', priority: 'High' }),
			makeTask({ name: 'eng-high', area: 'engineering', priority: 'High' }),
			makeTask({ name: 'gen-low', area: 'general', priority: 'Low' }),
		];

		const query: QuerySpec = {
			filter: { logic: 'and', conditions: [] },
			sort: [{ field: 'priority', direction: 'asc' }],
			sortScope: 'global',
			group: { kind: 'field', field: 'area' },
			limit: 2,
		};

		const groups = applyQuery(tasks, query);
		expect(groups.find((g) => g.key === 'engineering')?.tasks.map((t) => t.name)).toEqual(['eng-high']);
		expect(groups.find((g) => g.key === 'general')?.tasks.map((t) => t.name)).toEqual(['gen-high']);
	});
});
