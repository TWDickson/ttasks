/**
 * Pure utilities for multi-select task state.
 * No Obsidian deps — fully unit-testable.
 */

export function addToSelection(current: Set<string>, path: string): Set<string> {
	const next = new Set(current);
	next.add(path);
	return next;
}

export function removeFromSelection(current: Set<string>, path: string): Set<string> {
	const next = new Set(current);
	next.delete(path);
	return next;
}

export function toggleSelection(current: Set<string>, path: string): Set<string> {
	return current.has(path) ? removeFromSelection(current, path) : addToSelection(current, path);
}

export function selectAll(paths: string[]): Set<string> {
	return new Set(paths);
}

export function clearSelection(): Set<string> {
	return new Set();
}

export interface BatchEligibility {
	canArchive: boolean;
	canComplete: boolean;
	canDelete: boolean;
}

/**
 * Computes which batch actions are available for the current selection.
 * canArchive: all selected tasks are complete.
 * canComplete: at least one selected task is not complete.
 * canDelete: always true when selection is non-empty.
 */
export function batchEligibility(
	selectedPaths: Set<string>,
	tasks: Array<{ path: string; is_complete: boolean }>,
): BatchEligibility {
	if (selectedPaths.size === 0) {
		return { canArchive: false, canComplete: false, canDelete: false };
	}
	const selected = tasks.filter(t => selectedPaths.has(t.path));
	return {
		canArchive: selected.length > 0 && selected.every(t => t.is_complete),
		canComplete: selected.some(t => !t.is_complete),
		canDelete: true,
	};
}
