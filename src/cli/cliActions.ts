/**
 * The `obsidian ttasks:*` commands that do something: navigation (CLI-2,
 * `open` / `new`) and writes (CLI-3, `create` / `update` / `complete` /
 * `status` / `depend`).
 *
 * Pure, like the read commands (boundary-listed): parsing and validation run
 * here against the `CliContext` snapshot, and every side effect goes through
 * `CliActions`, which the plugin implements on `TaskStore`. So a CLI write takes
 * the UI's path — status_changed/completed stamping, recurrence on completion,
 * aliased links — and nothing here builds frontmatter.
 *
 * **Every write is a plan first.** A command builds a `WritePlan` — the task as
 * it will be, plus warnings — and the shared runner either previews it
 * (`dry-run`) or applies it. Both report the same thing, including `impact`:
 * the other tasks whose computed schedule or impediment the change moves. That
 * is the point of the design. TTasks derives most dates from the dependency
 * chain, estimates and the working calendar, and a caller — an agent or a
 * person — can't predict that; so the CLI shows it rather than expecting them
 * to know (see `ttasks:context` for the rules in words).
 *
 * Writes happen directly, with no confirmation dialog (decided 2026-11-06): a
 * command typed in a terminal is deliberate, and an agent can't click one.
 * Everything is validated before the first write, so a bad flag changes
 * nothing. A write that's already true is a no-op reported as
 * `"changed": false`, so an agent can retry safely.
 */
import type { Task, TaskCreateInput } from '../types';
import { addDaysLocal, isIsoDateString } from '../utils/dateUtils';
import { decideCompletion, nextStartFor } from '../store/completeTask';
import { repeatCalendarFromHolidays } from '../repeat/types';
import {
	CliArgumentError, FORMAT_FLAG, IMPACT_LIMIT, canonical, choice, exportAll, exportShape, guardedAsync, impactLine,
	impactOf, knownLabels, listParam, outputFormat, pretty, resolveOne, stripMd, taskFromParams, textLine, weekdayName,
	withTasks,
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

/** A bare flag (`remove`, `dry-run`) or `flag=true`. */
function flagParam(params: CliParams, key: string): boolean {
	const raw = params[key];
	return raw !== undefined && raw.toLowerCase() !== 'false' && raw !== '0';
}

const isNone = (raw: string): boolean => raw.toLowerCase() === 'none';

/**
 * `YYYY-MM-DD`, `today` or `tomorrow`; with `allowNone`, `none` clears (null).
 * Absent → undefined. Deliberately no richer grammar: "friday" or "next week"
 * is ambiguous across locales and week starts, and a wrong date written
 * silently is worse than an error. The error names today and its weekday so
 * the caller can work the date out.
 */
function dateParam(params: CliParams, key: string, ctx: CliContext, allowNone: boolean): string | null | undefined {
	const raw = textParam(params, key);
	if (raw === null) return undefined;
	const value = raw.toLowerCase();
	if (allowNone && isNone(value)) return null;
	if (value === 'today') return ctx.today;
	if (value === 'tomorrow') return addDaysLocal(ctx.today, 1);
	if (isIsoDateString(raw)) return raw;
	throw new CliArgumentError(
		`${key}=${raw} is not a date. Today is ${ctx.today} (${weekdayName(ctx.today)}); work the date out and give it as YYYY-MM-DD`,
		['YYYY-MM-DD', 'today', 'tomorrow', ...(allowNone ? ['none'] : [])],
	);
}

function timeParam(params: CliParams, key: string, allowNone: boolean): string | null | undefined {
	const raw = textParam(params, key);
	if (raw === null) return undefined;
	if (allowNone && isNone(raw)) return null;
	const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(raw);
	if (!match) throw new CliArgumentError(`${key}=${raw} is not a time; use HH:MM (24-hour)`);
	return `${match[1].padStart(2, '0')}:${match[2]}`;
}

function daysParam(params: CliParams, key: string, allowNone: boolean): number | null | undefined {
	const raw = textParam(params, key);
	if (raw === null) return undefined;
	if (allowNone && isNone(raw)) return null;
	const value = Number(raw);
	if (!Number.isFinite(value) || value <= 0) throw new CliArgumentError(`${key}=${raw} must be a positive number of working days`);
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
		start_date: dateParam(params, 'start', ctx, false) ?? null,
		due_date: dateParam(params, 'due', ctx, false) ?? null,
	};
}

