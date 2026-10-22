// AR-2: the pure helpers lifted out of TaskGraph.svelte, tested against real
// layouts from buildTaskGraph rather than hand-built nodes.
import { describe, expect, it } from 'vitest';
import type { Task } from '../../types';
import { buildTaskGraph, type TaskGraphEdge, type TaskGraphNode } from './taskGraph';
import { computeEdgeAttachments, layoutEdgePath, sortIncomingEdges, sortOutgoingEdges } from './graphEdgeRouting';
import { graphLayoutKey } from './graphQualityMetrics';
import { isReadyNode, nodeSubtitle, summarizeByStatus } from './graphPresentation';
import { computeTrace } from './graphTrace';

function makeTask(overrides: Partial<Task> & Pick<Task, 'path' | 'name'>): Task {
	const { path, name, ...rest } = overrides;
	return {
		id: path.slice(6, 12), slug: name.toLowerCase(), path, type: 'task', name, area: null,
		status: 'Active', priority: 'None', labels: [], parent_task: null, depends_on: [], blocks: [],
		blocked_reason: '', assigned_to: '', source: '', start_date: null, due_date: null, due_time: null,
		estimated_days: null, created: '2026-04-02', completed: null, notes: '', repeat: null,
		is_complete: false, is_inbox: false, status_changed: null,
		...rest,
	};
}

//   A ─┬─> B ──> D
//      └─> C ──┘        E (independent)
const TASKS = [
	makeTask({ path: 'Tasks/a.md', name: 'A', is_complete: true, status: 'Done', completed: '2026-04-01' }),
	makeTask({ path: 'Tasks/b.md', name: 'B', depends_on: ['Tasks/a'] }),
	makeTask({ path: 'Tasks/c.md', name: 'C', depends_on: ['Tasks/a'] }),
	makeTask({ path: 'Tasks/d.md', name: 'D', depends_on: ['Tasks/b', 'Tasks/c'] }),
	makeTask({ path: 'Tasks/e.md', name: 'E' }),
];
const layout = buildTaskGraph(TASKS, { nodeWidth: 196, nodeHeight: 96, horizontalGap: 40, verticalGap: 10, padding: 20 });
const nodesByPath = new Map(layout.nodes.map((node) => [node.path, node]));
const node = (path: string): TaskGraphNode => nodesByPath.get(path)!;

describe('computeTrace', () => {
	it('walks the whole chain up and down from the pinned node', () => {
		const trace = computeTrace('Tasks/b.md', layout.edges);
		expect([...trace.nodes].sort()).toEqual(['Tasks/a.md', 'Tasks/b.md', 'Tasks/d.md']);
		expect(trace.edges.size).toBe(2);
	});

	it('leaves an independent node alone', () => {
		const trace = computeTrace('Tasks/e.md', layout.edges);
		expect([...trace.nodes]).toEqual(['Tasks/e.md']);
		expect(trace.edges.size).toBe(0);
	});

	it('never follows containment (parent) edges', () => {
		const edges: TaskGraphEdge[] = [
			{ id: 'p', from: 'P', to: 'X', isParentEdge: true, isCycle: false, isBlockedChain: false, isSourceComplete: false },
		];
		expect([...computeTrace('X', edges).nodes]).toEqual(['X']);
	});
});

describe('computeEdgeAttachments', () => {
	/** The component's original per-node scan, kept as the oracle. */
	function reference(): Map<string, { startY: number; endY: number }> {
		const offsets = new Map<string, { startY: number; endY: number }>();
		for (const n of layout.nodes) {
			const out = sortOutgoingEdges(n, layout.edges.filter((e) => e.from === n.path), nodesByPath);
			for (const [i, edge] of out.entries()) {
				offsets.set(edge.id, { startY: n.y + n.height * (i + 1) / (out.length + 1), endY: offsets.get(edge.id)?.endY ?? (n.y + n.height / 2) });
			}
		}
		for (const n of layout.nodes) {
			const inc = sortIncomingEdges(n, layout.edges.filter((e) => e.to === n.path), nodesByPath);
			for (const [i, edge] of inc.entries()) {
				offsets.set(edge.id, { startY: offsets.get(edge.id)?.startY ?? (n.y + n.height / 2), endY: n.y + n.height * (i + 1) / (inc.length + 1) });
			}
		}
		return offsets;
	}

	it('matches the original per-node scan exactly', () => {
		expect(computeEdgeAttachments(layout.nodes, layout.edges, nodesByPath)).toEqual(reference());
	});

	it('spreads two outgoing edges across the source node', () => {
		const attachments = computeEdgeAttachments(layout.nodes, layout.edges, nodesByPath);
		const a = node('Tasks/a.md');
		const starts = layout.edges.filter((e) => e.from === a.path).map((e) => attachments.get(e.id)!.startY).sort((x, y) => x - y);
		expect(starts).toEqual([a.y + a.height / 3, a.y + (a.height * 2) / 3]);
	});

	it('draws nothing for an edge whose endpoint is off the graph', () => {
		const ghost: TaskGraphEdge = { id: 'g', from: 'Tasks/a.md', to: 'nowhere', isParentEdge: false, isCycle: false, isBlockedChain: false, isSourceComplete: false };
		expect(layoutEdgePath(ghost, nodesByPath, new Map())).toBe('');
		expect(layoutEdgePath(layout.edges[0], nodesByPath, computeEdgeAttachments(layout.nodes, layout.edges, nodesByPath))).not.toBe('');
	});
});

describe('node presentation', () => {
	it('summarises a node by what it waits on, else what it unblocks', () => {
		expect(nodeSubtitle(node('Tasks/d.md'))).toBe('2 open dependencies');
		expect(nodeSubtitle(node('Tasks/b.md'))).toBe('1 dependency');
		expect(nodeSubtitle(node('Tasks/a.md'))).toBe('unblocks 2 tasks');
		expect(nodeSubtitle(node('Tasks/e.md'))).toBe('independent');
	});

	it('calls open work with nothing open upstream ready', () => {
		expect(isReadyNode(node('Tasks/b.md'))).toBe(true); // upstream A is done
		expect(isReadyNode(node('Tasks/d.md'))).toBe(false);
		expect(isReadyNode(node('Tasks/a.md'))).toBe(false); // done itself
	});
});

describe('summarizeByStatus', () => {
	it('counts statuses, most common first, ties alphabetical', () => {
		expect(summarizeByStatus(TASKS)).toEqual([
			{ status: 'Active', count: 4 },
			{ status: 'Done', count: 1 },
		]);
		expect(summarizeByStatus([makeTask({ path: 'x', name: 'x', status: 'Hold' }), makeTask({ path: 'y', name: 'y', status: 'Blocked' })]))
			.toEqual([{ status: 'Blocked', count: 1 }, { status: 'Hold', count: 1 }]);
	});
});

describe('graphLayoutKey', () => {
	it('ignores order but notices a structural change', () => {
		const reordered = { ...layout, nodes: [...layout.nodes].reverse(), edges: [...layout.edges].reverse() };
		expect(graphLayoutKey(reordered)).toBe(graphLayoutKey(layout));
		expect(graphLayoutKey({ ...layout, edges: layout.edges.slice(1) })).not.toBe(graphLayoutKey(layout));
	});
});
