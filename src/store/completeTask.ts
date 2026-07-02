/**
 * Shared "complete a task, respecting recurrence" decision.
 *
 * Every completion path (detail button, quick action, kanban drag, detail
 * status dropdown, parent-checklist check) routes through this so the recurrence
 * rule — and its idempotence guard — lives in exactly one place.
 *
 * Pure: no Obsidian or plugin dependencies.
 */
import type { Task } from '../types';
import { nextDueDate, type RecurrenceType } from './recurrence';

export interface CompleteTaskDeps {
	completionStatus: string;
	today: string;
	/** All known tasks — used to detect an already-spawned next instance. */
	allTasks: Task[];
}

export type CompleteTaskDecision =
	| { kind: 'complete-only'; updates: Partial<Task> }
	| { kind: 'complete-and-recur'; updates: Partial<Task>; nextDue: string };

/**
 * Decides how to complete `task`:
 *
 * - Non-recurring → `complete-only`.
 * - Recurring, but an open instance already exists (same name + recurrence rule,
 *   due on/after the computed next due date) → `complete-only`. This is the
 *   idempotence guard that makes checklist re-checks and kanban drag jitter safe:
 *   it *prevents* the duplicate spawn rather than cleaning it up afterwards.
 * - Recurring with no such instance → `complete-and-recur`.
 *
 * The `updates` always stamp the completion status and today's date.
 */
export function decideCompletion(task: Task, deps: CompleteTaskDeps): CompleteTaskDecision {
	const updates: Partial<Task> = { status: deps.completionStatus, completed: deps.today };

	if (!task.recurrence) {
		return { kind: 'complete-only', updates };
	}

	const recurType = (task.recurrence_type ?? 'fixed') as RecurrenceType;
	const nextDue = nextDueDate(task.recurrence, recurType, task.due_date, deps.today);

	const alreadySpawned = deps.allTasks.some((candidate) =>
		candidate.path !== task.path &&
		!candidate.is_complete &&
		candidate.name === task.name &&
		candidate.recurrence === task.recurrence &&
		candidate.due_date != null &&
		candidate.due_date >= nextDue,
	);

	return alreadySpawned
		? { kind: 'complete-only', updates }
		: { kind: 'complete-and-recur', updates, nextDue };
}
