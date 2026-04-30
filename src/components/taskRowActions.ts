import type { Task } from '../types';

export function canShowInlineReopen(viewId: string, task: Pick<Task, 'is_complete'>): boolean {
	return viewId === 'logbook' && task.is_complete;
}
