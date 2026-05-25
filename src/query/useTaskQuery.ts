import { derived, writable } from 'svelte/store';
import type { Readable, Writable } from 'svelte/store';
import type { Task } from '../types';
import type { QuerySpec, TaskGroup } from './types';
import { applyQuery } from './engine';

const SHOULD_PROFILE_QUERY = process.env.NODE_ENV === 'development';

function applyQueryWithOptionalTiming(tasks: Task[], query: QuerySpec): TaskGroup[] {
	if (!SHOULD_PROFILE_QUERY) {
		return applyQuery(tasks, query);
	}

	console.time('applyQuery');
	try {
		return applyQuery(tasks, query);
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
 * The returned `result` store recomputes automatically whenever either the
 * task list or the query spec changes. The `query` store is writable — bind
	* to it from the UI to drive filter/sort/group controls.
 */
export function createTaskQuery(
	tasks: Readable<Task[]>,
	initialQuery: QuerySpec,
): TaskQueryHandle {
	const query = writable<QuerySpec>(initialQuery);
	const result = derived(
		[tasks, query] as const,
		([$tasks, $query]) => applyQueryWithOptionalTiming($tasks, $query),
	);
	return { result, query };
}
