import type { Task } from '../types';

/**
 * Build the update payload to reopen a completed task.
 * Clears: is_complete, completed, blocked_reason
 * Sets: status to the first configured status (the user's "open" status).
 */
export function buildRestoreInput(firstStatus: string = 'Active'): Partial<Task> {
	return {
		status: firstStatus,
		is_complete: false,
		completed: null,
		blocked_reason: '',
	};
}
