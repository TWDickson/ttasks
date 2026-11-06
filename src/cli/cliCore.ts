/**
 * Shared plumbing for the `obsidian ttasks:*` commands: the context snapshot,
 * argument parsing, task resolution and output shapes. Pure (boundary-listed),
 * like the commands themselves.
 */
import type { Task, TaskCreateInput } from '../types';
import type { ResolvedTaskDate } from '../store/graph/taskGraphDates';
import type { RegisteredTaskViewDefinition } from '../views/viewRegistry';
import { buildTaskJsonDocument, type ExportedTask, type NotesPolicy, type TaskJsonValidValues } from '../integration/taskJsonExport';
import type { DerivedStateContext } from '../integration/taskDerivedState';
import type { SharePreamblePreset } from '../integration/sharePreamble';
import { weekdayOfLocal, type WeekStart } from '../utils/dateUtils';

/** What the CLI hands a handler: `key=value` pairs, and `'true'` for a bare flag. */
export type CliParams = Readonly<Record<string, string>>;

/** A snapshot of the plugin state a command reads. Built per invocation. */
export interface CliContext {
	/** The whole store. */
	tasks: Task[];
	/** Built-in and custom Smart Lists, for `view=`. */
	views: RegisteredTaskViewDefinition[];
	validValues: TaskJsonValidValues;
	/** For the derived fields; its `allTasks` is the whole store. */
	derivedContext: DerivedStateContext;
	/** Dependency-chain dates, so `due=` sees an inferred due date like the board does. */
	schedule: Map<string, ResolvedTaskDate>;
	/** Local calendar date, YYYY-MM-DD. */
	today: string;
	weekStart: WeekStart;
	/** ISO timestamp stamped on exports. */
	now: string;
	/** The Share/Sync prompt library, for `export preamble=`. */
	presets: SharePreamblePreset[];
	/**
	 * `plugin.statusPolicy`'s resolved pointers. `hold` / `future` are null in a
	 * vault without them; both (and `block`) impede everything downstream.
	 */
	statusPolicy: { initial: string; completion: string; start: string; block: string; hold: string | null; future: string | null };
	/**
	 * Every note directly in the tasks folder, as the metadata cache reads it:
	 * the store's tasks plus any it refuses (old keys, no name). For `ttasks:lint`.
	 */
	folderNotes: CliNote[];
	/** Task notes in the archive folder. Links to them resolve; they aren't linted. */
	archived: ArchivedNote[];
}

/** A markdown note's path and frontmatter (null when it has none). */
export interface CliNote {
	path: string;
	frontmatter: Record<string, unknown> | null;
}

export interface ArchivedNote {
	path: string;
	name: string;
}

/** What a new task's create modal can be prefilled with (`ttasks:new`). */
export interface CliCreatePrefill {
	name?: string;
	area?: string;
	parent_task?: string;
	priority?: Task['priority'];
	labels?: string[];
	start_date?: string;
	due_date?: string;
}

/**
 * The side effects a command may cause (CLI-2 navigation, CLI-3 writes). The
 * plugin implements them on `TaskStore`, so writes take the same path as the UI
 * (status_changed / completed stamping, recurrence, alias-built links).
 */
export interface CliActions {
	openBoard(): Promise<void>;
	openTask(path: string): Promise<void>;
	openCreate(type: Task['type'], prefill: CliCreatePrefill): void;
	create(input: TaskCreateInput): Promise<Task>;
	/** Recurrence-aware completion; resolves to the spawned next instance, if any. */
	complete(task: Task): Promise<Task | null>;
	update(path: string, updates: Partial<Task>): Promise<void>;
	/** `dependency` is a vault path without `.md`. */
	addDependency(taskPath: string, dependency: string): Promise<void>;
	removeDependency(taskPath: string, dependency: string): Promise<void>;
	/** `parent` is a vault path without `.md`, or null to take the task out of its project. */
	setParent(taskPath: string, parent: string | null): Promise<void>;
	/** Replaces the note body verbatim — checklist lines stay text, never become subtasks. */
	updateNotes(taskPath: string, notes: string): Promise<void>;
	/**
	 * Rewrite link strings in a note's frontmatter, in place: each `from` found
	 * under `key` (as the value, or an entry of a list) becomes `to`. For
	 * `ttasks:lint fix`; the note may be one the store refuses.
	 */
	replaceFrontmatterLinks(path: string, changes: Array<{ key: string; from: string; to: string }>): Promise<void>;
	/** A fresh snapshot, for reporting the state after a write. */
	snapshot(): CliContext;
}

