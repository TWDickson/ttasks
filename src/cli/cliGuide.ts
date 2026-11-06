/**
 * The `obsidian ttasks:*` commands that explain rather than list:
 * `context` (how this vault works — call it first), `next` (what can be worked
 * on now) and `why` (what is holding a task up).
 *
 * They exist because TTasks computes most of what matters: a task's dates come
 * from its dependency chain, estimate and the working calendar, and a Blocked
 * task impedes everything downstream of it. A caller who doesn't know that
 * reads a blank due date as missing data and "fixes" it, or restatuses every
 * waiting task. `context` states the rules once, in words; `next` and `why`
 * answer the questions that would otherwise need the rules applied by hand.
 *
 * Pure (boundary-listed).
 */
import type { Task } from '../types';
import type { ExportedTask } from '../integration/taskJsonExport';
import { EMPTY_EXPORT_CRITERIA, filterTasksForExport } from '../integration/taskExportFilter';
import {
	FORMAT_FLAG, WEEKDAYS, canonical, exportAll, guarded, knownAreas, listParam, outputFormat, positiveInt,
	pretty, resolveOne, stripMd, taskFromParams, textLine, weekdayName,
	type CliCommand, type CliContext, type CliParams,
} from './cliCore';

// ── ttasks:context ────────────────────────────────────────────────────────────

const ROLE_MEANINGS = {
	new: 'the status a new task starts in',
	started: 'being worked on',
	done: 'complete; ttasks:complete sets it, and a repeating task recurs',
	blocked: 'stuck on something outside the plan; impedes everything downstream; takes blocked-reason=',
	'on-hold': 'parked on purpose; impedes everything downstream',
	future: 'not near-term yet; impedes everything downstream',
} as const;

type Role = keyof typeof ROLE_MEANINGS;

function statusRoles(ctx: CliContext): Array<{ name: string; roles: Role[] }> {
	const policy = ctx.statusPolicy;
	const pointers: Array<[Role, string | null]> = [
		['new', policy.initial], ['started', policy.start], ['done', policy.completion],
		['blocked', policy.block], ['on-hold', policy.hold], ['future', policy.future],
	];
	return ctx.validValues.statuses.map((name) => ({
		name,
		roles: pointers.flatMap(([role, status]) => (status === name ? [role] : [])),
	}));
}

/** The scheduling rules, in words, for this vault. Exported for tests. */
export function buildRules(ctx: CliContext): Record<string, string> {
	const { block, hold, future, completion } = ctx.statusPolicy;
	const parking = [hold, future].filter(Boolean).join(' and ');
	return {
		schedule:
			'Most tasks have no dates on purpose. TTasks schedules them itself: a task starts when everything it ' +
			'depends on is done, then takes its estimate (estimated_days, in working days; areas set to skip ' +
			'weekends also skip holidays). scheduled_start and scheduled_end are that computed plan; they appear ' +
			'once something in the chain is dated, and a task with none simply has no plan yet. A blank ' +
			'due_date or start_date is not missing data. Do not fill it in.',
		deadlines:
			'Set due-date= only for a real external deadline. It pins the task to that date instead of the computed ' +
			'schedule, and everything downstream follows it. To make work take longer, set estimated-days=. To make ' +
			'it wait for other work, set depends-on= (or add-depends-on=). Use start-date= only when work truly ' +
			'cannot begin before a date.',
		impediments:
			`Set ${block} only on the task that is actually stuck, with blocked-reason=. Every task waiting behind it ` +
			'shows impeded and impeded_by on its own. Do not restatus those tasks; they clear when the blocker ' +
			`does.${parking ? ` ${parking} propagate downstream the same way.` : ''}`,
		derived:
			'impeded, impeded_by, in_cycle, scheduled_start, scheduled_end and blocks are computed. Read them; ' +
			'nothing sets them. ttasks:why explains them for one task.',
		completion:
			`Finish work with ttasks:complete (or ttasks:update status=${completion}). A repeating task then creates ` +
			'its next instance itself. Never create the next one by hand.',
		dates:
			`Dates are local calendar dates, YYYY-MM-DD. Today is ${ctx.today} (${weekdayName(ctx.today)}). ` +
			'Work out other dates yourself. The only words accepted are today, tomorrow, and none to clear a date.',
		preview:
			'Every write accepts dry-run. It reports the result, warnings, and impact (the other tasks whose ' +
			'computed dates or impediments would move) without writing. Check impact before changing dates, ' +
			'estimates, dependencies or statuses.',
		values:
			'Statuses, areas, priorities and labels must be values listed here. Writes never invent one.',
		flags:
			'A flag is named after the output field it sets or filters, with - for _: due-date= sets due_date, ' +
			'estimated-days= sets estimated_days. List fields take add- and remove- forms (add-labels=, ' +
			'remove-depends-on=). none clears a field. id= takes several tasks (id=a1b2c3,d4e5f6) on update and complete.',
		notes:
			'Note bodies (notes=, append-notes=) take \\n for a line break. Link to another task as [[id-slug|Name]], ' +
			'with no folder prefix; writes make any task link bare. Run ttasks:lint after a batch of writes ' +
			'(ttasks:lint fix repairs link form).',
		identity:
			'Address a task by its ref, the 6-character hash (id=a1b2c3); a unique prefix works, and so does an ' +
			'exact name when only one task has it. Names are not unique; prefer the ref.',
	};
}

