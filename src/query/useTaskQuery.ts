import { derived, writable } from 'svelte/store';
import type { Readable, Writable } from 'svelte/store';
import type { Task } from '../types';
import type { QuerySpec, TaskGroup } from './types';
import { applyQuery } from './engine';

export interface TaskQueryHandle {
	/** Reactive filtered/sorted/grouped result. */
	result: Readable<TaskGroup[]>;
	/** Writable query spec — update this to change filter, sort, groupBy, etc. */
	query: Writable<QuerySpec>;
}

/**
 * Creates a reactive query over a task list.
 *
 * The returned `result` store recomputes automatically whenever either the
 * task list or the query spec changes. The `query` store is writable — bind
 * to it from the UI to drive filter/sort/groupBy controls.
 */
export function createTaskQuery(
	tasks: Readable<Task[]>,
	initialQuery: QuerySpec,
): TaskQueryHandle {
	const query = writable<QuerySpec>(initialQuery);
	const result = derived(
		[tasks, query] as const,
		([$tasks, $query]) => applyQuery($tasks, $query),
	);
	return { result, query };
}
