import type { TaskCreateInput } from '../types';
import type { ExternalTask } from './types';

function stripMdExt(path: string): string {
	return path.replace(/\.md$/i, '');
}

export function buildPromoteInput(
	external: ExternalTask,
	inboxStatus: string,
	noteBasename: string,
): TaskCreateInput {
	return {
		type: external.type,
		name: external.name,
		area: external.area,
		status: external.status || inboxStatus,
		priority: external.priority,
		labels: [...external.labels],
		parent_task: external.parent_task,
		depends_on: [...external.depends_on],
		blocked_reason: external.blocked_reason,
		assigned_to: external.assigned_to,
		source: `[[${stripMdExt(external.location.filePath)}|${noteBasename}]]`,
		start_date: external.start_date,
		due_date: external.due_date,
		due_time: external.due_time,
		estimated_days: external.estimated_days,
		created: external.created,
		completed: null,
		notes: external.notes,
		recurrence: external.recurrence,
		recurrence_type: external.recurrence_type,
	};
}

export function buildPromotedLine(
	originalLine: string,
	taskPath: string,
	taskName: string,
): string {
	const match = originalLine.match(/^(\s*(?:[-*+]|\d+\.)\s+)\[[^\]]\](\s*)(.*?)(\s*)$/);
	if (!match) {
		return originalLine;
	}

	const prefix = match[1] ?? '';
	const spacing = match[2] ?? ' ';
	const trailingWhitespace = match[4] ?? '';
	const cleanPath = taskPath.replace(/\.md$/i, '');

	return `${prefix}[ ]${spacing}[[${cleanPath}|${taskName}]]${trailingWhitespace}`;
}
