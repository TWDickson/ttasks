export type KanbanCardField = 'area' | 'dueDate' | 'labels' | 'depCount';

export const ALL_KANBAN_CARD_FIELDS: KanbanCardField[] = ['area', 'dueDate', 'labels', 'depCount'];

export interface DepCountBadge {
	blockedBy: number;
	unblocks: number;
}

/**
 * Returns a badge showing how many tasks this one depends on and how many it unblocks.
 * Returns null when there are no relationships (nothing to display).
 */
export function buildDepCountBadge(task: {
	depends_on: string[];
	blocks: string[];
}): DepCountBadge | null {
	const blockedBy = task.depends_on.length;
	const unblocks = task.blocks.length;
	if (blockedBy === 0 && unblocks === 0) return null;
	return { blockedBy, unblocks };
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
