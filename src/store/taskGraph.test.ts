import { describe, expect, it } from 'vitest';
import type { Task } from '../types';
import { buildHybridTimeline, buildTaskGraph, resolveConnectedDependencyPaths, resolveTaskDates } from './taskGraph';

function makeTask(overrides: Partial<Task> & Pick<Task, 'path' | 'name'>): Task {
	const { path, name, ...rest } = overrides;
	return {
		id: path.slice(0, 6),
		slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
		path,
		type: 'task',
		name,
		area: null,
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

describe('resolveConnectedDependencyPaths', () => {
	it('returns only nodes that participate in dependency edges', () => {
		const tasks = [
			makeTask({ path: 'Tasks/a.md', name: 'A' }),
			makeTask({ path: 'Tasks/b.md', name: 'B', depends_on: ['Tasks/a'] }),
			makeTask({ path: 'Tasks/c.md', name: 'C' }),
		];

		const connected = resolveConnectedDependencyPaths(tasks);

		expect([...connected].sort()).toEqual(['Tasks/a.md', 'Tasks/b.md']);
	});

	it('ignores dependency paths outside the current task set', () => {
		const tasks = [
			makeTask({ path: 'Tasks/a.md', name: 'A', depends_on: ['Tasks/missing'] }),
		];

		const connected = resolveConnectedDependencyPaths(tasks);
		expect(connected.size).toBe(0);
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

describe('buildHybridTimeline', () => {
	it('splits dated or inferred tasks into defined track and no-estimate dependents into underdefined track', () => {
		const tasks = [
			makeTask({ path: 'Tasks/a.md', name: 'A', due_date: '2026-04-05' }),
			makeTask({ path: 'Tasks/b.md', name: 'B', depends_on: ['Tasks/a'], estimated_days: 2 }),
			makeTask({ path: 'Tasks/c.md', name: 'C', depends_on: ['Tasks/b'] }),
			makeTask({ path: 'Tasks/d.md', name: 'D' }),
		];

		const model = buildHybridTimeline(tasks);

		expect(model.defined.map((item) => item.path).sort()).toEqual(['Tasks/a.md', 'Tasks/b.md']);
		expect(model.underdefined.map((item) => item.path)).toEqual(['Tasks/c.md']);
		expect(model.links).toHaveLength(1);
		expect(model.links[0]).toMatchObject({ fromPath: 'Tasks/b.md', toPath: 'Tasks/c.md' });
	});

	it('does not include underdefined tasks that are not anchored to a resolved dependency', () => {
		const tasks = [
			makeTask({ path: 'Tasks/a.md', name: 'A' }),
			makeTask({ path: 'Tasks/b.md', name: 'B', depends_on: ['Tasks/a'] }),
		];

		const model = buildHybridTimeline(tasks);

		expect(model.defined).toHaveLength(0);
		expect(model.underdefined).toHaveLength(0);
		expect(model.links).toHaveLength(0);
	});

	it('keeps underdefined card widths within readability bounds', () => {
		const tasks = [
			makeTask({ path: 'Tasks/a.md', name: 'A', due_date: '2026-04-05' }),
			makeTask({ path: 'Tasks/b.md', name: 'Very long task name that should produce a wider underdefined card', depends_on: ['Tasks/a'] }),
		];

		const model = buildHybridTimeline(tasks);
		expect(model.underdefined).toHaveLength(1);
		expect(model.underdefined[0].widthPercent).toBeGreaterThanOrEqual(10);
		expect(model.underdefined[0].widthPercent).toBeLessThanOrEqual(20);
	});

	// ── B5: project grouping ───────────────────────────────────────────────────

	it('groups defined items by parent project when grouping=project', () => {
		const projectA = makeTask({ path: 'Tasks/project-a.md', name: 'Project A', type: 'project' });
		const projectB = makeTask({ path: 'Tasks/project-b.md', name: 'Project B', type: 'project' });
		const taskA1 = makeTask({ path: 'Tasks/a1.md', name: 'A1', parent_task: 'Tasks/project-a', due_date: '2026-06-01' });
		const taskA2 = makeTask({ path: 'Tasks/a2.md', name: 'A2', parent_task: 'Tasks/project-a', due_date: '2026-06-10' });
		const taskB1 = makeTask({ path: 'Tasks/b1.md', name: 'B1', parent_task: 'Tasks/project-b', due_date: '2026-06-05' });
		const taskOrphan = makeTask({ path: 'Tasks/orphan.md', name: 'Orphan', due_date: '2026-06-15' });

		const model = buildHybridTimeline(
			[projectA, projectB, taskA1, taskA2, taskB1, taskOrphan],
			{ grouping: 'project' },
		);

		const definedPaths = model.defined.map(i => i.path);
		expect(definedPaths).toContain('Tasks/a1.md');
		expect(definedPaths).toContain('Tasks/a2.md');
		expect(definedPaths).toContain('Tasks/b1.md');
		expect(definedPaths).toContain('Tasks/orphan.md');

		// Each item has a groupKey matching its project
		const a1 = model.defined.find(i => i.path === 'Tasks/a1.md')!;
		const b1 = model.defined.find(i => i.path === 'Tasks/b1.md')!;
		const orphan = model.defined.find(i => i.path === 'Tasks/orphan.md')!;
		expect(a1.groupKey).toBe('project:Tasks/project-a.md');
		expect(b1.groupKey).toBe('project:Tasks/project-b.md');
		expect(orphan.groupKey).toBe('__no_project__');

		// A1 and A2 share the same group band, B1 in a separate band
		expect(a1.groupKey).toBe(model.defined.find(i => i.path === 'Tasks/a2.md')!.groupKey);
		expect(a1.groupKey).not.toBe(b1.groupKey);
	});

	it('uses parent task name as group label when the parent is a visible task', () => {
		// When the parent_task is itself a visible task (type='task'), its name is used as label.
		// Projects (type='project') are filtered out of visibleTasks, so they fall back to path leaf.
		const parentTask = makeTask({ path: 'Tasks/parent.md', name: 'Parent Task', type: 'task', due_date: '2026-06-01' });
		const childTask = makeTask({ path: 'Tasks/child.md', name: 'Child', parent_task: 'Tasks/parent', due_date: '2026-06-10' });

		const model = buildHybridTimeline([parentTask, childTask], { grouping: 'project' });

		const child = model.defined.find(i => i.path === 'Tasks/child.md')!;
		expect(child.groupLabel).toBe('Parent Task');
	});

	it('falls back to path leaf as group label when parent is a project (excluded from task list)', () => {
		// Project tasks are excluded from visibleTasks; the resolver falls back to pathLeaf
		const project = makeTask({ path: 'Tasks/my-proj.md', name: 'My Project', type: 'project' });
		const task = makeTask({ path: 'Tasks/t.md', name: 'T', parent_task: 'Tasks/my-proj', due_date: '2026-06-01' });

		const model = buildHybridTimeline([project, task], { grouping: 'project' });

		const item = model.defined.find(i => i.path === 'Tasks/t.md')!;
		// Falls back to the last segment of the parent path (no '.md' because normalizeTaskPath strips it)
		expect(item.groupLabel).toBeTruthy();
		expect(item.groupKey).toBe('project:Tasks/my-proj.md');
	});

	it('assigns "No project" label to orphan tasks when grouping=project', () => {
		const task = makeTask({ path: 'Tasks/t.md', name: 'Orphan', due_date: '2026-06-01' });

		const model = buildHybridTimeline([task], { grouping: 'project' });

		const item = model.defined.find(i => i.path === 'Tasks/t.md')!;
		expect(item.groupLabel).toBe('No project');
	});

	it('uses a single group when grouping=none', () => {
		const t1 = makeTask({ path: 'Tasks/t1.md', name: 'T1', parent_task: 'Tasks/proj-a', due_date: '2026-06-01' });
		const t2 = makeTask({ path: 'Tasks/t2.md', name: 'T2', parent_task: 'Tasks/proj-b', due_date: '2026-06-05' });

		const model = buildHybridTimeline([t1, t2], { grouping: 'none' });

		const keys = new Set(model.defined.map(i => i.groupKey));
		expect(keys.size).toBe(1);
	});
});