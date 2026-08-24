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

/**
 * How much of each task's markdown body ships with the export.
 *
 * Note bodies dominate a real export — measured against a 100-task vault they were
 * 62% of the tokens, more than every structural choice combined — so this is the
 * single biggest lever on what an external AI has to read. `summary` keeps the
 * opening of each body for context; `none` drops bodies entirely.
 */
export type NotesPolicy = 'full' | 'summary' | 'none';

/** Characters kept per body under the `summary` policy. */
export const NOTES_SUMMARY_LENGTH = 200;

/** Apply a notes policy to one body. */
export function applyNotesPolicy(notes: string, policy: NotesPolicy): string {
	if (policy === 'none') return '';
	if (policy === 'full') return notes;
	const trimmed = notes.trim();
	return trimmed.length <= NOTES_SUMMARY_LENGTH ? trimmed : `${trimmed.slice(0, NOTES_SUMMARY_LENGTH)}…`;
}

/**
 * Round-trip contract embedded in 'ai'-mode exports so a receiving AI knows how
 * to reply: it may tag each task with an `action` and send back only the fields
 * it is changing. Nothing it returns is written blindly — TTasks previews every
 * change and the user chooses what to apply.
 */
export interface TaskJsonMeta {
	instructions: string;
	ref: string;
	matchedBy: string;
	/** Why a retitle needs the ref: `name` is both the new title and the fallback match key. */
	rename: string;
	actions: Record<'update' | 'create' | 'delete', string>;
	/** That this is a graph, not a flat list — read before reasoning about order. */
	graph: string;
	/** That Blocked/Hold travel downstream, and are derived rather than written. */
	impediments: string;
	/** How to express dependency order on the way back. */
	sequences: string;
	/** How to set/clear a task's project membership. */
	parent: string;
	/** How projects differ from tasks, and how to create one. */
	projects: string;
	/** Semantics of the free-form note body on the way back in. */
	notes: string;
	/** Fields an import can set on a matched task (mirrors taskImportPlan). */
	updatableFields: string[];
	/** Fields present in the export but ignored on import. */
	ignoredOnImport: string[];
	/**
	 * Present only when note bodies were shortened or dropped for this export.
	 * Sending `notes` back would then overwrite a full body with a fragment, so
	 * the warning has to travel with the data.
	 */
	notesTruncated?: string;
	/**
	 * This vault's configured enum values — pick from these rather than
	 * inventing new statuses/areas/labels the plugin doesn't recognize.
	 * Present only when the caller supplies them (settings-aware exports).
	 */
	validValues?: {
		statuses: string[];
		priorities: string[];
		areas: string[];
		labels: string[];
	};
}

/** Settings-derived enum lists to embed in an 'ai'-mode export's meta. */
export interface TaskJsonValidValues {
	statuses: string[];
	priorities: string[];
	areas: string[];
	labels: string[];
}

const AI_IMPORT_META_BASE: Omit<TaskJsonMeta, 'validValues'> = {
	instructions:
		'To send changes back, reply with this same shape — a JSON object with a "tasks" array. ' +
		'Omit any task you are not changing. On each task you do change, add an "action" key and ' +
		'include only "ref"/"name" (the match key) plus the fields you are setting — keep it light. ' +
		'A "name" sent alongside a "ref" is a retitle; see "rename". ' +
		'For "status", "priority", "area", and "labels", pick ONLY from validValues below. Do not ' +
		'invent new statuses, priorities, areas, or labels — an unrecognized value is not created, it ' +
		'is imported as-is and has to be cleaned up by hand. If none of the listed values fits, leave ' +
		'the field unchanged and explain why in prose outside the JSON.',
	ref:
		'Stable unique id. Echo it back to target that exact task; omit it to create a new task. ' +
		'You can also point a dependency at a task by its ref.',
	matchedBy: 'ref when present, otherwise type + name (case-insensitive)',
	rename:
		'To retitle a task OR a project, send its "ref" plus the new "name". The ref is what identifies ' +
		'the entry, so the name is read as the new title. Without a ref there is nothing to match a ' +
		'changed name against and the entry is treated as a brand-new one instead — so never propose a ' +
		'new title without the ref. Projects are renamed exactly like tasks: "it groups tasks rather ' +
		'than being worked directly" describes how a project is *used*, not a rule against editing it. ' +
		'If a project\'s name is vague or off-vocabulary, retitle it — its tasks follow automatically, ' +
		'because they point at it by ref rather than by name.',
	actions: {
		update:
			'Default when "action" is omitted. Sets the fields you include on the matched task; ' +
			'omitted fields are left unchanged (a field cannot be cleared by omitting it).',
		create:
			'Add a new item. Requires "name"; unset fields take TTasks defaults. Set "type": "project" ' +
			'to create a project rather than a task (see "projects").',
		delete: 'Remove the matched task. Only "ref" (or "name") is needed.',
	},
	graph:
		'This is a dependency GRAPH, not a flat list. Each task may point at the tasks that must finish ' +
		'before it ("depends_on") and at the project that owns it ("parent"); "blocks" is the reverse of ' +
		'"depends_on" and is derived, never set. Read the whole set as a graph before advising: a task is ' +
		'only workable once everything it depends on is complete, changing one task\'s dates or status can ' +
		'move everything downstream of it, and a project\'s real timeline is driven by the longest chain ' +
		'through it. Do not propose a cycle — the chain must stay acyclic.',
	impediments:
		'Blocked and Hold travel downstream. Everything that depends on a Blocked task is stuck too; Hold ' +
		'is the same signal, weaker; where both reach a task it reads as Blocked. TTasks derives that ' +
		'downstream state from the graph and never stores it, so set Blocked or Hold ONLY on the task ' +
		'actually holding things up — never on the ones queued behind it.',
	sequences:
		'Order tasks with "depends_on": a task lists the tasks that must finish before it, each by ' +
		'ref or name. New tasks created in the same reply can be referenced by name, so you can define ' +
		'a whole chain at once. Adding is additive — existing dependencies are kept. To break a link, ' +
		'list the task(s) to unlink under "remove_depends_on".',
	parent:
		'Set a task\'s project with "parent" (a project ref or name — a project you create in the same ' +
		'reply works too). Omit it to leave the current project unchanged; set "remove_parent": true to ' +
		'detach the task from its project.',
	projects:
		'A project is an entry with "type": "project" — it groups tasks rather than being worked directly. ' +
		'That is about how it is used, not a restriction: a project can be renamed, restatused and ' +
		'edited exactly like a task, and its name is usually the most valuable thing to get right ' +
		'because every task under it inherits that framing. ' +
		'Every field above applies to projects too, and they are matched the same way (a project only ever ' +
		'matches a project). To create one, send "action": "create" with "type": "project", then point its ' +
		'tasks at it with "parent". Projects do not nest: a project has no "parent" of its own.',
	notes:
		'"notes" is the task\'s free-form markdown body. Sending it REPLACES the whole body, so include ' +
		'the existing text plus your additions rather than only the new part. Omit "notes" entirely to ' +
		'leave the body untouched — that is the safe default.',
	updatableFields: [
		'name', 'status', 'priority', 'area', 'labels', 'blocked_reason', 'assigned_to',
		'source', 'start_date', 'due_date', 'due_time', 'estimated_days',
		'completed', 'recurrence', 'recurrence_type', 'pomodoro_count', 'focused_minutes',
		'notes',
	],
	ignoredOnImport: ['blocks'],
};

