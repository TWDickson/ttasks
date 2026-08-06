import { describe, expect, it } from 'vitest';
import type { Task } from '../types';
import { computeImpediments, describeImpediment, isUpstreamImpediment, type ImpedimentStatuses } from './taskImpediment';

const STATUSES: ImpedimentStatuses = { blockStatus: 'Blocked', holdStatus: 'Hold' };

function makeTask(overrides: Partial<Task> & { path: string }): Task {
	return {
		id: overrides.path.slice(0, 6),
		slug: 'task',
		type: 'task',
		name: overrides.path,
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
		created: '2026-07-01',
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

/** a ← b ← c: c depends on b, b depends on a. */
function chain(aStatus: string, bStatus = 'Active', cStatus = 'Active'): Task[] {
	return [
		makeTask({ path: 'a.md', status: aStatus }),
		makeTask({ path: 'b.md', status: bStatus, depends_on: ['a.md'] }),
		makeTask({ path: 'c.md', status: cStatus, depends_on: ['b.md'] }),
	];
}

describe('computeImpediments', () => {
	it('returns an empty map when nothing is impeded', () => {
		expect(computeImpediments(chain('Active'), STATUSES).size).toBe(0);
	});

	describe('propagation', () => {
		it('cascades Blocked down the whole dependency chain', () => {
			const result = computeImpediments(chain('Blocked'), STATUSES);

			expect(result.get('a.md')).toMatchObject({ kind: 'blocked', source: 'self' });
			expect(result.get('b.md')).toMatchObject({ kind: 'blocked', source: 'upstream' });
			expect(result.get('c.md')).toMatchObject({ kind: 'blocked', source: 'upstream' });
		});

		it('cascades Hold the same way, as the weaker signal', () => {
			const result = computeImpediments(chain('Hold'), STATUSES);

			expect(result.get('a.md')).toMatchObject({ kind: 'held', source: 'self' });
			expect(result.get('c.md')).toMatchObject({ kind: 'held', source: 'upstream' });
		});

		it('names the originating task as the cause, not the intermediate carrier', () => {
			const result = computeImpediments(chain('Blocked'), STATUSES);
			// b is a carrier, not a cause — clearing b wouldn't unblock c.
			expect(result.get('c.md')?.causes).toEqual(['a.md']);
		});

		it('does not propagate upstream (a blocked dependent leaves its blocker alone)', () => {
			const tasks = chain('Active', 'Active', 'Blocked');
			const result = computeImpediments(tasks, STATUSES);

			expect(result.get('c.md')).toMatchObject({ source: 'self' });
			expect(result.has('a.md')).toBe(false);
			expect(result.has('b.md')).toBe(false);
		});
	});

	describe('precedence — Blocked beats Hold', () => {
		it('reads Blocked when both reach the same task', () => {
			const tasks = [
				makeTask({ path: 'blocker.md', status: 'Blocked' }),
				makeTask({ path: 'holder.md', status: 'Hold' }),
				makeTask({ path: 'target.md', depends_on: ['holder.md', 'blocker.md'] }),
			];

			expect(computeImpediments(tasks, STATUSES).get('target.md')).toMatchObject({
				kind: 'blocked',
				source: 'upstream',
				causes: ['blocker.md'],
			});
		});

		it('is order-independent: dependency order does not change the result', () => {
			const build = (deps: string[]) => [
				makeTask({ path: 'blocker.md', status: 'Blocked' }),
				makeTask({ path: 'holder.md', status: 'Hold' }),
				makeTask({ path: 'target.md', depends_on: deps }),
			];

			const holdFirst = computeImpediments(build(['holder.md', 'blocker.md']), STATUSES).get('target.md');
			const blockFirst = computeImpediments(build(['blocker.md', 'holder.md']), STATUSES).get('target.md');

			expect(holdFirst).toEqual(blockFirst);
		});

		it('is order-independent regardless of the order tasks are supplied in', () => {
			const tasks = [
				makeTask({ path: 'blocker.md', status: 'Blocked' }),
				makeTask({ path: 'holder.md', status: 'Hold' }),
				makeTask({ path: 'target.md', depends_on: ['holder.md', 'blocker.md'] }),
			];

			const forward = computeImpediments(tasks, STATUSES).get('target.md');
			const reversed = computeImpediments([...tasks].reverse(), STATUSES).get('target.md');

			expect(forward).toEqual(reversed);
		});

		it('a Hold cascade reaching an already-Blocked task leaves it Blocked', () => {
			const tasks = [
				makeTask({ path: 'holder.md', status: 'Hold' }),
				makeTask({ path: 'target.md', status: 'Blocked', depends_on: ['holder.md'] }),
			];

			expect(computeImpediments(tasks, STATUSES).get('target.md')).toMatchObject({
				kind: 'blocked',
				source: 'self',
			});
		});

		it('collects every cause at the winning rank', () => {
			const tasks = [
				makeTask({ path: 'b1.md', status: 'Blocked' }),
				makeTask({ path: 'b2.md', status: 'Blocked' }),
				makeTask({ path: 'h1.md', status: 'Hold' }),
				makeTask({ path: 'target.md', depends_on: ['b1.md', 'h1.md', 'b2.md'] }),
			];

			// Both blockers listed; the held one is outranked and dropped.
			expect(computeImpediments(tasks, STATUSES).get('target.md')?.causes).toEqual(['b1.md', 'b2.md']);
		});
	});

	describe('completion clears the impediment', () => {
		it('a completed blocker impedes nothing downstream', () => {
			const tasks = [
				makeTask({ path: 'a.md', status: 'Blocked', is_complete: true }),
				makeTask({ path: 'b.md', depends_on: ['a.md'] }),
			];

			expect(computeImpediments(tasks, STATUSES).size).toBe(0);
		});

		it('a completed task is not itself reported as impeded', () => {
			const tasks = [
				makeTask({ path: 'a.md', status: 'Blocked' }),
				makeTask({ path: 'b.md', is_complete: true, depends_on: ['a.md'] }),
			];

			const result = computeImpediments(tasks, STATUSES);
			expect(result.has('a.md')).toBe(true);
			expect(result.has('b.md')).toBe(false);
		});

		it('clearing a mid-chain blocker restores the downstream task', () => {
			const impeded = computeImpediments(chain('Blocked'), STATUSES);
			expect(impeded.has('c.md')).toBe(true);

			const cleared = chain('Blocked').map((task) =>
				task.path === 'a.md' ? { ...task, status: 'Completed', is_complete: true } : task,
			);
			expect(computeImpediments(cleared, STATUSES).has('c.md')).toBe(false);
		});
	});

	describe('link resolution', () => {
		it('resolves wiki-link style depends_on entries', () => {
			const tasks = [
				makeTask({ path: 'Tasks/a.md', status: 'Blocked', name: 'Alpha' }),
				makeTask({ path: 'Tasks/b.md', depends_on: ['[[Tasks/a|Alpha]]'] }),
			];

			expect(computeImpediments(tasks, STATUSES).get('Tasks/b.md')).toMatchObject({
				kind: 'blocked',
				source: 'upstream',
			});
		});

		it('a dangling depends_on link does not impede', () => {
			const tasks = [makeTask({ path: 'b.md', depends_on: ['Tasks/ghost.md'] })];
			expect(computeImpediments(tasks, STATUSES).size).toBe(0);
		});
	});

	describe('cycles', () => {
		it('terminates on a dependency cycle', () => {
			const tasks = [
				makeTask({ path: 'a.md', depends_on: ['b.md'] }),
				makeTask({ path: 'b.md', depends_on: ['a.md'] }),
			];

			expect(() => computeImpediments(tasks, STATUSES)).not.toThrow();
		});

		it('still reports an impediment carried by a member of a cycle', () => {
			const tasks = [
				makeTask({ path: 'a.md', status: 'Blocked', depends_on: ['b.md'] }),
				makeTask({ path: 'b.md', depends_on: ['a.md'] }),
				makeTask({ path: 'downstream.md', depends_on: ['a.md'] }),
			];

			const result = computeImpediments(tasks, STATUSES);
			expect(result.get('downstream.md')).toMatchObject({ kind: 'blocked' });
		});

		it('a self-dependency does not hang or self-impede', () => {
			const tasks = [makeTask({ path: 'a.md', depends_on: ['a.md'] })];
			expect(computeImpediments(tasks, STATUSES).size).toBe(0);
		});
	});

	describe('status configuration', () => {
		it('honours renamed statuses', () => {
			const tasks = [
				makeTask({ path: 'a.md', status: 'Escalated' }),
				makeTask({ path: 'b.md', depends_on: ['a.md'] }),
			];

			const result = computeImpediments(tasks, { blockStatus: 'Escalated', holdStatus: 'Parked' });
			expect(result.get('b.md')).toMatchObject({ kind: 'blocked' });
		});

		it('an unconfigured hold status cascades nothing', () => {
			// The guard against resolveOptionalStatus returning '' for a vault with
			// no Hold status — an empty name must not match every task.
			const tasks = [
				makeTask({ path: 'a.md', status: 'Hold' }),
				makeTask({ path: 'b.md', depends_on: ['a.md'] }),
			];

			expect(computeImpediments(tasks, { blockStatus: 'Blocked', holdStatus: '' }).size).toBe(0);
		});

		it('does not treat an empty status string as a match', () => {
			const tasks = [makeTask({ path: 'a.md', status: '' })];
			expect(computeImpediments(tasks, { blockStatus: '', holdStatus: '' }).size).toBe(0);
		});
	});

	describe('diamond and shared-blocker shapes', () => {
		it('reaches a task through two independent paths without duplicating causes', () => {
			const tasks = [
				makeTask({ path: 'root.md', status: 'Blocked' }),
				makeTask({ path: 'left.md', depends_on: ['root.md'] }),
				makeTask({ path: 'right.md', depends_on: ['root.md'] }),
				makeTask({ path: 'join.md', depends_on: ['left.md', 'right.md'] }),
			];

			expect(computeImpediments(tasks, STATUSES).get('join.md')?.causes).toEqual(['root.md']);
		});

		it('reports every sibling impeded by one shared blocker', () => {
			const tasks = [
				makeTask({ path: 'root.md', status: 'Blocked' }),
				makeTask({ path: 'x.md', depends_on: ['root.md'] }),
				makeTask({ path: 'y.md', depends_on: ['root.md'] }),
			];

			const result = computeImpediments(tasks, STATUSES);
			expect(result.size).toBe(3);
			expect(isUpstreamImpediment(result.get('x.md'))).toBe(true);
			expect(isUpstreamImpediment(result.get('y.md'))).toBe(true);
		});
	});
});

describe('describeImpediment', () => {
	const names = new Map([['Tasks/a.md', 'Ship the API'], ['Tasks/b.md', 'Sign the contract']]);

	it('names the blocking status from settings, not a hardcoded string', () => {
		const described = describeImpediment(
			{ kind: 'blocked', source: 'upstream', causes: ['Tasks/a.md'] },
			{ blockStatus: 'Escalated', holdStatus: 'Parked' },
			names,
		);

		expect(described.label).toBe('Escalated upstream');
		expect(described.tooltip).toBe('Escalated upstream — waiting on: Ship the API');
	});

	it('uses the hold status name for a held impediment', () => {
		const described = describeImpediment(
			{ kind: 'held', source: 'upstream', causes: ['Tasks/b.md'] },
			STATUSES,
			names,
		);

		expect(described.label).toBe('Hold upstream');
	});

	it('lists every cause', () => {
		const described = describeImpediment(
			{ kind: 'blocked', source: 'upstream', causes: ['Tasks/a.md', 'Tasks/b.md'] },
			STATUSES,
			names,
		);

		expect(described.tooltip).toBe('Blocked upstream — waiting on: Ship the API, Sign the contract');
	});

	// An unknown cause is still reported — the tooltip must never under-report
	// what's holding a task up. But it's reported as a missing link carrying its
	// id, not as a filename dressed up as a name (see utils/taskLabel).
	it('degrades an unknown cause to its task id rather than dropping it', () => {
		const described = describeImpediment(
			{ kind: 'blocked', source: 'upstream', causes: ['Tasks/abc123-hidden-task.md'] },
			STATUSES,
			new Map(),
		);

		expect(described.tooltip).toBe('Blocked upstream — waiting on: Missing task (abc123)');
		expect(described.tooltip).not.toContain('hidden-task');
	});

	it('omits the waiting-on clause when there are no causes', () => {
		const described = describeImpediment(
			{ kind: 'blocked', source: 'upstream', causes: [] },
			STATUSES,
			names,
		);

		expect(described.tooltip).toBe('Blocked upstream');
	});
});

describe('isUpstreamImpediment', () => {
	it('is true only for an inherited impediment', () => {
		expect(isUpstreamImpediment({ kind: 'blocked', source: 'upstream', causes: [] })).toBe(true);
		expect(isUpstreamImpediment({ kind: 'blocked', source: 'self', causes: [] })).toBe(false);
		expect(isUpstreamImpediment(undefined)).toBe(false);
	});
});
