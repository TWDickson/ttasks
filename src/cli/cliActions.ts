/**
 * The `obsidian ttasks:*` commands that do something: navigation (CLI-2,
 * `open` / `new`) and writes (CLI-3, `create` / `complete` / `status` /
 * `depend`).
 *
 * Pure, like the read commands (boundary-listed): parsing and validation run
 * here against the `CliContext` snapshot, and every side effect goes through
 * `CliActions`, which the plugin implements on `TaskStore`. So a CLI write takes
 * the UI's path — status_changed/completed stamping, recurrence on completion,
 * aliased links — and nothing here builds frontmatter.
 *
 * Writes happen directly, with no confirmation dialog (decided 2026-11-06): a
 * command typed in a terminal is deliberate, and an agent can't click one.
 * Everything is validated before the first write, so a bad flag changes
 * nothing. A write that's already true (completing a completed task, setting
 * the status it has) is a no-op reported as `"changed": false`, so an agent can
 * retry safely.
 */
import type { Task, TaskCreateInput } from '../types';
import { addDaysLocal, isIsoDateString } from '../utils/dateUtils';
import {
	CliArgumentError, FORMAT_FLAG, canonical, choice, exportShape, guardedAsync, knownLabels, listParam,
	outputFormat, pretty, resolveOne, stripMd, taskFromParams, textLine,
	type CliActions, type CliCommand, type CliContext, type CliCreatePrefill, type CliParams,
} from './cliCore';

// ── Argument parsing ──────────────────────────────────────────────────────────

/** A flag's text value; a bare flag (`'true'`) or blank counts as absent. */
function textParam(params: CliParams, key: string): string | null {
	const raw = params[key];
	if (raw === undefined || raw === 'true') return null;
	const value = raw.trim();
	return value ? value : null;
}

/** `YYYY-MM-DD`, `today` or `tomorrow`. */
function dateParam(params: CliParams, key: string, ctx: CliContext): string | null {
	const raw = textParam(params, key);
	if (raw === null) return null;
	const value = raw.toLowerCase();
	if (value === 'today') return ctx.today;
	if (value === 'tomorrow') return addDaysLocal(ctx.today, 1);
	if (isIsoDateString(raw)) return raw;
	throw new CliArgumentError(`${key}=${raw} is not a date`, ['YYYY-MM-DD', 'today', 'tomorrow']);
}

function timeParam(params: CliParams, key: string): string | null {
	const raw = textParam(params, key);
	if (raw === null) return null;
	const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(raw);
	if (!match) throw new CliArgumentError(`${key}=${raw} is not a time; use HH:MM (24-hour)`);
	return `${match[1].padStart(2, '0')}:${match[2]}`;
}

function daysParam(params: CliParams, key: string): number | null {
	const raw = textParam(params, key);
	if (raw === null) return null;
	const value = Number(raw);
	if (!Number.isFinite(value) || value <= 0) throw new CliArgumentError(`${key}=${raw} must be a positive number of days`);
	return value;
}

/** One value from a closed set, matched case-insensitively and returned in the vault's spelling. */
function oneOf(params: CliParams, key: string, valid: readonly string[]): string | null {
	const raw = textParam(params, key);
	return raw === null ? null : canonical([raw], valid, key)[0];
}

function typeParam(params: CliParams): Task['type'] {
	return choice(params, 'type', ['task', 'project'] as const, 'task');
}

/** The fields `new` and `create` share, validated against the vault's configured values. */
interface CommonFields {
	type: Task['type'];
	name: string | null;
	area: string | null;
	priority: Task['priority'] | null;
	labels: string[];
	/** The parent project, as a vault path without `.md`. */
	parent: Task | null;
	start_date: string | null;
	due_date: string | null;
}

