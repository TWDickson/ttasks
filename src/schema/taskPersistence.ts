import type { Task } from '../types';

/**
 * How each `Task` field relates to frontmatter — the one place that says which
 * fields are stored, under what key, and which write paths carry them.
 *
 * The map is typed `Record<keyof Task, …>`, so adding a field to `Task` fails
 * the type-check until it is described here. That is the lockstep guarantee
 * AR-3 exists for: the reader, the creation-time YAML builder, and `update()`
 * used to each carry their own hand-kept list of field names.
 *
 * MD-1 (`ttask_*` prefix) and MD-2 (sparse writes) build on this: `fmKey` is the
 * single place a key is renamed, and `onCreate` is the single place a field
 * becomes "omit when empty".
 *
 * Pure module — no Obsidian imports.
 */
/**
 * How a field is read from and written to frontmatter. One entry per behaviour
 * the codec (`taskCodec.ts`) distinguishes — kept as named kinds rather than
 * inferred from the TypeScript type because the coercions differ in ways that
 * matter (e.g. `source` is not list-unwrapped on read, `area` is).
 */
export type FieldKind =
	| 'derived'      // not in frontmatter
	| 'recordType'   // closed enum, falls back to 'task'
	| 'title'        // required text, list-unwrapped on read
	| 'text'         // free text, "" when absent
	| 'textOrNull'   // free text, null when absent
	| 'status'       // enum resolved against the user's status policy
	| 'priority'     // closed enum, falls back to 'None'
	| 'reminder'     // optional closed enum
	| 'strings'      // list of text
	| 'link'         // one wiki-link → path
	| 'links'        // list of wiki-links → paths
	| 'date'         // calendar date, single-quoted or null
	| 'time'         // HH:MM text, single-quoted or null
	| 'number'       // finite number or null
	| 'flag'         // boolean
	| 'dates';       // list of calendar dates

export interface FieldPersistence {
	/** Frontmatter key; `null` for file-derived or computed fields never stored in it. */
	fmKey: string | null;
	kind: FieldKind;
	/** `TaskWriter.update` mirrors this field from a `Partial<Task>` into frontmatter. */
	updatable: boolean;
	/**
	 * What `buildTaskFrontmatter` does when a note is created:
	 * `always` writes the key (null/empty included), `when-set` writes it only
	 * for a recurring task, `false` leaves it out (written later by `update`).
	 */
	onCreate: 'always' | 'when-set' | false;
	/**
	 * Value written on creation instead of the task's own: `blank` is the empty
	 * value for the kind (a new note has no reverse links and isn't complete),
	 * `created` stamps the creation date.
	 */
	seed?: 'blank' | 'created';
}

const derived: FieldPersistence = { fmKey: null, kind: 'derived', updatable: false, onCreate: false };
/** Written once at creation and thereafter by a dedicated path (not `update`). */
const createOnly = (fmKey: string, kind: FieldKind, seed?: FieldPersistence['seed']): FieldPersistence =>
	({ fmKey, kind, updatable: false, onCreate: 'always', ...(seed ? { seed } : {}) });
const editable = (fmKey: string, kind: FieldKind, seed?: FieldPersistence['seed']): FieldPersistence =>
	({ fmKey, kind, updatable: true, onCreate: 'always', ...(seed ? { seed } : {}) });
/** Absent until first written by `update`. */
const lazy = (fmKey: string, kind: FieldKind): FieldPersistence =>
	({ fmKey, kind, updatable: true, onCreate: false });

export const TASK_PERSISTENCE: Record<keyof Task, FieldPersistence> = {
	// File metadata / derived flags — never in frontmatter.
	id: derived,
	slug: derived,
	path: derived,
	notes: derived,
	is_complete: derived,
	is_inbox: derived,

	type: createOnly('type', 'recordType'),
	name: editable('name', 'title'),
	area: editable('area', 'textOrNull'),
	status: editable('status', 'status'),
	priority: editable('priority', 'priority'),
	labels: editable('labels', 'strings'),

	// Relationships are rewritten by the relationship services, not by `update`.
	parent_task: createOnly('parent_task', 'link'),
	depends_on: createOnly('depends_on', 'links'),
	// A new note has no dependents; the reverse index is maintained afterwards.
	blocks: createOnly('blocks', 'links', 'blank'),
	blocked_reason: editable('blocked_reason', 'text'),

	assigned_to: editable('assigned_to', 'text'),
	source: editable('source', 'text'),

	start_date: editable('start_date', 'date'),
	due_date: editable('due_date', 'date'),
	due_time: editable('due_time', 'time'),
	estimated_days: editable('estimated_days', 'number'),
	workweek_only: editable('workweek_only', 'flag'),
	holiday_dates: editable('holiday_dates', 'dates'),

	created: createOnly('created', 'date'),
	// A task is born incomplete.
	completed: editable('completed', 'date', 'blank'),
	// Stamped on creation and on every real status transition inside `update`.
	status_changed: createOnly('status_changed', 'date', 'created'),

	pomodoro_count: lazy('pomodoro_count', 'number'),
	focused_minutes: lazy('focused_minutes', 'number'),

	recurrence: editable('recurrence', 'textOrNull'),
	recurrence_type: editable('recurrence_type', 'textOrNull'),
	recurrence_anchor_day: { fmKey: 'recurrence_anchor_day', kind: 'number', updatable: true, onCreate: 'when-set' },
	reminder_override: lazy('reminder_override', 'reminder'),
};

/**
 * The frontmatter key for a stored field. Every read or write of a task note's
 * properties outside the codec goes through this — never a string literal — so a
 * schema rename (MD-1) is an edit to `TASK_PERSISTENCE` and nothing else. Throws
 * for a file-derived field, which has no key.
 */
export function fmKey(field: keyof Task): string {
	const key = TASK_PERSISTENCE[field].fmKey;
	if (key === null) throw new Error(`Task field "${field}" is not stored in frontmatter`);
	return key;
}

/** Frontmatter keys the plugin owns that are not `Task` fields. */
export const EXTRA_FM_KEYS = {
	/** Obsidian-native property that scopes `styles.css`; never prefixed. */
	cssclasses: 'cssclasses',
	archiveHistory: 'archive_history',
} as const;

const ENTRIES = Object.entries(TASK_PERSISTENCE) as [keyof Task, FieldPersistence][];

/** Fields `TaskWriter.update` mirrors into frontmatter and the in-memory Task. */
export const UPDATABLE_TASK_FIELDS: readonly (keyof Task)[] =
	ENTRIES.filter(([, p]) => p.updatable).map(([field]) => field);

/** Frontmatter keys `buildTaskFrontmatter` can emit for a field, in table order. */
export function createTimeFrontmatterKeys(): string[] {
	return ENTRIES.flatMap(([, p]) => (p.fmKey !== null && p.onCreate !== false ? [p.fmKey] : []));
}