function runContext(all: () => readonly CliCommand[]) {
	return (params: CliParams, ctx: CliContext): string => {
		const format = outputFormat(params, ['json', 'text'] as const);
		const calendar = ctx.derivedContext.calendarConfig;
		const workweekAreas = Object.entries(calendar?.areaWorkweek ?? {}).filter(([, on]) => on).map(([area]) => area);
		const statuses = statusRoles(ctx);
		const rules = buildRules(ctx);
		const commands = all().map((command) => ({ id: command.id, description: command.description }));
		const data = {
			today: ctx.today,
			weekday: weekdayName(ctx.today),
			week_starts_on: WEEKDAYS[ctx.weekStart],
			statuses,
			status_roles: ROLE_MEANINGS,
			priorities: ctx.validValues.priorities,
			areas: ctx.validValues.areas,
			areas_skipping_weekends: workweekAreas,
			labels: ctx.validValues.labels,
			rules,
			commands,
		};
		if (format === 'json') return pretty(data);

		const lines = [
			`Today is ${data.today} (${data.weekday}). Weeks start on ${data.week_starts_on}.`,
			'',
			'Statuses:',
			...statuses.map((status) => `  ${status.name}${status.roles.length ? ` — ${status.roles.map((role) => ROLE_MEANINGS[role]).join('; ')}` : ''}`),
			`Priorities: ${data.priorities.join(', ')}`,
			`Areas: ${data.areas.join(', ') || '(none)'}${workweekAreas.length ? ` (skipping weekends: ${workweekAreas.join(', ')})` : ''}`,
			`Labels: ${data.labels.join(', ') || '(none)'}`,
			'',
			'Rules:',
			...Object.entries(rules).map(([key, rule]) => `  ${key}: ${rule}`),
			'',
			'Commands:',
			...commands.map((command) => `  ${command.id} — ${command.description}`),
		];
		return lines.join('\n');
	};
}

// ── ttasks:next ───────────────────────────────────────────────────────────────

const PRIORITY_RANK: Record<string, number> = { High: 0, Medium: 1, Low: 2, None: 3 };

