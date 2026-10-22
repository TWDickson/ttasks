import type { Task } from '../types';
import type { TaskJsonMode } from './taskJsonExport';

/**
 * How each `Task` field travels through the Share/Sync JSON contract — the one
 * place that says which export modes carry it, under what contract key, and
 * what an import does with it (AR-3).
 *
 * Typed against `Record<keyof Task, …>` (via `satisfies`), so adding a field to
 * `Task` fails the type-check until its JSON treatment is decided here — the
 * same lockstep `TASK_PERSISTENCE` gives frontmatter. The exporter and parser
 * stay hand-written (each mode shapes values differently) but are test-guarded
 * against this table; the import whitelist is derived from it.
 *
 * Entry order is significant: it is the order of `IMPORT_UPDATABLE_FIELDS`,
 * which the import preview and the AI meta both list in.
 *
 * Pure module — no Obsidian imports.
 */
export interface JsonFieldContract {
	/**
	 * Contract key(s) the field travels under. Most keep their own name; `repeat`
	 * splits into the two legacy cadence strings. Empty for a field the contract
	 * never carries.
	 */
	keys: readonly string[];
	/** Export modes that emit the field. */
	export: readonly TaskJsonMode[];
	/**
	 * What an import does with it:
	 *  - `set`   — a whitelisted field change (`IMPORT_UPDATABLE_FIELDS`)
	 *  - `match` — identifies the target task rather than changing it
	 *  - `link`  — resolved in the import plan's link pass
	 *  - `body`  — the note body, its own plan bucket
	 *  - `create`— honoured only when the import creates the task
	 *  - `false` — ignored
	 */
	import: 'set' | 'match' | 'link' | 'body' | 'create' | false;
}

const none = { keys: [], export: [], import: false } as const;
const both = ['full', 'ai'] as const;
const fullOnly = ['full'] as const;

export const TASK_JSON_CONTRACT = {
	// `name` is settable even though it doubles as the fallback match key. Leaving
	// it out meant a reply that only retitled tasks — the literal output of
	// "suggest better titles" — diffed to zero changes. It counts as a change only
	// on a REF-matched record (`diffField` in taskImportPlan): there the name can
	// only be a new title, while on a name-matched record it IS the match key, so
	// a difference is just casing.
	name: { keys: ['name'], export: both, import: 'set' },
	status: { keys: ['status'], export: both, import: 'set' },
	priority: { keys: ['priority'], export: both, import: 'set' },
	area: { keys: ['area'], export: both, import: 'set' },
	labels: { keys: ['labels'], export: both, import: 'set' },
	blocked_reason: { keys: ['blocked_reason'], export: both, import: 'set' },
	assigned_to: { keys: ['assigned_to'], export: both, import: 'set' },
	// Provenance noise for an AI reader, so 'ai' leaves it out; still settable.
	source: { keys: ['source'], export: fullOnly, import: 'set' },
	start_date: { keys: ['start_date'], export: both, import: 'set' },
	due_date: { keys: ['due_date'], export: both, import: 'set' },
	due_time: { keys: ['due_time'], export: both, import: 'set' },
	estimated_days: { keys: ['estimated_days'], export: both, import: 'set' },
	completed: { keys: ['completed'], export: both, import: 'set' },
	// The vault stores a `RepeatRule`; the contract keeps its two cadence strings
	// (see `repeatContract.ts`).
	repeat: { keys: ['recurrence', 'recurrence_type'], export: both, import: 'set' },
	pomodoro_count: { keys: ['pomodoro_count'], export: both, import: 'set' },
	focused_minutes: { keys: ['focused_minutes'], export: both, import: 'set' },

	// 'full' calls it `id`, 'ai' calls it `ref`; the parser accepts either.
	id: { keys: ['id', 'ref'], export: both, import: 'match' },
	type: { keys: ['type'], export: both, import: 'match' },
	path: { keys: ['path'], export: fullOnly, import: false },
	parent_task: { keys: ['parent'], export: both, import: 'link' },
	depends_on: { keys: ['depends_on'], export: both, import: 'link' },
	// Reverse index of `depends_on`: readable in 'full', never imported.
	blocks: { keys: ['blocks'], export: fullOnly, import: false },
	notes: { keys: ['notes'], export: both, import: 'body' },
	created: { keys: ['created'], export: fullOnly, import: 'create' },
	status_changed: { keys: ['status_changed'], export: fullOnly, import: false },
	workweek_only: { keys: ['workweek_only'], export: fullOnly, import: false },
	holiday_dates: { keys: ['holiday_dates'], export: fullOnly, import: false },
	reminder_override: { keys: ['reminder_override'], export: fullOnly, import: false },

	// File-derived, computed, or series bookkeeping — not part of the contract.
	// `repeat_of` is a vault path into the series; a pasted copy can't use it.
	slug: none,
	is_complete: none,
	is_inbox: none,
	repeat_warning: none,
	repeat_of: none,
} as const satisfies Record<keyof Task, JsonFieldContract>;

type Contract = typeof TASK_JSON_CONTRACT;

/** A contract key an import may change on an existing task. */
export type ImportUpdatableField = {
	[F in keyof Contract]: Contract[F] extends { import: 'set'; keys: readonly (infer K)[] } ? K : never;
}[keyof Contract];

const ENTRIES = Object.values(TASK_JSON_CONTRACT) as JsonFieldContract[];

/**
 * Contract keys an import may set on an existing task, in table order — every
 * key of every `set` field. Links and the note body are importable too, but
 * through their own plan passes, not as field changes.
 */
export const IMPORT_UPDATABLE_FIELDS = ENTRIES
	.filter((c) => c.import === 'set')
	.flatMap((c) => c.keys) as readonly ImportUpdatableField[];

/**
 * What the AI meta advertises as settable: the field changes plus the note
 * body, which is imported through its own plan bucket.
 */
export const AI_UPDATABLE_FIELDS: readonly string[] = [
	...IMPORT_UPDATABLE_FIELDS,
	...ENTRIES.filter((c) => c.import === 'body').flatMap((c) => c.keys),
];
