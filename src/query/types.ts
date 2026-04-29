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
	| 'name' | 'due_date' | 'due_time' | 'start_date' | 'created'
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
	field: 'due_date';
	preset: 'agenda';
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
}

// ── Output ────────────────────────────────────────────────────────────────────

export interface TaskGroup {
	key: string;   // group label (status name, area name, 'No Area', etc.)
	tasks: import('../types').Task[];
}
