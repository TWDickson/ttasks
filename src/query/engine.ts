import type { Task } from '../types';
import type {
	FilterCondition,
	FilterGroup,
	FilterSpec,
	FieldGroupSpec,
	GroupSpec,
	QuerySpec,
	SortScope,
	SortSpec,
	TaskGroup,
} from './types';
import { addDaysLocal, localDateString } from '../utils/dateUtils';
import { AGENDA_BUCKET_ORDER, type AgendaBucketKey } from './agendaBuckets';
import { PRIORITIES } from '../constants';
import { sortReadyFirst } from './taskReadiness';

// ── Date resolution ───────────────────────────────────────────────────────────

const PRIORITY_ORDER: Record<string, number> = Object.fromEntries(PRIORITIES.map((p, i) => [p, i]));

/**
 * Resolves a date value which may be an absolute YYYY-MM-DD string or a
 * relative expression: 'today', '+7d', '-3d'.
 */
function resolveDate(value: string): string {
	if (value === 'today') {
		return localDateString();
	}
	const relative = /^([+-])(\d+)d$/.exec(value);
	if (relative) {
		const sign = relative[1] === '+' ? 1 : -1;
		const days = parseInt(relative[2], 10);
		return addDaysLocal(localDateString(), sign * days);
	}
	return value;
}

function today(): string {
	return localDateString();
}

const RELATIVE_DATE_RE = /^(today|[+-]\d+d)$/;

/**
 * For equality operators (`is`/`is_not`) a relative date expression such as
 * `'today'` or `'+7d'` must be resolved to a concrete YYYY-MM-DD string before
 * comparing, otherwise `due_date === 'today'` never matches. Non-relative values
 * are returned untouched.
 */
function resolveEqualityValue(value: unknown): unknown {
	if (typeof value === 'string' && RELATIVE_DATE_RE.test(value)) {
		return resolveDate(value);
	}
	return value;
}

// ── Field extraction ──────────────────────────────────────────────────────────

function getFieldValue(task: Task, field: string): unknown {
	return (task as unknown as Record<string, unknown>)[field] ?? null;
}

// ── Single condition evaluation ───────────────────────────────────────────────

function evalCondition(task: Task, cond: FilterCondition): boolean {
	const { field, operator, value } = cond;
	const raw = getFieldValue(task, field);

	switch (operator) {
		case 'is':
			return raw === resolveEqualityValue(value);

		case 'is_not':
			return raw !== resolveEqualityValue(value);

		case 'is_null':
			// For arrays, null means empty
			return raw === null || (Array.isArray(raw) && raw.length === 0);

		case 'is_not_null':
			return raw !== null && !(Array.isArray(raw) && raw.length === 0);

		case 'contains': {
			if (Array.isArray(raw)) return raw.includes(value as string);
			if (typeof raw === 'string') return raw.includes(value as string);
			return false;
		}

		case 'not_contains': {
			if (Array.isArray(raw)) return !raw.includes(value as string);
			if (typeof raw === 'string') return !raw.includes(value as string);
			return true;
		}

		case 'contains_any': {
			if (!Array.isArray(raw) || !Array.isArray(value)) return false;
			return (value as string[]).some(v => raw.includes(v));
		}

		case 'contains_all': {
			if (!Array.isArray(raw) || !Array.isArray(value)) return false;
			return (value as string[]).every(v => raw.includes(v));
		}

		case 'before': {
			if (typeof raw !== 'string') return false;
			return raw < resolveDate(value as string);
		}

		case 'after': {
			if (typeof raw !== 'string') return false;
			return raw > resolveDate(value as string);
		}

		case 'within_days': {
			if (typeof raw !== 'string') return false;
			const t = today();
			const cutoff = resolveDate(`+${value as number}d`);
			return raw >= t && raw <= cutoff;
		}

		default:
			return false;
	}
}

// ── Group evaluation (recursive) ─────────────────────────────────────────────

