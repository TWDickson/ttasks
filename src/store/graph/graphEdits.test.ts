import { describe, expect, it } from 'vitest';
import type { Task } from '../../types';
import { laneProjectPath, planConnect, planDisconnect, planInsertBefore, planMoveToLane, type GraphEditOp } from './graphEdits';
import { SATELLITE_LANE_PREFIX } from './taskGraph';

function makeTask(name: string, overrides: Partial<Task> = {}): Task {
	const path = `Tasks/${name}.md`;
	return {
		id: name.padEnd(6, '0').slice(0, 6),
		slug: name,
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
		repeat: null,
		is_complete: false,
		is_inbox: false,
		status_changed: null,
		...overrides,
	};
}

const p = (name: string): string => `Tasks/${name}.md`;
/** Links as the store holds them: extensionless, or as aliased wiki-links. */
const deps = (...names: string[]): string[] => names.map((name) => `Tasks/${name}`);

/** Applies a plan's dependency ops to the tasks, as a store would. */
function apply(tasks: Task[], ops: GraphEditOp[]): Map<string, string[]> {
	const map = new Map(tasks.map((task) => [task.path, task.depends_on.map((d) => d.replace(/^\[\[|\|.*$|\]\]$/g, '').replace(/(\.md)?$/, '.md'))]));
	for (const op of ops) {
		if (op.kind === 'addDependency') map.get(op.taskPath)?.push(op.dependencyPath);
		if (op.kind === 'removeDependency') map.set(op.taskPath, (map.get(op.taskPath) ?? []).filter((d) => d !== op.dependencyPath));
	}
	return new Map([...map].map(([key, value]) => [key, [...value].sort()]));
}

describe('planConnect', () => {
	it('adds the blocker to the dependent', () => {
		const tasks = [makeTask('a'), makeTask('b')];
		expect(planConnect(tasks, p('a'), p('b'))).toEqual({
			ok: true,
			ops: [{ kind: 'addDependency', taskPath: p('b'), dependencyPath: p('a') }],
		});
	});

	it('refuses a self-link, an existing link, a project, and a loop', () => {
		const tasks = [
			makeTask('a'),
			makeTask('b', { depends_on: ['[[Tasks/a|a]]'] }),
			makeTask('c', { depends_on: deps('b') }),
			makeTask('proj', { type: 'project' }),
		];
		expect(planConnect(tasks, p('a'), p('a'))).toEqual({ ok: false, reason: 'self' });
		expect(planConnect(tasks, p('a'), p('b'))).toEqual({ ok: false, reason: 'exists' });
		expect(planConnect(tasks, p('proj'), p('a'))).toEqual({ ok: false, reason: 'not-task' });
		// c already (transitively) waits on a, so a waiting on c closes a loop.
		expect(planConnect(tasks, p('c'), p('a'))).toEqual({ ok: false, reason: 'cycle' });
	});
});

describe('planDisconnect', () => {
	it('removes an existing link and refuses a missing one', () => {
		const tasks = [makeTask('a'), makeTask('b', { depends_on: deps('a') })];
		expect(planDisconnect(tasks, p('a'), p('b'))).toEqual({
			ok: true,
			ops: [{ kind: 'removeDependency', taskPath: p('b'), dependencyPath: p('a') }],
		});
		expect(planDisconnect(tasks, p('b'), p('a'))).toEqual({ ok: false, reason: 'noop' });
	});
});

