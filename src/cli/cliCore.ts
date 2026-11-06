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
import type { WeekStart } from '../utils/dateUtils';

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
	/** `plugin.statusPolicy`'s resolved pointers, for writes. */
	statusPolicy: { initial: string; completion: string };
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

export class CliArgumentError extends Error {
	constructor(message: string, readonly valid?: readonly string[]) {
		super(message);
	}
}

export type OutputFormat = 'json' | 'text' | 'tsv';

export function renderError(error: CliArgumentError, format: OutputFormat): string {
	if (format === 'json') {
		return pretty(error.valid ? { error: error.message, valid: error.valid } : { error: error.message });
	}
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

// ── Argument parsing ──────────────────────────────────────────────────────────

export function choice<T extends string>(params: CliParams, key: string, allowed: readonly T[], fallback: T): T {
	const raw = params[key];
	if (raw === undefined) return fallback;
	const match = allowed.find((option) => option === raw.toLowerCase());
	if (!match) throw new CliArgumentError(`${key}=${raw} is not recognised`, allowed);
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
		if (!match) throw new CliArgumentError(`${key}=${value} is not a configured value`, valid);
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
 * One task from `id=` (hash or unique hash prefix, `#` optional) or `path=`.
 * `kind` narrows to projects for `project=`.
 */
export function resolveOne(ctx: CliContext, raw: string, key: string, kind?: 'project'): Task {
	const pool = kind ? ctx.tasks.filter((task) => task.type === kind) : ctx.tasks;
	const wanted = raw.trim().replace(/^#/, '').toLowerCase();

	const byPath = pool.find((task) => stripMd(task.path).toLowerCase() === stripMd(wanted));
	if (byPath) return byPath;

	const byId = pool.filter((task) => task.id.toLowerCase().startsWith(wanted));
	if (byId.length === 1) return byId[0];
	if (byId.length > 1) {
		throw new CliArgumentError(`${key}=${raw} matches ${byId.length} tasks; give more of the hash`,
			byId.map((task) => `${task.id} ${task.name}`));
	}
	if (kind === 'project') {
		const byName = pool.filter((task) => task.name.toLowerCase() === raw.trim().toLowerCase());
		if (byName.length === 1) return byName[0];
		throw new CliArgumentError(`${key}=${raw} is not a project hash, path or name`,
			pool.map((task) => `${task.id} ${task.name}`));
	}
	throw new CliArgumentError(`no task has the hash or path "${raw}"`);
}

export function taskFromParams(params: CliParams, ctx: CliContext): Task {
	const raw = params.id ?? params.path;
	if (!raw || raw === 'true') throw new CliArgumentError('give the task as id=<hash> or path=<vault path>');
	return resolveOne(ctx, raw, params.id ? 'id' : 'path');
}

// ── Output ────────────────────────────────────────────────────────────────────

export function exportShape(tasks: Task[], ctx: CliContext, notes: NotesPolicy): ExportedTask[] {
	return buildTaskJsonDocument(tasks, 'ai', ctx.now, ctx.validValues, notes, ctx.derivedContext).tasks;
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
export const NOTES_FLAG = (fallback: string) => ({ value: '<none|summary|full>', description: `How much of each note body to include (default ${fallback})` });