// ── Links ─────────────────────────────────────────────────────────────────────

/**
 * In memory the store holds relationship links as full vault paths, `.md`
 * included (it resolves them through the metadata cache), while the writer
 * API takes them without. A task reported before the store has re-read it
 * gets the in-memory form, so its links resolve to names.
 */
const withExt = (path: string): string => `${stripMd(path)}.md`;
const asStored = <T extends Pick<Task, 'parent_task' | 'depends_on'>>(task: T): T => ({
	...task,
	parent_task: task.parent_task ? withExt(task.parent_task) : null,
	depends_on: task.depends_on.map(withExt),
});

const dependsOnPaths = (task: Task): string[] => task.depends_on.map(stripMd);

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

// ── Date guidance ─────────────────────────────────────────────────────────────

export const DEADLINE_WARNING =
	'due= pins this task, and everything downstream of it, to that date instead of the computed schedule. ' +
	'Keep it only if it is a real external deadline. To make work take longer, use estimate=; ' +
	'to make it wait for other work, use ttasks:depend.';
export const START_WARNING =
	'start= holds this task, and everything downstream of it, back until that date. ' +
	'Leave it blank to let the dependency chain decide when the work starts.';

/**
 * Warnings for a write that sets a date: the standing rule (most tasks have no
 * dates on purpose), a date in the past, and a deadline the dependency chain
 * can't meet — worked out by scheduling the task without its due date.
 */
function dateWarnings(ctx: CliContext, before: Task | null, after: Task): string[] {
	const warnings: string[] = [];
	if (after.due_date && after.due_date !== before?.due_date) {
		warnings.push(DEADLINE_WARNING);
		if (after.due_date < ctx.today) warnings.push(`due ${after.due_date} is in the past (today is ${ctx.today}).`);
		const unpinned = withTasks(ctx, [{ ...after, due_date: null, due_time: null }]);
		const chainEnd = exportAll(unpinned).get(after.path)?.scheduled_end;
		if (chainEnd && chainEnd > after.due_date) {
			warnings.push(`The dependency chain and estimates finish this task on ${chainEnd}, after due ${after.due_date}.`);
		}
	}
	if (after.start_date && after.start_date !== before?.start_date) {
		warnings.push(START_WARNING);
		if (after.start_date < ctx.today) warnings.push(`start ${after.start_date} is in the past (today is ${ctx.today}).`);
	}
	return warnings;
}

/** A status that impedes everything downstream (block / hold / future). */
function impedingStatus(ctx: CliContext, status: string): boolean {
	const { block, hold, future } = ctx.statusPolicy;
	return status === block || status === hold || status === future;
}

// ── Plans ─────────────────────────────────────────────────────────────────────

type Verb = 'created' | 'updated' | 'completed';

interface Applied {
	/** The main task as written, with any links the store hasn't re-read yet. */
	main: Task;
	/** A repeating task's spawned next instance. */
	next?: Task | null;
}

interface WritePlan {
	verb: Verb;
	/** The main task as it will be. For a create, a placeholder with ref `new`. */
	after: Task;
	/** A preview of a repeat's next instance (complete only), ref `new`. */
	next?: Task | null;
	changed: boolean;
	warnings: string[];
	/** Extra response fields (`added`, `removed`, `unchanged`). */
	fields?: Record<string, unknown>;
	apply(actions: CliActions): Promise<Applied>;
}

