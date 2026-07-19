// Pure task → JSON serializer. NO Obsidian imports (boundary-tested) so it's
// unit-testable. The command/file-IO wrapper in main.ts supplies the task list
// and the timestamp. Two modes:
//   - 'full': lossless-ish, keeps ids/paths/reverse-index so an import can remap.
//   - 'ai':   clean & self-contained for pasting into an external AI — drops
//             vault-internal noise (id, path, blocks) and flattens links to the
//             human task names, omitting empty/default fields.

import type { Task } from '../types';

export type TaskJsonMode = 'full' | 'ai';

export const TASK_JSON_SCHEMA_VERSION = 1;

/** One task in the exported document. Optional fields are omitted in 'ai' mode. */
export interface ExportedTask {
	id?: string;
	path?: string;
	type: string;
	name: string;
	area: string | null;
	status: string;
	priority: string;
	labels: string[];
	/** parent task — human name in 'ai' mode, vault path in 'full' mode. */
	parent?: string | null;
	/** dependencies — human names in 'ai' mode, vault paths in 'full' mode. */
	depends_on: string[];
	blocks?: string[];
	blocked_reason?: string;
	assigned_to?: string;
	source?: string;
	start_date: string | null;
	due_date: string | null;
	due_time?: string | null;
	estimated_days: number | null;
	workweek_only?: boolean;
	holiday_dates?: string[];
	created?: string | null;
	completed: string | null;
	status_changed?: string | null;
	recurrence?: string | null;
	recurrence_type?: string | null;
	reminder_override?: 'urgent' | 'mute' | null;
	pomodoro_count?: number | null;
	focused_minutes?: number | null;
	notes: string;
}

export interface TaskJsonDocument {
	schemaVersion: number;
	generatedAt: string;
	mode: TaskJsonMode;
	taskCount: number;
	tasks: ExportedTask[];
}

/** Strip the ".md" and any folders, leaving the display-ish basename. */
function basename(path: string): string {
	const last = path.split('/').pop() ?? path;
	return last.replace(/\.md$/, '');
}

/** Drop keys whose value is undefined so 'ai' output stays compact. */
function pruneUndefined(record: ExportedTask): ExportedTask {
	const out: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(record)) {
		if (value !== undefined) out[key] = value;
	}
	return out as unknown as ExportedTask;
}

function exportOne(task: Task, mode: TaskJsonMode, resolveLink: (path: string) => string): ExportedTask {
	if (mode === 'ai') {
		return pruneUndefined({
			type: task.type,
			name: task.name,
			area: task.area,
			status: task.status,
			priority: task.priority,
			labels: [...task.labels],
			parent: task.parent_task ? resolveLink(task.parent_task) : undefined,
			depends_on: task.depends_on.map(resolveLink),
			blocked_reason: task.blocked_reason || undefined,
			assigned_to: task.assigned_to || undefined,
			start_date: task.start_date,
			due_date: task.due_date,
			due_time: task.due_time || undefined,
			estimated_days: task.estimated_days,
			completed: task.completed,
			recurrence: task.recurrence || undefined,
			recurrence_type: task.recurrence_type || undefined,
			pomodoro_count: task.pomodoro_count ?? undefined,
			focused_minutes: task.focused_minutes ?? undefined,
			notes: task.notes,
		});
	}

	// 'full' — keep everything, links as vault paths so import can remap.
	return {
		id: task.id,
		path: task.path,
		type: task.type,
		name: task.name,
		area: task.area,
		status: task.status,
		priority: task.priority,
		labels: [...task.labels],
		parent: task.parent_task,
		depends_on: [...task.depends_on],
		blocks: [...task.blocks],
		blocked_reason: task.blocked_reason,
		assigned_to: task.assigned_to,
		source: task.source,
		start_date: task.start_date,
		due_date: task.due_date,
		due_time: task.due_time ?? null,
		estimated_days: task.estimated_days,
		workweek_only: task.workweek_only ?? false,
		holiday_dates: task.holiday_dates ?? [],
		created: task.created,
		completed: task.completed,
		status_changed: task.status_changed,
		recurrence: task.recurrence,
		recurrence_type: task.recurrence_type,
		reminder_override: task.reminder_override ?? null,
		pomodoro_count: task.pomodoro_count ?? null,
		focused_minutes: task.focused_minutes ?? null,
		notes: task.notes,
	};
}

/** Build the export document (pure; caller supplies the ISO timestamp). */
export function buildTaskJsonDocument(tasks: Task[], mode: TaskJsonMode, generatedAt: string): TaskJsonDocument {
	const nameByPath = new Map(tasks.map((task) => [task.path, task.name]));
	const resolveLink = (path: string): string => nameByPath.get(path) ?? basename(path);
	const exported = tasks.map((task) => exportOne(task, mode, resolveLink));
	return {
		schemaVersion: TASK_JSON_SCHEMA_VERSION,
		generatedAt,
		mode,
		taskCount: exported.length,
		tasks: exported,
	};
}

/** Convenience: the document as a pretty-printed JSON string. */
export function serializeTasksToJson(tasks: Task[], mode: TaskJsonMode, generatedAt: string): string {
	return JSON.stringify(buildTaskJsonDocument(tasks, mode, generatedAt), null, 2);
}
