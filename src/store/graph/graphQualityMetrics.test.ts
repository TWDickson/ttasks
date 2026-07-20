import { describe, expect, it } from 'vitest';
import type { Task } from '../../types';
import type { GraphLane, TaskGraphEdge, TaskGraphNode } from './taskGraph';
import { computeGraphQualityMetrics } from './graphQualityMetrics';

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

function makeEdge(id: string, from: string, to: string, isParentEdge = false): TaskGraphEdge {
	return {
		id,
		from,
		to,
		isCycle: false,
		isBlockedChain: false,
		isParentEdge,
		isSourceComplete: false,
	};
}

describe('computeGraphQualityMetrics', () => {
	it('computes aggregate graph metrics and lane breakdown', () => {
		const nodes: TaskGraphNode[] = [
			makeNode('Tasks/p1.md', 'Tasks/proj-a.md', 0, 0),
			makeNode('Tasks/p2.md', 'Tasks/proj-a.md', 1, 0),
			makeNode('Tasks/p3.md', 'Tasks/proj-a.md', 0, 1),
			makeNode('Tasks/p4.md', 'Tasks/proj-a.md', 1, 1),
			makeNode('Tasks/u1.md', null, 3, 0),
			makeNode('Tasks/u2.md', null, 4, 1),
		];

		const edges: TaskGraphEdge[] = [
			makeEdge('p1->p4', 'Tasks/p1.md', 'Tasks/p4.md'),
			makeEdge('p2->p3', 'Tasks/p2.md', 'Tasks/p3.md'),
			makeEdge('u1->u2', 'Tasks/u1.md', 'Tasks/u2.md'),
			makeEdge('parent', 'Tasks/p1.md', 'Tasks/p3.md', true),
		];

		const lanes: GraphLane[] = [
			{ key: 'Tasks/proj-a.md', label: 'Project A', taskPaths: ['Tasks/p1.md', 'Tasks/p2.md', 'Tasks/p3.md', 'Tasks/p4.md'], startRow: 0, endRow: 2 },
			{ key: null, label: 'Unassigned', taskPaths: ['Tasks/u1.md', 'Tasks/u2.md'], startRow: 3, endRow: 4 },
		];

		const metrics = computeGraphQualityMetrics(nodes, edges, lanes);

		expect(metrics.nodeCount).toBe(6);
		expect(metrics.dependencyEdgeCount).toBe(3);
		expect(metrics.parentEdgeCount).toBe(1);
		expect(metrics.laneCount).toBe(2);
		expect(metrics.totalCrossings).toBe(1);
		expect(metrics.totalBendScore).toBe(3);
		expect(metrics.laneMetrics).toHaveLength(2);
		expect(metrics.laneMetrics[0].label).toBe('Project A');
		expect(metrics.laneMetrics[0].crossingCount).toBe(1);
	});
});
