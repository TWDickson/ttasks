import type { Task } from '../../types';
import { DAY_MS, addDays, formatDateISO, isWeekend } from './graphTimeline';
import { normalizeTaskPath, resolveOwningProjectPath, dedupePaths } from './taskGraph';

// ---------------------------------------------------------------------------
// Working calendar types
// ---------------------------------------------------------------------------

export interface WorkingCalendar {
	workweekOnly: boolean;
	holidayDates: Set<string>;
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ResolvedTaskDate {
	start: Date;
	end: Date;
	/** True when start was propagated from dependency end dates rather than
	 *  set explicitly by the user. Used by the timeline to visually distinguish
	 *  inferred bars from explicitly scheduled ones. */
	isInferred: boolean;
}

export interface ResolveTaskDatesOptions {
	allTasks?: Task[];
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

export function inferParseDate(value: string | null | undefined): Date | null {
	if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
	const d = new Date(`${value}T00:00:00`);
	return isNaN(d.getTime()) ? null : d;
}

function parseHolidayDates(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	return value.filter((entry): entry is string => typeof entry === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(entry));
}

function isNonWorkingDay(date: Date, calendar: WorkingCalendar): boolean {
	if (calendar.holidayDates.has(formatDateISO(date))) return true;
	if (!calendar.workweekOnly) return false;
	return isWeekend(date);
}

export function addCalendarDays(date: Date, days: number, calendar: WorkingCalendar): Date {
	if (days === 0) return addDays(date, days);
	if (!calendar.workweekOnly && calendar.holidayDates.size === 0) return addDays(date, days);

	let cursor = new Date(date.getTime());
	let remaining = Math.abs(days);
	const step = days > 0 ? 1 : -1;

	while (remaining > 0) {
		cursor = addDays(cursor, step);
		if (isNonWorkingDay(cursor, calendar)) continue;
		remaining -= 1;
	}

	return cursor;
}

export function createWorkingCalendarResolver(
	tasks: Task[],
	options?: ResolveTaskDatesOptions,
): (task: Task) => WorkingCalendar {
	const allTasks = options?.allTasks ?? tasks;
	const allTaskByPath = new Map(allTasks.map((task) => [task.path, task]));
	const projectCalendarByPath = new Map<string, WorkingCalendar>();

	for (const candidate of allTasks) {
		if (candidate.type !== 'project') continue;
		projectCalendarByPath.set(candidate.path, {
			workweekOnly: candidate.workweek_only === true,
			holidayDates: new Set(parseHolidayDates(candidate.holiday_dates)),
		});
	}

	const defaultCalendar: WorkingCalendar = { workweekOnly: false, holidayDates: new Set<string>() };

	return (task: Task): WorkingCalendar => {
		const projectPath = resolveOwningProjectPath(task, allTaskByPath);
		if (!projectPath) return defaultCalendar;
		return projectCalendarByPath.get(projectPath) ?? defaultCalendar;
	};
}

// ---------------------------------------------------------------------------
// Public: resolve task dates via topological propagation
// ---------------------------------------------------------------------------

/**
 * Resolves start/end dates for all tasks via topological sort over the
 * dependency graph. Propagates resolved end dates forward through
 * arbitrary-depth dependency chains so that a task with no explicit dates
 * can inherit its position from its dependencies.
 *
 * Cycle handling: tasks whose in-degree never reaches zero during Kahn's
 * traversal are in a dependency cycle and are excluded from the result.
 *
 * Inclusion: a task appears in the result if at least one anchor date can
 * be established — either an explicit start_date / due_date, or a start
 * inferred from a resolved upstream dependency.
 */
export function resolveTaskDates(
	tasks: Task[],
	options?: ResolveTaskDatesOptions,
): Map<string, ResolvedTaskDate> {
	const taskByPath = new Map(tasks.map((t) => [t.path, t]));
	const resolveCalendar = createWorkingCalendarResolver(tasks, options);

	const depsOf = new Map<string, string[]>();
	for (const task of tasks) {
		const deps = dedupePaths(
			(task.depends_on ?? [])
				.map((p) => normalizeTaskPath(p))
				.filter((p): p is string => !!p && taskByPath.has(p) && p !== task.path),
		);
		depsOf.set(task.path, deps);
	}

	const dependentsOf = new Map<string, string[]>();
	for (const task of tasks) dependentsOf.set(task.path, []);
	for (const [path, deps] of depsOf) {
		for (const dep of deps) dependentsOf.get(dep)?.push(path);
	}

	const inDegree = new Map<string, number>();
	for (const task of tasks) inDegree.set(task.path, depsOf.get(task.path)?.length ?? 0);

	const queue: string[] = [];
	for (const task of tasks) {
		if ((inDegree.get(task.path) ?? 0) === 0) queue.push(task.path);
	}

	const resolved = new Map<string, ResolvedTaskDate>();

	while (queue.length > 0) {
		const path = queue.shift()!;
		const task = taskByPath.get(path);
		if (!task) continue;
		const calendar = resolveCalendar(task);
		const deps = depsOf.get(path) ?? [];

		const depEndTimes = deps
			.map((d) => resolved.get(d)?.end.getTime())
			.filter((t): t is number => t !== undefined);
		const latestDepEnd = depEndTimes.length > 0 ? new Date(Math.max(...depEndTimes)) : null;

		const explicitStart = inferParseDate(task.start_date);
		const explicitDue   = inferParseDate(task.due_date);

		let start: Date | null = explicitStart;
		let isInferred = false;

		if (!start && latestDepEnd) {
			start = addCalendarDays(latestDepEnd, 1, calendar);
			isInferred = true;
		}
		if (!start && explicitDue) {
			start = new Date(explicitDue.getTime());
		}

		if (start) {
			let end: Date | null = explicitDue;
			if (!end) {
				const estDays = task.estimated_days;
				if (estDays && estDays > 0) {
					end = addCalendarDays(start, Math.max(0, Math.round(estDays) - 1), calendar);
				}
			}
			if (!end) end = new Date(start.getTime());
			if (end.getTime() < start.getTime()) end = new Date(start.getTime());

			resolved.set(path, { start, end, isInferred });
		}

		for (const dependent of dependentsOf.get(path) ?? []) {
			const newDegree = (inDegree.get(dependent) ?? 1) - 1;
			inDegree.set(dependent, newDegree);
			if (newDegree === 0) queue.push(dependent);
		}
	}

	return resolved;
}
