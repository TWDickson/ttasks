// Pure JSON → task parser. NO Obsidian imports (boundary-tested). Validates and
// normalizes an exported document (see taskJsonExport.ts) into plain import
// records; the wiring in main.ts turns these into TaskStore.create calls behind
// a confirm. Forgiving by design: a bad entry is skipped with a warning rather
// than failing the whole import.

import { TASK_JSON_SCHEMA_VERSION } from './taskJsonExport';

/**
 * What a paste-back entry asks TTasks to do. `'auto'` (the default when no
 * `action` key is present) means "update if a task matches by name, else create"
 * — the original round-trip behaviour. `create`/`delete` are explicit overrides.
 */
export type ImportAction = 'auto' | 'update' | 'create' | 'delete';

export interface ParsedImportTask {
	action: ImportAction;
	/** Stable id to target an existing task exactly; null when matching falls back to name. */
	ref: string | null;
	type: string;
	name: string;
	area: string | null;
	status: string | null;
	priority: string | null;
	labels: string[];
	/** parent as written in the source (human name or vault path); remapped on create. */
	parent: string | null;
	/** Detach the task from its project. */
	remove_parent: boolean;
	depends_on: string[];
	/** Tasks (by ref or name) to unlink from depends_on. */
	remove_depends_on: string[];
	blocked_reason: string;
	assigned_to: string;
	source: string;
	start_date: string | null;
	due_date: string | null;
	due_time: string | null;
	estimated_days: number | null;
	created: string | null;
	completed: string | null;
	recurrence: string | null;
	recurrence_type: string | null;
	pomodoro_count: number | null;
	focused_minutes: number | null;
	notes: string;
}

export interface ParsedTasksJson {
	ok: boolean;
	schemaVersion: number | null;
	mode: string | null;
	tasks: ParsedImportTask[];
	/** Fatal problems (parse failure, wrong shape) — when non-empty, `ok` is false. */
	errors: string[];
	/** Non-fatal per-entry skips/coercions. */
	warnings: string[];
}

function asString(value: unknown): string | null {
	return typeof value === 'string' ? value : null;
}

function asStringOr(value: unknown, fallback: string): string {
	return typeof value === 'string' ? value : fallback;
}

function asNumber(value: unknown): number | null {
	return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function asStringArray(value: unknown): string[] {
	return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

function asAction(value: unknown): ImportAction {
	return value === 'create' || value === 'delete' || value === 'update' ? value : 'auto';
}

function normalizeOne(raw: Record<string, unknown>): ParsedImportTask {
	// Accept both the export's `parent`/`parent_task` spellings.
	const parent = asString(raw.parent) ?? asString(raw.parent_task);
	const type = asStringOr(raw.type, 'task');
	return {
		action: asAction(raw.action),
		ref: asString(raw.ref) ?? asString(raw.id),
		type: type === 'project' ? 'project' : 'task',
		name: asStringOr(raw.name, '').trim(),
		area: asString(raw.area),
		status: asString(raw.status),
		priority: asString(raw.priority),
		labels: asStringArray(raw.labels),
		parent,
		remove_parent: raw.remove_parent === true,
		depends_on: asStringArray(raw.depends_on),
		remove_depends_on: asStringArray(raw.remove_depends_on),
		blocked_reason: asStringOr(raw.blocked_reason, ''),
		assigned_to: asStringOr(raw.assigned_to, ''),
		source: asStringOr(raw.source, ''),
		start_date: asString(raw.start_date),
		due_date: asString(raw.due_date),
		due_time: asString(raw.due_time),
		estimated_days: asNumber(raw.estimated_days),
		created: asString(raw.created),
		completed: asString(raw.completed),
		recurrence: asString(raw.recurrence),
		recurrence_type: asString(raw.recurrence_type),
		pomodoro_count: asNumber(raw.pomodoro_count),
		focused_minutes: asNumber(raw.focused_minutes),
		notes: asStringOr(raw.notes, ''),
	};
}

/**
 * Parse an exported document (or a bare array of task objects) into normalized
 * import records. Never throws — parse/shape problems land in `errors`, per-entry
 * problems in `warnings`.
 */
export function parseTasksJson(text: string): ParsedTasksJson {
	const result: ParsedTasksJson = { ok: false, schemaVersion: null, mode: null, tasks: [], errors: [], warnings: [] };

	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch (error) {
		result.errors.push(`Invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
		return result;
	}

	// Accept either the wrapped document { tasks: [...] } or a bare array.
	let rawTasks: unknown;
	if (Array.isArray(parsed)) {
		rawTasks = parsed;
	} else if (parsed && typeof parsed === 'object') {
		const doc = parsed as Record<string, unknown>;
		result.schemaVersion = asNumber(doc.schemaVersion);
		result.mode = asString(doc.mode);
		if (result.schemaVersion !== null && result.schemaVersion > TASK_JSON_SCHEMA_VERSION) {
			result.warnings.push(
				`Document schemaVersion ${result.schemaVersion} is newer than supported (${TASK_JSON_SCHEMA_VERSION}); importing best-effort.`,
			);
		}
		rawTasks = doc.tasks;
	} else {
		result.errors.push('Expected a JSON object with a "tasks" array, or a JSON array of tasks.');
		return result;
	}

	if (!Array.isArray(rawTasks)) {
		result.errors.push('No "tasks" array found in the document.');
		return result;
	}

	rawTasks.forEach((entry, index) => {
		if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
			result.warnings.push(`Skipped entry ${index}: not a task object.`);
			return;
		}
		const normalized = normalizeOne(entry as Record<string, unknown>);
		if (!normalized.name && !normalized.ref) {
			result.warnings.push(`Skipped entry ${index}: missing both a name and a ref — nothing to match or create.`);
			return;
		}
		result.tasks.push(normalized);
	});

	result.ok = result.errors.length === 0;
	return result;
}