export type CliOutput = string | Promise<string>;

/** A command the CLI can register: its flags (for `obsidian help`) and its handler. */
export interface CliCommand {
	id: string;
	description: string;
	flags: Record<string, { value?: string; description: string; required?: boolean }>;
	run: (params: CliParams, ctx: CliContext, actions: CliActions) => CliOutput;
}

// ── Errors ────────────────────────────────────────────────────────────────────

/**
 * What kind of error a reply carries, so a caller can branch without matching
 * message text. `unavailable` (an unconverted vault) and `write-failed` (a
 * write that threw or didn't land) are set by the runner, not by commands.
 */
export type CliErrorCode =
	| 'bad-argument'       // a flag that is malformed, misplaced or missing
	| 'unknown-value'      // a status/area/label/... that isn't configured; `valid` lists them
	| 'not-found'          // no task matches the reference
	| 'ambiguous'          // several tasks match; `valid` lists them
	| 'not-a-date'         // a date or time that can't be read
	| 'dependency-loop'    // a dependency that would make a cycle
	| 'nothing-to-change'  // an update with no field flags
	| 'unavailable'
	| 'write-failed';

export class CliArgumentError extends Error {
	constructor(message: string, readonly valid?: readonly string[], readonly code: CliErrorCode = 'bad-argument') {
		super(message);
	}
}

export type OutputFormat = 'json' | 'text' | 'tsv';

/** The JSON error reply: `{"error": message, "code": …, "valid"?: […]}`. */
export function errorJson(message: string, code: CliErrorCode, valid?: readonly string[]): string {
	return pretty({ error: message, code, ...(valid ? { valid } : {}) });
}

export function renderError(error: CliArgumentError, format: OutputFormat): string {
	if (format === 'json') return errorJson(error.message, error.code, error.valid);
	return error.valid ? `Error: ${error.message}\nValid: ${error.valid.join(', ')}` : `Error: ${error.message}`;
}

/** Run a command body, turning a bad argument into printed output. */
export function guarded(format: OutputFormat, body: () => string): string {
	try {
		return body();
	} catch (error) {
		if (error instanceof CliArgumentError) return renderError(error, format);
		throw error;
	}
}

/** `guarded` for a command that awaits a write. */
export async function guardedAsync(format: OutputFormat, body: () => Promise<string>): Promise<string> {
	try {
		return await body();
	} catch (error) {
		if (error instanceof CliArgumentError) return renderError(error, format);
		throw error;
	}
}

export const pretty = (value: unknown): string => JSON.stringify(value, null, 2);

/**
 * Every command rejects flags it doesn't take, so a misspelt or renamed flag
 * (`due=` for `due-date=`) is an error rather than silently ignored. Applied
 * to the whole registry in `cliCommands.ts`.
 */
export function strictFlags(command: CliCommand): CliCommand {
	return {
		...command,
		run: (params, ctx, actions) => {
			const unknown = Object.keys(params).filter((key) => !(key in command.flags));
			if (!unknown.length) return command.run(params, ctx, actions);
			const format = outputFormat(params, ['json', 'text'] as const);
			const message = `${unknown.map((key) => `${key}=`).join(', ')} ${unknown.length === 1 ? 'is not a flag' : 'are not flags'} of ${command.id}`;
			return renderError(new CliArgumentError(message, Object.keys(command.flags)), format);
		},
	};
}

