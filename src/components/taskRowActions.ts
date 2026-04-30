import type { Task } from '../types';

export function canShowInlineReopen(task: Pick<Task, 'is_complete'>): boolean {
	return task.is_complete;
}
