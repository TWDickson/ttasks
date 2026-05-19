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

	const leftRowDelta = Math.abs((leftNode?.row ?? origin.row) - origin.row);
	const rightRowDelta = Math.abs((rightNode?.row ?? origin.row) - origin.row);
	if (leftRowDelta !== rightRowDelta) return leftRowDelta - rightRowDelta;

	const leftColumnDelta = Math.abs((leftNode?.column ?? origin.column) - origin.column);
	const rightColumnDelta = Math.abs((rightNode?.column ?? origin.column) - origin.column);
	if (leftColumnDelta !== rightColumnDelta) return leftColumnDelta - rightColumnDelta;

	const leftY = leftNode?.y ?? origin.y;
	const rightY = rightNode?.y ?? origin.y;
	if (leftY !== rightY) return leftY - rightY;

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
