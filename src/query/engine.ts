import type { Task } from '../types';
import type {
	FilterCondition,
	FilterGroup,
	FilterSpec,
	GroupByField,
	QuerySpec,
	SortSpec,
	TaskGroup,
} from './types';

// ── Date resolution ───────────────────────────────────────────────────────────

const PRIORITY_ORDER: Record<string, number> = { High: 0, Medium: 1, Low: 2, None: 3 };

/**
 * Resolves a date value which may be an absolute YYYY-MM-DD string or a
 * relative expression: 'today', '+7d', '-3d'.
 */
function resolveDate(value: string): string {
	if (value === 'today') {
		return new Date().toISOString().slice(0, 10);
	}
	const relative = /^([+-])(\d+)d$/.exec(value);
	if (relative) {
		const sign = relative[1] === '+' ? 1 : -1;
		const days = parseInt(relative[2], 10);
		const d = new Date();
		d.setDate(d.getDate() + sign * days);
		return d.toISOString().slice(0, 10);
	}
	return value;
}

function today(): string {
	return new Date().toISOString().slice(0, 10);
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
			return raw === value;

		case 'is_not':
			return raw !== value;

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

/**
 * Groups a task list by the specified field.
 * Returns an array of TaskGroup objects in a stable, meaningful order.
 * null groupBy returns a single group with key 'all'.
 */
export function applyGroup(tasks: Task[], groupBy: GroupByField): TaskGroup[] {
	if (groupBy === null) {
		return [{ key: 'all', tasks }];
	}

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
		for (const p of ['High', 'Medium', 'Low', 'None']) {
			if (map.has(p)) ordered.push({ key: p, tasks: map.get(p)! });
		}
		// Any custom priority values not in the canonical list
		for (const [key, tasks] of map) {
			if (!['High', 'Medium', 'Low', 'None'].includes(key)) {
				ordered.push({ key, tasks });
			}
		}
		return ordered;
	}

	return [...map.entries()].map(([key, tasks]) => ({ key, tasks }));
}

/**
 * Applies the full QuerySpec: search → filter → sort → group → limit.
 */
export function applyQuery(tasks: Task[], query: QuerySpec): TaskGroup[] {
	// 1. Search + filter
	const filtered = applyFilter(tasks, query.filter, query.search);

	// 2. Sort
	const sorted = applySort(filtered, query.sort);

	// 3. Apply total limit before grouping
	const limited = query.limit != null ? sorted.slice(0, query.limit) : sorted;

	// 4. Group
	const groups = applyGroup(limited, query.groupBy);

	// 5. Apply per-group limit
	if (query.limitPerGroup != null) {
		return groups.map(g => ({
			key: g.key,
			tasks: g.tasks.slice(0, query.limitPerGroup),
		}));
	}

	return groups;
}
