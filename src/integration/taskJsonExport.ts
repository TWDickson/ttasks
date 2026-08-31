// Pure task → JSON serializer. NO Obsidian imports (boundary-tested) so it's
// unit-testable. The command/file-IO wrapper in main.ts supplies the task list
// and the timestamp. Two modes:
//   - 'full': lossless-ish, keeps ids/paths/reverse-index so an import can remap.
//   - 'ai':   clean & self-contained for pasting into an external AI — drops
//             vault-internal noise (id, path, blocks), flattens links to the
//             human task names, omits empty/default fields, and materializes the
//             graph-derived fields (see taskDerivedState) so the receiving AI
//             reads the answer instead of having to derive it.

import type { Task } from '../types';
import type { DerivedStateContext, DerivedTaskState } from './taskDerivedState';
import { computeDerivedTaskState } from './taskDerivedState';

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
	/**
	 * A worked reply, verbatim. A weak model copies a shape far more reliably than
	 * it follows a description of one, so this earns its bytes back.
	 */
	example: string;
	ref: string;
	matchedBy: string;
	/** Why a rename needs the ref: `name` is both the new title and the fallback match key. */
	rename: string;
	actions: Record<'update' | 'create' | 'delete', string>;
	/** Stick to this vault's configured enums (split out of `instructions`). */
	values: string;
	/** That this is a graph, not a flat list — read before reasoning about order. */
	graph: string;
	/**
	 * That the graph-derived fields are already resolved in the data. This is the
	 * key that makes `impediments` and `dates` short: they no longer have to teach
	 * the two algorithms, only the write rules.
	 */
	derived: string;
	/** How to *set* Blocked/Hold on the way back (the reading is done for it). */
	impediments: string;
	/** That blank dates are deliberate — the schedule is already computed. */
	dates: string;
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
	// Written for a weak model: short declarative sentences, imperative voice, no
	// rationale, one worked example. A capable model uses "because" clauses to
	// generalize; a weak one just needs the rule and a shape to copy.
	instructions:
		'Reply with a JSON object: {"tasks": [ ... ]}. Include only the entries you are changing. ' +
		'On each one, send its "ref" plus only the fields you are changing. Copy the shape in "example".',
	example:
		'{"tasks": [' +
		'{"ref": "a1b2c3", "action": "update", "name": "A clearer title"}, ' +
		'{"ref": "d4e5f6", "action": "update", "status": "Blocked", "blocked_reason": "waiting on vendor"}, ' +
		'{"action": "create", "type": "task", "name": "A new task", "parent": "Some project"}' +
		']}',
	ref:
		'Each entry\'s unique id. Send it back to change that entry. No ref means create a new entry.',
	matchedBy: 'ref, or type + name when you send no ref',
	rename:
		'To rename something, send its "ref" and the new "name". This works on tasks AND on projects. ' +
		'Never send a new name without the ref — that creates a new entry instead of renaming.',
	actions: {
		update: 'Change the matched entry. This is the default. Fields you leave out stay as they are.',
		create: 'Add a new entry. Needs "name". Add "type": "project" to make a project.',
		delete: 'Remove the matched entry. Send just the "ref".',
	},
	values:
		'For "status", "priority", "area" and "labels", use only values listed in "validValues". Never ' +
		'invent one. If nothing fits, leave the field alone and say why in prose outside the JSON.',
	graph:
		'These entries form a dependency GRAPH. "depends_on" lists what must finish first. "parent" is ' +
		'the project an entry belongs to. "blocks" is just the reverse of "depends_on" — read it, never ' +
		'send it. A task cannot start until everything in its "depends_on" is done. Never make a cycle.',
	derived:
		'TTasks has already worked out the graph for you. "impeded" names the status stopping an entry ' +
		'from upstream and "impeded_by" names what has to clear first. "scheduled_start" and ' +
		'"scheduled_end" are the dates the dependency chain implies. "in_cycle" means the entry sits in ' +
		'a dependency loop and cannot be scheduled at all. Each one is left out when it does not apply, ' +
		'so no "impeded" means nothing upstream is stopping it. Read these. Do not recompute them, and ' +
		'never send them back — they are ignored.',
	impediments:
		'Set Blocked or Hold ONLY on the entry that is actually stuck. Never set it on the entries ' +
		'waiting behind it: "impeded" already marks those, and TTasks recomputes it from the graph every ' +
		'time. An entry with "impeded" is not idle and does not need chasing — it needs its blocker cleared.',
	dates:
		'Most entries have no dates on purpose, and a blank "start_date" or "due_date" is NOT missing ' +
		'data — "scheduled_start"/"scheduled_end" already show when the chain puts the work. Do not fill ' +
		'blank dates in and do not flag them. To make something take longer, set "estimated_days". Set ' +
		'"due_date" ONLY for a real external deadline; it overrides the computed schedule and pins ' +
		'everything downstream.',
	sequences:
		'To order work, send "depends_on" listing what must finish first, by ref or name. Entries you ' +
		'create in the same reply can be referenced by name. This adds links and keeps existing ones. ' +
		'To break a link, list it under "remove_depends_on".',
	parent:
		'Send "parent" (a project ref or name) to move an entry into that project. Leave "parent" out to ' +
		'keep the current project. Send "remove_parent": true to take the entry out of its project.',
	projects:
		'A project is an entry with "type": "project". It groups tasks. You can rename, restatus and ' +
		'edit a project just like a task — and its name matters most, because every task under it ' +
		'inherits that framing. A project cannot go inside another project.',
	notes:
		'"notes" is the entry\'s markdown body. Sending it REPLACES the whole body. Leave "notes" out to ' +
		'keep the body as it is. That is the safe default.',
	updatableFields: [
		'name', 'status', 'priority', 'area', 'labels', 'blocked_reason', 'assigned_to',
		'source', 'start_date', 'due_date', 'due_time', 'estimated_days',
		'completed', 'recurrence', 'recurrence_type', 'pomodoro_count', 'focused_minutes',
		'notes',
	],
	ignoredOnImport: ['blocks', 'impeded', 'impeded_by', 'in_cycle', 'scheduled_start', 'scheduled_end'],
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
	/** Derived (`taskDerivedState`): configured status impeding this from upstream. */
	impeded?: string;
	/** Derived: names of the tasks that have to clear. */
	impeded_by?: string[];
	/** Derived: in a dependency cycle, or downstream of one. */
	in_cycle?: boolean;
	blocks?: string[];
	blocked_reason?: string;
	assigned_to?: string;
	source?: string;
	start_date: string | null;
	due_date: string | null;
	/** Derived: projected start from the dependency chain. */
	scheduled_start?: string;
	/** Derived: projected finish from the chain plus `estimated_days`. */
	scheduled_end?: string;
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
	derived?: DerivedTaskState,
): ExportedTask {
	const notes = applyNotesPolicy(task.notes, notesPolicy);
	if (mode === 'ai') {
		// Each derived field sits beside the raw field it explains — `impeded` next
		// to the links it comes from, `scheduled_*` next to the blank dates it
		// accounts for. `pruneUndefined` preserves insertion order, so this is the
		// order the AI actually reads.
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
			impeded: derived?.impeded,
			impeded_by: derived?.impeded_by,
			in_cycle: derived?.in_cycle,
			blocked_reason: task.blocked_reason || undefined,
			assigned_to: task.assigned_to || undefined,
			start_date: task.start_date,
			due_date: task.due_date,
			scheduled_start: derived?.scheduled_start,
			scheduled_end: derived?.scheduled_end,
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

	// 'full' — keep everything, links as vault paths so import can remap. No derived
	// fields: this mode exists to round-trip losslessly, and derived state is not
	// vault state — emitting it here would invite an importer to treat it as real.
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

/**
 * Build the export document (pure; caller supplies the ISO timestamp).
 *
 * `derivedContext` carries the **full** vault list, and supplying it does two
 * things: it materializes the graph-derived fields into 'ai' mode, and it lets a
 * link that points outside the export selection resolve to a real name instead
 * of degrading to its `{6hex}-{slug}` basename.
 */
export function buildTaskJsonDocument(
	tasks: Task[],
	mode: TaskJsonMode,
	generatedAt: string,
	validValues?: TaskJsonValidValues,
	notesPolicy: NotesPolicy = 'full',
	derivedContext?: DerivedStateContext,
): TaskJsonDocument {
	// Names come from the widest list available: a filtered export still links to
	// tasks outside itself, and those deserve their real title.
	const nameByPath = new Map(
		(derivedContext?.allTasks ?? tasks).map((task) => [task.path, task.name]),
	);
	const resolveLink = (path: string): string => nameByPath.get(path) ?? basename(path);
	// Derived only for 'ai'; 'full' round-trips vault state and derived state isn't it.
	const derived = derivedContext && mode === 'ai'
		? computeDerivedTaskState(derivedContext)
		: undefined;
	const exported = tasks.map((task) => exportOne(task, mode, resolveLink, notesPolicy, derived?.get(task.path)));
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
	derivedContext?: DerivedStateContext,
): string {
	return JSON.stringify(
		buildTaskJsonDocument(tasks, mode, generatedAt, validValues, notesPolicy, derivedContext),
		null,
		2,
	);
}