function commonFields(params: CliParams, ctx: CliContext): CommonFields {
	const type = typeParam(params);
	const labels = canonical(listParam(params, 'label') ?? [], knownLabels(ctx), 'label');
	// A project carries no labels (converting a task to one clears them).
	if (type === 'project' && labels.length) throw new CliArgumentError('label= is for tasks; projects carry no labels');
	const projectRef = textParam(params, 'project');
	return {
		type,
		name: textParam(params, 'name'),
		area: oneOf(params, 'area', ctx.validValues.areas),
		priority: oneOf(params, 'priority', ctx.validValues.priorities) as Task['priority'] | null,
		labels,
		parent: projectRef ? resolveOne(ctx, projectRef, 'project', 'project') : null,
		start_date: dateParam(params, 'start', ctx),
		due_date: dateParam(params, 'due', ctx),
	};
}

// ── Reporting ─────────────────────────────────────────────────────────────────

/** `ctx` with these tasks in place of (or added to) the store's copies. */
function withTasks(ctx: CliContext, overlay: Task[]): CliContext {
	const byPath = new Map(overlay.map((task) => [task.path, task]));
	const tasks = ctx.tasks.map((task) => byPath.get(task.path) ?? task);
	for (const task of overlay) if (!ctx.tasks.some((existing) => existing.path === task.path)) tasks.push(task);
	return { ...ctx, tasks, derivedContext: { ...ctx.derivedContext, allTasks: tasks } };
}

/** A task as `show` prints it: the export shape plus its path. */
function described(task: Task, ctx: CliContext): Record<string, unknown> {
	const [shown] = exportShape([task], ctx, 'none');
	return { ...shown, path: task.path };
}

function describedLine(task: Task, ctx: CliContext): string {
	return textLine(exportShape([task], ctx, 'none')[0]);
}

/** The store's current copy of `task`, or a clear error if the write didn't show up in it. */
function reread(actions: CliActions, task: Task, landed: (fresh: Task) => boolean): { ctx: CliContext; task: Task } {
	const ctx = actions.snapshot();
	const fresh = ctx.tasks.find((candidate) => candidate.path === task.path);
	if (!fresh || !landed(fresh)) {
		// TaskStore reports a failed write as an Obsidian notice rather than throwing.
		throw new Error(`the change to ${task.id} didn't land; check Obsidian for a notice`);
	}
	return { ctx, task: fresh };
}

// ── Dependency graph ──────────────────────────────────────────────────────────

/** Whether `from` depending on `on` closes a loop: `from` is already upstream of `on`. */
export function wouldCreateCycle(tasks: Task[], from: Task, on: Task): boolean {
	const byPath = new Map(tasks.map((task) => [stripMd(task.path), task]));
	const target = stripMd(from.path);
	const seen = new Set<string>();
	const stack = [stripMd(on.path)];
	while (stack.length) {
		const path = stack.pop()!;
		if (path === target) return true;
		if (seen.has(path)) continue;
		seen.add(path);
		for (const dep of byPath.get(path)?.depends_on ?? []) stack.push(stripMd(dep));
	}
	return false;
}

const dependsOnPaths = (task: Task): string[] => task.depends_on.map(stripMd);

/**
 * In memory the store holds relationship links as full vault paths, `.md`
 * included (it resolves them through the metadata cache), while the writer
 * API takes them without. A task we report before the store has re-read it
 * gets the in-memory form, so its links resolve to names.
 */
const withExt = (path: string): string => `${stripMd(path)}.md`;
const asStored = (task: Task): Task => ({
	...task,
	parent_task: task.parent_task ? withExt(task.parent_task) : null,
	depends_on: task.depends_on.map(withExt),
});

// ── ttasks:open ───────────────────────────────────────────────────────────────

async function runOpen(params: CliParams, ctx: CliContext, actions: CliActions): Promise<string> {
	const format = outputFormat(params, ['json', 'text'] as const);
	return guardedAsync(format, async () => {
		if (!params.id && !params.path) {
			await actions.openBoard();
			return format === 'json' ? pretty({ opened: 'board' }) : 'Opened the board.';
		}
		const task = taskFromParams(params, ctx);
		await actions.openTask(task.path);
		return format === 'json'
			? pretty({ opened: { ref: task.id, name: task.name, path: task.path } })
			: `Opened ${task.id} ${task.name}.`;
	});
}