/** A task as `show` prints it: the export shape plus its path. */
function described(task: Task, ctx: CliContext): Record<string, unknown> {
	const [shown] = exportShape([task], ctx, 'none');
	return { ...shown, path: task.path };
}

function describedLine(task: Task, ctx: CliContext): string {
	return textLine(exportShape([task], ctx, 'none')[0]);
}

/**
 * The store's current copy of `task` after a write, checked against what was
 * written. TaskStore reports a failed write as an Obsidian notice rather than
 * throwing, so a missing change is the only signal there is.
 */
function reread(actions: CliActions, task: Task, written: Partial<Task>): Task {
	const fresh = actions.snapshot().tasks.find((candidate) => candidate.path === task.path);
	const landed = fresh && Object.entries(written).every(([key, value]) =>
		JSON.stringify(fresh[key as keyof Task] ?? null) === JSON.stringify(value ?? null));
	if (!fresh || !landed) throw new Error(`the change to ${task.id} didn't land; check Obsidian for a notice`);
	return fresh;
}

const TEXT_LABEL: Record<Verb, string> = { created: 'Created', updated: 'Updated', completed: 'Completed' };

/** Preview or apply a plan, and report the result with its impact on the rest of the graph. */
async function runPlan(plan: WritePlan, params: CliParams, ctx: CliContext, actions: CliActions, format: 'json' | 'text'): Promise<string> {
	const dryRun = flagParam(params, 'dry-run');

	let main = plan.after;
	let next = plan.next ?? null;
	let after = ctx;
	if (plan.changed) {
		if (dryRun) {
			after = withTasks(ctx, [plan.after, ...(next ? [next] : [])]);
		} else {
			const applied = await plan.apply(actions);
			main = applied.main;
			next = applied.next ?? null;
			after = withTasks(actions.snapshot(), [main, ...(next ? [next] : [])]);
		}
	}
	const changedPaths = new Set([plan.after.path, main.path, ...(next ? [next.path] : [])]);
	const impact = plan.changed ? impactOf(ctx, after, changedPaths) : [];
	const shownImpact = impact.slice(0, IMPACT_LIMIT);

	if (format === 'json') {
		return pretty({
			today: ctx.today,
			...(dryRun ? { dry_run: true } : {}),
			changed: plan.changed,
			[plan.verb]: described(main, after),
			...(plan.verb === 'completed' ? { next: next ? described(next, after) : null } : {}),
			...plan.fields,
			...(plan.warnings.length ? { warnings: plan.warnings } : {}),
			...(impact.length ? { impact: shownImpact } : {}),
			...(impact.length > IMPACT_LIMIT ? { impact_more: impact.length - IMPACT_LIMIT } : {}),
		});
	}

	const lines = [`${plan.changed ? TEXT_LABEL[plan.verb] : 'Unchanged'}  ${describedLine(main, after)}`];
	if (next) lines.push(`Next  ${describedLine(next, after)}`);
	for (const [key, value] of Object.entries(plan.fields ?? {})) {
		if (Array.isArray(value) && value.length) lines.push(`${key}: ${value.join(', ')}`);
	}
	for (const warning of plan.warnings) lines.push(`Warning: ${warning}`);
	if (impact.length) {
		lines.push(`Moves ${impact.length} other task${impact.length === 1 ? '' : 's'}:`);
		for (const entry of shownImpact) lines.push(`  ${impactLine(entry)}`);
		if (impact.length > IMPACT_LIMIT) lines.push(`  … and ${impact.length - IMPACT_LIMIT} more`);
	}
	if (dryRun && plan.changed) lines.push('Dry run: nothing was written.');
	return lines.join('\n');
}

// ── ttasks:open / ttasks:new ──────────────────────────────────────────────────

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
	const dueTime = timeParam(params, 'due-time', false) ?? null;
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
		estimated_days: daysParam(params, 'estimate', false) ?? null,
		workweek_only: false,
		holiday_dates: [],
		created: ctx.today,
		completed: status === ctx.statusPolicy.completion ? ctx.today : null,
		repeat: null,
		notes: textParam(params, 'notes') ?? '',
		reminder_override: null,
	};
}

