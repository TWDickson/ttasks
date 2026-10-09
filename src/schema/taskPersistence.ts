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
export interface FieldPersistence {
	/** Frontmatter key; `null` for file-derived or computed fields never stored in it. */
	fmKey: string | null;
	/** `TaskWriter.update` mirrors this field from a `Partial<Task>` into frontmatter. */
	updatable: boolean;
	/**
	 * What `buildTaskFrontmatter` does when a note is created:
	 * `always` writes the key (null/empty included), `when-set` writes it only
	 * for a recurring task, `false` leaves it out (written later by `update`).
	 */
	onCreate: 'always' | 'when-set' | false;
}

const derived: FieldPersistence = { fmKey: null, updatable: false, onCreate: false };
/** Written once at creation and thereafter by a dedicated path (not `update`). */
const createOnly = (fmKey: string): FieldPersistence => ({ fmKey, updatable: false, onCreate: 'always' });
const editable = (fmKey: string): FieldPersistence => ({ fmKey, updatable: true, onCreate: 'always' });
/** Absent until first written by `update`. */
const lazy = (fmKey: string): FieldPersistence => ({ fmKey, updatable: true, onCreate: false });

export const TASK_PERSISTENCE: Record<keyof Task, FieldPersistence> = {
	// File metadata / derived flags — never in frontmatter.
	id: derived,
	slug: derived,
	path: derived,
	notes: derived,
	is_complete: derived,
	is_inbox: derived,

	type: createOnly('type'),
	name: editable('name'),
	area: editable('area'),
	status: editable('status'),
	priority: editable('priority'),
	labels: editable('labels'),

	// Relationships are rewritten by the relationship services, not by `update`.
	parent_task: createOnly('parent_task'),
	depends_on: createOnly('depends_on'),
	blocks: createOnly('blocks'),
	blocked_reason: editable('blocked_reason'),

	assigned_to: editable('assigned_to'),
	source: editable('source'),

	start_date: editable('start_date'),
	due_date: editable('due_date'),
	due_time: editable('due_time'),
	estimated_days: editable('estimated_days'),
	workweek_only: editable('workweek_only'),
	holiday_dates: editable('holiday_dates'),

	created: createOnly('created'),
	completed: editable('completed'),
	// Stamped on creation and on every real status transition inside `update`.
	status_changed: createOnly('status_changed'),

	pomodoro_count: lazy('pomodoro_count'),
	focused_minutes: lazy('focused_minutes'),

	recurrence: editable('recurrence'),
	recurrence_type: editable('recurrence_type'),
	recurrence_anchor_day: { fmKey: 'recurrence_anchor_day', updatable: true, onCreate: 'when-set' },
	reminder_override: lazy('reminder_override'),
};

const ENTRIES = Object.entries(TASK_PERSISTENCE) as [keyof Task, FieldPersistence][];

/** Fields `TaskWriter.update` mirrors into frontmatter and the in-memory Task. */
export const UPDATABLE_TASK_FIELDS: readonly (keyof Task)[] =
	ENTRIES.filter(([, p]) => p.updatable).map(([field]) => field);

/** Frontmatter keys `buildTaskFrontmatter` can emit for a field, in table order. */
export function createTimeFrontmatterKeys(): string[] {
	return ENTRIES.flatMap(([, p]) => (p.fmKey !== null && p.onCreate !== false ? [p.fmKey] : []));
}