// ── ttasks:new ────────────────────────────────────────────────────────────────

async function runNew(params: CliParams, ctx: CliContext, actions: CliActions): Promise<string> {
	const format = outputFormat(params, ['json', 'text'] as const);
	return guardedAsync(format, async () => {
		const fields = commonFields(params, ctx);
		const prefill: CliCreatePrefill = {
			...(fields.name ? { name: fields.name } : {}),
			...(fields.area ? { area: fields.area } : {}),
			...(fields.parent ? { parent_task: stripMd(fields.parent.path) } : {}),
			...(fields.priority ? { priority: fields.priority } : {}),
			...(fields.labels.length ? { labels: fields.labels } : {}),
			...(fields.start_date ? { start_date: fields.start_date } : {}),
			...(fields.due_date ? { due_date: fields.due_date } : {}),
		};
		actions.openCreate(fields.type, prefill);
		return format === 'json'
			? pretty({ opened: 'create', type: fields.type, prefill })
			: `Opened the new-${fields.type} dialog in Obsidian.`;
	});
}

// ── ttasks:create ─────────────────────────────────────────────────────────────

/** The create input `ttasks:create` builds. Exported for tests. */
export function buildCreateInput(params: CliParams, ctx: CliContext): TaskCreateInput {
	const fields = commonFields(params, ctx);
	if (!fields.name) throw new CliArgumentError('give the new task a name=');
	const dueTime = timeParam(params, 'due-time');
	if (dueTime && !fields.due_date) throw new CliArgumentError('due-time= needs a due=');
	if (fields.start_date && fields.due_date && fields.start_date > fields.due_date) {
		throw new CliArgumentError(`start=${fields.start_date} is after due=${fields.due_date}`);
	}
	const status = oneOf(params, 'status', ctx.validValues.statuses) ?? ctx.statusPolicy.initial;
	const dependsOn = (listParam(params, 'depends') ?? []).map((raw) => stripMd(resolveOne(ctx, raw, 'depends').path));

	return {
		type: fields.type,
		name: fields.name,
		area: fields.area,
		status,
		priority: fields.priority ?? 'None',
		labels: fields.labels,
		parent_task: fields.parent ? stripMd(fields.parent.path) : null,
		depends_on: [...new Set(dependsOn)],
		blocked_reason: '',
		assigned_to: '',
		source: '',
		start_date: fields.start_date,
		due_date: fields.due_date,
		due_time: dueTime,
		estimated_days: daysParam(params, 'estimate'),
		workweek_only: false,
		holiday_dates: [],
		created: ctx.today,
		completed: status === ctx.statusPolicy.completion ? ctx.today : null,
		repeat: null,
		notes: textParam(params, 'notes') ?? '',
		reminder_override: null,
	};
}

async function runCreate(params: CliParams, ctx: CliContext, actions: CliActions): Promise<string> {
	const format = outputFormat(params, ['json', 'text'] as const);
	return guardedAsync(format, async () => {
		const input = buildCreateInput(params, ctx);
		const created = await actions.create(input);
		// The store picks the new note up from the metadata cache a moment later,
		// so report the task as created rather than waiting for it.
		const reported = asStored(created);
		const after = withTasks(actions.snapshot(), [reported]);
		return format === 'json'
			? pretty({ created: described(reported, after) })
			: `Created  ${describedLine(reported, after)}`;
	});
}

// ── ttasks:complete ───────────────────────────────────────────────────────────

async function completeTask(task: Task, ctx: CliContext, actions: CliActions, format: 'json' | 'text'): Promise<string> {
	if (task.is_complete) {
		return format === 'json'
			? pretty({ completed: described(task, ctx), next: null, changed: false })
			: `Already complete  ${describedLine(task, ctx)}`;
	}
	const next = await actions.complete(task);
	const { ctx: after, task: done } = reread(actions, task, (fresh) => fresh.status === ctx.statusPolicy.completion);
	const reported = next ? withTasks(after, [next]) : after;
	if (format === 'json') {
		return pretty({ completed: described(done, reported), next: next ? described(next, reported) : null, changed: true });
	}
	const lines = [`Completed  ${describedLine(done, reported)}`];
	if (next) lines.push(`Next       ${describedLine(next, reported)}`);
	return lines.join('\n');
}