// ── Argument parsing ──────────────────────────────────────────────────────────

export function choice<T extends string>(params: CliParams, key: string, allowed: readonly T[], fallback: T): T {
	const raw = params[key];
	if (raw === undefined) return fallback;
	const match = allowed.find((option) => option === raw.toLowerCase());
	if (!match) throw new CliArgumentError(`${key}=${raw} is not recognised`, allowed, 'unknown-value');
	return match;
}

/** The output format, read before anything else so an argument error can be printed in it. */
export function outputFormat<T extends OutputFormat>(params: CliParams, allowed: readonly T[]): T {
	const raw = params.format?.toLowerCase();
	return (allowed.find((option) => option === raw) ?? allowed[0]);
}

/** `status=Active,Hold` → `['Active', 'Hold']`; absent → `null`. */
export function listParam(params: CliParams, key: string): string[] | null {
	const raw = params[key];
	if (raw === undefined || raw === 'true') return null;
	const values = raw.split(',').map((value) => value.trim()).filter(Boolean);
	return values.length ? values : null;
}

/**
 * Match typed values to the vault's spelling, case-insensitively — `status=hold`
 * means "Hold". An unknown value is an error carrying the valid list, never a
 * filter that silently matches nothing.
 */
export function canonical(values: string[], valid: readonly string[], key: string): string[] {
	return values.map((value) => {
		const match = valid.find((option) => option.toLowerCase() === value.toLowerCase());
		if (!match) throw new CliArgumentError(`${key}=${value} is not a configured value`, valid, 'unknown-value');
		return match;
	});
}

