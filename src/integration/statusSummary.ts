import type { Task } from '../types';
import { localDateString } from '../utils/dateUtils';

export interface StatusSummary {
	overdue: number;
	blocked: number;
	label: string;
}

export interface StatusSummaryOptions {
	today?: string;
	blockStatus: string;
}

function todayString(): string {
	return localDateString();
}

export function buildStatusSummary(tasks: Task[], options: StatusSummaryOptions): StatusSummary {
	const today = options.today ?? todayString();
	let overdue = 0;
	let blocked = 0;

	for (const task of tasks) {
		if (task.is_complete) continue;
		if (task.status === options.blockStatus) blocked += 1;
		if (task.due_date !== null && task.due_date < today) overdue += 1;
	}

	if (overdue === 0 && blocked === 0) {
		return { overdue, blocked, label: 'TTasks: all clear' };
	}

	const parts: string[] = [];
	if (overdue > 0) parts.push(`${overdue} overdue`);
	if (blocked > 0) parts.push(`${blocked} blocked`);
	return {
		overdue,
		blocked,
		label: `TTasks: ${parts.join(' · ')}`,
	};
}
