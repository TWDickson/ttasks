import type { Task } from '../types';

export type DebounceKey = 'name' | 'assigned_to' | 'blocked_reason';

type TimerId = ReturnType<typeof setTimeout>;

export interface TaskDetailSaveControllerOptions {
	updateTask: (taskPath: string, updates: Partial<Task>) => Promise<void>;
	getActiveTaskPath: () => string | null;
	onPendingChange?: (pendingCount: number) => void;
	debounceMs?: number;
	setTimeoutFn?: typeof setTimeout;
	clearTimeoutFn?: typeof clearTimeout;
}

export interface TaskDetailSaveController {
	saveImmediateForPath: (taskPath: string, updates: Partial<Task>) => Promise<void>;
	saveImmediate: (updates: Partial<Task>) => Promise<void>;
	saveDebounced: (key: DebounceKey, updates: Partial<Task>) => void;
	runWithPending: <T>(work: () => Promise<T>) => Promise<T>;
	dispose: () => void;
}

export function normalizeDateValue(value: string): string | null {
	if (!value) return null;
	return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

export function createTaskDetailSaveController(
	options: TaskDetailSaveControllerOptions
): TaskDetailSaveController {
	const {
		updateTask,
		getActiveTaskPath,
		onPendingChange,
		debounceMs = 600,
		setTimeoutFn = setTimeout,
		clearTimeoutFn = clearTimeout,
	} = options;

	let pendingCount = 0;
	const saveTimers: Partial<Record<DebounceKey, TimerId>> = {};

	const setPending = (nextCount: number): void => {
		pendingCount = Math.max(0, nextCount);
		onPendingChange?.(pendingCount);
	};

	const beginSave = (): void => {
		setPending(pendingCount + 1);
	};

	const endSave = (): void => {
		setPending(pendingCount - 1);
	};

	const clearSaveTimer = (key: DebounceKey): void => {
		const timer = saveTimers[key];
		if (!timer) return;
		clearTimeoutFn(timer);
		delete saveTimers[key];
	};

	const runWithPending = async <T>(work: () => Promise<T>): Promise<T> => {
		beginSave();
		try {
			return await work();
		} finally {
			endSave();
		}
	};

	const saveImmediateForPath = async (taskPath: string, updates: Partial<Task>): Promise<void> => {
		await runWithPending(async () => {
			await updateTask(taskPath, updates);
		});
	};

	const saveImmediate = async (updates: Partial<Task>): Promise<void> => {
		const taskPath = getActiveTaskPath();
		if (!taskPath) return;
		await saveImmediateForPath(taskPath, updates);
	};

	const saveDebounced = (key: DebounceKey, updates: Partial<Task>): void => {
		const taskPath = getActiveTaskPath();
		if (!taskPath) return;
		clearSaveTimer(key);
		saveTimers[key] = setTimeoutFn(() => {
			void saveImmediateForPath(taskPath, updates);
			delete saveTimers[key];
		}, debounceMs);
	};

	const dispose = (): void => {
		for (const key of Object.keys(saveTimers) as DebounceKey[]) {
			clearSaveTimer(key);
		}
	};

	return {
		saveImmediateForPath,
		saveImmediate,
		saveDebounced,
		runWithPending,
		dispose,
	};
}
