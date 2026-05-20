import type { Task } from '../types';

/**
 * Build the update payload to reopen a completed task.
 * Clears: is_complete, completed, blocked_reason
 * Sets: status to 'Active'
 */
export function buildRestoreInput(): Partial<Task> {
	return {
		status: 'Active',
		is_complete: false,
		completed: null,
		blocked_reason: '',
	};
}
