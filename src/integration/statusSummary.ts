import type { Task } from '../types';
import { localDateString } from '../utils/dateUtils';

export interface StatusSummary {
	dueToday: number;
	overdue: number;
	inProgress: number;
	blocked: number;
	/** Compact status-bar text — urgency only (overdue + blocked). */
	label: string;
	/** Multi-line hover breakdown of all four counts. */
	tooltip: string;
}

export interface StatusSummaryOptions {
	today?: string;
	blockStatus: string;
	inProgressStatus: string;
}

function todayString(): string {
	return localDateString();
}

export function buildStatusSummary(tasks: Task[], options: StatusSummaryOptions): StatusSummary {
	const today = options.today ?? todayString();
	let dueToday = 0;
	let overdue = 0;
	let inProgress = 0;
	let blocked = 0;

	for (const task of tasks) {
		if (task.is_complete) continue;
		if (task.status === options.blockStatus) blocked += 1;
		if (task.status === options.inProgressStatus) inProgress += 1;
		if (task.due_date !== null) {
			if (task.due_date < today) overdue += 1;
			else if (task.due_date === today) dueToday += 1;
		}
	}

	const parts: string[] = [];
	if (overdue > 0) parts.push(`${overdue} overdue`);
	if (blocked > 0) parts.push(`${blocked} blocked`);
	const label = parts.length === 0 ? 'TTasks: all clear' : `TTasks: ${parts.join(' · ')}`;

	const tooltip = [
		`Due today: ${dueToday}`,
		`Overdue: ${overdue}`,
		`In progress: ${inProgress}`,
		`Blocked: ${blocked}`,
	].join('\n');

	return { dueToday, overdue, inProgress, blocked, label, tooltip };
}
