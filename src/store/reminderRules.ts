import type { Task } from '../types';
import { daysBetweenLocal } from '../utils/dateUtils';
import { resolveStaleDate } from './statusChanged';

export type ReminderRuleId = 'due-today' | 'overdue' | 'lead-time' | 'stale';

export interface FiredReminder {
	ruleId: ReminderRuleId;
	taskPath: string;
	taskName: string;
	message: string;
}

export function evaluateReminders(
	task: Task,
	today: string,
	leadDays: number,
	staleDays: number,
	startStatus: string,
): FiredReminder[] {
	if (task.is_complete) return [];

	const fired: FiredReminder[] = [];

	const dueToday = checkDueToday(task, today);
	if (dueToday) {
		fired.push(dueToday);
		return fired;
	}

	const overdue = checkOverdue(task, today);
	if (overdue) fired.push(overdue);

	const leadTime = checkLeadTime(task, today, leadDays);
	if (leadTime) fired.push(leadTime);

	const stale = checkStaleInProgress(task, today, staleDays, startStatus);
	if (stale) fired.push(stale);

	return fired;
}

export function checkDueToday(task: Task, today: string): FiredReminder | null {
	if (task.due_date !== today) return null;
	return {
		ruleId: 'due-today',
		taskPath: task.path,
		taskName: task.name,
		message: `Due today: ${task.name}`,
	};
}

export function checkOverdue(task: Task, today: string): FiredReminder | null {
	if (task.due_date === null || task.due_date >= today || task.is_complete) return null;
	return {
		ruleId: 'overdue',
		taskPath: task.path,
		taskName: task.name,
		message: `Overdue: ${task.name}`,
	};
}

export function checkLeadTime(task: Task, today: string, leadDays: number): FiredReminder | null {
	if (task.due_date === null || task.due_date <= today) return null;
	const daysUntilDue = daysBetweenLocal(today, task.due_date);
	if (daysUntilDue > leadDays) return null;
	return {
		ruleId: 'lead-time',
		taskPath: task.path,
		taskName: task.name,
		message: `Coming up: ${task.name} (in ${daysUntilDue} day${daysUntilDue === 1 ? '' : 's'})`,
	};
}

export function checkStaleInProgress(
	task: Task,
	today: string,
	staleDays: number,
	startStatus: string,
): FiredReminder | null {
	if (task.status !== startStatus) return null;
	const staleAnchor = resolveStaleDate(task.status_changed, task.start_date);
	if (staleAnchor === null) return null;
	const daysInProgress = daysBetweenLocal(staleAnchor, today);
	if (daysInProgress < staleDays) return null;
	return {
		ruleId: 'stale',
		taskPath: task.path,
		taskName: task.name,
		message: `Stale in-progress: ${task.name} (${daysInProgress} day${daysInProgress === 1 ? '' : 's'})`,
	};
}