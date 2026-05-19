import type { TaskGraphEdge, TaskGraphNode } from './taskGraph';

export interface ColumnPairEdgeProjection {
	fromRow: number;
	toRow: number;
}

export function countCrossingsForColumnPair(edges: ColumnPairEdgeProjection[]): number {
	let crossings = 0;
	for (let i = 0; i < edges.length; i += 1) {
		for (let j = i + 1; j < edges.length; j += 1) {
			const a = edges[i];
			const b = edges[j];
			if ((a.fromRow - b.fromRow) * (a.toRow - b.toRow) < 0) {
				crossings += 1;
			}
		}
	}
	return crossings;
}

export function countCrossingsByColumnPairs(
	orderedLanePaths: string[],
	nodesByPath: Map<string, TaskGraphNode>,
	edges: TaskGraphEdge[],
): number {
	const rankByPath = new Map<string, number>();
	for (const [index, path] of orderedLanePaths.entries()) {
		rankByPath.set(path, index);
	}

	const pairs = new Map<string, ColumnPairEdgeProjection[]>();

	for (const edge of edges) {
		if (edge.isParentEdge) continue;
		const from = nodesByPath.get(edge.from);
		const to = nodesByPath.get(edge.to);
		if (!from || !to) continue;
		if (from.laneKey !== to.laneKey) continue;

		const fromRow = rankByPath.get(from.path);
		const toRow = rankByPath.get(to.path);
		if (fromRow === undefined || toRow === undefined) continue;

		const leftCol = Math.min(from.column, to.column);
		const rightCol = Math.max(from.column, to.column);
		if (leftCol === rightCol) continue;

		const key = `${leftCol}->${rightCol}`;
		const list = pairs.get(key) ?? [];
		list.push({ fromRow, toRow });
		pairs.set(key, list);
	}

	let total = 0;
	for (const projections of pairs.values()) {
		total += countCrossingsForColumnPair(projections);
	}
	return total;
}

function countVerticalDeltaPenalty(
	orderedLanePaths: string[],
	nodesByPath: Map<string, TaskGraphNode>,
	edges: TaskGraphEdge[],
): number {
	const rankByPath = new Map<string, number>();
	for (const [index, path] of orderedLanePaths.entries()) {
		rankByPath.set(path, index);
	}

	let penalty = 0;
	for (const edge of edges) {
		if (edge.isParentEdge) continue;
		const from = nodesByPath.get(edge.from);
		const to = nodesByPath.get(edge.to);
		if (!from || !to) continue;
		if (from.laneKey !== to.laneKey) continue;
		const fromRank = rankByPath.get(from.path);
		const toRank = rankByPath.get(to.path);
		if (fromRank === undefined || toRank === undefined) continue;
		penalty += Math.abs(toRank - fromRank);
	}
	return penalty;
}

function scoreLaneOrder(
	orderedLanePaths: string[],
	nodesByPath: Map<string, TaskGraphNode>,
	edges: TaskGraphEdge[],
): number {
	const crossings = countCrossingsByColumnPairs(orderedLanePaths, nodesByPath, edges);
	const bendPenalty = countVerticalDeltaPenalty(orderedLanePaths, nodesByPath, edges);
	// Crossings dominate; bend penalty refines tie-breaks.
	return crossings * 10_000 + bendPenalty;
}

export function optimizeLaneOrderForCrossings(
	orderedLanePaths: string[],
	nodesByPath: Map<string, TaskGraphNode>,
	edges: TaskGraphEdge[],
	lockedPrefixCount = 0,
): string[] {
	if (orderedLanePaths.length <= 2) return orderedLanePaths;

	const best = [...orderedLanePaths];
	let bestScore = scoreLaneOrder(best, nodesByPath, edges);

	const maxPasses = Math.max(2, Math.min(10, orderedLanePaths.length));
	for (let pass = 0; pass < maxPasses; pass += 1) {
		let improved = false;
		for (let i = Math.max(lockedPrefixCount, 0); i < best.length - 1; i += 1) {
			const candidate = [...best];
			const tmp = candidate[i];
			candidate[i] = candidate[i + 1];
			candidate[i + 1] = tmp;

			const candidateScore = scoreLaneOrder(candidate, nodesByPath, edges);
			if (candidateScore < bestScore) {
				bestScore = candidateScore;
				best.splice(0, best.length, ...candidate);
				improved = true;
			}
		}

		if (!improved) break;
	}

	return best;
}