/** The tasks that can be worked on today, best first. Exported for tests. */
export function readyTasks(ctx: CliContext, pool: Task[]): { ready: Task[]; waitingToStart: number } {
	const shaped = exportAll(ctx);
	const { start, block, hold, future } = ctx.statusPolicy;
	const parked = new Set([block, hold, future].filter((status): status is string => !!status));
	let waitingToStart = 0;
	const ready = pool.filter((task) => {
		const view = shaped.get(task.path);
		if (task.type !== 'task' || task.is_complete || parked.has(task.status) || !view) return false;
		if (view.impeded || view.in_cycle) return false;
		const startsOn = task.start_date ?? view.scheduled_start ?? null;
		if (startsOn && startsOn > ctx.today) {
			waitingToStart++;
			return false;
		}
		return true;
	});
	const dateOf = (task: Task) => task.due_date ?? shaped.get(task.path)?.scheduled_end ?? '9999-12-31';
	ready.sort((a, b) =>
		Number(b.status === start) - Number(a.status === start)
		|| dateOf(a).localeCompare(dateOf(b))
		|| (PRIORITY_RANK[a.priority] ?? 3) - (PRIORITY_RANK[b.priority] ?? 3)
		|| a.name.localeCompare(b.name));
	return { ready, waitingToStart };
}

function runNext(params: CliParams, ctx: CliContext): string {
	const format = outputFormat(params, ['json', 'text'] as const);
	return guarded(format, () => {
		let pool = ctx.tasks;
		const areas = listParam(params, 'area');
		if (areas) {
			const wanted = new Set(canonical(areas, knownAreas(ctx), 'area'));
			pool = pool.filter((task) => task.area !== null && wanted.has(task.area));
		}
		if (params.parent) {
			const project = resolveOne(ctx, params.parent, 'parent', 'project');
			pool = filterTasksForExport(pool, { ...EMPTY_EXPORT_CRITERIA, projects: [project.path] });
		}
		const limit = positiveInt(params, 'limit') ?? 10;
		const { ready, waitingToStart } = readyTasks(ctx, pool);
		const shaped = exportAll(ctx);
		const tasks = ready.slice(0, limit).map((task) => shaped.get(task.path)!);

		if (format === 'text') {
			if (!tasks.length) return `Nothing is ready to work on today (${ctx.today}).`;
			return [...tasks.map(textLine), ...(ready.length > limit ? [`… ${ready.length - limit} more ready`] : [])].join('\n');
		}
		return pretty({ today: ctx.today, count: tasks.length, ready_total: ready.length, waiting_to_start: waitingToStart, tasks });
	});
}

// ── ttasks:why ────────────────────────────────────────────────────────────────

interface WaitNode {
	ref: string;
	name: string;
	status: string;
	blocked_reason?: string;
	scheduled_end?: string;
	waiting_on?: WaitNode[];
}

const MAX_DEPTH = 8;

/** The unfinished chain a task waits on, as a tree. Shared subtrees repeat; loops stop. */
function waitTree(task: Task, byPath: Map<string, Task>, shaped: Map<string, ExportedTask>, seen: Set<string>, depth: number): WaitNode[] {
	if (depth >= MAX_DEPTH) return [];
	return task.depends_on.flatMap((dep) => {
		const upstream = byPath.get(stripMd(dep));
		if (!upstream || upstream.is_complete || seen.has(upstream.path)) return [];
		const next = new Set(seen).add(upstream.path);
		const node: WaitNode = { ref: upstream.id, name: upstream.name, status: upstream.status };
		if (upstream.blocked_reason) node.blocked_reason = upstream.blocked_reason;
		const end = shaped.get(upstream.path)?.scheduled_end;
		if (end) node.scheduled_end = end;
		const children = waitTree(upstream, byPath, shaped, next, depth + 1);
		if (children.length) node.waiting_on = children;
		return [node];
	});
}

