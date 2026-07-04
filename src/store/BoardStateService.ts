import { derived, get, writable, type Readable, type Writable } from 'svelte/store';
import type { Task } from '../types';
import type { ExternalTask } from '../integration/types';

export interface BoardStateStores {
	activeTaskPath: Writable<string | null>;
	focusedTaskPath: Writable<string | null>;
	currentViewId: Writable<string>;
	searchQuery: Writable<string>;
	selectedPaths: Writable<Set<string>>;
}

export interface CreateBoardStateOptions {
	defaultViewId: string;
	activeTaskPath?: Writable<string | null>;
	focusedTaskPath?: Writable<string | null>;
}

export function createBoardStateService(options: CreateBoardStateOptions): BoardStateStores {
	return {
		activeTaskPath: options.activeTaskPath ?? writable<string | null>(null),
		focusedTaskPath: options.focusedTaskPath ?? writable<string | null>(null),
		currentViewId: writable(options.defaultViewId),
		searchQuery: writable(''),
		selectedPaths: writable(new Set<string>()),
	};
}

/**
 * Combined board task list: captured (external) tasks first — rolled-over ones
 * before today's — followed by native tasks. Shared by the board and detail
 * leaves so both resolve the same paths.
 */
export function combineBoardTasks(
	nativeTasks: Readable<Task[]>,
	capturedTasks: Readable<ExternalTask[]>,
): Readable<Task[]> {
	return derived([nativeTasks, capturedTasks], ([$native, $captured]) => [
		...$captured
			.slice()
			.sort((a, b) => (a.fromPreviousDay === b.fromPreviousDay ? 0 : a.fromPreviousDay ? -1 : 1)),
		...$native,
	]);
}

export function isTaskActive(
	activeTaskPath: Readable<string | null>,
	taskPath: string,
): Readable<boolean> {
	return derived(activeTaskPath, ($activeTaskPath) => $activeTaskPath === taskPath);
}

export function isViewActive(
	currentViewId: Readable<string>,
	viewId: string,
): Readable<boolean> {
	return derived(currentViewId, ($currentViewId) => $currentViewId === viewId);
}

export function clearSelectionOnViewChange(
	currentViewId: Readable<string>,
	selectedPaths: Writable<Set<string>>,
): () => void {
	let previousViewId = get(currentViewId);
	return currentViewId.subscribe((nextViewId) => {
		if (nextViewId === previousViewId) return;
		previousViewId = nextViewId;
		selectedPaths.set(new Set<string>());
	});
}
