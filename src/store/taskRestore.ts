import type { Task } from '../types';

export type RestoreTaskInput = Pick<Task, 'status' | 'completed' | 'is_complete'>;

/**
 * Compute the status to restore when reopening a completed task.
 * Defaults to 'Active' if the task has no previous status hint.
 */
export function resolveRestoreStatus(task: RestoreTaskInput): string {
	return 'Active';
}

/**
 * Build the update payload to reopen a completed task.
 * Clears: is_complete, completed, blocked_reason
 * Sets: status to restored value
 */
export function buildRestoreInput(task: RestoreTaskInput): Partial<Task> {
	return {
		status: resolveRestoreStatus(task),
		is_complete: false,
		completed: null,
		blocked_reason: '',
	};
}
