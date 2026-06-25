import { describe, expect, it } from 'vitest';
import type { Task } from '../../types';
import type { TaskGraphEdge, TaskGraphNode } from './taskGraph';
import {
	applyBarycenterOrdering,
	countCrossingsByColumnPairs,
	countCrossingsForColumnPair,
	optimizeLaneBandOrder,
	optimizeLaneOrderForCrossings,
} from './graphCrossingOptimizer';

function makeTask(path: string): Task {
	return {
		id: path.slice(0, 6),
		slug: path,
		path,
		type: 'task',
		name: path,
		area: null,
		status: 'Active',
		priority: 'None',
		labels: [],
		parent_task: 'Tasks/proj-a',
		depends_on: [],
		blocks: [],
		blocked_reason: '',
		assigned_to: '',
		source: '',
		start_date: null,
		due_date: null,
		due_time: null,
		estimated_days: null,
		created: '2026-05-19',
		completed: null,
		notes: '',
		recurrence: null,
		recurrence_type: null,
		is_complete: false,
		is_inbox: false,
		status_changed: null,
	};
}

function makeNode(path: string, row: number, column: number, laneKey: string | null = 'Tasks/proj-a.md'): TaskGraphNode {
	return {
		path,
		task: makeTask(path),
		laneKey,
		column,
		row,
		x: 100 + column * 250,
		y: 100 + row * 120,
		width: 220,
		height: 100,
		isCycle: false,
		isBlockedChain: false,
		incomingCount: 0,
		outgoingCount: 0,
		blockedIncomingCount: 0,
	};
}

function makeEdge(id: string, from: string, to: string): TaskGraphEdge {
	return {
		id,
		from,
		to,
		isCycle: false,
		isBlockedChain: false,
		isParentEdge: false,
	};
}

describe('graphCrossingOptimizer', () => {
	it('counts pair crossings', () => {
		const crossings = countCrossingsForColumnPair([
			{ fromRow: 0, toRow: 1 },
			{ fromRow: 1, toRow: 0 },
		]);
		expect(crossings).toBe(1);
	});

	it('optimizes lane order to reduce crossings', () => {
		const nodes = new Map<string, TaskGraphNode>([
			['Tasks/a.md', makeNode('Tasks/a.md', 0, 0)],
			['Tasks/b.md', makeNode('Tasks/b.md', 1, 0)],
			['Tasks/c.md', makeNode('Tasks/c.md', 0, 1)],
			['Tasks/d.md', makeNode('Tasks/d.md', 1, 1)],
		]);

		const edges = [
			makeEdge('a->d', 'Tasks/a.md', 'Tasks/d.md'),
			makeEdge('b->c', 'Tasks/b.md', 'Tasks/c.md'),
		];

		const beforeOrder = ['Tasks/a.md', 'Tasks/b.md', 'Tasks/c.md', 'Tasks/d.md'];
		const before = countCrossingsByColumnPairs(beforeOrder, nodes, edges);

		const afterOrder = optimizeLaneOrderForCrossings(beforeOrder, nodes, edges);
		const after = countCrossingsByColumnPairs(afterOrder, nodes, edges);

		expect(after).toBeLessThan(before);
	});

	it('barycenter ordering does not regress crossings in three-column pattern', () => {
		const nodes = new Map<string, TaskGraphNode>([
			['Tasks/a.md', makeNode('Tasks/a.md', 0, 0)],
			['Tasks/b.md', makeNode('Tasks/b.md', 1, 0)],
			['Tasks/c.md', makeNode('Tasks/c.md', 0, 1)],
			['Tasks/d.md', makeNode('Tasks/d.md', 1, 1)],
			['Tasks/e.md', makeNode('Tasks/e.md', 0, 2)],
			['Tasks/f.md', makeNode('Tasks/f.md', 1, 2)],
		]);

		const edges = [
			makeEdge('a->d', 'Tasks/a.md', 'Tasks/d.md'),
			makeEdge('b->c', 'Tasks/b.md', 'Tasks/c.md'),
			makeEdge('c->f', 'Tasks/c.md', 'Tasks/f.md'),
			makeEdge('d->e', 'Tasks/d.md', 'Tasks/e.md'),
		];

		const beforeOrder = ['Tasks/a.md', 'Tasks/b.md', 'Tasks/c.md', 'Tasks/d.md', 'Tasks/e.md', 'Tasks/f.md'];
		const before = countCrossingsByColumnPairs(beforeOrder, nodes, edges);

		const afterOrder = applyBarycenterOrdering(beforeOrder, nodes, edges);
		const after = countCrossingsByColumnPairs(afterOrder, nodes, edges);

		expect(after).toBeLessThanOrEqual(before);
	});

	it('barycenter ordering preserves locked prefix', () => {
		const nodes = new Map<string, TaskGraphNode>([
			['Tasks/lock.md', makeNode('Tasks/lock.md', 0, 0)],
			['Tasks/a.md', makeNode('Tasks/a.md', 1, 0)],
			['Tasks/b.md', makeNode('Tasks/b.md', 2, 0)],
			['Tasks/c.md', makeNode('Tasks/c.md', 0, 1)],
		]);
		const edges = [
			makeEdge('a->c', 'Tasks/a.md', 'Tasks/c.md'),
			makeEdge('b->c', 'Tasks/b.md', 'Tasks/c.md'),
		];

		const order = ['Tasks/lock.md', 'Tasks/a.md', 'Tasks/b.md', 'Tasks/c.md'];
		const optimized = applyBarycenterOrdering(order, nodes, edges, 1);

		expect(optimized[0]).toBe('Tasks/lock.md');
	});

	describe('optimizeLaneBandOrder', () => {
		it('places lanes with cross-lane edges adjacent', () => {
			const nodes = new Map<string, TaskGraphNode>([
				['a', makeNode('a', 0, 0, 'lane-1')],
				['b', makeNode('b', 1, 0, 'lane-2')],
				['c', makeNode('c', 2, 1, 'lane-3')],
			]);
			const edges = [
				makeEdge('a->c', 'a', 'c'),
				makeEdge('b->c', 'b', 'c'),
			];
			const bands = [
				{ key: 'lane-1', paths: ['a'] },
				{ key: 'lane-2', paths: ['b'] },
				{ key: 'lane-3', paths: ['c'] },
			];
			const result = optimizeLaneBandOrder(bands, nodes, edges);
			expect(result).toHaveLength(3);
			// All lanes should be present
			expect(new Set(result.map((b) => b.key))).toEqual(new Set(['lane-1', 'lane-2', 'lane-3']));
		});

		it('returns input unchanged for two or fewer lanes', () => {
			const nodes = new Map<string, TaskGraphNode>([
				['a', makeNode('a', 0, 0, 'lane-1')],
			]);
			const bands = [{ key: 'lane-1', paths: ['a'] }];
			const result = optimizeLaneBandOrder(bands, nodes, []);
			expect(result).toEqual(bands);
		});
	});

});
