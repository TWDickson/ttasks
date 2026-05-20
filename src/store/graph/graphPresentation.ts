import type { HybridTimelineGrouping } from './taskGraph';

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
