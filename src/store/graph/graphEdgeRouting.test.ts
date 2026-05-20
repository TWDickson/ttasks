import { describe, expect, it } from 'vitest';
import type { Task } from '../../types';
import type { TaskGraphEdge, TaskGraphNode } from './taskGraph';
import { computeEdgePath, sortIncomingEdges, sortOutgoingEdges } from './graphEdgeRouting';

function makeTask(path: string, name: string, laneKey: string | null): Task {
	return {
		id: path.slice(0, 6),
		slug: name.toLowerCase(),
		path,
		type: 'task',
		name,
		area: null,
		status: 'Active',
		priority: 'None',
		labels: [],
		parent_task: laneKey,
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

function makeNode(path: string, laneKey: string | null, row: number, column: number): TaskGraphNode {
	return {
		path,
		task: makeTask(path, path, laneKey),
		laneKey,
		column,
		row,
		x: 200 + column * 260,
		y: 120 + row * 134,
		width: 226,
		height: 122,
		isCycle: false,
		isBlockedChain: false,
		incomingCount: 0,
		outgoingCount: 0,
		blockedIncomingCount: 0,
	};
}

function makeEdge(id: string, from: string, to: string, isParentEdge = false): TaskGraphEdge {
	return {
		id,
		from,
		to,
		isCycle: false,
		isBlockedChain: false,
		isParentEdge,
	};
}

describe('graphEdgeRouting', () => {
	it('prioritizes same-lane outgoing edges before cross-lane edges', () => {
		const origin = makeNode('Tasks/origin.md', 'Tasks/proj-a.md', 2, 1);
		const sameLaneTarget = makeNode('Tasks/same.md', 'Tasks/proj-a.md', 2, 2);
		const crossLaneTarget = makeNode('Tasks/cross.md', 'Tasks/proj-b.md', 2, 2);
		const nodes = new Map([
			[origin.path, origin],
			[sameLaneTarget.path, sameLaneTarget],
			[crossLaneTarget.path, crossLaneTarget],
		]);

		const sorted = sortOutgoingEdges(
			origin,
			[
				makeEdge('cross', origin.path, crossLaneTarget.path),
				makeEdge('same', origin.path, sameLaneTarget.path),
			],
			nodes,
		);

		expect(sorted.map((edge) => edge.id)).toEqual(['same', 'cross']);
	});

	it('prioritizes same-lane incoming edges before cross-lane edges', () => {
		const target = makeNode('Tasks/target.md', 'Tasks/proj-a.md', 3, 2);
		const sameLaneSource = makeNode('Tasks/same-source.md', 'Tasks/proj-a.md', 2, 1);
		const crossLaneSource = makeNode('Tasks/cross-source.md', 'Tasks/proj-z.md', 2, 1);
		const nodes = new Map([
			[target.path, target],
			[sameLaneSource.path, sameLaneSource],
			[crossLaneSource.path, crossLaneSource],
		]);

		const sorted = sortIncomingEdges(
			target,
			[
				makeEdge('cross', crossLaneSource.path, target.path),
				makeEdge('same', sameLaneSource.path, target.path),
			],
			nodes,
		);

		expect(sorted.map((edge) => edge.id)).toEqual(['same', 'cross']);
	});

	it('draws tighter same-lane back edges than cross-lane back edges', () => {
		const from = makeNode('Tasks/from.md', 'Tasks/proj-a.md', 3, 3);
		const toSameLane = makeNode('Tasks/to-same.md', 'Tasks/proj-a.md', 2, 1);
		const toCrossLane = makeNode('Tasks/to-cross.md', 'Tasks/proj-b.md', 2, 1);

		const samePath = computeEdgePath(makeEdge('same', from.path, toSameLane.path), from, toSameLane, from.y + 48, toSameLane.y + 48);
		const crossPath = computeEdgePath(makeEdge('cross', from.path, toCrossLane.path), from, toCrossLane, from.y + 48, toCrossLane.y + 48);

		expect(samePath).toContain(`${from.x + from.width + 44}`);
		expect(crossPath).toContain(`${from.x + from.width + 64}`);
	});
});