describe('planInsertBefore', () => {
	it('inserts an unlinked task between a target and its blocker', () => {
		const tasks = [makeTask('a'), makeTask('y', { depends_on: deps('a') }), makeTask('x')];
		const plan = planInsertBefore(tasks, p('x'), p('y'));
		expect(plan.ok).toBe(true);
		if (!plan.ok) return;
		const after = apply(tasks, plan.ops);
		expect(after.get(p('x'))).toEqual([p('a')]);
		expect(after.get(p('y'))).toEqual([p('x')]);
	});

	it('moves a later step in front of an earlier one without a loop', () => {
		// a → b → c → d; drop d onto b gives a → d → b → c.
		const tasks = [
			makeTask('a'),
			makeTask('b', { depends_on: deps('a') }),
			makeTask('c', { depends_on: deps('b') }),
			makeTask('d', { depends_on: deps('c') }),
		];
		const plan = planInsertBefore(tasks, p('d'), p('b'));
		expect(plan.ok).toBe(true);
		if (!plan.ok) return;
		const after = apply(tasks, plan.ops);
		expect(after.get(p('a'))).toEqual([]);
		expect(after.get(p('d'))).toEqual([p('a')]);
		expect(after.get(p('b'))).toEqual([p('d')]);
		expect(after.get(p('c'))).toEqual([p('b')]);
	});

	it('closes the gap a moved task leaves behind', () => {
		// a → x → c, plus an unrelated y; moving x before y joins a → c.
		const tasks = [
			makeTask('a'),
			makeTask('x', { depends_on: deps('a') }),
			makeTask('c', { depends_on: deps('x') }),
			makeTask('y'),
		];
		const plan = planInsertBefore(tasks, p('x'), p('y'));
		expect(plan.ok).toBe(true);
		if (!plan.ok) return;
		const after = apply(tasks, plan.ops);
		expect(after.get(p('c'))).toEqual([p('a')]);
		expect(after.get(p('x'))).toEqual([]);
		expect(after.get(p('y'))).toEqual([p('x')]);
	});

	it('writes adds before removes', () => {
		const tasks = [makeTask('a'), makeTask('y', { depends_on: deps('a') }), makeTask('x')];
		const plan = planInsertBefore(tasks, p('x'), p('y'));
		if (!plan.ok) throw new Error('expected a plan');
		const kinds = plan.ops.map((op) => op.kind);
		expect(kinds.lastIndexOf('addDependency')).toBeLessThan(kinds.indexOf('removeDependency'));
	});

	it('is a no-op when the task already sits right before the target', () => {
		const tasks = [makeTask('x'), makeTask('y', { depends_on: deps('x') })];
		expect(planInsertBefore(tasks, p('x'), p('y'))).toEqual({ ok: false, reason: 'noop' });
	});

	it('refuses self and project targets', () => {
		const tasks = [makeTask('x'), makeTask('proj', { type: 'project' })];
		expect(planInsertBefore(tasks, p('x'), p('x'))).toEqual({ ok: false, reason: 'self' });
		expect(planInsertBefore(tasks, p('x'), p('proj'))).toEqual({ ok: false, reason: 'not-task' });
	});
});

describe('planMoveToLane', () => {
	const proj = makeTask('proj', { type: 'project' });
	const other = makeTask('other', { type: 'project' });

	it('parents the task to the lane project', () => {
		const tasks = [proj, other, makeTask('x', { parent_task: 'Tasks/proj' })];
		expect(planMoveToLane(tasks, p('x'), p('proj'), p('other'))).toEqual({
			ok: true,
			ops: [{ kind: 'setParent', taskPath: p('x'), parentPath: p('other') }],
		});
	});

	it('unparents on the Unassigned lane and no-ops in the same lane', () => {
		const tasks = [proj, makeTask('x', { parent_task: 'Tasks/proj' }), makeTask('loose')];
		expect(planMoveToLane(tasks, p('x'), p('proj'), '__unassigned__')).toEqual({
			ok: true,
			ops: [{ kind: 'setParent', taskPath: p('x'), parentPath: null }],
		});
		expect(planMoveToLane(tasks, p('x'), p('proj'), p('proj'))).toEqual({ ok: false, reason: 'noop' });
		expect(planMoveToLane(tasks, p('loose'), null, `${SATELLITE_LANE_PREFIX}${p('proj')}`)).toEqual({ ok: false, reason: 'noop' });
	});
});

describe('laneProjectPath', () => {
	it('names a project only for a project lane', () => {
		expect(laneProjectPath(p('proj'))).toBe(p('proj'));
		expect(laneProjectPath('__unassigned__')).toBeNull();
		expect(laneProjectPath(`${SATELLITE_LANE_PREFIX}${p('proj')}`)).toBeNull();
		expect(laneProjectPath(null)).toBeNull();
	});
});
