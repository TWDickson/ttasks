import type { Task } from '../types';
import { addDaysLocal } from '../utils/dateUtils';

export type QuickActionInput = 'start' | 'block' | 'complete' | 'defer';

export interface QuickActionContext {
	completionStatus: string;
	startStatus: string;
	blockStatus: string;
	statuses: string[];
	deferDays: number;
	today: string;
}

export type QuickActionResult =
	| { kind: 'updates'; updates: Partial<Task>; noticeLabel: string }
	| { kind: 'error'; reason: string };

/**
 * Pure function: resolves what field updates and notice label a quick action
 * produces for a given task and settings context. No vault I/O, no Obsidian deps.
 */
export function resolveQuickAction(
	action: QuickActionInput,
	task: Task,
	ctx: QuickActionContext,
): QuickActionResult {
	if (action === 'defer') {
		const base = task.due_date ?? ctx.today;
		const newDate = addDaysLocal(base, ctx.deferDays);
		return {
			kind: 'updates',
			updates: { due_date: newDate },
			noticeLabel: `Deferred "${task.name}" to ${newDate}`,
		};
	}

	const targetStatus =
		action === 'start' ? ctx.startStatus
		: action === 'block' ? ctx.blockStatus
		: ctx.completionStatus;

	if (!ctx.statuses.includes(targetStatus)) {
		return {
			kind: 'error',
			reason: `status "${targetStatus}" is not configured - check Quick Actions settings.`,
		};
	}

	const updates: Partial<Task> =
		action === 'complete' ? { status: targetStatus, completed: ctx.today }
		: action === 'start'  ? { status: targetStatus, completed: null, start_date: ctx.today }
		: { status: targetStatus, completed: null };

	const noticeLabel =
		action === 'start'   ? `Started "${task.name}"`
		: action === 'block' ? `Blocked "${task.name}"`
		: `Completed "${task.name}"`;

	return { kind: 'updates', updates, noticeLabel };
}