/** Stand-in path for a task that doesn't exist yet (a dry run, a repeat's next instance). */
const PENDING_PATH = (label: string) => `(${label}).md`;

function planCreate(params: CliParams, ctx: CliContext): WritePlan {
	const input = buildCreateInput(params, ctx);
	const placeholder: Task = asStored({
		...input,
		id: 'new',
		slug: 'new',
		path: PENDING_PATH('new task'),
		blocks: [],
		status_changed: ctx.today,
		is_complete: input.status === ctx.statusPolicy.completion,
		is_inbox: input.area === null,
	});
	return {
		verb: 'created',
		after: placeholder,
		changed: true,
		warnings: dateWarnings(ctx, null, placeholder),
		apply: async (actions) => ({ main: asStored(await actions.create(input)) }),
	};
}

// ── ttasks:update ─────────────────────────────────────────────────────────────

/** Every flag `update` reads; at least one must be given. */
const UPDATE_FIELD_FLAGS = ['name', 'area', 'priority', 'label', 'add-label', 'remove-label', 'project', 'start', 'due', 'due-time', 'estimate', 'notes', 'append'] as const;

function planUpdate(params: CliParams, ctx: CliContext): WritePlan {
	const task = taskFromParams(params, ctx);
	if (params.status !== undefined) throw new CliArgumentError('use ttasks:status to change a status (completion recurs a repeat)');
	if (!UPDATE_FIELD_FLAGS.some((flag) => params[flag] !== undefined)) {
		throw new CliArgumentError('nothing to change; give at least one field', UPDATE_FIELD_FLAGS);
	}

	const updates: Partial<Task> = {};
	const setIfChanged = <K extends keyof Task>(key: K, value: Task[K]) => {
		if (JSON.stringify(value ?? null) !== JSON.stringify(task[key] ?? null)) updates[key] = value;
	};

	if (params.name !== undefined) {
		const name = textParam(params, 'name');
		if (!name) throw new CliArgumentError('name= can\'t be blank');
		setIfChanged('name', name);
	}
	const areaRaw = textParam(params, 'area');
	if (areaRaw !== null) setIfChanged('area', isNone(areaRaw) ? null : oneOf(params, 'area', ctx.validValues.areas));
	const priority = oneOf(params, 'priority', ctx.validValues.priorities);
	if (priority) setIfChanged('priority', priority as Task['priority']);

	// Labels: label= replaces (none clears), then add-label / remove-label adjust.
	const labelRaw = textParam(params, 'label');
	let labels = labelRaw === null ? [...task.labels] : isNone(labelRaw) ? [] : canonical(listParam(params, 'label') ?? [], knownLabels(ctx), 'label');
	for (const label of canonical(listParam(params, 'add-label') ?? [], knownLabels(ctx), 'add-label')) if (!labels.includes(label)) labels.push(label);
	const removing = canonical(listParam(params, 'remove-label') ?? [], task.labels.length ? task.labels : knownLabels(ctx), 'remove-label');
	labels = labels.filter((label) => !removing.includes(label));
	if (task.type === 'project' && labels.length) throw new CliArgumentError('projects carry no labels');
	setIfChanged('labels', labels);

	const start = dateParam(params, 'start', ctx, true);
	if (start !== undefined) setIfChanged('start_date', start);
	const due = dateParam(params, 'due', ctx, true);
	if (due !== undefined) setIfChanged('due_date', due);
	const dueTime = timeParam(params, 'due-time', true);
	// Clearing the due date clears its time with it.
	if (dueTime !== undefined) setIfChanged('due_time', dueTime);
	else if (due === null && task.due_time) updates.due_time = null;
	const estimate = daysParam(params, 'estimate', true);
	if (estimate !== undefined) setIfChanged('estimated_days', estimate);

	const merged = { ...task, ...updates };
	if (merged.due_time && !merged.due_date) throw new CliArgumentError('due-time= needs a due date');
	if (merged.start_date && merged.due_date && merged.start_date > merged.due_date) {
		throw new CliArgumentError(`start ${merged.start_date} would be after due ${merged.due_date}`);
	}

	// Relationship and body changes go through their own writers, not `update`.
	let parent: string | null | undefined;
	const projectRaw = textParam(params, 'project');
	if (projectRaw !== null) {
		const target = isNone(projectRaw) ? null : resolveOne(ctx, projectRaw, 'project', 'project');
		if (target?.path === task.path) throw new CliArgumentError(`${task.id} can't be its own project`);
		const wanted = target ? withExt(target.path) : null;
		if (wanted !== (task.parent_task ? withExt(task.parent_task) : null)) parent = wanted;
	}
	let notes: string | undefined;
	const replaceNotes = params.notes !== undefined ? (params.notes === 'true' ? '' : params.notes) : undefined;
	const append = textParam(params, 'append');
	if (replaceNotes !== undefined && append !== null) throw new CliArgumentError('give notes= (replace the body) or append= (add to it), not both');
	if (replaceNotes !== undefined && replaceNotes !== task.notes) notes = replaceNotes;
	if (append !== null) notes = task.notes.trim() ? `${task.notes.trimEnd()}\n\n${append}` : append;

	const after: Task = {
		...merged,
		is_inbox: merged.area === null,
		...(parent !== undefined ? { parent_task: parent } : {}),
		...(notes !== undefined ? { notes } : {}),
	};
	const changed = Object.keys(updates).length > 0 || parent !== undefined || notes !== undefined;

	return {
		verb: 'updated',
		after,
		changed,
		warnings: dateWarnings(ctx, task, after),
		apply: async (actions) => {
			if (Object.keys(updates).length) await actions.update(task.path, updates);
			if (parent !== undefined) await actions.setParent(task.path, parent ? stripMd(parent) : null);
			if (notes !== undefined) await actions.updateNotes(task.path, notes);
			const fresh = Object.keys(updates).length ? reread(actions, task, updates) : task;
			// The store re-reads links and the body from the file a moment later.
			return { main: { ...fresh, parent_task: after.parent_task, notes: after.notes } };
		},
	};
}

