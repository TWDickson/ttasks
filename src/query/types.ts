// ── Filter ────────────────────────────────────────────────────────────────────

export type FilterOperator =
	| 'is' | 'is_not'
	| 'contains' | 'not_contains'
	| 'contains_any' | 'contains_all'
	| 'before' | 'after'
	| 'within_days'
	| 'is_null' | 'is_not_null';

export type FilterField =
	| 'area' | 'status' | 'priority' | 'labels' | 'type'
	| 'due_date' | 'due_time' | 'start_date' | 'created'
	| 'is_complete' | 'is_inbox'
	| 'parent_task' | 'depends_on' | 'blocks'
	| 'assigned_to';

export interface FilterCondition {
	field: FilterField;
	operator: FilterOperator;
	value?: string | number | boolean | string[];
}

export interface FilterGroup {
	logic: 'and' | 'or';
	conditions: Array<FilterCondition | FilterGroup>;
}

export type FilterSpec = FilterGroup;

// ── Sort ──────────────────────────────────────────────────────────────────────

export type SortField =
	| 'name' | 'due_date' | 'due_time' | 'start_date' | 'created' | 'completed'
	| 'priority' | 'status' | 'area' | 'type';

export interface SortEntry {
	field: SortField;
	direction: 'asc' | 'desc';
}

export type SortSpec = SortEntry[];

export type SortScope = 'global' | 'within_groups';

// ── Group ─────────────────────────────────────────────────────────────────────

export type GroupField =
	| 'status' | 'area' | 'priority' | 'type'
	| 'due_date' | 'parent_task';

export interface NoGroupSpec {
	kind: 'none';
}

export interface FieldGroupSpec {
	kind: 'field';
	field: GroupField;
}

export interface DateBucketGroupSpec {
	kind: 'date_buckets';
	field: 'due_date' | 'completed';
	preset: 'agenda' | 'logbook';
}

export type GroupSpec = NoGroupSpec | FieldGroupSpec | DateBucketGroupSpec;

// ── QuerySpec — the full query object ─────────────────────────────────────────

export interface QuerySpec {
	filter: FilterSpec;
	sort: SortSpec;
	/** How sort is applied when grouping is active. */
	sortScope?: SortScope;
	group: GroupSpec;
	/** Cap total results after sort. */
	limit?: number;
	/** Cap results per group after sort (e.g. top 1 per area). */
	limitPerGroup?: number;
	/** Pre-filter full-text match on task name + notes (case-insensitive). */
	search?: string;
	/**
	 * For `date_buckets` grouping only: a status that always buckets as "today"
	 * regardless of due date (an in-progress task with no/later due date still
	 * belongs in today's view of the world). Never demotes an already-overdue
	 * task out of the 'overdue' bucket.
	 */
	activeStatusBucket?: string | null;
	/**
	 * Stable-partitions the final result: tasks with no unfinished dependency
	 * float above ones still blocked, within whatever sort already applies.
	 */
	readyFirst?: boolean;
}

// ── Output ────────────────────────────────────────────────────────────────────

export interface TaskGroup {
	key: string;   // group label (status name, area name, 'No Area', etc.)
	tasks: import('../types').Task[];
}
