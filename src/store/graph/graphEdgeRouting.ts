import type { TaskGraphEdge, TaskGraphNode } from './taskGraph';

export function sortOutgoingEdges(
	node: TaskGraphNode,
	edges: TaskGraphEdge[],
	nodesByPath: Map<string, TaskGraphNode>,
): TaskGraphEdge[] {
	return [...edges].sort((left, right) => {
		const leftNode = nodesByPath.get(left.to);
		const rightNode = nodesByPath.get(right.to);
		return compareByRoutingRank(node, left, leftNode, right, rightNode);
	});
}

export function sortIncomingEdges(
	node: TaskGraphNode,
	edges: TaskGraphEdge[],
	nodesByPath: Map<string, TaskGraphNode>,
): TaskGraphEdge[] {
	return [...edges].sort((left, right) => {
		const leftNode = nodesByPath.get(left.from);
		const rightNode = nodesByPath.get(right.from);
		return compareByRoutingRank(node, left, leftNode, right, rightNode);
	});
}

function compareByRoutingRank(
	origin: TaskGraphNode,
	leftEdge: TaskGraphEdge,
	leftNode: TaskGraphNode | undefined,
	rightEdge: TaskGraphEdge,
	rightNode: TaskGraphNode | undefined,
): number {
	const leftSameLane = leftNode?.laneKey === origin.laneKey ? 0 : 1;
	const rightSameLane = rightNode?.laneKey === origin.laneKey ? 0 : 1;
	if (leftSameLane !== rightSameLane) return leftSameLane - rightSameLane;

	const leftIsDependency = leftEdge.isParentEdge ? 1 : 0;
	const rightIsDependency = rightEdge.isParentEdge ? 1 : 0;
	if (leftIsDependency !== rightIsDependency) return leftIsDependency - rightIsDependency;

	// Order attachment points by the OTHER endpoint's actual vertical position
	// (directional), so an edge whose source/target sits higher attaches higher.
	// Using the signed Y — not |rowDelta| — is what prevents edges from two
	// differently-placed neighbours crossing right before they meet the node.
	const leftY = leftNode?.y ?? origin.y;
	const rightY = rightNode?.y ?? origin.y;
	if (leftY !== rightY) return leftY - rightY;

	const leftColumnDelta = Math.abs((leftNode?.column ?? origin.column) - origin.column);
	const rightColumnDelta = Math.abs((rightNode?.column ?? origin.column) - origin.column);
	if (leftColumnDelta !== rightColumnDelta) return leftColumnDelta - rightColumnDelta;

	return leftEdge.id.localeCompare(rightEdge.id);
}

export function computeEdgePath(
	edge: TaskGraphEdge,
	from: TaskGraphNode,
	to: TaskGraphNode,
	startY: number,
	endY: number,
): string {
	const startX = from.x + from.width;
	const endX = to.x;
	const deltaX = endX - startX;
	const sameLane = from.laneKey !== null && from.laneKey === to.laneKey;

	if (deltaX >= 0) {
		const baseCurve = Math.max(42, Math.abs(deltaX) * 0.45);
		const curve = sameLane ? Math.max(28, Math.round(baseCurve * 0.68)) : baseCurve;
		const yBias = sameLane ? (endY - startY) * 0.12 : 0;
		return `M ${startX} ${startY} C ${startX + curve} ${startY + yBias}, ${endX - curve} ${endY - yBias}, ${endX} ${endY}`;
	}

	const hook = sameLane ? 44 : 64;
	const shoulder = sameLane ? 18 : 22;
	const lift = sameLane ? 28 : 48;
	const midY = Math.min(startY, endY) - lift;
	return `M ${startX} ${startY} C ${startX + hook} ${startY}, ${startX + hook} ${midY}, ${startX + shoulder} ${midY} S ${endX - hook} ${midY}, ${endX} ${endY}`;
}

export interface EdgeAttachment {
	startY: number;
	endY: number;
}

/**
 * Where each edge meets its two nodes. A node's outgoing edges spread evenly
 * down its right side and its incoming edges down its left, in routing-rank
 * order, so several edges never draw on top of each other.
 */
export function computeEdgeAttachments(
	nodes: TaskGraphNode[],
	edges: TaskGraphEdge[],
	nodesByPath: Map<string, TaskGraphNode>,
): Map<string, EdgeAttachment> {
	const outgoing = new Map<string, TaskGraphEdge[]>();
	const incoming = new Map<string, TaskGraphEdge[]>();
	const push = (map: Map<string, TaskGraphEdge[]>, key: string, edge: TaskGraphEdge): void => {
		const list = map.get(key);
		if (list) list.push(edge);
		else map.set(key, [edge]);
	};
	for (const edge of edges) {
		push(outgoing, edge.from, edge);
		push(incoming, edge.to, edge);
	}
	const attachments = new Map<string, EdgeAttachment>();
	const mid = (node: TaskGraphNode): number => node.y + node.height / 2;
	for (const node of nodes) {
		const out = sortOutgoingEdges(node, outgoing.get(node.path) ?? [], nodesByPath);
		for (const [i, edge] of out.entries()) {
			const startY = node.y + node.height * (i + 1) / (out.length + 1);
			attachments.set(edge.id, { startY, endY: attachments.get(edge.id)?.endY ?? mid(node) });
		}
	}
	for (const node of nodes) {
		const inc = sortIncomingEdges(node, incoming.get(node.path) ?? [], nodesByPath);
		for (const [i, edge] of inc.entries()) {
			const endY = node.y + node.height * (i + 1) / (inc.length + 1);
			attachments.set(edge.id, { startY: attachments.get(edge.id)?.startY ?? mid(node), endY });
		}
	}
	return attachments;
}

/** The SVG path for an edge in a laid-out graph, or `''` when an endpoint isn't on it. */
export function layoutEdgePath(
	edge: TaskGraphEdge,
	nodesByPath: Map<string, TaskGraphNode>,
	attachments: Map<string, EdgeAttachment>,
): string {
	const from = nodesByPath.get(edge.from);
	const to = nodesByPath.get(edge.to);
	if (!from || !to) return '';
	const attachment = attachments.get(edge.id);
	return computeEdgePath(
		edge,
		from,
		to,
		attachment?.startY ?? (from.y + from.height / 2),
		attachment?.endY ?? (to.y + to.height / 2),
	);
}