function evalGroup(task: Task, group: FilterGroup): boolean {
	if (group.conditions.length === 0) return true;

	if (group.logic === 'and') {
		return group.conditions.every(c =>
			'logic' in c ? evalGroup(task, c) : evalCondition(task, c)
		);
	} else {
		return group.conditions.some(c =>
			'logic' in c ? evalGroup(task, c) : evalCondition(task, c)
		);
	}
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Filters a task list using a FilterSpec (recursive AND/OR tree).
 * Optional `search` string pre-filters on name + notes (case-insensitive).
 */
export function applyFilter(tasks: Task[], spec: FilterSpec, search?: string): Task[] {
	let result = tasks;

	if (search && search.trim()) {
		const lower = search.trim().toLowerCase();
		result = result.filter(t =>
			t.name.toLowerCase().includes(lower) ||
			t.notes.toLowerCase().includes(lower)
		);
	}

	return result.filter(t => evalGroup(t, spec));
}

/**
 * Sorts a task list by one or more sort keys in order.
 * Priority uses semantic ordering (High → Medium → Low → None).
 * Null date values always sort last regardless of direction.
 */
export function applySort(tasks: Task[], sort: SortSpec): Task[] {
	if (sort.length === 0) return [...tasks];

	return [...tasks].sort((a, b) => {
		for (const { field, direction } of sort) {
			const av = getFieldValue(a, field);
			const bv = getFieldValue(b, field);
			const mul = direction === 'asc' ? 1 : -1;

			if (field === 'priority') {
				const ap = PRIORITY_ORDER[av as string] ?? 3;
				const bp = PRIORITY_ORDER[bv as string] ?? 3;
				if (ap !== bp) return (ap - bp) * mul;
				continue;
			}

			// Nulls always last
			if (av == null && bv == null) continue;
			if (av == null) return 1;
			if (bv == null) return -1;

			if ((av as string) < (bv as string)) return -1 * mul;
			if ((av as string) > (bv as string)) return 1 * mul;
		}
		return 0;
	});
}

function applyFieldGroup(tasks: Task[], group: FieldGroupSpec): TaskGroup[] {
	const groupBy = group.field;

	const map = new Map<string, Task[]>();

	for (const task of tasks) {
		const raw = getFieldValue(task, groupBy);
		const key = raw === null
			? groupBy === 'parent_task' ? 'No Parent'
			: groupBy === 'area'        ? 'No Area'
			: 'None'
			: String(raw);

		if (!map.has(key)) map.set(key, []);
		map.get(key)!.push(task);
	}

	// Priority groups get semantic ordering
	if (groupBy === 'priority') {
		const ordered: TaskGroup[] = [];
		for (const p of PRIORITIES) {
			if (map.has(p)) ordered.push({ key: p, tasks: map.get(p)! });
		}
		// Any custom priority values not in the canonical list
		for (const [key, tasks] of map) {
			if (!(PRIORITIES as readonly string[]).includes(key)) {
				ordered.push({ key, tasks });
			}
		}
		return ordered;
	}

	return [...map.entries()].map(([key, tasks]) => ({ key, tasks }));
}

function classifyAgendaBucketByDate(dueDate: string | null): AgendaBucketKey {
	if (!dueDate) return 'no-date';
	const current = today();
	if (dueDate < current) return 'overdue';
	if (dueDate === current) return 'today';
	if (dueDate === addDaysLocal(current, 1)) return 'tomorrow';
	if (dueDate <= addDaysLocal(current, 7)) return 'this-week';
	if (dueDate <= addDaysLocal(current, 14)) return 'next-week';
	return 'later';
}

/**
 * An active-status task (e.g. "In Progress") always reads as "today" — work
 * underway belongs in today's view regardless of its due date — but an
 * already-overdue task keeps that more urgent signal instead.
 */
function classifyAgendaBucket(task: Task, activeStatusBucket: string | null | undefined): AgendaBucketKey {
	const dateBucket = classifyAgendaBucketByDate(task.due_date);
	if (activeStatusBucket && task.status === activeStatusBucket && dateBucket !== 'overdue') {
		return 'today';
	}
	return dateBucket;
}

function applyAgendaDateBuckets(tasks: Task[], activeStatusBucket: string | null | undefined): TaskGroup[] {
	const map = new Map<AgendaBucketKey, Task[]>();
	for (const key of AGENDA_BUCKET_ORDER) {
		map.set(key, []);
	}

	for (const task of tasks) {
		const key = classifyAgendaBucket(task, activeStatusBucket);
		map.get(key)!.push(task);
	}

	const bucketSort: SortSpec = [
		{ field: 'due_date', direction: 'asc' },
		{ field: 'priority', direction: 'asc' },
	];

	const groups: TaskGroup[] = [];
	for (const key of AGENDA_BUCKET_ORDER) {
		const bucketTasks = map.get(key) ?? [];
		if (bucketTasks.length > 0) {
			groups.push({ key, tasks: applySort(bucketTasks, bucketSort) });
		}
	}

	return groups;
}

type LogbookBucketKey = 'today' | 'yesterday' | 'this-week' | 'earlier' | 'no-date';

const LOGBOOK_BUCKET_ORDER: LogbookBucketKey[] = [
	'today', 'yesterday', 'this-week', 'earlier', 'no-date',
];

function classifyLogbookBucket(completedDate: string | null): LogbookBucketKey {
	if (!completedDate) return 'no-date';
	const current = today();
	if (completedDate === current) return 'today';
	if (completedDate === addDaysLocal(current, -1)) return 'yesterday';
	if (completedDate > addDaysLocal(current, -7)) return 'this-week';
	return 'earlier';
}

function applyLogbookDateBuckets(tasks: Task[]): TaskGroup[] {
	const map = new Map<LogbookBucketKey, Task[]>();
	for (const key of LOGBOOK_BUCKET_ORDER) {
		map.set(key, []);
	}

	for (const task of tasks) {
		const key = classifyLogbookBucket(task.completed);
		map.get(key)!.push(task);
	}

	const bucketSort: SortSpec = [
		{ field: 'completed', direction: 'desc' },
		{ field: 'priority', direction: 'asc' },
	];

	const groups: TaskGroup[] = [];
	for (const key of LOGBOOK_BUCKET_ORDER) {
		const bucketTasks = map.get(key) ?? [];
		if (bucketTasks.length > 0) {
			groups.push({ key, tasks: applySort(bucketTasks, bucketSort) });
		}
	}

	return groups;
}

/**
 * Groups a task list according to the query grouping strategy.
 * Returns an array of TaskGroup objects in a stable, meaningful order.
 */
export function applyGroup(tasks: Task[], group: GroupSpec, activeStatusBucket?: string | null): TaskGroup[] {
	if (group.kind === 'none') {
		return [{ key: 'all', tasks }];
	}

	if (group.kind === 'field') {
		return applyFieldGroup(tasks, group);
	}

	if (group.kind === 'date_buckets') {
		if (group.preset === 'logbook') {
			return applyLogbookDateBuckets(tasks);
		}
		return applyAgendaDateBuckets(tasks, activeStatusBucket);
	}

	return applyAgendaDateBuckets(tasks, activeStatusBucket);
}

/**
 * Caps grouped results: first each group to `limitPerGroup`, then (when `limit`
 * is given) the total task count across groups while preserving group order.
 * Either cap is skipped when its argument is null/undefined.
 */
function capGroups(groups: TaskGroup[], limitPerGroup: number | undefined, limit: number | undefined): TaskGroup[] {
	let result = limitPerGroup != null
		? groups.map(g => ({ key: g.key, tasks: g.tasks.slice(0, limitPerGroup) }))
		: groups;

	if (limit != null) {
		let remaining = limit;
		const capped: TaskGroup[] = [];
		for (const group of result) {
			if (remaining <= 0) break;
			if (group.tasks.length === 0) continue;
			const take = Math.min(remaining, group.tasks.length);
			capped.push({ key: group.key, tasks: group.tasks.slice(0, take) });
			remaining -= take;
		}
		result = capped;
	}

	return result;
}

/**
 * Applies the full QuerySpec: search → filter → sort → group → limit.
 */
export function applyQuery(tasks: Task[], query: QuerySpec): TaskGroup[] {
	const filtered = applyFilter(tasks, query.filter, query.search);
	const sortScope: SortScope = query.sortScope ?? (query.group.kind === 'none' ? 'global' : 'within_groups');

	// Global (and always-global ungrouped) mode: sort the flat list, apply the
	// total row limit, then group. Per-group capping happens after grouping;
	// the total limit was already applied pre-group, so it is not re-applied.
	if (query.group.kind === 'none' || sortScope === 'global') {
		const sorted0 = applySort(filtered, query.sort);
		const sorted = query.readyFirst ? sortReadyFirst(sorted0, tasks) : sorted0;
		const limited = query.limit != null ? sorted.slice(0, query.limit) : sorted;
		const groups = applyGroup(limited, query.group, query.activeStatusBucket);
		return capGroups(groups, query.limitPerGroup, undefined);
	}

	// Within-groups mode: group first, sort within each group, then cap.
	const groups = applyGroup(filtered, query.group, query.activeStatusBucket).map((group) => {
		const sorted = applySort(group.tasks, query.sort);
		return {
			key: group.key,
			tasks: query.readyFirst ? sortReadyFirst(sorted, tasks) : sorted,
		};
	});
	return capGroups(groups, query.limitPerGroup, query.limit);
}
