import { derived, readable, writable } from 'svelte/store';
import type { Readable, Writable } from 'svelte/store';
import type { Task } from '../types';
import type { QuerySpec, TaskGroup } from './types';
import type { ResolvedTaskDate } from '../store/graph/taskGraphDates';
import { applyQuery } from './engine';
import { today as liveToday } from '../utils/todayStore';
import type { WeekStart } from '../utils/dateUtils';

const SHOULD_PROFILE_QUERY = process.env.NODE_ENV === 'development';

const EMPTY_SCHEDULE: Map<string, ResolvedTaskDate> = new Map();
const emptyScheduleStore = readable(EMPTY_SCHEDULE);
const defaultWeekStartStore = readable<WeekStart>(0);

function applyQueryWithOptionalTiming(
	tasks: Task[],
	query: QuerySpec,
	schedule: Map<string, ResolvedTaskDate>,
	today: string,
	weekStart: WeekStart,
): TaskGroup[] {
	if (!SHOULD_PROFILE_QUERY) {
		return applyQuery(tasks, query, schedule, { today, weekStart });
	}

	console.time('applyQuery');
	try {
		return applyQuery(tasks, query, schedule, { today, weekStart });
	} finally {
		console.timeEnd('applyQuery');
	}
}

export interface TaskQueryHandle {
	/** Reactive filtered/sorted/grouped result. */
	result: Readable<TaskGroup[]>;
	/** Writable query spec — update this to change filter, sort, grouping, etc. */
	query: Writable<QuerySpec>;
}

/**
 * Creates a reactive query over a task list.
 *
 * The returned `result` store recomputes automatically whenever the task
 * list, the query spec, the resolved schedule, or the calendar date changes. The `query` store
 * is writable — bind to it from the UI to drive filter/sort/group controls.
 *
 * `schedule` (dependency-chain-resolved dates) is optional so a `due_date`
 * condition/sort/group reads a task's inferred finish when it has no
 * explicit due date — the same value its row badge already shows.
 *
 * `weekStart` sets which day the agenda's This Week / Next Week buckets begin on.
 *
 * `today` defaults to the shared midnight-flipping store, so date-relative
 * filters and agenda buckets re-run when the date rolls over. Tests inject a
 * writable to drive it.
 */
export function createTaskQuery(
	tasks: Readable<Task[]>,
	initialQuery: QuerySpec,
	schedule: Readable<Map<string, ResolvedTaskDate>> = emptyScheduleStore,
	today: Readable<string> = liveToday,
	weekStart: Readable<WeekStart> = defaultWeekStartStore,
): TaskQueryHandle {
	const query = writable<QuerySpec>(initialQuery);
	const result = derived(
		[tasks, query, schedule, today, weekStart] as const,
		([$tasks, $query, $schedule, $today, $weekStart]) =>
			applyQueryWithOptionalTiming($tasks, $query, $schedule, $today, $weekStart),
	);
	return { result, query };
}
