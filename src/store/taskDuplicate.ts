/**
 * Pure helper for task duplication logic.
 * No Obsidian API dependencies — fully unit-testable.
 */

import type { Task, TaskCreateInput } from '../types';

/**
 * Builds a TaskCreateInput for a duplicate of `task`.
 *
 * Reset fields (not carried over):
 *   - status → firstStatus (first configured status, fresh triage)
 *   - completed → null
 *   - created → today
 *   - start_date → null (duplicate hasn't been started)
 *   - depends_on → [] (no stale prerequisite chain)
 *   - blocked_reason → ''
 *
 * Preserved fields: name, type, area, priority, labels,
 *   parent_task, due_date, estimated_days, notes, recurrence,
 *   recurrence_type, assigned_to, source.
 */
export function buildDuplicateInput(
	task: Task,
	today: string,
	firstStatus: string,
): TaskCreateInput {
	return {
		type:            task.type,
		name:            task.name,
		area:            task.area,
		status:          firstStatus,
		priority:        task.priority,
		labels:          [...task.labels],
		parent_task:     task.parent_task,
		depends_on:      [],
		blocked_reason:  '',
		assigned_to:     task.assigned_to,
		source:          task.source,
		start_date:      null,
		due_date:        task.due_date,
		estimated_days:  task.estimated_days,
		created:         today,
		completed:       null,
		notes:           task.notes,
		recurrence:      task.recurrence,
		recurrence_type: task.recurrence_type,
	};
}
