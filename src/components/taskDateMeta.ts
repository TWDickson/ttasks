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

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Format an ISO date (YYYY-MM-DD) as "Apr 25" (same year) or "Apr 25, 2025" (different year).
 */
export function formatHumanDate(iso: string, todayIso: string): string {
	const year = parseInt(iso.slice(0, 4), 10);
	const todayYear = parseInt(todayIso.slice(0, 4), 10);
	const month = parseInt(iso.slice(5, 7), 10) - 1;
	const day = parseInt(iso.slice(8, 10), 10);
	return year === todayYear
		? `${MONTH_ABBR[month]} ${day}`
		: `${MONTH_ABBR[month]} ${day}, ${year}`;
}

export function getTaskDateBadge(task: TaskDateMetaInput, today: string): TaskDateBadge | null {
	if (task.is_complete) {
		return {
			kind: 'completed',
			label: task.completed ? `Completed ${formatHumanDate(task.completed, today)}` : 'Completed',
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
