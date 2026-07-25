/**
 * Pure helper for task duplication logic.
 * No Obsidian API dependencies — fully unit-testable.
 */

import type { Task, TaskCreateInput } from '../types';
import { deriveAnchorDay } from './recurrence';

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
 *   recurrence_type, recurrence_anchor_day, assigned_to, source.
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
		due_time:        task.due_time,
		estimated_days:  task.estimated_days,
		workweek_only:   task.workweek_only ?? false,
		holiday_dates:   [...(task.holiday_dates ?? [])],
		created:         today,
		completed:       null,
		notes:           task.notes,
		recurrence:      task.recurrence,
		recurrence_type: task.recurrence_type,
		// Carried, not re-derived: due_date may be a clamped occurrence, and
		// re-deriving from it would reintroduce the RP-1 drift in the copy.
		recurrence_anchor_day: task.recurrence_anchor_day ?? deriveAnchorDay(task.due_date),
	};
}