async function runComplete(params: CliParams, ctx: CliContext, actions: CliActions): Promise<string> {
	const format = outputFormat(params, ['json', 'text'] as const);
	return guardedAsync(format, async () => completeTask(taskFromParams(params, ctx), ctx, actions, format));
}

// ── ttasks:status ─────────────────────────────────────────────────────────────

async function runStatus(params: CliParams, ctx: CliContext, actions: CliActions): Promise<string> {
	const format = outputFormat(params, ['json', 'text'] as const);
	return guardedAsync(format, async () => {
		const task = taskFromParams(params, ctx);
		const status = oneOf(params, 'status', ctx.validValues.statuses);
		if (!status) throw new CliArgumentError('give the new status=', ctx.validValues.statuses);
		const reason = textParam(params, 'reason');
		const blockStatus = ctx.derivedContext.statuses.blockStatus;
		if (reason !== null && status !== blockStatus) {
			throw new CliArgumentError(blockStatus
				? `reason= is the blocked reason; it goes with status=${blockStatus}`
				: 'reason= is the blocked reason, and this vault has no blocked status');
		}

		// The completion status takes the completion path, so a repeating task recurs.
		if (status === ctx.statusPolicy.completion) return completeTask(task, ctx, actions, format);

		const updates: Partial<Task> = {
			...(status !== task.status ? { status } : {}),
			...(reason !== null && reason !== task.blocked_reason ? { blocked_reason: reason } : {}),
		};
		if (!Object.keys(updates).length) {
			return format === 'json'
				? pretty({ updated: described(task, ctx), changed: false })
				: `Unchanged  ${describedLine(task, ctx)}`;
		}
		await actions.update(task.path, updates);
		const { ctx: after, task: fresh } = reread(actions, task, (candidate) => candidate.status === status);
		return format === 'json'
			? pretty({ updated: described(fresh, after), changed: true })
			: `Updated  ${describedLine(fresh, after)}`;
	});
}

// ── ttasks:depend ─────────────────────────────────────────────────────────────

async function runDepend(params: CliParams, ctx: CliContext, actions: CliActions): Promise<string> {
	const format = outputFormat(params, ['json', 'text'] as const);
	return guardedAsync(format, async () => {
		const task = taskFromParams(params, ctx);
		const raws = listParam(params, 'on');
		if (!raws) throw new CliArgumentError('give the tasks it depends on as on=<hash>[,<hash>]');
		const removing = params.remove === 'true';
		const targets = raws.map((raw) => resolveOne(ctx, raw, 'on'));

		const current = new Set(dependsOnPaths(task));
		let working = ctx.tasks;
		const changed: Task[] = [];
		const unchanged: Task[] = [];
		// Validate every target before writing any, so a bad one changes nothing.
		for (const target of targets) {
			const path = stripMd(target.path);
			if (target.path === task.path) throw new CliArgumentError(`${task.id} can't depend on itself`);
			if (removing ? !current.has(path) : current.has(path)) {
				unchanged.push(target);
				continue;
			}
			if (!removing) {
				if (wouldCreateCycle(working, task, target)) {
					throw new CliArgumentError(`${task.id} depending on ${target.id} would make a loop: ${target.id} already waits on ${task.id}`);
				}
				current.add(path);
				working = withTasks({ ...ctx, tasks: working }, [asStored({ ...task, depends_on: [...current] })]).tasks;
			} else {
				current.delete(path);
			}
			changed.push(target);
		}

		for (const target of changed) {
			const path = stripMd(target.path);
			if (removing) await actions.removeDependency(task.path, path);
			else await actions.addDependency(task.path, path);
		}

		// processFrontMatter has written the file; the store re-reads it a moment
		// later, so report the state the write produced.
		const after = withTasks(actions.snapshot(), [asStored({ ...task, depends_on: [...current] })]);
		const updated = after.tasks.find((candidate) => candidate.path === task.path)!;
		const names = (list: Task[]) => list.map((entry) => entry.name);
		if (format === 'json') {
			return pretty({
				updated: described(updated, after),
				[removing ? 'removed' : 'added']: names(changed),
				unchanged: names(unchanged),
				changed: changed.length > 0,
			});
		}
		const verb = removing ? 'No longer depends on' : 'Now depends on';
		const lines = [changed.length ? `${verb}: ${names(changed).join(', ')}` : 'Unchanged.', describedLine(updated, after)];
		return lines.join('\n');
	});
}

