/**
 * The `obsidian ttasks:*` commands that do something: navigation (`open` /
 * `new`) and writes (`create` / `update` / `complete`).
 *
 * Pure, like the read commands (boundary-listed): parsing and validation run
 * here against the `CliContext` snapshot, and every side effect goes through
 * `CliActions`, which the plugin implements on `TaskStore`. So a CLI write takes
 * the UI's path — status_changed/completed stamping, recurrence on completion,
 * aliased links — and nothing here builds frontmatter.
 *
 * **One vocabulary.** A flag is named after the output field it sets, with `-`
 * for `_` (`due-date=` → `due_date`, `estimated-days=` → `estimated_days`). List
 * fields take `add-` / `remove-` forms. `none` clears. `create` and `update`
 * read the same flags through the same parsers, so a flag means one thing
 * everywhere. Status and dependency changes are `update` fields too.
 *
 * **Every write is a plan first.** A command builds a `WritePlan` per task — the
 * task as it will be, plus warnings — and the shared runner either previews the
 * plans (`dry-run`) or applies them. Both report the same thing, including
 * `impact`: the other tasks whose computed schedule or impediment the change
 * moves. TTasks derives most dates from the dependency chain, estimates and the
 * working calendar, and a caller can't predict that; so the CLI shows it.
 * Warnings are for actual problems (a past date, a deadline the chain can't
 * meet, a blocker with no reason); the standing rules are in `ttasks:context`.
 *
 * **Batches.** `update` and `complete` take `id=a,b,c`: the same change to every
 * task, validated together before anything is written, reported with one
 * combined impact.
 *
 * Writes happen directly, with no confirmation dialog (decided 2026-11-06): a
 * command typed in a terminal is deliberate, and an agent can't click one. A
 * write that's already true is a no-op reported as `"changed": false`, so an
 * agent can retry safely.
 */
import type { RepeatRule } from '../repeat/types';
import type { Task, TaskCreateInput } from '../types';
import { addDaysLocal, isIsoDateString } from '../utils/dateUtils';
import { decideCompletion, nextStartFor } from '../store/completeTask';
import { repeatCalendarFromHolidays } from '../repeat/types';
import { REPEAT_BASES, REPEAT_PRESETS, presetFromText } from '../repeat/presets';
import { repeatFromContract } from '../integration/repeatContract';
import {
	CliArgumentError, FORMAT_FLAG, IMPACT_LIMIT, canonical, choice, exportAll, exportShape, guardedAsync, impactLine,
	impactOf, knownLabels, listParam, outputFormat, pretty, resolveOne, stripMd, taskFromParams, tasksFromParams,
	textLine, weekdayName, withTasks,
	type CliActions, type CliCommand, type CliContext, type CliCreatePrefill, type CliParams,
} from './cliCore';
import { cliText } from './cliLint';
import { missingTaskLabel } from '../utils/taskLabel';

// ── Argument parsing ──────────────────────────────────────────────────────────

/** A flag's text value; a bare flag (`'true'`) or blank counts as absent. */
function textParam(params: CliParams, key: string): string | null {
	const raw = params[key];
	if (raw === undefined || raw === 'true') return null;
	const value = raw.trim();
	return value ? value : null;
}

/** A bare flag (`dry-run`) or `flag=true`. */
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
		'not-a-date',
	);
}

