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
import type { RepeatCalendar, RepeatRule } from '../repeat/types';
import { nextOccurrence } from '../repeat/next';
import { normalizeRefPath } from '../utils/taskRef';

export interface CompleteTaskDeps {
	completionStatus: string;
	today: string;
	/** All known tasks — used to detect an already-spawned next instance. */
	allTasks: Task[];
	/** Working calendar for working-day rules; without one, working days are Mon–Fri. */
	calendar?: RepeatCalendar;
}

export type CompleteTaskDecision =
	| { kind: 'complete-only'; updates: Partial<Task> }
	| { kind: 'complete-and-recur'; updates: Partial<Task>; nextDue: string; nextRule: RepeatRule };

/** Two rules describe the same series — `count` is ignored, since each spawn decrements it. */
export function sameSeries(a: RepeatRule | null, b: RepeatRule | null): boolean {
	if (!a || !b) return false;
	const strip = ({ count: _count, ...rest }: RepeatRule) => JSON.stringify(rest, Object.keys(rest).sort());
	return strip(a) === strip(b);
}

/**
 * Decides how to complete `task`:
 *
 * - No repeat rule, or the series has ended (`until` passed, no `count` left)
 *   → `complete-only`.
 * - Repeating, but an open instance already exists → `complete-only`. That is an
 *   open task whose `repeat_of` points here (RP-3 — survives renames), or, for
 *   instances spawned before that link existed, one with the same name and
 *   series due on/after the computed next date. This is the idempotence
 *   guard that makes checklist re-checks and kanban drag jitter safe: it
 *   *prevents* the duplicate spawn rather than cleaning it up afterwards.
 * - Otherwise → `complete-and-recur`, with the next due date and the rule the
 *   next instance carries (`count` decremented).
 *
 * A schedule-based rule advances from the due date (falling back to today when
 * there is none); a completion-based rule advances from today. The rule's pinned
 * day-of-month keeps month-end schedules from drifting (RP-1).
 *
 * The `updates` always stamp the completion status and today's date.
 */
export function decideCompletion(task: Task, deps: CompleteTaskDeps): CompleteTaskDecision {
	const updates: Partial<Task> = { status: deps.completionStatus, completed: deps.today };
	const rule = task.repeat;
	if (!rule) return { kind: 'complete-only', updates };

	const anchor = rule.basis === 'completion' ? deps.today : (task.due_date ?? deps.today);
	const nextDue = nextOccurrence(rule, anchor, anchor, deps.calendar);
	if (nextDue === null) return { kind: 'complete-only', updates };

	const self = normalizeRefPath(task.path);
	const alreadySpawned = deps.allTasks.some((candidate) =>
		candidate.path !== task.path &&
		!candidate.is_complete &&
		(
			// Stable identity (RP-3): this instance already has an open child.
			(candidate.repeat_of != null && normalizeRefPath(candidate.repeat_of) === self) ||
			// Fallback for instances spawned before the link existed.
			(candidate.name === task.name &&
				sameSeries(candidate.repeat, rule) &&
				candidate.due_date != null &&
				candidate.due_date >= nextDue)
		),
	);
	if (alreadySpawned) return { kind: 'complete-only', updates };

	const nextRule: RepeatRule = rule.count !== undefined ? { ...rule, count: rule.count - 1 } : rule;
	return { kind: 'complete-and-recur', updates, nextDue, nextRule };
}