// ── ttasks:complete / ttasks:status ───────────────────────────────────────────

function planComplete(task: Task, ctx: CliContext): WritePlan {
	if (task.is_complete) {
		return { verb: 'completed', after: task, next: null, changed: false, warnings: [], apply: async () => ({ main: task }) };
	}
	const holidays = ctx.derivedContext.calendarConfig;
	const decision = decideCompletion(task, {
		completionStatus: ctx.statusPolicy.completion,
		today: ctx.today,
		allTasks: ctx.tasks,
		calendar: repeatCalendarFromHolidays(holidays?.holidays ?? [], holidays?.recurringHolidays ?? []),
	});
	const after: Task = { ...task, ...decision.updates, is_complete: true };
	const next: Task | null = decision.kind === 'complete-and-recur'
		? {
			...task,
			id: 'new',
			slug: 'new',
			path: PENDING_PATH('next instance'),
			status: ctx.statusPolicy.initial,
			due_date: decision.nextDue,
			start_date: nextStartFor(task, decision.nextDue, ctx.today),
			depends_on: [],
			blocks: [],
			completed: null,
			is_complete: false,
			repeat: decision.nextRule,
			repeat_of: task.path,
		}
		: null;
	return {
		verb: 'completed',
		after,
		next,
		changed: true,
		warnings: [],
		apply: async (actions) => {
			const spawned = await actions.complete(task);
			return { main: reread(actions, task, { status: ctx.statusPolicy.completion }), next: spawned };
		},
	};
}