export function uniqueSorted(values: Iterable<string>): string[] {
	return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

/** Configured values plus any found in the vault (a since-deleted area still filters). */
export function knownAreas(ctx: CliContext): string[] {
	return uniqueSorted([...ctx.validValues.areas, ...ctx.tasks.flatMap((task) => (task.area ? [task.area] : []))]);
}

export function knownLabels(ctx: CliContext): string[] {
	return uniqueSorted([...ctx.validValues.labels, ...ctx.tasks.flatMap((task) => task.labels)]);
}

export function knownStatuses(ctx: CliContext): string[] {
	return uniqueSorted([...ctx.validValues.statuses, ...ctx.tasks.map((task) => task.status)]);
}

export function positiveInt(params: CliParams, key: string): number | null {
	const raw = params[key];
	if (raw === undefined) return null;
	const value = Number(raw);
	if (!Number.isInteger(value) || value < 0) throw new CliArgumentError(`${key}=${raw} must be a whole number`);
	return value;
}

// ── Task resolution ───────────────────────────────────────────────────────────

export const stripMd = (path: string): string => path.replace(/\.md$/, '');

/**
 * One task from a reference: its hash or a unique hash prefix (`#` optional),
 * its vault path, or its exact name when only one task has it. Every flag that
 * names a task (`id=`, `parent=`, `depends-on=`, …) resolves this way. `kind`
 * narrows to projects for `parent=`.
 */
export function resolveOne(ctx: CliContext, raw: string, key: string, kind?: 'project'): Task {
	const pool = kind ? ctx.tasks.filter((task) => task.type === kind) : ctx.tasks;
	const wanted = raw.trim().replace(/^#/, '').toLowerCase();
	const listed = (tasks: Task[]) => tasks.map((task) => `${task.id} ${task.name}`);

	const byPath = pool.find((task) => stripMd(task.path).toLowerCase() === stripMd(wanted));
	if (byPath) return byPath;

	const byId = pool.filter((task) => task.id.toLowerCase().startsWith(wanted));
	if (byId.length === 1) return byId[0];
	if (byId.length > 1) {
		throw new CliArgumentError(`${key}=${raw} matches ${byId.length} tasks; give more of the hash`, listed(byId), 'ambiguous');
	}
	const byName = pool.filter((task) => task.name.toLowerCase() === raw.trim().toLowerCase());
	if (byName.length === 1) return byName[0];
	if (byName.length > 1) {
		throw new CliArgumentError(`${key}=${raw} names ${byName.length} tasks; give the hash`, listed(byName), 'ambiguous');
	}
	throw new CliArgumentError(`${key}=${raw} is not a ${kind ?? 'task'} hash, path or name`, kind ? listed(pool) : undefined, 'not-found');
}

/** Several task references (`id=a,b`), each resolved like `resolveOne`, in order and without repeats. */
export function resolveMany(ctx: CliContext, raws: string[], key: string, kind?: 'project'): Task[] {
	const seen = new Set<string>();
	return raws.map((raw) => resolveOne(ctx, raw, key, kind)).filter((task) => !seen.has(task.path) && !!seen.add(task.path));
}

export function taskFromParams(params: CliParams, ctx: CliContext): Task {
	const raw = params.id ?? params.path;
	if (!raw || raw === 'true') throw new CliArgumentError('give the task as id=<hash|name> or path=<vault path>');
	return resolveOne(ctx, raw, params.id ? 'id' : 'path');
}

/** `id=a,b,c` (or a single `path=`): the tasks a batch write changes. */
export function tasksFromParams(params: CliParams, ctx: CliContext): Task[] {
	if (params.path !== undefined && params.id === undefined) return [taskFromParams(params, ctx)];
	const raws = listParam(params, 'id');
	if (!raws) throw new CliArgumentError('give the task as id=<hash|name>[,<hash|name>…] or path=<vault path>');
	return resolveMany(ctx, raws, 'id');
}

// ── Output ────────────────────────────────────────────────────────────────────

/**
 * Tasks as the CLI prints them: the Share/Sync 'ai' shape, plus the fields the
 * CLI can set that the Share/Sync contract leaves out (`source`,
 * `workweek_only`), placed before `notes`. `ttasks:export` stays the contract
 * exactly; it doesn't go through here.
 */
export function exportShape(tasks: Task[], ctx: CliContext, notes: NotesPolicy): ExportedTask[] {
	const shaped = buildTaskJsonDocument(tasks, 'ai', ctx.now, ctx.validValues, notes, ctx.derivedContext).tasks;
	return shaped.map((entry, index) => {
		const task = tasks[index];
		const extra = { ...(task.source ? { source: task.source } : {}), ...(task.workweek_only ? { workweek_only: true } : {}) };
		if (!Object.keys(extra).length) return entry;
		const { notes: body, ...rest } = entry as ExportedTask & { notes?: string };
		return { ...rest, ...extra, ...(body !== undefined ? { notes: body } : {}) } as ExportedTask;
	});
}

/** `a1b2c3  In Progress  High  Fix the roof  · Home · due 2026-11-07 · ⛔ Blocked` */
export function textLine(task: ExportedTask): string {
	const extras = [
		task.area,
		task.due_date ? `due ${task.due_date}${task.due_time ? ` ${task.due_time}` : ''}`
			: task.scheduled_end ? `scheduled ${task.scheduled_end}` : null,
		task.parent ? `in ${task.parent}` : null,
		task.impeded ? `impeded (${task.impeded})` : null,
	].filter(Boolean);
	const priority = task.priority === 'None' ? '' : task.priority;
	return [task.ref, task.status, priority, task.name].filter(Boolean).join('  ')
		+ (extras.length ? `  · ${extras.join(' · ')}` : '');
}

const TSV_COLUMNS = ['ref', 'name', 'type', 'status', 'priority', 'area', 'labels', 'parent', 'due_date', 'due_time', 'scheduled_end', 'impeded', 'completed'] as const;

function tsvCell(value: unknown): string {
	if (value === null || value === undefined) return '';
	const text = Array.isArray(value) ? value.join(', ') : String(value);
	return text.replace(/[\t\r\n]+/g, ' ');
}

export function toTsv(tasks: ExportedTask[]): string {
	const rows = tasks.map((task) => TSV_COLUMNS.map((column) => tsvCell((task as unknown as Record<string, unknown>)[column])).join('\t'));
	return [TSV_COLUMNS.join('\t'), ...rows].join('\n');
}

// ── Flag descriptions ─────────────────────────────────────────────────────────

export const FORMAT_FLAG = (formats: string) => ({ value: `<${formats}>`, description: `Output format (default ${formats.split('|')[0]})` });
export const SHOW_NOTES_FLAG = (fallback: string) => ({ value: '<none|summary|full>', description: `How much of each note body to include (default ${fallback})` });

/** `completed=` on the read commands: one vocabulary, one default. */
export const COMPLETED_FLAG = { value: '<exclude|include|only>', description: 'Completed tasks (default exclude)' };

// ── Previews and impact ───────────────────────────────────────────────────────

/** `ctx` with these tasks in place of (or added to) the store's copies. */
export function withTasks(ctx: CliContext, overlay: Task[]): CliContext {
	const byPath = new Map(overlay.map((task) => [task.path, task]));
	const tasks = ctx.tasks.map((task) => byPath.get(task.path) ?? task);
	for (const task of overlay) if (!ctx.tasks.some((existing) => existing.path === task.path)) tasks.push(task);
	return { ...ctx, tasks, derivedContext: { ...ctx.derivedContext, allTasks: tasks } };
}

/** Every task in the export shape, by path — the derived fields computed over the whole graph. */
export function exportAll(ctx: CliContext): Map<string, ExportedTask> {
	const shaped = exportShape(ctx.tasks, ctx, 'none');
	return new Map(ctx.tasks.map((task, index) => [task.path, shaped[index]]));
}

/** One task whose computed state a change moves. Only the fields that moved are present. */
export interface ImpactEntry {
	ref: string;
	name: string;
	scheduled_start?: { from: string | null; to: string | null };
	scheduled_end?: { from: string | null; to: string | null };
	impeded?: { from: string | null; to: string | null };
}

const IMPACT_FIELDS = ['scheduled_start', 'scheduled_end', 'impeded'] as const;
export const IMPACT_LIMIT = 25;

/**
 * What a change does to the rest of the graph: open tasks (other than the ones
 * changed) whose computed schedule or impediment differs between `before` and
 * `after`. This is the part a caller can't work out alone — the dates are
 * derived from the dependency chain, estimates and the working calendar.
 */
export function impactOf(before: CliContext, after: CliContext, changed: ReadonlySet<string>): ImpactEntry[] {
	const was = exportAll(before);
	const now = exportAll(after);
	const entries: ImpactEntry[] = [];
	for (const task of after.tasks) {
		if (changed.has(task.path) || task.is_complete) continue;
		const a = was.get(task.path);
		const b = now.get(task.path);
		if (!a || !b) continue;
		const entry: ImpactEntry = { ref: task.id, name: task.name };
		for (const field of IMPACT_FIELDS) {
			const from = a[field] ?? null;
			const to = b[field] ?? null;
			if (from !== to) entry[field] = { from, to };
		}
		if (Object.keys(entry).length > 2) entries.push(entry);
	}
	return entries;
}

/** `scheduled_end 2026-11-12 → 2026-11-19 · impeded none → Blocked` */
export function impactLine(entry: ImpactEntry): string {
	const parts = IMPACT_FIELDS.flatMap((field) => {
		const move = entry[field];
		return move ? [`${field} ${move.from ?? 'none'} → ${move.to ?? 'none'}`] : [];
	});
	return `${entry.ref}  ${entry.name}  · ${parts.join(' · ')}`;
}

export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
export const weekdayName = (date: string): string => WEEKDAYS[weekdayOfLocal(date)];
