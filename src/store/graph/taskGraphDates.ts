import type { Task } from '../../types';
import { addDays, formatDateISO, isWeekend, parseIsoDate } from './graphTimeline';
import { normalizeTaskPath, resolveOwningProjectPath, dedupePaths } from './taskGraph';

// ---------------------------------------------------------------------------
// Working calendar types
// ---------------------------------------------------------------------------

export interface WorkingCalendar {
	workweekOnly: boolean;
	holidayDates: Set<string>;
	/** Recurring holidays as MM-DD, matched against any year. */
	recurringHolidays: Set<string>;
}

/**
 * Universal working-calendar configuration resolved from plugin settings.
 * Holidays are a single vault-wide list; whether a task actually skips
 * weekends/holidays is decided per area via `areaWorkweek`. Kept Obsidian-free
 * so this module stays a pure dependency of the graph/timeline layers.
 */
export interface CalendarConfig {
	/** Universal one-off holiday dates (YYYY-MM-DD). */
	holidays: string[];
	/** Universal recurring holidays as MM-DD, matched against any year. */
	recurringHolidays?: string[];
	/** Per-area "skip weekends & holidays" toggle. Areas absent fall back to
	 *  legacy per-task/project `workweek_only`. */
	areaWorkweek: Record<string, boolean>;
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
	/** Universal calendar config (holidays + per-area workweek toggle). When
	 *  omitted, only legacy per-task/project fields drive the calendar. */
	calendarConfig?: CalendarConfig;
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

function parseHolidayDates(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	return value.filter((entry): entry is string => typeof entry === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(entry));
}

function parseRecurringHolidays(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	return value.filter((entry): entry is string => typeof entry === 'string' && /^\d{2}-\d{2}$/.test(entry));
}

function isNonWorkingDay(date: Date, calendar: WorkingCalendar): boolean {
	const iso = formatDateISO(date);
	if (calendar.holidayDates.has(iso)) return true;
	if (calendar.recurringHolidays.has(iso.slice(5))) return true;
	if (!calendar.workweekOnly) return false;
	return isWeekend(date);
}

export function addCalendarDays(date: Date, days: number, calendar: WorkingCalendar): Date {
	if (days === 0) return addDays(date, days);
	if (!calendar.workweekOnly && calendar.holidayDates.size === 0 && calendar.recurringHolidays.size === 0) return addDays(date, days);

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

	// Universal config from settings (holidays + per-area skip toggle).
	const universalHolidays = parseHolidayDates(options?.calendarConfig?.holidays);
	const universalRecurringHolidays = parseRecurringHolidays(options?.calendarConfig?.recurringHolidays);
	const areaWorkweek = options?.calendarConfig?.areaWorkweek ?? {};

	// Legacy per-project fields, kept for notes not yet migrated to the
	// area-driven model.
	const projectCalendarByPath = new Map<string, WorkingCalendar>();
	for (const candidate of allTasks) {
		if (candidate.type !== 'project') continue;
		projectCalendarByPath.set(candidate.path, {
			workweekOnly: candidate.workweek_only === true,
			holidayDates: new Set(parseHolidayDates(candidate.holiday_dates)),
			recurringHolidays: new Set<string>(),
		});
	}

	// A calendar that skips nothing — shared so the common (default) case does
	// not allocate a fresh Set per task.
	const noSkipCalendar: WorkingCalendar = { workweekOnly: false, holidayDates: new Set<string>(), recurringHolidays: new Set<string>() };

	return (task: Task): WorkingCalendar => {
		const projectPath = resolveOwningProjectPath(task, allTaskByPath);
		const legacyProject = projectPath ? projectCalendarByPath.get(projectPath) : undefined;

		// A single "skip weekends & holidays" toggle governs both. Prefer the
		// per-area setting when the task's area is configured; otherwise fall
		// back to the legacy owning-project / per-task flag.
		let workweekOnly: boolean;
		if (task.area != null && task.area in areaWorkweek) {
			workweekOnly = areaWorkweek[task.area] === true;
		} else {
			workweekOnly = (legacyProject?.workweekOnly ?? false) || task.workweek_only === true;
		}

		if (!workweekOnly) return noSkipCalendar;

		// When skipping, non-working days = weekends plus the union of universal
		// (one-off + recurring), legacy-project, and legacy-per-task holidays.
		const holidayDates = new Set<string>(universalHolidays);
		if (legacyProject) for (const date of legacyProject.holidayDates) holidayDates.add(date);
		for (const date of parseHolidayDates(task.holiday_dates)) holidayDates.add(date);

		return { workweekOnly: true, holidayDates, recurringHolidays: new Set(universalRecurringHolidays) };
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
interface DependencyGraph {
	taskByPath: Map<string, Task>;
	/** Deduped, self-loop-free dependency paths that exist in the task set. */
	depsOf: Map<string, string[]>;
	dependentsOf: Map<string, string[]>;
	inDegree: Map<string, number>;
}

/**
 * Builds the dependency adjacency structure shared by date resolution and cycle
 * detection: self-references and links to unknown tasks are dropped, so both
 * consumers agree on what counts as an edge.
 */
function buildDependencyGraph(tasks: Task[]): DependencyGraph {
	const taskByPath = new Map(tasks.map((t) => [t.path, t]));

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

	return { taskByPath, depsOf, dependentsOf, inDegree };
}

/**
 * Returns the set of task paths that participate in a dependency cycle (or sit
 * downstream of one so they can never be scheduled). Reuses the same Kahn
 * in-degree traversal as `resolveTaskDates`: any node never dequeued still has
 * an unresolved dependency and is therefore part of / blocked by a cycle.
 */
export function detectDependencyCyclePaths(tasks: Task[]): Set<string> {
	const { dependentsOf, inDegree } = buildDependencyGraph(tasks);

	const queue: string[] = [];
	for (const task of tasks) {
		if ((inDegree.get(task.path) ?? 0) === 0) queue.push(task.path);
	}

	const processed = new Set<string>();
	while (queue.length > 0) {
		const path = queue.shift()!;
		processed.add(path);
		for (const dependent of dependentsOf.get(path) ?? []) {
			const newDegree = (inDegree.get(dependent) ?? 1) - 1;
			inDegree.set(dependent, newDegree);
			if (newDegree === 0) queue.push(dependent);
		}
	}

	const cyclePaths = new Set<string>();
	for (const task of tasks) {
		if (!processed.has(task.path)) cyclePaths.add(task.path);
	}
	return cyclePaths;
}

export function resolveTaskDates(
	tasks: Task[],
	options?: ResolveTaskDatesOptions,
): Map<string, ResolvedTaskDate> {
	const resolveCalendar = createWorkingCalendarResolver(tasks, options);
	const { taskByPath, depsOf, dependentsOf, inDegree } = buildDependencyGraph(tasks);

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

		const explicitStart = parseIsoDate(task.start_date);
		const explicitDue   = parseIsoDate(task.due_date);
		// Completed work is anchored on when it actually finished. This is the key
		// to propagation: a done task with no explicit start/due still resolves,
		// so everything downstream of it can inherit a date instead of stalling.
		const completedDate = task.is_complete ? parseIsoDate(task.completed) : null;

		let start: Date | null = explicitStart;
		let isInferred = false;

		if (!start && latestDepEnd) {
			start = addCalendarDays(latestDepEnd, 1, calendar);
			isInferred = true;
		}
		if (!start && explicitDue) {
			start = new Date(explicitDue.getTime());
		}
		if (!start && completedDate) {
			start = new Date(completedDate.getTime());
		}

		if (start) {
			// Completion date is the authoritative end for done work; otherwise an
			// explicit due date; otherwise the estimated duration, defaulting to a
			// single day when no estimate is given so every task has a non-zero
			// footprint and dependents advance by at least one day.
			let end: Date | null = completedDate ?? explicitDue;
			if (!end) {
				const estDays = task.estimated_days;
				const days = estDays && estDays > 0 ? Math.round(estDays) : 1;
				end = addCalendarDays(start, Math.max(0, days - 1), calendar);
			}
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
