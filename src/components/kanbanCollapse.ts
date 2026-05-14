/**
 * Pure utilities for Kanban column collapse state.
 * No Obsidian deps — fully unit-testable.
 */

export function toggleColumnCollapse(collapsed: Set<string>, columnId: string): Set<string> {
	const next = new Set(collapsed);
	if (next.has(columnId)) {
		next.delete(columnId);
	} else {
		next.add(columnId);
	}
	return next;
}

export function isColumnCollapsed(collapsed: Set<string>, columnId: string): boolean {
	return collapsed.has(columnId);
}

/** Serialise to a sorted string array for settings persistence. */
export function serializeCollapsed(collapsed: Set<string>): string[] {
	return [...collapsed].sort();
}

/** Deserialise from settings (handles undefined/malformed gracefully). */
export function deserializeCollapsed(raw: string[] | undefined | null): Set<string> {
	if (!Array.isArray(raw)) return new Set();
	return new Set(raw);
}
