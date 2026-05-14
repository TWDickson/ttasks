/**
 * Pure helpers for graph overview lane header positioning.
 * No Obsidian/Svelte deps — fully unit-testable.
 */

export interface LaneHeader {
	key: string;
	label: string;
	topPx: number;
	heightPx: number;
	taskCount: number;
}

/**
 * Converts group band data into pixel-positioned lane header descriptors.
 * Parameters match the constants used in TaskGraph.svelte.
 */
export function buildLaneHeaders(
	groups: Array<{ key: string; label: string; startRow: number; endRow: number; count?: number }>,
	rowHeight: number,
	rowGap: number,
	trackPadding: number,
): LaneHeader[] {
	return groups.map(group => ({
		key: group.key,
		label: group.label,
		topPx: trackPadding + group.startRow * (rowHeight + rowGap),
		heightPx:
			(group.endRow - group.startRow + 1) * rowHeight
			+ Math.max(0, group.endRow - group.startRow) * rowGap,
		taskCount: group.count ?? 0,
	}));
}
