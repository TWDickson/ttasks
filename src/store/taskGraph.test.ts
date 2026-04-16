import { describe, expect, it } from 'vitest';
import type { Task } from '../types';
import { buildTaskGraph, resolveTaskDates } from './taskGraph';

function makeTask(overrides: Partial<Task> & Pick<Task, 'path' | 'name'>): Task {
	const { path, name, ...rest } = overrides;
	return {
		id: path.slice(0, 6),
		slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
		path,
		type: 'task',
		name,
		category: null,
		status: 'Active',
		priority: 'None',
		task_type: null,
		parent_task: null,
		depends_on: [],
		blocks: [],
		blocked_reason: '',
		assigned_to: '',
		source: '',
		start_date: null,
		due_date: null,
		estimated_days: null,
		created: '2026-04-02',
		completed: null,
		notes: '',
		recurrence: null,
		recurrence_type: null,
		is_complete: false,
		is_inbox: false,
		status_changed: null,
		...rest,
	};
}

describe('buildTaskGraph', () => {
	it('assigns dependency depth left to right for acyclic chains', () => {
		const tasks = [
			makeTask({ path: 'Tasks/a.md', name: 'A' }),
			makeTask({ path: 'Tasks/b.md', name: 'B', depends_on: ['Tasks/a'] }),
			makeTask({ path: 'Tasks/c.md', name: 'C', depends_on: ['Tasks/b'] }),
		];

		const layout = buildTaskGraph(tasks, {});
		const columns = new Map(layout.nodes.map((node) => [node.path, node.column]));

		expect(layout.edges).toHaveLength(2);
		expect(columns.get('Tasks/a.md')).toBe(0);
		expect(columns.get('Tasks/b.md')).toBe(1);
		expect(columns.get('Tasks/c.md')).toBe(2);
		expect(layout.maxDepth).toBe(2);
	});

	it('marks cycles and blocked dependency chains', () => {
		const tasks = [
			makeTask({ path: 'Tasks/a.md', name: 'A', status: 'Active', depends_on: ['Tasks/c'] }),
			makeTask({ path: 'Tasks/b.md', name: 'B', status: 'Active', depends_on: ['Tasks/a'] }),
			makeTask({ path: 'Tasks/c.md', name: 'C', status: 'Active', depends_on: ['Tasks/b'] }),
			makeTask({ path: 'Tasks/d.md', name: 'D', status: 'Done', is_complete: true }),
			makeTask({ path: 'Tasks/e.md', name: 'E', status: 'Active', depends_on: ['Tasks/d'] }),
		];

		const layout = buildTaskGraph(tasks, {});
		const cycleNodes = layout.nodes.filter((node) => node.isCycle).map((node) => node.path).sort();
		const blockedNodes = layout.nodes.filter((node) => node.isBlockedChain).map((node) => node.path).sort();

		expect(cycleNodes).toEqual(['Tasks/a.md', 'Tasks/b.md', 'Tasks/c.md']);
		expect(layout.edges.filter((edge) => edge.isCycle)).toHaveLength(3);
		expect(blockedNodes).toEqual(['Tasks/a.md', 'Tasks/b.md', 'Tasks/c.md']);
		expect(layout.blockedEdgeCount).toBe(3);
	});

	it('does not mark a dependency chain as blocked when the upstream task is complete', () => {
		// E depends on D which is complete — E should not be in a blocked chain
		const tasks = [
			makeTask({ path: 'Tasks/d.md', name: 'D', status: 'Done', is_complete: true }),
			makeTask({ path: 'Tasks/e.md', name: 'E', status: 'Active', depends_on: ['Tasks/d'] }),
		];

		const layout = buildTaskGraph(tasks, {});
		const blockedNodes = layout.nodes.filter((node) => node.isBlockedChain).map((node) => node.path);

		expect(blockedNodes).toEqual([]);
		expect(layout.blockedEdgeCount).toBe(0);
	});
});

describe('resolveTaskDates', () => {
	it('uses explicit start_date and due_date directly', () => {
		const tasks = [
			makeTask({ path: 'Tasks/a.md', name: 'A', start_date: '2026-04-01', due_date: '2026-04-05' }),
		];
		const result = resolveTaskDates(tasks);
		const a = result.get('Tasks/a.md');
		expect(a).toBeDefined();
		expect(a!.start.toISOString().slice(0, 10)).toBe('2026-04-01');
		expect(a!.end.toISOString().slice(0, 10)).toBe('2026-04-05');
		expect(a!.isInferred).toBe(false);
	});

	it('infers start from dependency end date across a full chain', () => {
		// A finishes 2026-04-10, B has 3 estimated days, C has 2 estimated days
		// Expected: B starts 2026-04-11, ends 2026-04-13; C starts 2026-04-14, ends 2026-04-15
		const tasks = [
			makeTask({ path: 'Tasks/a.md', name: 'A', due_date: '2026-04-10' }),
			makeTask({ path: 'Tasks/b.md', name: 'B', depends_on: ['Tasks/a'], estimated_days: 3 }),
			makeTask({ path: 'Tasks/c.md', name: 'C', depends_on: ['Tasks/b'], estimated_days: 2 }),
		];
		const result = resolveTaskDates(tasks);

		const b = result.get('Tasks/b.md');
		expect(b).toBeDefined();
		expect(b!.start.toISOString().slice(0, 10)).toBe('2026-04-11');
		expect(b!.end.toISOString().slice(0, 10)).toBe('2026-04-13');
		expect(b!.isInferred).toBe(true);

		const c = result.get('Tasks/c.md');
		expect(c).toBeDefined();
		expect(c!.start.toISOString().slice(0, 10)).toBe('2026-04-14');
		expect(c!.end.toISOString().slice(0, 10)).toBe('2026-04-15');
		expect(c!.isInferred).toBe(true);
	});

	it('excludes tasks with no resolvable dates', () => {
		const tasks = [
			makeTask({ path: 'Tasks/a.md', name: 'A' }), // no dates, no deps
		];
		const result = resolveTaskDates(tasks);
		expect(result.has('Tasks/a.md')).toBe(false);
	});

	it('excludes tasks in dependency cycles', () => {
		const tasks = [
			makeTask({ path: 'Tasks/a.md', name: 'A', depends_on: ['Tasks/b'], due_date: '2026-04-10' }),
			makeTask({ path: 'Tasks/b.md', name: 'B', depends_on: ['Tasks/a'], estimated_days: 3 }),
		];
		const result = resolveTaskDates(tasks);
		// A has a due_date so it CAN resolve independently; B depends on A but A→B→A is a cycle
		// A resolves (deadline-only from due_date); B's dep on A resolves A first,
		// but A also depends on B so B's in-degree never reaches 0 → excluded
		expect(result.has('Tasks/b.md')).toBe(false);
	});

	it('uses latest dependency end when a task has multiple upstream deps', () => {
		const tasks = [
			makeTask({ path: 'Tasks/a.md', name: 'A', due_date: '2026-04-05' }),
			makeTask({ path: 'Tasks/b.md', name: 'B', due_date: '2026-04-10' }),
			makeTask({ path: 'Tasks/c.md', name: 'C', depends_on: ['Tasks/a', 'Tasks/b'], estimated_days: 2 }),
		];
		const result = resolveTaskDates(tasks);
		const c = result.get('Tasks/c.md');
		expect(c).toBeDefined();
		// start = day after latest dep end (2026-04-10) = 2026-04-11
		expect(c!.start.toISOString().slice(0, 10)).toBe('2026-04-11');
		expect(c!.end.toISOString().slice(0, 10)).toBe('2026-04-12');
	});
});