function planStatus(params: CliParams, ctx: CliContext): WritePlan {
	const task = taskFromParams(params, ctx);
	const status = oneOf(params, 'status', ctx.validValues.statuses);
	if (!status) throw new CliArgumentError('give the new status=', ctx.validValues.statuses);
	const reason = textParam(params, 'reason');
	const { block, completion } = ctx.statusPolicy;
	if (reason !== null && status !== block) {
		throw new CliArgumentError(`reason= is the blocked reason; it goes with status=${block}`);
	}

	// The completion status takes the completion path, so a repeating task recurs.
	if (status === completion) return planComplete(task, ctx);

	const updates: Partial<Task> = {
		...(status !== task.status ? { status } : {}),
		...(reason !== null && reason !== task.blocked_reason ? { blocked_reason: reason } : {}),
	};
	const reopening = task.is_complete && 'status' in updates;
	const after: Task = { ...task, ...updates, ...(reopening ? { is_complete: false, completed: null } : {}) };

	const warnings: string[] = [];
	if ('status' in updates && impedingStatus(ctx, status)) {
		warnings.push(`${status} impedes every task downstream of this one (see impact). Don't set it on those tasks too; they clear when this one does.`);
		if (status === block && !reason && !task.blocked_reason) warnings.push('No reason= given; say what it is waiting on.');
	}

	return {
		verb: 'updated',
		after,
		changed: Object.keys(updates).length > 0,
		warnings,
		apply: async (actions) => {
			await actions.update(task.path, updates);
			return { main: reread(actions, task, updates) };
		},
	};
}

// ── ttasks:depend ─────────────────────────────────────────────────────────────

function planDepend(params: CliParams, ctx: CliContext): WritePlan {
	const task = taskFromParams(params, ctx);
	const raws = listParam(params, 'on');
	if (!raws) throw new CliArgumentError('give the tasks it depends on as on=<hash>[,<hash>]');
	const removing = flagParam(params, 'remove');
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
		if (removing) {
			current.delete(path);
		} else {
			if (wouldCreateCycle(working, task, target)) {
				throw new CliArgumentError(`${task.id} depending on ${target.id} would make a loop: ${target.id} already waits on ${task.id}`);
			}
			current.add(path);
			working = withTasks({ ...ctx, tasks: working }, [asStored({ ...task, depends_on: [...current] })]).tasks;
		}
		changed.push(target);
	}

	const after = asStored({ ...task, depends_on: [...current] });
	const names = (list: Task[]) => list.map((entry) => entry.name);
	return {
		verb: 'updated',
		after,
		changed: changed.length > 0,
		warnings: [],
		fields: { [removing ? 'removed' : 'added']: names(changed), unchanged: names(unchanged) },
		apply: async (actions) => {
			for (const target of changed) {
				const path = stripMd(target.path);
				if (removing) await actions.removeDependency(task.path, path);
				else await actions.addDependency(task.path, path);
			}
			// processFrontMatter has written the file; the store re-reads it a moment later.
			return { main: after };
		},
	};
}

// ── Registry ──────────────────────────────────────────────────────────────────

const writeCommand = (plan: (params: CliParams, ctx: CliContext) => WritePlan) =>
	async (params: CliParams, ctx: CliContext, actions: CliActions): Promise<string> => {
		const format = outputFormat(params, ['json', 'text'] as const);
		return guardedAsync(format, async () => runPlan(plan(params, ctx), params, ctx, actions, format));
	};

const ID_FLAGS = {
	id: { value: '<hash>', description: 'The task hash, or a unique prefix of it' },
	path: { value: '<vault path>', description: 'Alternatively, the task note\'s vault path' },
};

const DRY_RUN_FLAG = { 'dry-run': { description: 'Report the result and its impact without writing anything' } };

const DATE_HINT = 'YYYY-MM-DD|today|tomorrow';

