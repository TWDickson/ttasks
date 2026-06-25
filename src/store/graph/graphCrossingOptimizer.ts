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

	const best = applyBarycenterOrdering(orderedLanePaths, nodesByPath, edges, lockedPrefixCount);
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

export function applyBarycenterOrdering(
	orderedLanePaths: string[],
	nodesByPath: Map<string, TaskGraphNode>,
	edges: TaskGraphEdge[],
	lockedPrefixCount = 0,
): string[] {
	if (orderedLanePaths.length <= 2) return [...orderedLanePaths];

	let current = [...orderedLanePaths];
	const locked = new Set(current.slice(0, Math.max(0, lockedPrefixCount)));

	const adjacentNeighbors = buildNeighborMap(nodesByPath, edges);

	const maxPasses = Math.max(2, Math.min(8, orderedLanePaths.length));
	for (let pass = 0; pass < maxPasses; pass += 1) {
		const rank = new Map<string, number>();
		for (const [index, path] of current.entries()) {
			rank.set(path, index);
		}

		const movable = current.filter((path) => !locked.has(path));
		movable.sort((left, right) => {
			const leftScore = computeBarycenterScore(left, rank, adjacentNeighbors);
			const rightScore = computeBarycenterScore(right, rank, adjacentNeighbors);
			if (leftScore !== rightScore) return leftScore - rightScore;
			return (rank.get(left) ?? 0) - (rank.get(right) ?? 0);
		});

		current = [...current.slice(0, locked.size), ...movable];
	}

	return current;
}

function computeBarycenterScore(
	path: string,
	rank: Map<string, number>,
	adjacentNeighbors: Map<string, string[]>,
): number {
	const neighbors = adjacentNeighbors.get(path) ?? [];
	if (neighbors.length === 0) return rank.get(path) ?? Number.MAX_SAFE_INTEGER;

	let sum = 0;
	let count = 0;
	for (const neighbor of neighbors) {
		const neighborRank = rank.get(neighbor);
		if (neighborRank === undefined) continue;
		sum += neighborRank;
		count += 1;
	}

	if (count === 0) return rank.get(path) ?? Number.MAX_SAFE_INTEGER;
	return sum / count;
}

function buildNeighborMap(
	nodesByPath: Map<string, TaskGraphNode>,
	edges: TaskGraphEdge[],
): Map<string, string[]> {
	const neighbors = new Map<string, Set<string>>();
	for (const path of nodesByPath.keys()) {
		neighbors.set(path, new Set<string>());
	}

	for (const edge of edges) {
		if (edge.isParentEdge) continue;
		const from = nodesByPath.get(edge.from);
		const to = nodesByPath.get(edge.to);
		if (!from || !to) continue;
		if (from.laneKey !== to.laneKey) continue;

		neighbors.get(from.path)?.add(to.path);
		neighbors.get(to.path)?.add(from.path);
	}

	const result = new Map<string, string[]>();
	for (const [path, set] of neighbors) {
		result.set(path, [...set]);
	}
	return result;
}

// ---------------------------------------------------------------------------
// Lane order optimization
// ---------------------------------------------------------------------------

interface LaneBand {
	key: string | null;
	paths: string[];
}

/**
 * Determine the best ordering of lane bands to minimize cross-lane edge distance.
 * Uses a greedy "heaviest-neighbor-next" strategy: place the lane with the most
 * cross-lane edges to already-placed lanes next to them.
 */
export function optimizeLaneBandOrder(
	laneBands: LaneBand[],
	nodesByPath: Map<string, TaskGraphNode>,
	edges: TaskGraphEdge[],
): LaneBand[] {
	if (laneBands.length <= 2) return laneBands;

	const lanePathSets = new Map<string | null, Set<string>>();
	for (const band of laneBands) {
		lanePathSets.set(band.key, new Set(band.paths));
	}

	const crossLaneWeight = new Map<string, number>();
	for (const edge of edges) {
		if (edge.isParentEdge) continue;
		const from = nodesByPath.get(edge.from);
		const to = nodesByPath.get(edge.to);
		if (!from || !to) continue;
		if (from.laneKey === to.laneKey) continue;

		const pairKey = laneEdgePairKey(from.laneKey, to.laneKey);
		crossLaneWeight.set(pairKey, (crossLaneWeight.get(pairKey) ?? 0) + 1);
	}

	if (crossLaneWeight.size === 0) return laneBands;

	const placed: LaneBand[] = [];
	const remaining = new Set(laneBands.map((_, i) => i));

	let bestStart = 0;
	let bestStartWeight = -1;
	for (const idx of remaining) {
		let weight = 0;
		for (const otherIdx of remaining) {
			if (otherIdx === idx) continue;
			const pk = laneEdgePairKey(laneBands[idx].key, laneBands[otherIdx].key);
			weight += crossLaneWeight.get(pk) ?? 0;
		}
		if (weight > bestStartWeight) {
			bestStartWeight = weight;
			bestStart = idx;
		}
	}

	placed.push(laneBands[bestStart]);
	remaining.delete(bestStart);

	while (remaining.size > 0) {
		let bestIdx = -1;
		let bestWeight = -1;
		for (const idx of remaining) {
			let weight = 0;
			for (const p of placed) {
				const pk = laneEdgePairKey(laneBands[idx].key, p.key);
				weight += crossLaneWeight.get(pk) ?? 0;
			}
			if (weight > bestWeight || bestIdx === -1) {
				bestWeight = weight;
				bestIdx = idx;
			}
		}
		placed.push(laneBands[bestIdx]);
		remaining.delete(bestIdx);
	}

	return placed;
}

function laneEdgePairKey(a: string | null, b: string | null): string {
	const sa = a ?? '__null__';
	const sb = b ?? '__null__';
	return sa < sb ? `${sa}<>${sb}` : `${sb}<>${sa}`;
}

