import { describe, expect, it } from 'vitest';
import type { Task } from '../../types';
import { buildHybridTimeline, buildTaskGraph, resolveConnectedDependencyPaths, resolveTaskDates } from './taskGraph';
import { detectDependencyCyclePaths } from './taskGraphDates';
import { countCrossingsByColumnPairs } from './graphCrossingOptimizer';

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

describe('detectDependencyCyclePaths', () => {
	it('returns an empty set for an acyclic chain', () => {
		const tasks = [
			makeTask({ path: 'Tasks/a.md', name: 'A' }),
			makeTask({ path: 'Tasks/b.md', name: 'B', depends_on: ['Tasks/a'] }),
			makeTask({ path: 'Tasks/c.md', name: 'C', depends_on: ['Tasks/b'] }),
		];
		expect(detectDependencyCyclePaths(tasks).size).toBe(0);
	});

	it('flags both members of a 2-cycle', () => {
		const tasks = [
			makeTask({ path: 'Tasks/a.md', name: 'A', depends_on: ['Tasks/b'] }),
			makeTask({ path: 'Tasks/b.md', name: 'B', depends_on: ['Tasks/a'] }),
		];
		expect([...detectDependencyCyclePaths(tasks)].sort()).toEqual(['Tasks/a.md', 'Tasks/b.md']);
	});

	it('ignores a self-dependency (filtered as a non-edge)', () => {
		const tasks = [
			makeTask({ path: 'Tasks/a.md', name: 'A', depends_on: ['Tasks/a'] }),
		];
		expect(detectDependencyCyclePaths(tasks).size).toBe(0);
	});
});

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

	it('keeps a linear dependency chain on a single row (horizontal flow)', () => {
		const tasks = [
			makeTask({ path: 'Tasks/a.md', name: 'A' }),
			makeTask({ path: 'Tasks/b.md', name: 'B', depends_on: ['Tasks/a'] }),
			makeTask({ path: 'Tasks/c.md', name: 'C', depends_on: ['Tasks/b'] }),
			makeTask({ path: 'Tasks/d.md', name: 'D', depends_on: ['Tasks/c'] }),
		];

		const layout = buildTaskGraph(tasks, {});
		const rows = new Set(layout.nodes.map((node) => node.row));

		// All four chained nodes share the same row — a horizontal staircase-free flow.
		expect(rows.size).toBe(1);
		// And columns still advance with dependency depth.
		const columns = layout.nodes.map((node) => node.column).sort((a, b) => a - b);
		expect(columns).toEqual([0, 1, 2, 3]);
	});

	it('forks a fan-out onto separate rows while the first child keeps the spine', () => {
		// A fans out to B and C. The first child stays on A's row; the second forks.
		const tasks = [
			makeTask({ path: 'Tasks/a.md', name: 'A' }),
			makeTask({ path: 'Tasks/b.md', name: 'B', depends_on: ['Tasks/a'] }),
			makeTask({ path: 'Tasks/c.md', name: 'C', depends_on: ['Tasks/a'] }),
		];

		const layout = buildTaskGraph(tasks, {});
		const byPath = new Map(layout.nodes.map((node) => [node.path, node]));
		const a = byPath.get('Tasks/a.md')!;
		const b = byPath.get('Tasks/b.md')!;
		const c = byPath.get('Tasks/c.md')!;

		// One child shares A's row (the spine), the other forks to a different row.
		const childRows = [b.row, c.row];
		expect(childRows).toContain(a.row);
		expect(b.row).not.toBe(c.row);
	});

	it('separates two independent roots in the same lane onto different rows', () => {
		const tasks = [
			makeTask({ path: 'Tasks/proj.md', name: 'Proj', type: 'project' }),
			makeTask({ path: 'Tasks/r1.md', name: 'R1', parent_task: 'Tasks/proj' }),
			makeTask({ path: 'Tasks/r2.md', name: 'R2', parent_task: 'Tasks/proj' }),
		];

		const layout = buildTaskGraph(tasks, {});
		const byPath = new Map(layout.nodes.map((node) => [node.path, node]));
		expect(byPath.get('Tasks/r1.md')!.row).not.toBe(byPath.get('Tasks/r2.md')!.row);
	});

	it('stacks same-column roots in date order (earliest highest)', () => {
		// Three roots in one lane, same column. They should stack by date so the
		// earliest-dated work sits on the lowest (top) row.
		const tasks = [
			makeTask({ path: 'Tasks/proj.md', name: 'Proj', type: 'project' }),
			makeTask({ path: 'Tasks/late.md', name: 'Late', parent_task: 'Tasks/proj', start_date: '2026-06-20' }),
			makeTask({ path: 'Tasks/early.md', name: 'Early', parent_task: 'Tasks/proj', start_date: '2026-06-01' }),
			makeTask({ path: 'Tasks/mid.md', name: 'Mid', parent_task: 'Tasks/proj', start_date: '2026-06-10' }),
		];

		const layout = buildTaskGraph(tasks, {});
		const byPath = new Map(layout.nodes.map((node) => [node.path, node]));

		expect(byPath.get('Tasks/early.md')!.row).toBeLessThan(byPath.get('Tasks/mid.md')!.row);
		expect(byPath.get('Tasks/mid.md')!.row).toBeLessThan(byPath.get('Tasks/late.md')!.row);
	});

	it('never places two nodes from the same column on the same row', () => {
		// Diamond: A fans out to B and C, which both feed D. B and C land in the
		// same column and must therefore occupy distinct rows.
		const tasks = [
			makeTask({ path: 'Tasks/a.md', name: 'A' }),
			makeTask({ path: 'Tasks/b.md', name: 'B', depends_on: ['Tasks/a'] }),
			makeTask({ path: 'Tasks/c.md', name: 'C', depends_on: ['Tasks/a'] }),
			makeTask({ path: 'Tasks/d.md', name: 'D', depends_on: ['Tasks/b', 'Tasks/c'] }),
		];

		const layout = buildTaskGraph(tasks, {});

		const seen = new Set<string>();
		for (const node of layout.nodes) {
			const slot = `${node.column}:${node.row}`;
			expect(seen.has(slot)).toBe(false);
			seen.add(slot);
		}
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

	it('builds project-based lanes with project header labels', () => {
		const tasks = [
			makeTask({ path: 'Tasks/proj-a.md', name: 'Project A', type: 'project' }),
			makeTask({ path: 'Tasks/proj-b.md', name: 'Project B', type: 'project' }),
			makeTask({ path: 'Tasks/a1.md', name: 'A1', parent_task: 'Tasks/proj-a' }),
			makeTask({ path: 'Tasks/a2.md', name: 'A2', parent_task: 'Tasks/proj-a' }),
			makeTask({ path: 'Tasks/b1.md', name: 'B1', parent_task: 'Tasks/proj-b' }),
			makeTask({ path: 'Tasks/orphan.md', name: 'Orphan' }),
		];

		const layout = buildTaskGraph(tasks, {});
		const lanesByLabel = new Map(layout.lanes.map((lane) => [lane.label, lane]));

		expect(lanesByLabel.has('Project A')).toBe(true);
		expect(lanesByLabel.has('Project B')).toBe(true);
		expect(lanesByLabel.has('Unassigned')).toBe(true);

		expect(lanesByLabel.get('Project A')?.taskPaths).not.toContain('Tasks/proj-a.md');
		expect(lanesByLabel.get('Project A')?.taskPaths).toContain('Tasks/a1.md');
		expect(lanesByLabel.get('Project A')?.taskPaths).toContain('Tasks/a2.md');
		expect(lanesByLabel.get('Project B')?.taskPaths).not.toContain('Tasks/proj-b.md');
		expect(lanesByLabel.get('Project B')?.taskPaths).toContain('Tasks/b1.md');
		expect(lanesByLabel.get('Unassigned')?.taskPaths).toContain('Tasks/orphan.md');

		const nodePaths = new Set(layout.nodes.map((node) => node.path));
		expect(nodePaths.has('Tasks/proj-a.md')).toBe(false);
		expect(nodePaths.has('Tasks/proj-b.md')).toBe(false);
	});

	it('resolves lanes to the owning project when parent_task points to an intermediate task', () => {
		const tasks = [
			makeTask({ path: 'Tasks/proj-a.md', name: 'Project A', type: 'project' }),
			makeTask({ path: 'Tasks/epic-a.md', name: 'Epic A', parent_task: 'Tasks/proj-a' }),
			makeTask({ path: 'Tasks/work-a.md', name: 'Work A', parent_task: 'Tasks/epic-a' }),
		];

		const layout = buildTaskGraph(tasks, {});
		const laneByLabel = new Map(layout.lanes.map((lane) => [lane.label, lane]));

		expect(laneByLabel.has('Project A')).toBe(true);
		expect(laneByLabel.get('Project A')?.taskPaths).toContain('Tasks/epic-a.md');
		expect(laneByLabel.get('Project A')?.taskPaths).toContain('Tasks/work-a.md');

		const workNode = layout.nodes.find((node) => node.path === 'Tasks/work-a.md');
		expect(workNode?.laneKey).toBe('Tasks/proj-a.md');
	});

	it('uses project name for lane labels when parent_task is stored as an aliased wikilink', () => {
		const tasks = [
			makeTask({ path: 'Tasks/1a2b3c-platform-refresh.md', name: 'Platform Refresh', type: 'project' }),
			makeTask({ path: 'Tasks/work-a.md', name: 'Work A', parent_task: '[[Tasks/1a2b3c-platform-refresh|Platform Refresh]]' }),
		];

		const layout = buildTaskGraph(tasks, {});
		const laneByLabel = new Map(layout.lanes.map((lane) => [lane.label, lane]));

		expect(laneByLabel.has('Platform Refresh')).toBe(true);
		expect(laneByLabel.get('Platform Refresh')?.taskPaths).toContain('Tasks/work-a.md');
	});

	it('nudges independent tasks left-to-right by approximate date ordering', () => {
		const tasks = [
			makeTask({ path: 'Tasks/soon.md', name: 'Soon', due_date: '2026-06-02' }),
			makeTask({ path: 'Tasks/later.md', name: 'Later', due_date: '2026-06-20' }),
		];

		const layout = buildTaskGraph(tasks, {});
		const columns = new Map(layout.nodes.map((node) => [node.path, node.column]));

		expect(columns.get('Tasks/soon.md')).toBeLessThan(columns.get('Tasks/later.md') ?? Infinity);
	});

	it('keeps dependency ordering ahead of temporal nudging', () => {
		const tasks = [
			makeTask({ path: 'Tasks/a.md', name: 'A', due_date: '2026-06-20' }),
			makeTask({ path: 'Tasks/b.md', name: 'B', due_date: '2026-06-02', depends_on: ['Tasks/a'] }),
		];

		const layout = buildTaskGraph(tasks, {});
		const columns = new Map(layout.nodes.map((node) => [node.path, node.column]));

		expect(columns.get('Tasks/b.md')).toBeGreaterThan(columns.get('Tasks/a.md') ?? -1);
	});

	it('does not spread a connected chain across extra columns by date', () => {
		// Two roots feed one merge. Their dates differ, but because they are part
		// of a connected dependency graph, date must not push either root right —
		// both stay at column 0 and the merge sits at column 1 (compact).
		const tasks = [
			makeTask({ path: 'Tasks/proj.md', name: 'Proj', type: 'project' }),
			makeTask({ path: 'Tasks/r1.md', name: 'R1', parent_task: 'Tasks/proj', due_date: '2026-06-20' }),
			makeTask({ path: 'Tasks/r2.md', name: 'R2', parent_task: 'Tasks/proj', due_date: '2026-06-02' }),
			makeTask({ path: 'Tasks/m.md', name: 'M', parent_task: 'Tasks/proj', depends_on: ['Tasks/r1', 'Tasks/r2'] }),
		];

		const layout = buildTaskGraph(tasks, {});
		const columns = new Map(layout.nodes.map((node) => [node.path, node.column]));

		expect(columns.get('Tasks/r1.md')).toBe(0);
		expect(columns.get('Tasks/r2.md')).toBe(0);
		expect(columns.get('Tasks/m.md')).toBe(1);
	});

	it('applies temporal left-right ordering per lane rather than globally across unrelated lanes', () => {
		const tasks = [
			makeTask({ path: 'Tasks/proj-a.md', name: 'Project A', type: 'project' }),
			makeTask({ path: 'Tasks/proj-b.md', name: 'Project B', type: 'project' }),
			makeTask({ path: 'Tasks/a.md', name: 'A', parent_task: 'Tasks/proj-a', due_date: '2026-06-01' }),
			makeTask({ path: 'Tasks/b.md', name: 'B', parent_task: 'Tasks/proj-b', due_date: '2026-07-01' }),
		];

		const layout = buildTaskGraph(tasks, {});
		const columns = new Map(layout.nodes.map((node) => [node.path, node.column]));

		expect(columns.get('Tasks/a.md')).toBe(0);
		expect(columns.get('Tasks/b.md')).toBe(0);
	});

	it('reduces same-lane column-pair crossings for dense dependency patterns', () => {
		const tasks = [
			makeTask({ path: 'Tasks/proj-a.md', name: 'Project A', type: 'project' }),
			makeTask({ path: 'Tasks/a.md', name: 'A', parent_task: 'Tasks/proj-a' }),
			makeTask({ path: 'Tasks/b.md', name: 'B', parent_task: 'Tasks/proj-a' }),
			makeTask({ path: 'Tasks/c.md', name: 'C', parent_task: 'Tasks/proj-a', depends_on: ['Tasks/b'] }),
			makeTask({ path: 'Tasks/d.md', name: 'D', parent_task: 'Tasks/proj-a', depends_on: ['Tasks/a'] }),
		];

		const layout = buildTaskGraph(tasks, {});
		const nodesByPath = new Map(layout.nodes.map((node) => [node.path, node]));
		const orderedLanePaths = layout.nodes
			.filter((node) => node.task.type !== 'project' && node.laneKey === 'Tasks/proj-a.md')
			.sort((left, right) => left.row - right.row)
			.map((node) => node.path);

		const crossings = countCrossingsByColumnPairs(orderedLanePaths, nodesByPath, layout.edges);
		expect(crossings).toBe(0);
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

	it('anchors a completed task on its completion date even without explicit start/due', () => {
		const tasks = [
			makeTask({ path: 'Tasks/a.md', name: 'A', status: 'Done', is_complete: true, completed: '2026-05-27' }),
		];
		const result = resolveTaskDates(tasks);
		const a = result.get('Tasks/a.md');
		expect(a).toBeDefined();
		expect(a!.start.toISOString().slice(0, 10)).toBe('2026-05-27');
		expect(a!.end.toISOString().slice(0, 10)).toBe('2026-05-27');
	});

	it('propagates dates downstream of a completed anchor, defaulting undated tasks to one day', () => {
		// A is done May 27 with no explicit dates; B (no estimate) and C chain off it.
		// B should start the day after A and span a single day; C follows B.
		const tasks = [
			makeTask({ path: 'Tasks/a.md', name: 'A', status: 'Done', is_complete: true, completed: '2026-05-27' }),
			makeTask({ path: 'Tasks/b.md', name: 'B', depends_on: ['Tasks/a'] }),
			makeTask({ path: 'Tasks/c.md', name: 'C', depends_on: ['Tasks/b'], estimated_days: 2 }),
		];
		const result = resolveTaskDates(tasks);

		const b = result.get('Tasks/b.md');
		expect(b).toBeDefined();
		expect(b!.start.toISOString().slice(0, 10)).toBe('2026-05-28');
		expect(b!.end.toISOString().slice(0, 10)).toBe('2026-05-28'); // 1-day default
		expect(b!.isInferred).toBe(true);

		const c = result.get('Tasks/c.md');
		expect(c).toBeDefined();
		expect(c!.start.toISOString().slice(0, 10)).toBe('2026-05-29');
		expect(c!.end.toISOString().slice(0, 10)).toBe('2026-05-30'); // 2 estimated days
	});

	it('uses the completion date as the end even when an estimate is present', () => {
		const tasks = [
			makeTask({ path: 'Tasks/a.md', name: 'A', start_date: '2026-05-20', status: 'Done', is_complete: true, completed: '2026-05-27', estimated_days: 99 }),
		];
		const result = resolveTaskDates(tasks);
		const a = result.get('Tasks/a.md');
		expect(a).toBeDefined();
		expect(a!.start.toISOString().slice(0, 10)).toBe('2026-05-20');
		expect(a!.end.toISOString().slice(0, 10)).toBe('2026-05-27'); // actual completion, not estimate
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

	it('skips weekends for inferred starts and estimated duration when parent project is workweek-only', () => {
		const project = makeTask({
			path: 'Tasks/proj.md',
			name: 'Project',
			type: 'project',
			workweek_only: true,
		});
		const a = makeTask({ path: 'Tasks/a.md', name: 'A', parent_task: 'Tasks/proj', due_date: '2026-04-10' }); // Friday
		const b = makeTask({
			path: 'Tasks/b.md',
			name: 'B',
			parent_task: 'Tasks/proj',
			depends_on: ['Tasks/a'],
			estimated_days: 3,
		});

		const result = resolveTaskDates([a, b], { allTasks: [project, a, b] });
		const resolvedB = result.get('Tasks/b.md');

		expect(resolvedB).toBeDefined();
		expect(resolvedB!.start.toISOString().slice(0, 10)).toBe('2026-04-13'); // Monday
		expect(resolvedB!.end.toISOString().slice(0, 10)).toBe('2026-04-15'); // Wednesday
	});

	it('skips configured project holiday dates when inferring schedule', () => {
		const project = makeTask({
			path: 'Tasks/proj.md',
			name: 'Project',
			type: 'project',
			workweek_only: true,
			holiday_dates: ['2026-04-14'],
		});
		const a = makeTask({ path: 'Tasks/a.md', name: 'A', parent_task: 'Tasks/proj', due_date: '2026-04-10' }); // Friday
		const b = makeTask({
			path: 'Tasks/b.md',
			name: 'B',
			parent_task: 'Tasks/proj',
			depends_on: ['Tasks/a'],
			estimated_days: 2,
		});

		const result = resolveTaskDates([a, b], { allTasks: [project, a, b] });
		const resolvedB = result.get('Tasks/b.md');

		expect(resolvedB).toBeDefined();
		expect(resolvedB!.start.toISOString().slice(0, 10)).toBe('2026-04-13'); // Monday
		expect(resolvedB!.end.toISOString().slice(0, 10)).toBe('2026-04-15'); // Tuesday is a holiday
	});

	it('skips configured holidays for estimated durations even when workweek mode is off', () => {
		const project = makeTask({
			path: 'Tasks/proj.md',
			name: 'Project',
			type: 'project',
			workweek_only: false,
			holiday_dates: ['2026-04-14'],
		});
		const task = makeTask({
			path: 'Tasks/a.md',
			name: 'A',
			parent_task: 'Tasks/proj',
			start_date: '2026-04-13',
			estimated_days: 2,
		});

		const result = resolveTaskDates([task], { allTasks: [project, task] });
		const resolvedTask = result.get('Tasks/a.md');

		expect(resolvedTask).toBeDefined();
		expect(resolvedTask!.start.toISOString().slice(0, 10)).toBe('2026-04-13');
		expect(resolvedTask!.end.toISOString().slice(0, 10)).toBe('2026-04-15');
	});
});

describe('buildHybridTimeline', () => {
	it('extends the timeline range to keep a future-looking window around today', () => {
		const tasks = [
			makeTask({ path: 'Tasks/a.md', name: 'A', due_date: '2026-05-05' }),
		];

		const model = buildHybridTimeline(tasks);
		const today = new Date();
		today.setHours(0, 0, 0, 0);
		const minPast = new Date(today.getTime());
		minPast.setDate(minPast.getDate() - 14);
		const minFuture = new Date(today.getTime());
		minFuture.setDate(minFuture.getDate() + 28);

		expect(model.rangeStart.getTime()).toBeLessThanOrEqual(minPast.getTime());
		expect(model.rangeEnd.getTime()).toBeGreaterThanOrEqual(minFuture.getTime());
	});

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

	it('includes a completed-only anchor as a defined bar with a link to its dependent', () => {
		const tasks = [
			makeTask({ path: 'Tasks/done.md', name: 'Done', status: 'Done', is_complete: true, completed: '2026-04-05' }),
			makeTask({ path: 'Tasks/open.md', name: 'Open', depends_on: ['Tasks/done'] }),
		];

		const model = buildHybridTimeline(tasks);

		expect(model.defined.map((item) => item.path)).toContain('Tasks/done.md');
		expect(model.links).toHaveLength(1);
		expect(model.links[0]).toMatchObject({ fromPath: 'Tasks/done.md', toPath: 'Tasks/open.md' });
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

	it('uses owning project name as group label for project grouping', () => {
		const project = makeTask({ path: 'Tasks/my-proj.md', name: 'My Project', type: 'project' });
		const task = makeTask({ path: 'Tasks/t.md', name: 'T', parent_task: 'Tasks/my-proj', due_date: '2026-06-01' });

		const model = buildHybridTimeline([project, task], { grouping: 'project' });

		const item = model.defined.find(i => i.path === 'Tasks/t.md')!;
		expect(item.groupLabel).toBe('My Project');
		expect(item.groupKey).toBe('project:Tasks/my-proj.md');
	});

	it('uses owning project name when task parent points to an intermediate task', () => {
		const project = makeTask({ path: 'Tasks/my-proj.md', name: 'My Project', type: 'project' });
		const parentTask = makeTask({ path: 'Tasks/epic.md', name: 'Epic', parent_task: 'Tasks/my-proj', due_date: '2026-06-01' });
		const childTask = makeTask({ path: 'Tasks/child.md', name: 'Child', parent_task: 'Tasks/epic', due_date: '2026-06-10' });

		const model = buildHybridTimeline([project, parentTask, childTask], { grouping: 'project' });

		const child = model.defined.find(i => i.path === 'Tasks/child.md')!;
		expect(child.groupLabel).toBe('My Project');
		expect(child.groupKey).toBe('project:Tasks/my-proj.md');
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