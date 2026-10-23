import type { Task, TaskPriority, TaskRecordType, TaskStatus } from '../types';
import { REPEAT_KEYS } from '../repeat/normalize';
import type { RepeatRule } from '../repeat/types';

/**
 * How each `Task` field relates to frontmatter — the one place that says which
 * fields are stored, under what key, and which write paths carry them.
 *
 * The map is typed `Record<keyof Task, …>`, so adding a field to `Task` fails
 * the type-check until it is described here. That is the lockstep guarantee
 * AR-3 exists for: the reader, the creation-time YAML builder, and `update()`
 * used to each carry their own hand-kept list of field names.
 *
 * Keys carry the `ttask_` prefix (MD-1) so the plugin's properties don't pollute
 * Obsidian's vault-wide property suggestions or collide with other plugins'
 * conventions. `fmKey` is the single place a key is named; `onCreate` is the
 * single place a field becomes "omit when empty" (MD-2).
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
	| 'dates'        // list of calendar dates
	| 'repeat';      // the `ttask_repeat_*` key group, as one RepeatRule

/**
 * The value each kind decodes to. `TASK_PERSISTENCE` checks every entry's kind
 * against its field's type, and the codec's decoder table is checked against
 * this, so `labels: editable('ttask_labels', 'number')` no longer compiles
 * (AR-6). `derived` is `never` because nothing is decoded — it fits any field.
 */
export interface KindValue {
	derived: never;
	recordType: TaskRecordType;
	title: string;
	text: string;
	textOrNull: string | null;
	status: TaskStatus;
	priority: TaskPriority;
	reminder: NonNullable<Task['reminder_override']> | null;
	strings: string[];
	link: string | null;
	links: string[];
	date: string | null;
	time: string | null;
	number: number | null;
	flag: boolean;
	dates: string[];
	repeat: RepeatRule | null;
}

/** The kinds whose decoded value is assignable to `T`. */
type KindFor<T> = { [K in FieldKind]: [KindValue[K]] extends [T] ? K : never }[FieldKind];

export interface FieldPersistence<K extends FieldKind = FieldKind> {
	/** Frontmatter key; `null` for file-derived or computed fields never stored in it. */
	fmKey: string | null;
	kind: K;
	/** `TaskWriter.update` mirrors this field from a `Partial<Task>` into frontmatter. */
	updatable: boolean;
	/**
	 * What note creation does with this field (MD-2, sparse writes): `always`
	 * writes the key even when empty — reserved for the handful of fields every
	 * note carries — `when-set` writes it only when the value is non-blank for its
	 * kind (see `isBlankStoredValue`), `false` leaves it out (written later by
	 * `update`). The same rule governs `update`: a field that becomes blank has its
	 * key removed rather than set to null/empty, unless it is `always`.
	 */
	onCreate: 'always' | 'when-set' | false;
	/**
	 * Value written on creation instead of the task's own: `blank` is the empty
	 * value for the kind (a new note has no reverse links and isn't complete),
	 * `created` stamps the creation date.
	 */
	seed?: 'blank' | 'created';
}

const derived: FieldPersistence<'derived'> = { fmKey: null, kind: 'derived', updatable: false, onCreate: false };
/** Written once at creation and thereafter by a dedicated path (not `update`). */
const createOnly = <K extends FieldKind>(fmKey: string, kind: K, seed?: FieldPersistence['seed']): FieldPersistence<K> =>
	({ fmKey, kind, updatable: false, onCreate: 'when-set', ...(seed ? { seed } : {}) });
const editable = <K extends FieldKind>(fmKey: string, kind: K, seed?: FieldPersistence['seed']): FieldPersistence<K> =>
	({ fmKey, kind, updatable: true, onCreate: 'when-set', ...(seed ? { seed } : {}) });
/** The few keys every note carries, even when empty. */
const core = <K extends FieldKind>(p: FieldPersistence<K>): FieldPersistence<K> => ({ ...p, onCreate: 'always' });
/** Absent until first written by `update`. */
const lazy = <K extends FieldKind>(fmKey: string, kind: K): FieldPersistence<K> =>
	({ fmKey, kind, updatable: true, onCreate: false });

/** One entry per `Task` field, whose kind must decode to that field's type. */
export type PersistenceTable = { [F in keyof Task]-?: FieldPersistence<KindFor<Task[F]>> };