function timeParam(params: CliParams, key: string, allowNone: boolean): string | null | undefined {
	const raw = textParam(params, key);
	if (raw === null) return undefined;
	if (allowNone && isNone(raw)) return null;
	const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(raw);
	if (!match) throw new CliArgumentError(`${key}=${raw} is not a time; use HH:MM (24-hour)`, undefined, 'not-a-date');
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

/** `true` / `false` (`yes` / `no`, and `none` for false). Absent → undefined. */
function boolParam(params: CliParams, key: string): boolean | undefined {
	const raw = params[key];
	if (raw === undefined) return undefined;
	const value = raw.trim().toLowerCase();
	if (value === 'true' || value === 'yes') return true;
	if (value === 'false' || value === 'no' || value === 'none') return false;
	throw new CliArgumentError(`${key}=${raw} is not true or false`, ['true', 'false'], 'unknown-value');
}

/** Free text; with `allowNone`, `none` clears (''). Absent → undefined. */
function stringParam(params: CliParams, key: string, allowNone: boolean): string | undefined {
	const raw = textParam(params, key);
	if (raw === null) return undefined;
	return allowNone && isNone(raw) ? '' : raw;
}

/** One value from a closed set, matched case-insensitively and returned in the vault's spelling. */
function oneOf(params: CliParams, key: string, valid: readonly string[]): string | null {
	const raw = textParam(params, key);
	return raw === null ? null : canonical([raw], valid, key)[0];
}

// ── Recurrence ────────────────────────────────────────────────────────────────

const RECURRENCE_VALUES = [...REPEAT_PRESETS, 'none'] as const;

/**
 * `recurrence=` / `recurrence-type=`, in the Share/Sync vocabulary the output
 * uses. Returns the rule to store, `null` to stop repeating, or `undefined` for
 * "leave it alone". A custom rule (nth weekday, an end date…) is edited in
 * Obsidian's repeat builder; here only its basis can change.
 */
function recurrenceParams(params: CliParams, base: Task | null, dueDate: string | null): RepeatRule | null | undefined {
	const raw = textParam(params, 'recurrence');
	const typeRaw = textParam(params, 'recurrence-type');
	if (raw === null && typeRaw === null) return undefined;
	const type = typeRaw === null ? null : canonical([typeRaw], REPEAT_BASES, 'recurrence-type')[0];
	if (raw !== null && isNone(raw)) {
		if (type) throw new CliArgumentError('recurrence-type= goes with a recurrence; recurrence=none stops the repeat');
		return null;
	}
	if (raw !== null && !presetFromText(raw)) {
		throw new CliArgumentError(`recurrence=${raw} is not a recurrence the CLI sets; custom rules are made in Obsidian's repeat builder`, RECURRENCE_VALUES, 'unknown-value');
	}
	if (raw === null && !base?.repeat) throw new CliArgumentError('recurrence-type= needs a recurrence=; this task doesn\'t repeat');
	const rule = repeatFromContract(raw, type, dueDate, base?.repeat ?? null);
	return rule === undefined ? (base?.repeat ?? null) : rule;
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

const dependsOnPaths = (task: Pick<Task, 'depends_on'>): string[] => task.depends_on.map(stripMd);

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

/**
 * A `depends_on` entry of `task` that matches `raw` by hash but isn't a task in
 * the tasks folder (archived, or gone), as a stand-in Task — so
 * `remove-depends-on=` can clear what `ttasks:lint` reports as dangling.
 */
function danglingDependency(task: Task, ctx: CliContext, raw: string): Task | null {
	const wanted = raw.trim().replace(/^#/, '').toLowerCase();
	if (!wanted) return null;
	const known = new Set(ctx.tasks.map((candidate) => stripMd(candidate.path)));
	const path = dependsOnPaths(task).find((dep) => {
		const leaf = (dep.split('/').pop() ?? dep).toLowerCase();
		return !known.has(dep) && (leaf.startsWith(wanted) || dep.toLowerCase() === stripMd(wanted));
	});
	if (!path) return null;
	const leaf = path.split('/').pop() ?? path;
	const archived = ctx.archived.find((note) => stripMd(note.path) === path || note.path.endsWith(`/${leaf}.md`));
	return { ...task, id: leaf.slice(0, 6), name: archived?.name ?? missingTaskLabel(path), path: withExt(path) };
}

/** The open tasks downstream of `task` (everything that waits on it, directly or not). */
function openDownstream(ctx: CliContext, task: Task): Task[] {
	const self = stripMd(task.path);
	const found = new Map<string, Task>();
	const frontier = [self];
	while (frontier.length) {
		const path = frontier.pop()!;
		for (const other of ctx.tasks) {
			if (found.has(other.path) || stripMd(other.path) === self) continue;
			if (other.depends_on.some((dep) => stripMd(dep) === path)) {
				found.set(other.path, other);
				frontier.push(stripMd(other.path));
			}
		}
	}
	return [...found.values()].filter((other) => !other.is_complete);
}

// ── Fields ────────────────────────────────────────────────────────────────────

/** The field flags `create` and `update` share, in output-field order. Exported for tests. */
export const FIELD_FLAG_NAMES = [
	'name', 'area', 'status', 'priority', 'labels', 'parent', 'depends-on', 'blocked-reason', 'assigned-to', 'source',
	'start-date', 'due-date', 'due-time', 'estimated-days', 'workweek-only', 'recurrence', 'recurrence-type', 'notes',
] as const;
type FieldFlag = typeof FIELD_FLAG_NAMES[number];

/** What a write asks for, parsed and validated. Absent = leave it alone. */
interface FieldInput {
	scalars: Partial<Task>;
	/** The project (an `.md` vault path), or null to leave one. */
	parent?: string | null;
	/** The full `depends_on` the task should end up with, as paths without `.md`. */
	dependsOn?: string[];
	notes?: string;
	rewritten: Array<{ from: string; to: string }>;
}

/**
 * Parse every field flag against `task` (null for a new task). `update` allows
 * `none` to clear; the `add-` / `remove-` forms only make sense there too.
 */
function readFields(params: CliParams, ctx: CliContext, task: Task | null): FieldInput {
	const updating = task !== null;
	const scalars: Partial<Task> = {};
	const set = <K extends keyof Task>(key: K, value: Task[K] | undefined) => { if (value !== undefined) scalars[key] = value; };

	if (params.name !== undefined) {
		const name = textParam(params, 'name');
		if (!name) throw new CliArgumentError('name= can\'t be blank');
		set('name', name);
	}
	const areaRaw = textParam(params, 'area');
	if (areaRaw !== null) set('area', updating && isNone(areaRaw) ? null : oneOf(params, 'area', ctx.validValues.areas));
	const status = oneOf(params, 'status', ctx.validValues.statuses);
	if (status) set('status', status);
	const priority = oneOf(params, 'priority', ctx.validValues.priorities);
	if (priority) set('priority', priority as Task['priority']);

	// labels= replaces (none clears), then add-labels / remove-labels adjust.
	const labelsRaw = textParam(params, 'labels');
	const adding = canonical(listParam(params, 'add-labels') ?? [], knownLabels(ctx), 'add-labels');
	const removingLabels = listParam(params, 'remove-labels');
	if (labelsRaw !== null || adding.length || removingLabels) {
		let labels = labelsRaw === null ? [...(task?.labels ?? [])]
			: isNone(labelsRaw) ? [] : canonical(listParam(params, 'labels') ?? [], knownLabels(ctx), 'labels');
		for (const label of adding) if (!labels.includes(label)) labels.push(label);
		const removing = canonical(removingLabels ?? [], task?.labels.length ? task.labels : knownLabels(ctx), 'remove-labels');
		labels = labels.filter((label) => !removing.includes(label));
		set('labels', labels);
	}

	set('blocked_reason', stringParam(params, 'blocked-reason', true));
	set('assigned_to', stringParam(params, 'assigned-to', true));
	set('source', stringParam(params, 'source', true));
	set('start_date', dateParam(params, 'start-date', ctx, updating));
	set('due_date', dateParam(params, 'due-date', ctx, updating));
	const dueTime = timeParam(params, 'due-time', updating);
	set('due_time', dueTime);
	// Clearing the due date clears its time with it.
	if (dueTime === undefined && scalars.due_date === null && task?.due_time) scalars.due_time = null;
	set('estimated_days', daysParam(params, 'estimated-days', updating));
	set('workweek_only', boolParam(params, 'workweek-only'));
	const dueAfter = scalars.due_date !== undefined ? scalars.due_date : (task?.due_date ?? null);
	set('repeat', recurrenceParams(params, task, dueAfter));

	// Relationships and the body go through their own writers.
	let parent: string | null | undefined;
	const parentRaw = textParam(params, 'parent');
	if (parentRaw !== null) {
		const target = updating && isNone(parentRaw) ? null : resolveOne(ctx, parentRaw, 'parent', 'project');
		if (target && task && target.path === task.path) throw new CliArgumentError(`${task.id} can't be its own project`);
		parent = target ? withExt(target.path) : null;
	}

	let dependsOn: string[] | undefined;
	const depsRaw = textParam(params, 'depends-on');
	const addDeps = listParam(params, 'add-depends-on');
	const removeDeps = listParam(params, 'remove-depends-on');
	if (depsRaw !== null || addDeps || removeDeps) {
		const resolveDep = (raw: string, key: string) => {
			const found = resolveOne(ctx, raw, key);
			if (task && found.path === task.path) throw new CliArgumentError(`${task.id} can't depend on itself`);
			return stripMd(found.path);
		};
		let working = depsRaw === null ? dependsOnPaths(task ?? { depends_on: [] })
			: isNone(depsRaw) ? [] : (listParam(params, 'depends-on') ?? []).map((raw) => resolveDep(raw, 'depends-on'));
		for (const raw of addDeps ?? []) {
			const path = resolveDep(raw, 'add-depends-on');
			if (!working.includes(path)) working.push(path);
		}
		for (const raw of removeDeps ?? []) {
			// A dependency on an archived or deleted task isn't in the store; match it by hash.
			const path = (task ? danglingDependency(task, ctx, raw) : null)?.path ?? resolveOne(ctx, raw, 'remove-depends-on').path;
			working = working.filter((dep) => dep !== stripMd(path));
		}
		dependsOn = [...new Set(working)];
	}

	let notes: string | undefined;
	const rewritten: Array<{ from: string; to: string }> = [];
	const notesRaw = params.notes !== undefined ? (params.notes === 'true' ? '' : params.notes) : undefined;
	const appendRaw = textParam(params, 'append-notes');
	if (notesRaw !== undefined && appendRaw !== null) throw new CliArgumentError('give notes= (replace the body) or append-notes= (add to it), not both');
	if (notesRaw !== undefined) {
		const replaced = cliText(notesRaw, ctx);
		notes = replaced.text.trim() ? replaced.text : '';
		rewritten.push(...replaced.rewritten);
	}
	if (appendRaw !== null) {
		const appended = cliText(appendRaw, ctx);
		const current = task?.notes ?? '';
		notes = current.trim() ? `${current.trimEnd()}\n\n${appended.text}` : appended.text;
		rewritten.push(...appended.rewritten);
	}

	return { scalars, parent, dependsOn, notes, rewritten };
}

/** Rules that hold whatever the write: checked on the task as it will be. */
function validateMerged(ctx: CliContext, merged: Task, settingReason: boolean): void {
	if (merged.due_time && !merged.due_date) throw new CliArgumentError('due-time= needs a due date');
	if (merged.start_date && merged.due_date && merged.start_date > merged.due_date) {
		throw new CliArgumentError(`start ${merged.start_date} would be after due ${merged.due_date}`);
	}
	if (merged.type === 'project' && merged.labels.length) throw new CliArgumentError('projects carry no labels');
	// Only a reason this write sets: one left over from an earlier block is kept, not an error.
	if (settingReason && merged.blocked_reason && merged.status !== ctx.statusPolicy.block) {
		throw new CliArgumentError(`blocked-reason= goes with status=${ctx.statusPolicy.block}`);
	}
}

// ── Warnings ──────────────────────────────────────────────────────────────────

/**
 * Problems a write has, not reminders of the rules (those are in
 * `ttasks:context`): a date in the past, a deadline the dependency chain can't
 * meet (worked out by scheduling the task without its due date), and a status
 * that impedes open work downstream or blocks with no reason.
 */
function warningsFor(ctx: CliContext, before: Task | null, after: Task): string[] {
	const warnings: string[] = [];
	if (after.due_date && after.due_date !== before?.due_date) {
		if (after.due_date < ctx.today) warnings.push(`due ${after.due_date} is in the past (today is ${ctx.today}).`);
		const unpinned = withTasks(ctx, [{ ...after, due_date: null, due_time: null }]);
		const chainEnd = exportAll(unpinned).get(after.path)?.scheduled_end;
		if (chainEnd && chainEnd > after.due_date) {
			warnings.push(`The dependency chain and estimates finish this task on ${chainEnd}, after due ${after.due_date}.`);
		}
	}
	if (after.start_date && after.start_date !== before?.start_date && after.start_date < ctx.today) {
		warnings.push(`start ${after.start_date} is in the past (today is ${ctx.today}).`);
	}
	if (after.status !== before?.status && !after.is_complete) {
		const { block, hold, future } = ctx.statusPolicy;
		if ([block, hold, future].includes(after.status)) {
			const downstream = openDownstream(ctx, after);
			if (downstream.length) {
				warnings.push(`${after.status} impedes ${downstream.length} open task${downstream.length === 1 ? '' : 's'} downstream (see impact). ` +
					'They clear when this one does; don\'t restatus them.');
			}
		}
		if (after.status === block && !after.blocked_reason) warnings.push('No blocked-reason= given; say what it is waiting on.');
	}
	return warnings;
}

// ── Plans ─────────────────────────────────────────────────────────────────────

type Verb = 'created' | 'updated' | 'completed';

interface Applied {
	/** The task as written, with any links the store hasn't re-read yet. */
	main: Task;
	/** A repeating task's spawned next instance. */
	next?: Task | null;
}

interface WritePlan {
	/** The task as it will be. For a create, a placeholder with ref `new`. */
	after: Task;
	/** A preview of a repeat's next instance, ref `new`. */
	next?: Task | null;
	changed: boolean;
	warnings: string[];
	rewritten: Array<{ from: string; to: string }>;
	/** The write sets the note body, so the reply shows it: the caller can see what landed. */
	showsNotes: boolean;
	apply(actions: CliActions): Promise<Applied>;
}

/** A task as the CLI prints it: the export shape plus its path (and its body, when the write set it). */
function described(task: Task, ctx: CliContext, withNotes = false): Record<string, unknown> {
	const [shown] = exportShape([task], ctx, withNotes ? 'full' : 'none');
	return { ...shown, ...(withNotes ? { notes: task.notes } : {}), path: task.path };
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

/** Stand-in path for a task that doesn't exist yet (a dry run, a repeat's next instance). */
const PENDING_PATH = (label: string) => `(${label}).md`;

/** A completion preview: the task done, plus the next instance a repeat spawns. */
function completion(task: Task, ctx: CliContext): { updates: Partial<Task>; next: Task | null } {
	const holidays = ctx.derivedContext.calendarConfig;
	const decision = decideCompletion(task, {
		completionStatus: ctx.statusPolicy.completion,
		today: ctx.today,
		allTasks: ctx.tasks,
		calendar: repeatCalendarFromHolidays(holidays?.holidays ?? [], holidays?.recurringHolidays ?? []),
	});
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
	return { updates: decision.updates, next };
}

/** Preview or apply plans, and report them with their combined impact on the rest of the graph. */
async function runPlans(verb: Verb, plans: WritePlan[], params: CliParams, ctx: CliContext, actions: CliActions, format: 'json' | 'text'): Promise<string> {
	const dryRun = flagParam(params, 'dry-run');
	const changed = plans.filter((plan) => plan.changed);
	const overlay = (applied: Applied[]) => applied.flatMap((entry) => [entry.main, ...(entry.next ? [entry.next] : [])]);

	let results: Applied[] = plans.map((plan) => ({ main: plan.after, next: plan.next ?? null }));
	let after = ctx;
	if (changed.length) {
		if (dryRun) {
			after = withTasks(ctx, overlay(results));
		} else {
			const done: string[] = [];
			results = [];
			for (const plan of plans) {
				if (!plan.changed) { results.push({ main: plan.after }); continue; }
				try {
					results.push(await plan.apply(actions));
					done.push(plan.after.id);
				} catch (error) {
					const message = error instanceof Error ? error.message : String(error);
					throw new Error(done.length ? `${message}. Already written: ${done.join(', ')}` : message);
				}
			}
			after = withTasks(actions.snapshot(), overlay(results));
		}
	}
	const changedPaths = new Set(plans.flatMap((plan, index) => [plan.after.path, ...overlay([results[index]]).map((task) => task.path)]));
	const impact = changed.length ? impactOf(ctx, after, changedPaths) : [];
	const shownImpact = impact.slice(0, IMPACT_LIMIT);
	const warnings = plans.flatMap((plan) => plan.warnings.map((message) => ({ ref: plan.after.id, message })));
	const rewritten = plans.flatMap((plan) => plan.rewritten.map((entry) => ({ ref: plan.after.id, ...entry })));
	const spawned = results.flatMap((entry) => (entry.next ? [entry.next] : []));

	if (format === 'json') {
		return pretty({
			today: ctx.today,
			...(dryRun ? { dry_run: true } : {}),
			verb,
			changed: changed.length > 0,
			tasks: plans.map((plan, index) => ({ ...described(results[index].main, after, plan.showsNotes), changed: plan.changed })),
			...(spawned.length || verb === 'completed' ? { spawned: spawned.map((task) => described(task, after)) } : {}),
			...(rewritten.length ? { links_made_bare: rewritten } : {}),
			...(warnings.length ? { warnings } : {}),
			...(impact.length ? { impact: shownImpact } : {}),
			...(impact.length > IMPACT_LIMIT ? { impact_more: impact.length - IMPACT_LIMIT } : {}),
		});
	}

	const label = { created: 'Created', updated: 'Updated', completed: 'Completed' }[verb];
	const lines: string[] = [];
	plans.forEach((plan, index) => {
		const main = results[index].main;
		lines.push(`${plan.changed ? label : 'Unchanged'}  ${describedLine(main, after)}`);
		if (main.labels.length) lines.push(`  labels: ${main.labels.join(', ')}`);
		if (plan.showsNotes) lines.push('  notes:', ...(main.notes || '(empty)').split('\n').map((line) => `    ${line}`));
	});
	for (const task of spawned) lines.push(`Next  ${describedLine(task, after)}`);
	for (const entry of rewritten) lines.push(`Link made bare (${entry.ref}): ${entry.from} → ${entry.to}`);
	for (const warning of warnings) lines.push(`Warning (${warning.ref}): ${warning.message}`);
	if (impact.length) {
		lines.push(`Moves ${impact.length} other task${impact.length === 1 ? '' : 's'}:`);
		for (const entry of shownImpact) lines.push(`  ${impactLine(entry)}`);
		if (impact.length > IMPACT_LIMIT) lines.push(`  … and ${impact.length - IMPACT_LIMIT} more`);
	}
	if (dryRun && changed.length) lines.push('Dry run: nothing was written.');
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

function typeParam(params: CliParams): Task['type'] {
	return choice(params, 'type', ['task', 'project'] as const, 'task');
}

async function runNew(params: CliParams, ctx: CliContext, actions: CliActions): Promise<string> {
	const format = outputFormat(params, ['json', 'text'] as const);
	return guardedAsync(format, async () => {
		const type = typeParam(params);
		const fields = readFields(params, ctx, null);
		const { scalars } = fields;
		if (type === 'project' && scalars.labels?.length) throw new CliArgumentError('labels= is for tasks; projects carry no labels');
		const prefill: CliCreatePrefill = {
			...(scalars.name ? { name: scalars.name } : {}),
			...(scalars.area ? { area: scalars.area } : {}),
			...(fields.parent ? { parent_task: stripMd(fields.parent) } : {}),
			...(scalars.priority ? { priority: scalars.priority } : {}),
			...(scalars.labels?.length ? { labels: scalars.labels } : {}),
			...(scalars.start_date ? { start_date: scalars.start_date } : {}),
			...(scalars.due_date ? { due_date: scalars.due_date } : {}),
		};
		actions.openCreate(type, prefill);
		return format === 'json'
			? pretty({ opened: 'create', type, prefill })
			: `Opened the new-${type} dialog in Obsidian.`;
	});
}

// ── ttasks:create ─────────────────────────────────────────────────────────────

/** The create input `ttasks:create` builds. Exported for tests. */
export function buildCreateInput(params: CliParams, ctx: CliContext): TaskCreateInput {
	return buildCreate(params, ctx).input;
}

function buildCreate(params: CliParams, ctx: CliContext): { input: TaskCreateInput; rewritten: Array<{ from: string; to: string }> } {
	const type = typeParam(params);
	const fields = readFields(params, ctx, null);
	const { scalars } = fields;
	if (!scalars.name) throw new CliArgumentError('give the new task a name=');
	const status = scalars.status ?? ctx.statusPolicy.initial;
	const input: TaskCreateInput = {
		type,
		name: scalars.name,
		area: scalars.area ?? null,
		status,
		priority: scalars.priority ?? 'None',
		labels: scalars.labels ?? [],
		parent_task: fields.parent ? stripMd(fields.parent) : null,
		depends_on: fields.dependsOn ?? [],
		blocked_reason: scalars.blocked_reason ?? '',
		assigned_to: scalars.assigned_to ?? '',
		source: scalars.source ?? '',
		start_date: scalars.start_date ?? null,
		due_date: scalars.due_date ?? null,
		due_time: scalars.due_time ?? null,
		estimated_days: scalars.estimated_days ?? null,
		workweek_only: scalars.workweek_only ?? false,
		holiday_dates: [],
		created: ctx.today,
		completed: status === ctx.statusPolicy.completion ? ctx.today : null,
		repeat: scalars.repeat ?? null,
		notes: fields.notes ?? '',
		reminder_override: null,
	};
	validateMerged(ctx, input as Task, !!input.blocked_reason);
	return { input, rewritten: fields.rewritten };
}

function planCreate(params: CliParams, ctx: CliContext): WritePlan {
	const { input, rewritten } = buildCreate(params, ctx);
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
		after: placeholder,
		changed: true,
		warnings: warningsFor(ctx, null, placeholder),
		rewritten,
		showsNotes: input.notes !== '',
		apply: async (actions) => ({ main: asStored(await actions.create(input)) }),
	};
}

// ── ttasks:update ─────────────────────────────────────────────────────────────

/** The `update`-only forms of the field flags. */
const UPDATE_ONLY_FLAGS = ['add-labels', 'remove-labels', 'add-depends-on', 'remove-depends-on', 'append-notes'] as const;
const UPDATE_FIELD_FLAGS: readonly string[] = [...FIELD_FLAG_NAMES, ...UPDATE_ONLY_FLAGS];

/** One task's update plan, against `ctx` (which holds any earlier tasks of the batch as they will be). */
function planUpdateOne(params: CliParams, ctx: CliContext, task: Task): WritePlan {
	const fields = readFields(params, ctx, task);
	const updates: Partial<Task> = {};
	for (const [key, value] of Object.entries(fields.scalars) as Array<[keyof Task, unknown]>) {
		if (JSON.stringify(value ?? null) !== JSON.stringify(task[key] ?? null)) (updates as Record<string, unknown>)[key] = value;
	}
	// The completion status takes the completion path, so a repeating task recurs.
	const completing = updates.status === ctx.statusPolicy.completion && !task.is_complete;
	if (completing) delete updates.status;

	const currentParent = task.parent_task ? withExt(task.parent_task) : null;
	const parent = fields.parent !== undefined && fields.parent !== currentParent ? fields.parent : undefined;
	const current = dependsOnPaths(task);
	const wanted = fields.dependsOn ?? current;
	const added = wanted.filter((path) => !current.includes(path));
	const removed = current.filter((path) => !wanted.includes(path));
	let working = ctx.tasks;
	for (const path of added) {
		const target = ctx.tasks.find((candidate) => stripMd(candidate.path) === path)!;
		if (wouldCreateCycle(working, task, target)) {
			throw new CliArgumentError(`${task.id} depending on ${target.id} would make a loop: ${target.id} already waits on ${task.id}`, undefined, 'dependency-loop');
		}
		working = withTasks({ ...ctx, tasks: working }, [asStored({ ...task, depends_on: [...current, path] })]).tasks;
	}
	const notes = fields.notes !== undefined && fields.notes !== task.notes ? fields.notes : undefined;

	const reopening = task.is_complete && updates.status !== undefined;
	let after: Task = asStored({
		...task,
		...updates,
		is_inbox: (updates.area !== undefined ? updates.area : task.area) === null,
		...(reopening ? { is_complete: false, completed: null } : {}),
		...(parent !== undefined ? { parent_task: parent } : {}),
		depends_on: wanted,
		...(notes !== undefined ? { notes } : {}),
	});
	validateMerged(ctx, completing ? { ...after, status: ctx.statusPolicy.completion } : after, !!fields.scalars.blocked_reason);
	let next: Task | null = null;
	if (completing) {
		const done = completion(after, ctx);
		after = { ...after, ...done.updates, is_complete: true };
		next = done.next;
	}

	const changed = Object.keys(updates).length > 0 || parent !== undefined || added.length > 0 || removed.length > 0 || notes !== undefined || completing;
	return {
		after,
		next,
		changed,
		warnings: warningsFor(ctx, task, after),
		rewritten: fields.rewritten,
		showsNotes: fields.notes !== undefined,
		apply: async (actions) => {
			if (Object.keys(updates).length) await actions.update(task.path, updates);
			if (parent !== undefined) await actions.setParent(task.path, parent ? stripMd(parent) : null);
			for (const path of removed) await actions.removeDependency(task.path, path);
			for (const path of added) await actions.addDependency(task.path, path);
			if (notes !== undefined) await actions.updateNotes(task.path, notes);
			let fresh = Object.keys(updates).length ? reread(actions, task, updates) : task;
			let spawned: Task | null = null;
			if (completing) {
				spawned = await actions.complete(fresh);
				fresh = reread(actions, task, { status: ctx.statusPolicy.completion });
			}
			// The store re-reads links and the body from the file a moment later.
			return { main: { ...fresh, parent_task: after.parent_task, depends_on: after.depends_on, notes: after.notes }, next: spawned };
		},
	};
}

/** Plans for every task of a batch, each seeing the earlier ones as they will be. */
function planBatch(ctx: CliContext, tasks: Task[], plan: (ctx: CliContext, task: Task) => WritePlan): WritePlan[] {
	const plans: WritePlan[] = [];
	let working = ctx;
	for (const task of tasks) {
		const current = working.tasks.find((candidate) => candidate.path === task.path) ?? task;
		const next = plan(working, current);
		plans.push(next);
		working = withTasks(working, [next.after]);
	}
	return plans;
}

function planUpdate(params: CliParams, ctx: CliContext): WritePlan[] {
	if (!UPDATE_FIELD_FLAGS.some((flag) => params[flag] !== undefined)) {
		throw new CliArgumentError('nothing to change; give at least one field', UPDATE_FIELD_FLAGS, 'nothing-to-change');
	}
	return planBatch(ctx, tasksFromParams(params, ctx), (working, task) => planUpdateOne(params, working, task));
}

// ── ttasks:complete ───────────────────────────────────────────────────────────

function planCompleteOne(ctx: CliContext, task: Task): WritePlan {
	const base = { warnings: [], rewritten: [], showsNotes: false };
	if (task.is_complete) return { ...base, after: task, next: null, changed: false, apply: async () => ({ main: task }) };
	const done = completion(task, ctx);
	return {
		...base,
		after: { ...task, ...done.updates, is_complete: true },
		next: done.next,
		changed: true,
		apply: async (actions) => {
			const spawned = await actions.complete(task);
			return { main: reread(actions, task, { status: ctx.statusPolicy.completion }), next: spawned };
		},
	};
}

// ── Registry ──────────────────────────────────────────────────────────────────

const writeCommand = (verb: Verb, plan: (params: CliParams, ctx: CliContext) => WritePlan[]) =>
	async (params: CliParams, ctx: CliContext, actions: CliActions): Promise<string> => {
		const format = outputFormat(params, ['json', 'text'] as const);
		return guardedAsync(format, async () => runPlans(verb, plan(params, ctx), params, ctx, actions, format));
	};

type FlagSpec = { value?: string; description: string; required?: boolean };

const ID_FLAG: FlagSpec = { value: '<hash|name>', description: 'The task: its hash (or a unique prefix), or its exact name' };
const BATCH_ID_FLAG: FlagSpec = { value: '<hash|name>[,…]', description: 'The task, or several (id=a1b2c3,d4e5f6): the same change to each' };
const PATH_FLAG: FlagSpec = { value: '<vault path>', description: 'Alternatively, the task note\'s vault path' };
const DRY_RUN_FLAG: FlagSpec = { description: 'Report the result and its impact without writing anything' };
const DATE_HINT = 'YYYY-MM-DD|today|tomorrow';

/** Every field flag, described once. `update` adds `|none` (clear) to the clearable ones. */
const FIELD_FLAGS: Record<FieldFlag, FlagSpec> = {
	name: { value: '<text>', description: 'The name (renaming keeps links)' },
	area: { value: '<area>', description: 'A configured area' },
	status: { value: '<status>', description: 'A configured status; the completion status completes it (and recurs)' },
	priority: { value: '<High|Medium|Low|None>', description: 'Priority' },
	labels: { value: '<a,b>', description: 'Labels (tasks only)' },
	parent: { value: '<hash|name>', description: 'The project it belongs to' },
	'depends-on': { value: '<a,b>', description: 'Tasks it waits on (hash or name)' },
	'blocked-reason': { value: '<text>', description: 'What it is waiting on (with the blocked status)' },
	'assigned-to': { value: '<text>', description: 'Who it is assigned to' },
	source: { value: '<text>', description: 'Where it came from (a chat, an email, a meeting)' },
	'start-date': { value: `<${DATE_HINT}>`, description: 'Not before this date. Usually leave blank: the dependency chain decides' },
	'due-date': { value: `<${DATE_HINT}>`, description: 'A real external deadline only; it pins the schedule' },
	'due-time': { value: '<HH:MM>', description: 'Due time (needs a due date)' },
	'estimated-days': { value: '<days>', description: 'Working days of effort; this, not a date, is how to size work' },
	'workweek-only': { value: '<true|false>', description: 'Schedule on working days only' },
	recurrence: { value: `<${REPEAT_PRESETS.join('|')}>`, description: 'Repeat; completing it creates the next instance' },
	'recurrence-type': { value: `<${REPEAT_BASES.join('|')}>`, description: 'Repeat from the due date (fixed) or from completion' },
	notes: { value: '<text>', description: 'The note body; \\n is a line break, task links are written bare' },
};

const CLEARABLE = new Set<FieldFlag>(['area', 'labels', 'parent', 'depends-on', 'blocked-reason', 'assigned-to', 'source', 'start-date', 'due-date', 'due-time', 'estimated-days', 'recurrence']);
const updateFlag = (name: FieldFlag): FlagSpec => {
	const flag = FIELD_FLAGS[name];
	return CLEARABLE.has(name) && flag.value ? { ...flag, value: flag.value.replace(/>$/, '|none>') } : flag;
};
const pick = (names: readonly FieldFlag[]) => Object.fromEntries(names.map((name) => [name, FIELD_FLAGS[name]]));

const TYPE_FLAG: FlagSpec = { value: '<task|project>', description: 'What to create (default task)' };
const OPEN_FLAGS: Record<string, FlagSpec> = { id: ID_FLAG, path: PATH_FLAG, format: FORMAT_FLAG('json|text') };
const NEW_FLAGS: Record<string, FlagSpec> = {
	type: TYPE_FLAG,
	...pick(['name', 'area', 'priority', 'labels', 'parent', 'start-date', 'due-date']),
	format: FORMAT_FLAG('json|text'),
};
const CREATE_FLAGS: Record<string, FlagSpec> = {
	type: TYPE_FLAG,
	...FIELD_FLAGS,
	name: { ...FIELD_FLAGS.name, description: 'The name', required: true },
	status: { ...FIELD_FLAGS.status, description: 'A configured status (default: the first one)' },
	'dry-run': DRY_RUN_FLAG,
	format: FORMAT_FLAG('json|text'),
};
const UPDATE_FLAGS: Record<string, FlagSpec> = {
	id: BATCH_ID_FLAG,
	path: PATH_FLAG,
	...Object.fromEntries(FIELD_FLAG_NAMES.map((name) => [name, updateFlag(name)])),
	'add-labels': { value: '<a,b>', description: 'Add labels' },
	'remove-labels': { value: '<a,b>', description: 'Remove labels' },
	'add-depends-on': { value: '<a,b>', description: 'Add dependencies (refuses a loop)' },
	'remove-depends-on': { value: '<a,b>', description: 'Remove dependencies; an archived or missing task\'s hash works too' },
	notes: { ...FIELD_FLAGS.notes, description: 'Replace the note body; \\n is a line break, task links are written bare' },
	'append-notes': { value: '<text>', description: 'Add a paragraph to the note body (same rules as notes=)' },
	'dry-run': DRY_RUN_FLAG,
	format: FORMAT_FLAG('json|text'),
};
const COMPLETE_FLAGS: Record<string, FlagSpec> = { id: BATCH_ID_FLAG, path: PATH_FLAG, 'dry-run': DRY_RUN_FLAG, format: FORMAT_FLAG('json|text') };

export const ACTION_COMMANDS: readonly CliCommand[] = [
	{
		id: 'ttasks:open',
		description: 'Open a task in the board and detail pane, or the board when no task is given.',
		flags: OPEN_FLAGS,
		run: runOpen,
	},
	{
		id: 'ttasks:new',
		description: 'Open the new-task dialog in Obsidian, prefilled. Writes nothing until you press Create.',
		flags: NEW_FLAGS,
		run: runNew,
	},
	{
		id: 'ttasks:create',
		description: 'Create a task directly, with no dialog. Reports its computed schedule.',
		flags: CREATE_FLAGS,
		run: writeCommand('created', (params, ctx) => [planCreate(params, ctx)]),
	},
	{
		id: 'ttasks:update',
		description: 'Change fields, status or dependencies on one task or several. Reports what the change moves elsewhere in the schedule.',
		flags: UPDATE_FLAGS,
		run: writeCommand('updated', planUpdate),
	},
	{
		id: 'ttasks:complete',
		description: 'Mark one task or several complete. A repeating task spawns its next instance, as from the board.',
		flags: COMPLETE_FLAGS,
		run: writeCommand('completed', (params, ctx) => planBatch(ctx, tasksFromParams(params, ctx), planCompleteOne)),
	},
];
