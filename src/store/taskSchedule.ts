/**
 * Presentation-facing wrapper over the dependency-graph date resolver.
 *
 * `resolveTaskDates` propagates start/end dates through the dependency graph, but
 * its result was previously used only for timeline bar positions. This module
 * exposes the same resolution to the Detail panel, list rows, and dependency
 * cards so a task whose schedule is implied by its chain shows consistent dates
 * everywhere — the fix for "figuring out dates in dependency chains is hard."
 *
 * Pure aside from the identity-keyed memo cache.
 */
import type { Task } from '../types';
import { resolveTaskDates, type ResolvedTaskDate, type ResolveTaskDatesOptions } from './graph/taskGraphDates';
import { formatDateISO } from '../utils/dateUtils';

export type { ResolvedTaskDate };

// The store replaces the task array on every change, so caching on array
// identity is sufficient: a new array means a recompute, the same array reuses.
// The cached entry also records the calendar-config signature so a settings
// change (holidays / per-area workweek) invalidates a stale schedule.
interface ScheduleCacheEntry {
	sig: string;
	result: Map<string, ResolvedTaskDate>;
}
const cache = new WeakMap<Task[], ScheduleCacheEntry>();

function calendarConfigSignature(options?: ResolveTaskDatesOptions): string {
	const config = options?.calendarConfig;
	if (!config) return '';
	return JSON.stringify([config.holidays, config.areaWorkweek]);
}

/**
 * Resolve every task's effective schedule. Memoized on the `tasks` array
 * identity (plus the calendar-config signature) on the presentation path. Calls
 * that pass `allTasks` (the graph/timeline layout, which resolve over freshly
 * built filtered sub-lists) are computed directly and not cached.
 */
export function buildTaskSchedule(tasks: Task[], options?: ResolveTaskDatesOptions): Map<string, ResolvedTaskDate> {
	if (options?.allTasks) return resolveTaskDates(tasks, options);
	const sig = calendarConfigSignature(options);
	const cached = cache.get(tasks);
	if (cached && cached.sig === sig) return cached.result;
	const result = resolveTaskDates(tasks, options);
	cache.set(tasks, { sig, result });
	return result;
}

export interface ProjectedSchedule {
	start: string;
	end: string;
	isInferred: boolean;
}

/**
 * Detail-panel display rule (pure). Returns the projected schedule to show under
 * the Start/Due fields, or null when it adds no information.
 *
 * Shows when the resolution is inferred, or when the resolved end differs from
 * the explicit due date (e.g. end derived from `estimated_days`). Hides when the
 * explicit due date already matches the resolution and nothing was inferred.
 */
export function resolveProjectedSchedule(
	task: Pick<Task, 'due_date'>,
	resolved: ResolvedTaskDate | undefined,
): ProjectedSchedule | null {
	if (!resolved) return null;
	const start = formatDateISO(resolved.start);
	const end = formatDateISO(resolved.end);
	const addsInfo = resolved.isInferred || end !== (task.due_date ?? null);
	if (!addsInfo) return null;
	return { start, end, isInferred: resolved.isInferred };
}

/**
 * List-row / dependency-card inferred-date badge rule (pure). Returns the
 * projected finish date to show as a `~{date}` badge, or null.
 *
 * Only for an incomplete task that has no explicit due date but does have a
 * resolved schedule entry. The badge is informational; it never drives overdue
 * styling or agenda bucketing.
 */
export function resolveInferredDueDate(
	task: Pick<Task, 'due_date' | 'is_complete'>,
	resolved: ResolvedTaskDate | undefined,
): string | null {
	if (task.is_complete) return null;
	if (task.due_date) return null;
	if (!resolved) return null;
	return formatDateISO(resolved.end);
}