/** Why a task can or can't be worked on today. Exported for tests. */
export function explainTask(ctx: CliContext, task: Task) {
	const shaped = exportAll(ctx);
	const view = shaped.get(task.path)!;
	const byPath = new Map(ctx.tasks.map((entry) => [stripMd(entry.path), entry]));
	const { block, hold, future } = ctx.statusPolicy;
	const reasons: string[] = [];

	if (task.is_complete) reasons.push(`It is complete (${task.status}${task.completed ? `, ${task.completed}` : ''}).`);
	if (task.status === block) reasons.push(`Its status is ${block}${task.blocked_reason ? `: ${task.blocked_reason}` : ', with no reason given'}.`);
	else if (task.status === hold || task.status === future) reasons.push(`Its status is ${task.status}.`);
	if (view.impeded) reasons.push(`It is impeded (${view.impeded}) by ${(view.impeded_by ?? []).join(', ') || 'an upstream task'}. Clear that, not this task.`);
	if (view.in_cycle) reasons.push('It is in a dependency loop, so it has no schedule. Remove one of the dependencies.');
	const waitingOn = task.is_complete ? [] : waitTree(task, byPath, shaped, new Set([task.path]), 0);
	if (waitingOn.length) reasons.push(`It waits on ${waitingOn.length} unfinished task${waitingOn.length === 1 ? '' : 's'}.`);
	const startsOn = task.start_date ?? view.scheduled_start ?? null;
	if (!task.is_complete && startsOn && startsOn > ctx.today) {
		reasons.push(task.start_date
			? `Its start date is ${task.start_date}.`
			: `The schedule starts it on ${startsOn}, when the work before it is done.`);
	}

	const unblocks = ctx.tasks
		.filter((other) => !other.is_complete && other.depends_on.some((dep) => stripMd(dep) === stripMd(task.path)))
		.map((other) => other.name);

	return {
		today: ctx.today,
		task: { ref: task.id, name: task.name, status: task.status },
		ready: reasons.length === 0,
		reasons: reasons.length ? reasons : ['Nothing is holding it up; it can be worked on now.'],
		...(waitingOn.length ? { waiting_on: waitingOn } : {}),
		...(view.scheduled_start ? { scheduled_start: view.scheduled_start } : {}),
		...(view.scheduled_end ? { scheduled_end: view.scheduled_end } : {}),
		...(unblocks.length ? { unblocks } : {}),
	};
}

function treeLines(nodes: WaitNode[], indent: string): string[] {
	return nodes.flatMap((node) => [
		`${indent}${node.ref}  ${node.status}  ${node.name}${node.blocked_reason ? ` (${node.blocked_reason})` : ''}${node.scheduled_end ? ` · ends ${node.scheduled_end}` : ''}`,
		...treeLines(node.waiting_on ?? [], `${indent}  `),
	]);
}

function runWhy(params: CliParams, ctx: CliContext): string {
	const format = outputFormat(params, ['json', 'text'] as const);
	return guarded(format, () => {
		const task = taskFromParams(params, ctx);
		const answer = explainTask(ctx, task);
		if (format === 'json') return pretty(answer);
		return [
			`${task.id}  ${task.name}: ${answer.ready ? 'ready' : 'not ready'}`,
			...answer.reasons.map((reason) => `  ${reason}`),
			...(answer.waiting_on ? ['Waiting on:', ...treeLines(answer.waiting_on, '  ')] : []),
			...(answer.unblocks ? [`Finishing it unblocks: ${answer.unblocks.join(', ')}`] : []),
		].join('\n');
	});
}

// ── Registry ──────────────────────────────────────────────────────────────────

/** `all` is the full registry, for `context` to list; passed lazily to avoid an import cycle. */
export function guideCommands(all: () => readonly CliCommand[]): CliCommand[] {
	return [
		{
			id: 'ttasks:context',
			description: 'Start here: today\'s date, this vault\'s statuses and values, and how TTasks schedules work.',
			flags: { format: FORMAT_FLAG('json|text') },
			run: runContext(all),
		},
		{
			id: 'ttasks:next',
			description: 'What can be worked on today: open, unimpeded, already startable. Started work first.',
			flags: {
				area: { value: '<a,b>', description: 'Only these areas' },
				parent: { value: '<hash|name>', description: 'Only this project' },
				limit: { value: '<n>', description: 'At most n (default 10)' },
				format: FORMAT_FLAG('json|text'),
			},
			run: runNext,
		},
		{
			id: 'ttasks:why',
			description: 'Why a task can or can\'t be worked on: its status, what it waits on, when the schedule starts it.',
			flags: {
				id: { value: '<hash|name>', description: 'The task: its hash (or a unique prefix), or its exact name' },
				path: { value: '<vault path>', description: 'Alternatively, the task note\'s vault path' },
				format: FORMAT_FLAG('json|text'),
			},
			run: runWhy,
		},
	];
}

