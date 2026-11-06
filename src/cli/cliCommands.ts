/**
 * The `obsidian ttasks:*` command-line commands (CLI-1: read-only).
 *
 * Pure: every command takes the parsed CLI parameters plus a `CliContext`
 * snapshot of the plugin's state and returns the text to print. No Obsidian
 * import (boundary-listed); `registerCli.ts` is the plugin-facing half.
 *
 * Contract (decided 2026-11-06, see PROJECT.md § CLI):
 * - **JSON by default** — agents are the expected main consumer. `format=text`
 *   (and `tsv` for `list`) on request.
 * - Tasks travel in the Share/Sync **'ai' export shape** (`ExportedTask`): the
 *   hash is `ref`, links are names, and the graph-derived fields (`impeded`,
 *   `scheduled_*`, …) are filled in. One shape for every consumer.
 * - A task is addressed by its **hash** (`id=a1b2c3`, prefix allowed if
 *   unique), which survives renames, or by vault `path=`.
 * - A bad argument returns an error **as output**, `{"error": …}` in JSON,
 *   with the valid choices when there's a closed set, so an agent can correct
 *   itself. (What the CLI does with a *thrown* error isn't documented.)
 */
import type { Task } from '../types';
import type { QuerySpec, FilterCondition, FilterGroup } from '../query/types';
import { applyQuery } from '../query/engine';
import type { ResolvedTaskDate } from '../store/graph/taskGraphDates';
import type { RegisteredTaskViewDefinition } from '../views/viewRegistry';
import { buildTaskJsonDocument, type ExportedTask, type NotesPolicy, type TaskJsonMode, type TaskJsonValidValues } from '../integration/taskJsonExport';
import { serializeDocumentToToon } from '../integration/taskToonExport';
import type { DerivedStateContext } from '../integration/taskDerivedState';
import { EMPTY_EXPORT_CRITERIA, filterTasksForExport, type ExportFilterCriteria } from '../integration/taskExportFilter';
import { buildPreambleText, composeShareOutput, type SharePreamblePreset } from '../integration/sharePreamble';
import { endOfWeekLocal, isIsoDateString, type WeekStart } from '../utils/dateUtils';

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
}

/** A command the CLI can register: its flags (for `obsidian help`) and its handler. */
export interface CliCommand {
	id: string;
	description: string;
	flags: Record<string, { value?: string; description: string; required?: boolean }>;
	run: (params: CliParams, ctx: CliContext) => string;
}

// ── Errors ────────────────────────────────────────────────────────────────────

class CliArgumentError extends Error {
	constructor(message: string, readonly valid?: readonly string[]) {
		super(message);
	}
}

type OutputFormat = 'json' | 'text' | 'tsv';

function renderError(error: CliArgumentError, format: OutputFormat): string {
	if (format === 'json') {
		return pretty(error.valid ? { error: error.message, valid: error.valid } : { error: error.message });
	}
	return error.valid ? `Error: ${error.message}\nValid: ${error.valid.join(', ')}` : `Error: ${error.message}`;
}

/** Run a command body, turning a bad argument into printed output. */
function guarded(format: OutputFormat, body: () => string): string {
	try {
		return body();
	} catch (error) {
		if (error instanceof CliArgumentError) return renderError(error, format);
		throw error;
	}
}

const pretty = (value: unknown): string => JSON.stringify(value, null, 2);

// ── Argument parsing ──────────────────────────────────────────────────────────

function choice<T extends string>(params: CliParams, key: string, allowed: readonly T[], fallback: T): T {
	const raw = params[key];
	if (raw === undefined) return fallback;
	const match = allowed.find((option) => option === raw.toLowerCase());
	if (!match) throw new CliArgumentError(`${key}=${raw} is not recognised`, allowed);
	return match;
}

/** The output format, read before anything else so an argument error can be printed in it. */
function outputFormat<T extends OutputFormat>(params: CliParams, allowed: readonly T[]): T {
	const raw = params.format?.toLowerCase();
	return (allowed.find((option) => option === raw) ?? allowed[0]);
}