const FIELD_FLAGS = {
	type: { value: '<task|project>', description: 'What to create (default task)' },
	name: { value: '<text>', description: 'The name' },
	area: { value: '<area>', description: 'A configured area' },
	project: { value: '<hash|name>', description: 'The project it belongs to' },
	priority: { value: '<High|Medium|Low|None>', description: 'Priority' },
	label: { value: '<a,b>', description: 'Labels (tasks only)' },
	start: { value: `<${DATE_HINT}>`, description: 'Not before this date. Usually leave blank: the dependency chain decides' },
	due: { value: `<${DATE_HINT}>`, description: 'A real external deadline only; it pins the schedule' },
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
		description: 'Create a task directly, with no dialog. Reports its computed schedule.',
		flags: {
			...FIELD_FLAGS,
			name: { value: '<text>', description: 'The name', required: true },
			status: { value: '<status>', description: 'A configured status (default: the first one)' },
			'due-time': { value: '<HH:MM>', description: 'Due time (needs due=)' },
			estimate: { value: '<days>', description: 'Working days of effort; this, not a date, is how to size work' },
			depends: { value: '<a,b>', description: 'Tasks it waits on (hashes)' },
			notes: { value: '<text>', description: 'The note body' },
			...DRY_RUN_FLAG,
			format: FORMAT_FLAG('json|text'),
		},
		run: writeCommand(planCreate),
	},
	{
		id: 'ttasks:update',
		description: 'Change a task\'s fields. Reports what the change moves elsewhere in the schedule.',
		flags: {
			...ID_FLAGS,
			name: { value: '<text>', description: 'Rename (links follow)' },
			area: { value: '<area|none>', description: 'A configured area; none sends it to the inbox' },
			priority: { value: '<High|Medium|Low|None>', description: 'Priority' },
			label: { value: '<a,b|none>', description: 'Replace the labels' },
			'add-label': { value: '<a,b>', description: 'Add labels' },
			'remove-label': { value: '<a,b>', description: 'Remove labels' },
			project: { value: '<hash|name|none>', description: 'Move into a project, or out of one' },
			start: { value: `<${DATE_HINT}|none>`, description: 'Not before this date; none lets the chain decide' },
			due: { value: `<${DATE_HINT}|none>`, description: 'A real external deadline; none unpins it' },
			'due-time': { value: '<HH:MM|none>', description: 'Due time' },
			estimate: { value: '<days|none>', description: 'Working days of effort' },
			notes: { value: '<text>', description: 'Replace the note body' },
			append: { value: '<text>', description: 'Add a paragraph to the note body' },
			...DRY_RUN_FLAG,
			format: FORMAT_FLAG('json|text'),
		},
		run: writeCommand(planUpdate),
	},
	{
		id: 'ttasks:complete',
		description: 'Mark a task complete. A repeating task spawns its next instance, as from the board.',
		flags: { ...ID_FLAGS, ...DRY_RUN_FLAG, format: FORMAT_FLAG('json|text') },
		run: writeCommand((params, ctx) => planComplete(taskFromParams(params, ctx), ctx)),
	},
	{
		id: 'ttasks:status',
		description: 'Set a task\'s status. The completion status completes it (and recurs).',
		flags: {
			...ID_FLAGS,
			status: { value: '<status>', description: 'A configured status', required: true },
			reason: { value: '<text>', description: 'Why it\'s blocked (with the blocked status)' },
			...DRY_RUN_FLAG,
			format: FORMAT_FLAG('json|text'),
		},
		run: writeCommand(planStatus),
	},
	{
		id: 'ttasks:depend',
		description: 'Make a task wait on others (or stop, with remove). Refuses a dependency loop.',
		flags: {
			...ID_FLAGS,
			on: { value: '<a,b>', description: 'The tasks it waits on (hashes)', required: true },
			remove: { description: 'Remove these dependencies instead of adding them' },
			...DRY_RUN_FLAG,
			format: FORMAT_FLAG('json|text'),
		},
		run: writeCommand(planDepend),
	},
];