// ── Registry ──────────────────────────────────────────────────────────────────

const ID_FLAGS = {
	id: { value: '<hash>', description: 'The task hash, or a unique prefix of it' },
	path: { value: '<vault path>', description: 'Alternatively, the task note\'s vault path' },
};

const FIELD_FLAGS = {
	type: { value: '<task|project>', description: 'What to create (default task)' },
	name: { value: '<text>', description: 'The name' },
	area: { value: '<area>', description: 'A configured area' },
	project: { value: '<hash|name>', description: 'The project it belongs to' },
	priority: { value: '<High|Medium|Low|None>', description: 'Priority' },
	label: { value: '<a,b>', description: 'Labels (tasks only)' },
	start: { value: '<YYYY-MM-DD|today|tomorrow>', description: 'Start date' },
	due: { value: '<YYYY-MM-DD|today|tomorrow>', description: 'Due date' },
};

export const ACTION_COMMANDS: readonly CliCommand[] = [
	{
		id: 'ttasks:open',
		description: 'Open a task in the board and detail pane, or the board when no task is given.',
		flags: { ...ID_FLAGS, format: FORMAT_FLAG('json|text') },
		run: runOpen,
	},
	{
		id: 'ttasks:new',
		description: 'Open the new-task dialog in Obsidian, prefilled. Writes nothing until you press Create.',
		flags: { ...FIELD_FLAGS, format: FORMAT_FLAG('json|text') },
		run: runNew,
	},
	{
		id: 'ttasks:create',
		description: 'Create a task directly, with no dialog.',
		flags: {
			...FIELD_FLAGS,
			name: { value: '<text>', description: 'The name', required: true },
			status: { value: '<status>', description: 'A configured status (default: the first one)' },
			'due-time': { value: '<HH:MM>', description: 'Due time (needs due=)' },
			estimate: { value: '<days>', description: 'Estimated days of work' },
			depends: { value: '<a,b>', description: 'Tasks it waits on (hashes)' },
			notes: { value: '<text>', description: 'The note body' },
			format: FORMAT_FLAG('json|text'),
		},
		run: runCreate,
	},
	{
		id: 'ttasks:complete',
		description: 'Mark a task complete. A repeating task spawns its next instance, as from the board.',
		flags: { ...ID_FLAGS, format: FORMAT_FLAG('json|text') },
		run: runComplete,
	},
	{
		id: 'ttasks:status',
		description: 'Set a task\'s status. The completion status completes it (and recurs).',
		flags: {
			...ID_FLAGS,
			status: { value: '<status>', description: 'A configured status', required: true },
			reason: { value: '<text>', description: 'Why it\'s blocked (with the blocked status)' },
			format: FORMAT_FLAG('json|text'),
		},
		run: runStatus,
	},
	{
		id: 'ttasks:depend',
		description: 'Make a task depend on others (or stop, with remove). Refuses a dependency loop.',
		flags: {
			...ID_FLAGS,
			on: { value: '<a,b>', description: 'The tasks it waits on (hashes)', required: true },
			remove: { description: 'Remove these dependencies instead of adding them' },
			format: FORMAT_FLAG('json|text'),
		},
		run: runDepend,
	},
];
