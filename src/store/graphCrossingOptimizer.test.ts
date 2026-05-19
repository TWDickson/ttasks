import { describe, expect, it } from 'vitest';
import type { Task } from '../types';
import type { TaskGraphEdge, TaskGraphNode } from './taskGraph';
import { countCrossingsByColumnPairs, countCrossingsForColumnPair, optimizeLaneOrderForCrossings } from './graphCrossingOptimizer';

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

function makeNode(path: string, row: number, column: number): TaskGraphNode {
	return {
		path,
		task: makeTask(path),
		laneKey: 'Tasks/proj-a.md',
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
});
