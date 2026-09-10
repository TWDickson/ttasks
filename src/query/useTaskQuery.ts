import { derived, readable, writable } from 'svelte/store';
import type { Readable, Writable } from 'svelte/store';
import type { Task } from '../types';
import type { QuerySpec, TaskGroup } from './types';
import type { ResolvedTaskDate } from '../store/graph/taskGraphDates';
import { applyQuery } from './engine';

const SHOULD_PROFILE_QUERY = process.env.NODE_ENV === 'development';

const EMPTY_SCHEDULE: Map<string, ResolvedTaskDate> = new Map();
const emptyScheduleStore = readable(EMPTY_SCHEDULE);

function applyQueryWithOptionalTiming(
	tasks: Task[],
	query: QuerySpec,
	schedule: Map<string, ResolvedTaskDate>,
): TaskGroup[] {
	if (!SHOULD_PROFILE_QUERY) {
		return applyQuery(tasks, query, schedule);
	}

	console.time('applyQuery');
	try {
		return applyQuery(tasks, query, schedule);
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
 * list, the query spec, or the resolved schedule changes. The `query` store
 * is writable — bind to it from the UI to drive filter/sort/group controls.
 *
 * `schedule` (dependency-chain-resolved dates) is optional so a `due_date`
 * condition/sort/group reads a task's inferred finish when it has no
 * explicit due date — the same value its row badge already shows.
 */
export function createTaskQuery(
	tasks: Readable<Task[]>,
	initialQuery: QuerySpec,
	schedule: Readable<Map<string, ResolvedTaskDate>> = emptyScheduleStore,
): TaskQueryHandle {
	const query = writable<QuerySpec>(initialQuery);
	const result = derived(
		[tasks, query, schedule] as const,
		([$tasks, $query, $schedule]) => applyQueryWithOptionalTiming($tasks, $query, $schedule),
	);
	return { result, query };
}
