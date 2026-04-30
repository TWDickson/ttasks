import { daysBetweenLocal } from '../utils/dateUtils';
import type { Task } from '../types';

export type TaskDateBadge = {
	kind: 'completed' | 'due';
	label: string;
	title: string;
	isOverdue: boolean;
};

type TaskDateMetaInput = Pick<Task, 'completed' | 'due_date' | 'is_complete'>;

export function isTaskOverdue(task: TaskDateMetaInput, today: string): boolean {
	if (task.is_complete || !task.due_date) return false;
	return task.due_date < today;
}

export function getTaskDateBadge(task: TaskDateMetaInput, today: string): TaskDateBadge | null {
	if (task.is_complete) {
		return {
			kind: 'completed',
			label: task.completed ? `Completed ${task.completed}` : 'Completed',
			title: task.completed ?? 'Completed',
			isOverdue: false,
		};
	}

	if (!task.due_date) return null;
	return {
		kind: 'due',
		label: relativeDueDate(task.due_date, today),
		title: task.due_date,
		isOverdue: task.due_date < today,
	};
}

function relativeDueDate(due: string, today: string): string {
	if (due === today) return 'Today';
	const diff = daysBetweenLocal(today, due);
	if (diff === 1) return 'Tomorrow';
	if (diff === -1) return 'Yesterday';
	if (diff < -1) return `${Math.abs(diff)}d overdue`;
	if (diff <= 7) return `In ${diff}d`;
	return due;
}
