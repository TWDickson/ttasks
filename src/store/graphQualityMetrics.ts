import type { GraphLane, TaskGraphEdge, TaskGraphNode } from './taskGraph';
import { countCrossingsByColumnPairs } from './graphCrossingOptimizer';

export interface LaneQualityMetrics {
	key: string;
	label: string;
	nodeCount: number;
	dependencyEdgeCount: number;
	crossingCount: number;
	bendScore: number;
}

export interface GraphQualityMetrics {
	nodeCount: number;
	dependencyEdgeCount: number;
	parentEdgeCount: number;
	totalCrossings: number;
	totalBendScore: number;
	laneCount: number;
	laneMetrics: LaneQualityMetrics[];
}

export function computeGraphQualityMetrics(
	nodes: TaskGraphNode[],
	edges: TaskGraphEdge[],
	lanes: GraphLane[],
): GraphQualityMetrics {
	const nodesByPath = new Map(nodes.map((node) => [node.path, node]));
	const dependencyEdges = edges.filter((edge) => !edge.isParentEdge);
	const parentEdges = edges.filter((edge) => edge.isParentEdge);

	const laneMetrics: LaneQualityMetrics[] = [];
	let totalCrossings = 0;
	let totalBendScore = 0;

	for (const lane of lanes) {
		const orderedLanePaths = [...lane.taskPaths]
			.filter((path) => nodesByPath.has(path))
			.sort((left, right) => {
				const leftNode = nodesByPath.get(left);
				const rightNode = nodesByPath.get(right);
				return (leftNode?.row ?? 0) - (rightNode?.row ?? 0);
			});

		const laneNodeSet = new Set(orderedLanePaths);
		const laneDependencyEdges = dependencyEdges.filter((edge) => (
			laneNodeSet.has(edge.from) && laneNodeSet.has(edge.to)
		));

		const crossings = countCrossingsByColumnPairs(orderedLanePaths, nodesByPath, laneDependencyEdges);
		const bendScore = laneDependencyEdges.reduce((sum, edge) => {
			const from = nodesByPath.get(edge.from);
			const to = nodesByPath.get(edge.to);
			if (!from || !to) return sum;
			return sum + Math.abs(to.row - from.row);
		}, 0);

		totalCrossings += crossings;
		totalBendScore += bendScore;

		laneMetrics.push({
			key: lane.key ?? '__unassigned__',
			label: lane.label,
			nodeCount: orderedLanePaths.length,
			dependencyEdgeCount: laneDependencyEdges.length,
			crossingCount: crossings,
			bendScore,
		});
	}

	return {
		nodeCount: nodes.length,
		dependencyEdgeCount: dependencyEdges.length,
		parentEdgeCount: parentEdges.length,
		totalCrossings,
		totalBendScore,
		laneCount: lanes.length,
		laneMetrics,
	};
}
