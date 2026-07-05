import type { Task } from '../types';

/**
 * Pure decision logic for the detail leaf's native header actions (P6/N1).
 * The view maps this onto the `addAction` elements: hidden when no native
 * task is active, and the complete action flips to Reopen for done tasks.
 */
export interface DetailHeaderActionState {
	hidden: boolean;
	completeIcon: 'check' | 'undo-2';
	completeLabel: 'Mark complete' | 'Reopen task';
}

export function resolveDetailHeaderActions(
	task: Pick<Task, 'is_complete'> | null,
): DetailHeaderActionState {
	if (!task) {
		return { hidden: true, completeIcon: 'check', completeLabel: 'Mark complete' };
	}
	return task.is_complete
		? { hidden: false, completeIcon: 'undo-2', completeLabel: 'Reopen task' }
		: { hidden: false, completeIcon: 'check', completeLabel: 'Mark complete' };
}