/** `status=Active,Hold` → `['Active', 'Hold']`; absent → `null`. */
function listParam(params: CliParams, key: string): string[] | null {
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
function canonical(values: string[], valid: readonly string[], key: string): string[] {
	return values.map((value) => {
		const match = valid.find((option) => option.toLowerCase() === value.toLowerCase());
		if (!match) throw new CliArgumentError(`${key}=${value} is not a configured value`, valid);
		return match;
	});
}

function uniqueSorted(values: Iterable<string>): string[] {
	return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

/** Configured values plus any found in the vault (a since-deleted area still filters). */
function knownAreas(ctx: CliContext): string[] {
	return uniqueSorted([...ctx.validValues.areas, ...ctx.tasks.flatMap((task) => (task.area ? [task.area] : []))]);
}

function knownLabels(ctx: CliContext): string[] {
	return uniqueSorted([...ctx.validValues.labels, ...ctx.tasks.flatMap((task) => task.labels)]);
}

function knownStatuses(ctx: CliContext): string[] {
	return uniqueSorted([...ctx.validValues.statuses, ...ctx.tasks.map((task) => task.status)]);
}

function positiveInt(params: CliParams, key: string): number | null {
	const raw = params[key];
	if (raw === undefined) return null;
	const value = Number(raw);
	if (!Number.isInteger(value) || value < 0) throw new CliArgumentError(`${key}=${raw} must be a whole number`);
	return value;
}

// ── Task resolution ───────────────────────────────────────────────────────────

const stripMd = (path: string): string => path.replace(/\.md$/, '');

/**
 * One task from `id=` (hash or unique hash prefix, `#` optional) or `path=`.
 * `kind` narrows to projects for `project=`.
 */
function resolveOne(ctx: CliContext, raw: string, key: string, kind?: 'project'): Task {
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

function taskFromParams(params: CliParams, ctx: CliContext): Task {
	const raw = params.id ?? params.path;
	if (!raw || raw === 'true') throw new CliArgumentError('give the task as id=<hash> or path=<vault path>');
	return resolveOne(ctx, raw, params.id ? 'id' : 'path');
}

// ── Output ────────────────────────────────────────────────────────────────────

function exportShape(tasks: Task[], ctx: CliContext, notes: NotesPolicy): ExportedTask[] {
	return buildTaskJsonDocument(tasks, 'ai', ctx.now, ctx.validValues, notes, ctx.derivedContext).tasks;
}

/** `a1b2c3  In Progress  High  Fix the roof  · Home · due 2026-11-07 · ⛔ Blocked` */
function textLine(task: ExportedTask): string {
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

function toTsv(tasks: ExportedTask[]): string {
	const rows = tasks.map((task) => TSV_COLUMNS.map((column) => tsvCell((task as unknown as Record<string, unknown>)[column])).join('\t'));
	return [TSV_COLUMNS.join('\t'), ...rows].join('\n');
}

// ── ttasks:list ───────────────────────────────────────────────────────────────

const DUE_KEYWORDS = ['today', 'overdue', 'week', 'none'] as const;

function dueCondition(raw: string, ctx: CliContext): FilterCondition | FilterGroup {
	const value = raw.toLowerCase();
	switch (value) {
		case 'today': return { field: 'due_date', operator: 'is', value: 'today' };
		case 'overdue': return { field: 'due_date', operator: 'before', value: 'today' };
		// The calendar week, as the agenda's This Week bucket sees it.
		case 'week': return {
			logic: 'and',
			conditions: [
				{ field: 'due_date', operator: 'on_or_after', value: 'today' },
				{ field: 'due_date', operator: 'on_or_before', value: endOfWeekLocal(ctx.today, ctx.weekStart) },
			],
		};
		case 'none': return { field: 'due_date', operator: 'is_null' };
		default:
			if (isIsoDateString(raw)) return { field: 'due_date', operator: 'is', value: raw };
			throw new CliArgumentError(`due=${raw} is not recognised`, [...DUE_KEYWORDS, 'YYYY-MM-DD']);
	}
}

function anyOf(field: 'status' | 'area' | 'priority', values: string[]): FilterCondition | FilterGroup {
	if (values.length === 1) return { field, operator: 'is', value: values[0] };
	return { logic: 'or', conditions: values.map((value) => ({ field, operator: 'is' as const, value })) };
}

function resolveView(ctx: CliContext, raw: string): RegisteredTaskViewDefinition {
	const wanted = raw.toLowerCase();
	const view = ctx.views.find((candidate) => candidate.id.toLowerCase() === wanted)
		?? ctx.views.find((candidate) => candidate.name.toLowerCase() === wanted);
	if (!view) throw new CliArgumentError(`view=${raw} is not a Smart List`, ctx.views.map((candidate) => candidate.name));
	return view;
}

/** The query `list` runs: a Smart List's (or open-tasks-by-due-date), narrowed by every flag given. */
export function buildListQuery(params: CliParams, ctx: CliContext): QuerySpec {
	const view = params.view ? resolveView(ctx, params.view) : null;
	const conditions: Array<FilterCondition | FilterGroup> = view ? [view.query.filter] : [];

	const completed = choice(params, 'completed', ['exclude', 'include', 'only'] as const, view ? 'include' : 'exclude');
	if (completed !== 'include') conditions.push({ field: 'is_complete', operator: 'is', value: completed === 'only' });

	const statuses = listParam(params, 'status');
	if (statuses) conditions.push(anyOf('status', canonical(statuses, knownStatuses(ctx), 'status')));
	const areas = listParam(params, 'area');
	if (areas) conditions.push(anyOf('area', canonical(areas, knownAreas(ctx), 'area')));
	const priorities = listParam(params, 'priority');
	if (priorities) conditions.push(anyOf('priority', canonical(priorities, ctx.validValues.priorities, 'priority')));
	const labels = listParam(params, 'label');
	if (labels) conditions.push({ field: 'labels', operator: 'contains_any', value: canonical(labels, knownLabels(ctx), 'label') });
	const type = params.type ? choice(params, 'type', ['task', 'project'] as const, 'task') : null;
	if (type) conditions.push({ field: 'type', operator: 'is', value: type });
	if (params.due) conditions.push(dueCondition(params.due, ctx));

	const limit = positiveInt(params, 'limit');
	return {
		filter: { logic: 'and', conditions },
		sort: view?.query.sort.length ? view.query.sort : [{ field: 'due_date', direction: 'asc' }, { field: 'priority', direction: 'asc' }],
		sortScope: 'global',
		// Flat: an agent wants one ordered list. The view's grouping is reported, not nested.
		group: { kind: 'none' },
		...(limit !== null ? { limit } : {}),
		...(params.search && params.search !== 'true' ? { search: params.search } : {}),
		...(view?.query.readyFirst ? { readyFirst: true } : {}),
		...(view?.query.activeStatusBucket !== undefined ? { activeStatusBucket: view.query.activeStatusBucket } : {}),
	};
}

function runList(params: CliParams, ctx: CliContext): string {
	const format = outputFormat(params, ['json', 'text', 'tsv'] as const);
	return guarded(format, () => {
		const query = buildListQuery(params, ctx);
		const notes = choice(params, 'notes', ['none', 'summary', 'full'] as const, 'none');
		const project = params.project ? resolveOne(ctx, params.project, 'project', 'project') : null;
		const pool = project
			? filterTasksForExport(ctx.tasks, { ...EMPTY_EXPORT_CRITERIA, projects: [project.path] })
			: ctx.tasks;
		const found = applyQuery(pool, query, ctx.schedule, { today: ctx.today, weekStart: ctx.weekStart })
			.flatMap((group) => group.tasks);
		const tasks = exportShape(found, ctx, notes);

		if (format === 'tsv') return toTsv(tasks);
		if (format === 'text') return tasks.length ? tasks.map(textLine).join('\n') : 'No tasks match.';
		return pretty({ count: tasks.length, tasks });
	});
}

// ── ttasks:show ───────────────────────────────────────────────────────────────

function runShow(params: CliParams, ctx: CliContext): string {
	const format = outputFormat(params, ['json', 'text'] as const);
	return guarded(format, () => {
		const task = taskFromParams(params, ctx);
		const notes = choice(params, 'notes', ['none', 'summary', 'full'] as const, 'full');
		const [shown] = exportShape([task], ctx, notes);
		if (format === 'json') return pretty({ ...shown, path: task.path });

		const lines = [textLine(shown), `path: ${task.path}`];
		if (shown.labels.length) lines.push(`labels: ${shown.labels.join(', ')}`);
		if (shown.depends_on.length) lines.push(`depends on: ${shown.depends_on.join(', ')}`);
		if (shown.impeded_by?.length) lines.push(`impeded by: ${shown.impeded_by.join(', ')}`);
		if (shown.blocked_reason) lines.push(`blocked because: ${shown.blocked_reason}`);
		if (shown.notes) lines.push('', shown.notes);
		return lines.join('\n');
	});
}

// ── ttasks:export ─────────────────────────────────────────────────────────────

function runExport(params: CliParams, ctx: CliContext): string {
	// Errors print as JSON here regardless — TOON isn't a format an error fits in.
	return guarded('json', () => {
		const payloadFormat = choice(params, 'format', ['json', 'toon'] as const, 'json');
		const mode = choice(params, 'mode', ['ai', 'full'] as const, 'ai') as TaskJsonMode;
		if (payloadFormat === 'toon' && mode === 'full') {
			throw new CliArgumentError('format=toon is for mode=ai only; a full export has to round-trip as JSON');
		}
		const notes = mode === 'ai' ? choice(params, 'notes', ['full', 'summary', 'none'] as const, 'full') : 'full';

		const projects = listParam(params, 'project')?.map((raw) => resolveOne(ctx, raw, 'project', 'project').path) ?? [];
		const completed = choice(params, 'completed', ['include', 'exclude'] as const, 'include');
		const criteria: ExportFilterCriteria = {
			areas: canonical(listParam(params, 'area') ?? [], knownAreas(ctx), 'area'),
			statuses: canonical(listParam(params, 'status') ?? [], knownStatuses(ctx), 'status'),
			labels: canonical(listParam(params, 'label') ?? [], knownLabels(ctx), 'label'),
			projects,
			includeCompleted: completed === 'include',
			completedWithinDays: positiveInt(params, 'completed-within'),
		};
		const tasks = filterTasksForExport(ctx.tasks, criteria, ctx.today);
		const doc = buildTaskJsonDocument(tasks, mode, ctx.now, ctx.validValues, notes, ctx.derivedContext);
		const payload = payloadFormat === 'toon' ? serializeDocumentToToon(doc) : pretty(doc);

		if (!params.preamble) return payload;
		if (mode !== 'ai') throw new CliArgumentError('preamble= is for mode=ai exports');
		const wanted = params.preamble === 'true' ? 'review' : params.preamble.toLowerCase();
		const preset = ctx.presets.find((candidate) => candidate.id.toLowerCase() === wanted
			|| candidate.label.toLowerCase() === wanted);
		if (!preset) throw new CliArgumentError(`preamble=${params.preamble} is not a Share/Sync prompt`, ctx.presets.map((candidate) => candidate.id));
		const preamble = buildPreambleText(preset, ctx.validValues, { payloadFormat, notesPolicy: notes });
		return composeShareOutput(preamble, payload, 'fenced', payloadFormat)[0].text;
	});
}

// ── Registry ──────────────────────────────────────────────────────────────────

const FORMAT_FLAG = (formats: string) => ({ value: `<${formats}>`, description: `Output format (default ${formats.split('|')[0]})` });
const NOTES_FLAG = (fallback: string) => ({ value: '<none|summary|full>', description: `How much of each note body to include (default ${fallback})` });

export const CLI_COMMANDS: readonly CliCommand[] = [
	{
		id: 'ttasks:list',
		description: 'List tasks, filtered like the board. Open tasks only unless completed= says otherwise.',
		flags: {
			view: { value: '<name|id>', description: 'Start from a Smart List (e.g. Today, Blocked)' },
			status: { value: '<a,b>', description: 'Any of these statuses' },
			area: { value: '<a,b>', description: 'Any of these areas' },
			label: { value: '<a,b>', description: 'Has any of these labels' },
			priority: { value: '<a,b>', description: 'Any of these priorities' },
			project: { value: '<hash|name>', description: 'Tasks in this project (and the project)' },
			type: { value: '<task|project>', description: 'Only tasks or only projects' },
			due: { value: '<today|overdue|week|none|YYYY-MM-DD>', description: 'Due date, including dependency-inferred dates' },
			search: { value: '<text>', description: 'Name/notes text, or a hash (#a1b2 for hash only)' },
			completed: { value: '<exclude|include|only>', description: 'Completed tasks (default exclude; include with view=)' },
			limit: { value: '<n>', description: 'At most n tasks' },
			notes: NOTES_FLAG('none'),
			format: FORMAT_FLAG('json|text|tsv'),
		},
		run: runList,
	},
	{
		id: 'ttasks:show',
		description: 'Show one task, with its notes.',
		flags: {
			id: { value: '<hash>', description: 'The task hash, or a unique prefix of it' },
			path: { value: '<vault path>', description: 'Alternatively, the task note\'s vault path' },
			notes: NOTES_FLAG('full'),
			format: FORMAT_FLAG('json|text'),
		},
		run: runShow,
	},
	{
		id: 'ttasks:export',
		description: 'The Share/Sync export: the task set an AI reads, with its instructions block.',
		flags: {
			format: FORMAT_FLAG('json|toon'),
			mode: { value: '<ai|full>', description: 'ai (default) for an assistant; full round-trips vault state' },
			preamble: { value: '<prompt id>', description: 'Wrap with a Share/Sync prompt (bare flag = review)' },
			status: { value: '<a,b>', description: 'Only these statuses' },
			area: { value: '<a,b>', description: 'Only these areas' },
			label: { value: '<a,b>', description: 'Only tasks with any of these labels' },
			project: { value: '<a,b>', description: 'Only these projects (hash or name)' },
			completed: { value: '<include|exclude>', description: 'Completed tasks (default include)' },
			'completed-within': { value: '<days>', description: 'Only completed work from the last n days' },
			notes: NOTES_FLAG('full'),
		},
		run: runExport,
	},
];
