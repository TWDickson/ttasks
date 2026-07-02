export type KanbanCardField = 'area' | 'dueDate' | 'labels' | 'depCount';

export const ALL_KANBAN_CARD_FIELDS: KanbanCardField[] = ['area', 'dueDate', 'labels', 'depCount'];

export interface DepCountBadge {
	/** Dependencies that are unfinished — the count that actually blocks this task. */
	blockedByOpen: number;
	/** All dependency links, including completed and dangling ones. */
	blockedByTotal: number;
	unblocks: number;
}

/**
 * Returns a badge describing this task's dependency relationships.
 *
 * `blockedByOpen` counts only dependencies that resolve to an incomplete task —
 * matching the Detail panel's "Blocked by N open" number. Completed and dangling
 * (unresolvable) links count toward `blockedByTotal` but never toward the open
 * count. Returns null when there are no relationships at all.
 *
 * @param resolveDependency Looks up a dependency link and reports whether the
 *   target is complete; return null for links that resolve to no task.
 */
export function buildDepCountBadge(
	task: { depends_on: string[]; blocks: string[] },
	resolveDependency: (link: string) => { is_complete: boolean } | null,
): DepCountBadge | null {
	const blockedByTotal = task.depends_on.length;
	const unblocks = task.blocks.length;
	if (blockedByTotal === 0 && unblocks === 0) return null;

	let blockedByOpen = 0;
	for (const dep of task.depends_on) {
		const resolved = resolveDependency(dep);
		if (resolved && !resolved.is_complete) blockedByOpen++;
	}

	return { blockedByOpen, blockedByTotal, unblocks };
}

/**
 * Returns true when the given field is included in the configured visible fields.
 * Treats undefined/empty array as "show all" for backwards compatibility.
 */
export function isFieldEnabled(fields: KanbanCardField[] | undefined, field: KanbanCardField): boolean {
	if (!fields || fields.length === 0) return true;
	return fields.includes(field);
}

/** Human-readable label for settings UI. */
export const KANBAN_CARD_FIELD_LABELS: Record<KanbanCardField, string> = {
	area: 'Area',
	dueDate: 'Due date',
	labels: 'Labels',
	depCount: 'Dependency count',
};