export const TASK_PERSISTENCE: PersistenceTable = {
	// File metadata / derived flags — never in frontmatter.
	id: derived,
	slug: derived,
	path: derived,
	notes: derived,
	is_complete: derived,
	is_inbox: derived,
	// Reverse index of `depends_on`, derived at load by `deriveBlocks` (MD-3) — never stored.
	blocks: derived,

	type: core(createOnly('ttask_type', 'recordType')),
	name: core(editable('ttask_name', 'title')),
	area: editable('ttask_area', 'textOrNull'),
	status: core(editable('ttask_status', 'status')),
	priority: editable('ttask_priority', 'priority'),
	labels: editable('ttask_labels', 'strings'),

	// Relationships are rewritten by the relationship services, not by `update`.
	parent_task: createOnly('ttask_parent_task', 'link'),
	depends_on: createOnly('ttask_depends_on', 'links'),
	blocked_reason: editable('ttask_blocked_reason', 'text'),

	assigned_to: editable('ttask_assigned_to', 'text'),
	source: editable('ttask_source', 'text'),

	start_date: editable('ttask_start_date', 'date'),
	due_date: editable('ttask_due_date', 'date'),
	due_time: editable('ttask_due_time', 'time'),
	estimated_days: editable('ttask_estimated_days', 'number'),
	workweek_only: editable('ttask_workweek_only', 'flag'),
	holiday_dates: editable('ttask_holiday_dates', 'dates'),

	created: core(createOnly('ttask_created', 'date')),
	// A task is born incomplete.
	completed: editable('ttask_completed', 'date', 'blank'),
	// Stamped on creation and on every real status transition inside `update`.
	status_changed: core(createOnly('ttask_status_changed', 'date', 'created')),

	pomodoro_count: lazy('ttask_pomodoro_count', 'number'),
	focused_minutes: lazy('ttask_focused_minutes', 'number'),

	// A group of keys (`ttask_repeat_every`, `_unit`, …); `fmKey` names the one whose
	// presence means "repeats". The codec reads and writes the whole group.
	repeat: editable(REPEAT_KEYS.every, 'repeat'),
	repeat_warning: derived,
	reminder_override: lazy('ttask_reminder_override', 'reminder'),
	// Written once when completion spawns the next instance; kept current by the
	// rename/delete link rewriters, never by `update`.
	repeat_of: createOnly('ttask_repeat_of', 'link'),
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

/**
 * Translate a field-named object to the keys it is stored under — `{ due_date }`
 * becomes `{ [fmKey('due_date')]: … }`. Keys that aren't stored `Task` fields pass
 * through unchanged. Lets tests and fixtures be written in field names and stay
 * correct across a key rename.
 */
export function toStoredFrontmatter(fields: Record<string, unknown>): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	for (const [field, value] of Object.entries(fields)) {
		const key = (TASK_PERSISTENCE as Record<string, FieldPersistence | undefined>)[field]?.fmKey;
		out[key ?? field] = value;
	}
	return out;
}

/** Frontmatter keys the plugin owns that are not `Task` fields. */
export const EXTRA_FM_KEYS = {
	/** Obsidian-native property that scopes `styles.css`; never prefixed. */
	cssclasses: 'cssclasses',
	archiveHistory: 'ttask_archive_history',
} as const;

/**
 * Whether a value would be stored as an *absent* key (MD-2). Blank means "the
 * reader's fallback for a missing key gives back exactly this": null, `''`, an
 * empty list, `false`, and the neutral priority.
 */
export function isBlankStoredValue(kind: FieldKind, value: unknown): boolean {
	if (value === null || value === undefined) return true;
	switch (kind) {
		case 'derived': return true;
		case 'priority': return value === '' || value === 'None';
		case 'flag': return value === false;
		case 'number': return typeof value === 'number' && Number.isNaN(value);
		case 'strings':
		case 'links':
		case 'dates': return Array.isArray(value) ? value.length === 0 : value === '';
		case 'repeat': return false; // a rule object; null was handled above
		default: return value === '';
	}
}

/** `TASK_PERSISTENCE` as typed `[field, persistence]` pairs, in table order. */
export const PERSISTENCE_ENTRIES = Object.entries(TASK_PERSISTENCE) as [keyof Task, FieldPersistence][];

/** Fields `TaskWriter.update` mirrors into frontmatter and the in-memory Task. */
export const UPDATABLE_TASK_FIELDS: readonly (keyof Task)[] =
	PERSISTENCE_ENTRIES.filter(([, p]) => p.updatable).map(([field]) => field);
