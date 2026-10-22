import type { TaskGraphEdge } from './taskGraph';

export interface GraphTrace {
	nodes: Set<string>;
	edges: Set<string>;
}

/**
 * The dependency chain through one node: everything upstream and downstream of
 * `path` along dependency edges, plus the edges walked. Parent (containment)
 * edges are not part of a chain. Drives the click-pinned chain highlight.
 *
 * Pure module — no Obsidian imports.
 */
export function computeTrace(path: string, edges: TaskGraphEdge[]): GraphTrace {
	const nodes = new Set<string>([path]);
	const traced = new Set<string>();
	const walk = (start: string, direction: 'up' | 'down'): void => {
		const stack = [start];
		while (stack.length > 0) {
			const current = stack.pop();
			if (current === undefined) continue;
			for (const edge of edges) {
				if (edge.isParentEdge || traced.has(`${direction}:${edge.id}`)) continue;
				if (direction === 'down' && edge.from === current) {
					traced.add(`${direction}:${edge.id}`);
					nodes.add(edge.to);
					stack.push(edge.to);
				} else if (direction === 'up' && edge.to === current) {
					traced.add(`${direction}:${edge.id}`);
					nodes.add(edge.from);
					stack.push(edge.from);
				}
			}
		}
	};
	walk(path, 'up');
	walk(path, 'down');
	return {
		nodes,
		edges: new Set([...traced].map((key) => key.slice(key.indexOf(':') + 1))),
	};
}
