import type { Task } from '../../types';
import type { HybridTimelineGrouping, TaskGraphNode } from './taskGraph';

export function laneHeaderClass(
	lane: { label: string; heightPx: number },
	compactHeight: number,
	rotateLabelLength: number,
): string {
	const compact = lane.heightPx < compactHeight;
	const rotate = compact || lane.label.length >= rotateLabelLength;
	return `tt-dependency-lane-header${compact ? ' is-compact' : ''}${rotate ? ' is-rotated' : ''}`;
}

export function computeDependencyLaneWidth(
	lanes: Array<{ label: string }>,
	minWidth: number,
	maxWidth: number,
): number {
	const longestLabelLength = lanes.reduce((longest, lane) => Math.max(longest, lane.label.length), 0);
	const estimated = 96 + Math.min(18, longestLabelLength) * 2.7;
	return Math.round(Math.max(minWidth, Math.min(maxWidth, estimated)));
}

export function groupingLabel(mode: HybridTimelineGrouping): string {
	if (mode === 'project') return 'Project';
	if (mode === 'dependency') return 'Dependency';
	return 'None';
}

/** Ready work: open, with nothing incomplete upstream — it can be started now. */
export function isReadyNode(node: TaskGraphNode): boolean {
	return !node.task.is_complete && node.blockedIncomingCount === 0;
}

/** The one-line dependency summary under a node card's title. */
export function nodeSubtitle(node: TaskGraphNode): string {
	if (node.blockedIncomingCount > 0) {
		return `${node.blockedIncomingCount} open ${node.blockedIncomingCount === 1 ? 'dependency' : 'dependencies'}`;
	}
	if (node.incomingCount > 0) {
		return `${node.incomingCount} ${node.incomingCount === 1 ? 'dependency' : 'dependencies'}`;
	}
	if (node.outgoingCount > 0) {
		return `unblocks ${node.outgoingCount} task${node.outgoingCount === 1 ? '' : 's'}`;
	}
	return 'independent';
}

/** Status counts for a timeline track's header, most common first. */
export function summarizeByStatus(items: Task[]): Array<{ status: string; count: number }> {
	const counts = new Map<string, number>();
	for (const item of items) {
		counts.set(item.status, (counts.get(item.status) ?? 0) + 1);
	}
	return [...counts.entries()]
		.map(([status, count]) => ({ status, count }))
		.sort((left, right) => right.count - left.count || left.status.localeCompare(right.status));
}