/** Static meta with no `validValues` — the shape used when the caller doesn't supply settings. */
export const AI_IMPORT_META: TaskJsonMeta = AI_IMPORT_META_BASE;

/** Meta for an 'ai'-mode export, embedding this vault's enum lists when supplied. */
function buildAiImportMeta(validValues?: TaskJsonValidValues, notesPolicy: NotesPolicy = 'full'): TaskJsonMeta {
	const meta: TaskJsonMeta = validValues ? { ...AI_IMPORT_META_BASE, validValues } : { ...AI_IMPORT_META_BASE };
	if (notesPolicy === 'full') return meta;

	// `notesTruncated` is the flag ("was this export cut?"); `notes` is the
	// instruction. Keeping them disjoint matters: they previously both carried the
	// full warning, so the payload said "do not send notes back" three times in
	// two adjacent keys — the kind of repetition that teaches a skimming model to
	// skip the whole meta block.
	meta.notesTruncated = notesPolicy === 'summary'
		? `bodies cut to the first ${NOTES_SUMMARY_LENGTH} characters (a trailing "…" marks a cut body)`
		: 'bodies omitted entirely — you are seeing task fields only';
	// The default `notes` contract invites a replacement body, which is exactly
	// what must not happen here — overwrite it rather than leaving the two
	// instructions to contradict each other.
	meta.notes = notesPolicy === 'summary'
		? 'Do NOT send "notes" back in this export: the bodies here are truncated, so returning one would ' +
			'replace the real, longer body with a fragment. Put body edits in prose instead.'
		: 'Do NOT send "notes" back in this export: the bodies were not included, and a body you did not ' +
			'see cannot be safely replaced. Put body edits in prose instead.';
	return meta;
}

/** One task in the exported document. Optional fields are omitted in 'ai' mode. */
export interface ExportedTask {
	id?: string;
	/** Compact stable id echoed in 'ai' mode so a paste-back can target this task exactly. */
	ref?: string;
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
	/** Present only in 'ai' mode — the paste-back contract for a receiving AI. */
	meta?: TaskJsonMeta;
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

function exportOne(
	task: Task,
	mode: TaskJsonMode,
	resolveLink: (path: string) => string,
	notesPolicy: NotesPolicy,
): ExportedTask {
	const notes = applyNotesPolicy(task.notes, notesPolicy);
	if (mode === 'ai') {
		return pruneUndefined({
			ref: task.id,
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
			notes,
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
		notes,
	};
}

/** Build the export document (pure; caller supplies the ISO timestamp). */
export function buildTaskJsonDocument(
	tasks: Task[],
	mode: TaskJsonMode,
	generatedAt: string,
	validValues?: TaskJsonValidValues,
	notesPolicy: NotesPolicy = 'full',
): TaskJsonDocument {
	const nameByPath = new Map(tasks.map((task) => [task.path, task.name]));
	const resolveLink = (path: string): string => nameByPath.get(path) ?? basename(path);
	const exported = tasks.map((task) => exportOne(task, mode, resolveLink, notesPolicy));
	return {
		schemaVersion: TASK_JSON_SCHEMA_VERSION,
		generatedAt,
		mode,
		...(mode === 'ai' ? { meta: buildAiImportMeta(validValues, notesPolicy) } : {}),
		taskCount: exported.length,
		tasks: exported,
	};
}

/** Convenience: the document as a pretty-printed JSON string. */
export function serializeTasksToJson(
	tasks: Task[],
	mode: TaskJsonMode,
	generatedAt: string,
	validValues?: TaskJsonValidValues,
	notesPolicy: NotesPolicy = 'full',
): string {
	return JSON.stringify(buildTaskJsonDocument(tasks, mode, generatedAt, validValues, notesPolicy), null, 2);
}
