/**
 * Note-body text for the CLI, and `ttasks:lint`, the hygiene check.
 *
 * **Body text.** `notes=` / `append-notes=` arrive as one shell argument, so a caller
 * writes a line break as `\n`. `cliText` turns `\n`, `\t` and `\\` into what
 * they stand for, so a literal `\n` never lands in a note. (If Obsidian has
 * already unescaped the value, there is nothing left to convert.) Task links in
 * the body are then written in their bare form, `[[id-slug|Name]]`: a folder
 * prefix is dropped, a `.md` is dropped, and a missing alias becomes the task's
 * name. A bare link survives the tasks folder being moved or renamed, and it
 * shows the task's name in native Obsidian views. Only links that resolve to a
 * task (open or archived) are touched. Embeds (`![[…]]`) and links to other
 * notes are left alone.
 *
 * **Lint.** Read-only checks for what makes a plan go stale without anything
 * failing. Two scopes:
 * - *Format* checks (`dangling-link`, `prefixed-link`, `format-drift`,
 *   `legacy-keys`) read every note in the tasks folder, completed ones and ones
 *   the store refuses included: a bad link or key is wrong whatever the status.
 * - *Work* checks (`stalled-without-reason`, `thin-body`, `overdue`,
 *   `open-under-finished-parent`) read open tasks only. `thin-body` skips parked
 *   work (the blocked, hold and future statuses): a parked task may be a stub,
 *   and one about to be picked up may not. `thin-status=` narrows it to named
 *   statuses. It counts non-whitespace characters, as `planner.py` does.
 * Links resolve against open **and archived** tasks, so a link to finished,
 * archived work isn't dangling.
 *
 * Pure (boundary-listed).
 */
import type { Task } from '../types';
import { PERSISTENCE_ENTRIES, EXTRA_FM_KEYS, fmKey, type FieldKind } from '../schema/taskPersistence';
import { classifyNote } from '../store/schemaGuard';
import { isIsoDateString } from '../utils/dateUtils';
import {
	FORMAT_FLAG, canonical, guardedAsync, listParam, outputFormat, positiveInt, pretty, stripMd,
	type CliActions, type CliCommand, type CliContext, type CliNote, type CliParams,
} from './cliCore';

// ── Escapes ───────────────────────────────────────────────────────────────────

const ESCAPES: Record<string, string> = { n: '\n', t: '\t', '\\': '\\' };

/** `\n` → newline, `\t` → tab, `\\` → a backslash. Any other backslash is kept as typed. */
export function unescapeCliText(raw: string): string {
	return raw.replace(/\\([nt\\])/g, (_, code: string) => ESCAPES[code]);
}

// ── Link targets ──────────────────────────────────────────────────────────────

/** A note a task link can point at: an open task, or an archived one. */
export interface LinkTarget {
	path: string;
	name: string;
	task: Task | null;
}

export interface LinkTargets {
	resolve(linkpath: string): LinkTarget | null;
}

const leaf = (path: string): string => path.split('/').pop() ?? path;
const withMd = (path: string): string => (path.endsWith('.md') ? path : `${path}.md`);

/**
 * Open and archived tasks, resolved the way `resolveTaskRef` does: an exact
 * vault path, or a filename whose whole remainder lines up (`Tasks/a.md`
 * can't claim `Other/Tasks/a.md`).
 */
export function linkTargets(ctx: Pick<CliContext, 'tasks' | 'archived'>): LinkTargets {
	const byPath = new Map<string, LinkTarget>();
	const byLeaf = new Map<string, LinkTarget[]>();
	const add = (target: LinkTarget) => {
		if (byPath.has(target.path)) return;
		byPath.set(target.path, target);
		const bucket = byLeaf.get(leaf(target.path));
		if (bucket) bucket.push(target);
		else byLeaf.set(leaf(target.path), [target]);
	};
	for (const task of ctx.tasks) add({ path: task.path, name: task.name, task });
	for (const note of ctx.archived) add({ path: note.path, name: note.name, task: null });
	return {
		resolve(linkpath) {
			const wanted = withMd(linkpath.trim());
			const exact = byPath.get(wanted);
			if (exact) return exact;
			return (byLeaf.get(leaf(wanted)) ?? []).find((candidate) => candidate.path.endsWith(`/${wanted}`)) ?? null;
		},
	};
}

// ── Wiki-links ────────────────────────────────────────────────────────────────

/** `[[target#heading|alias]]`, with an optional `!` for an embed. */
const WIKILINK = /(!?)\[\[([^\]|#\n]+)(#[^\]|\n]*)?(?:\|([^\]\n]*))?\]\]/g;

/** A task note's filename: the 6-hex id, a dash, then the slug. */
const TASK_FILE = /^[0-9a-f]{6}-[^/]+$/i;

export interface TaskLink {
	/** The link as written. */
	raw: string;
	/** The link target as written (no heading or alias). */
	target: string;
	/** What it resolves to, or null for a task-shaped link to nothing (dangling). */
	resolved: LinkTarget | null;
	/** The bare form, when it resolves. */
	bare: string | null;
}

/**
 * The task links in some text: links that resolve to an open or archived task,
 * plus links whose filename has the task-note shape but resolve to nothing.
 * Embeds and links to other notes are skipped.
 */
export function taskLinks(text: string, targets: LinkTargets): TaskLink[] {
	const links: TaskLink[] = [];
	for (const match of text.matchAll(WIKILINK)) {
		const [raw, embed, rawTarget, heading = '', alias] = match;
		if (embed) continue;
		const target = rawTarget.trim();
		const resolved = targets.resolve(target);
		if (resolved) {
			const name = alias?.trim() ? alias : resolved.name;
			links.push({ raw, target, resolved, bare: `[[${stripMd(leaf(resolved.path))}${heading}|${name}]]` });
		} else if (TASK_FILE.test(stripMd(leaf(target)))) {
			links.push({ raw, target, resolved: null, bare: null });
		}
	}
	return links;
}

/** The text with every resolvable task link in its bare form, and the links that changed. */
export function bareTaskLinks(text: string, targets: LinkTargets): { text: string; rewritten: Array<{ from: string; to: string }> } {
	const changes = new Map<string, string>();
	for (const link of taskLinks(text, targets)) {
		if (link.bare && link.bare !== link.raw) changes.set(link.raw, link.bare);
	}
	if (!changes.size) return { text, rewritten: [] };
	return {
		text: text.replace(WIKILINK, (raw) => changes.get(raw) ?? raw),
		rewritten: [...changes].map(([from, to]) => ({ from, to })),
	};
}

/** Note text from a CLI flag: escapes resolved, task links made bare. */
export function cliText(raw: string, ctx: CliContext): { text: string; rewritten: Array<{ from: string; to: string }> } {
	return bareTaskLinks(unescapeCliText(raw), linkTargets(ctx));
}

// ── Frontmatter shape ─────────────────────────────────────────────────────────

const STORED = PERSISTENCE_ENTRIES.filter(([, p]) => p.fmKey !== null && p.kind !== 'repeat') as Array<[keyof Task, { fmKey: string; kind: FieldKind; onCreate: string }]>;
const LINK_KEYS = STORED.filter(([, p]) => p.kind === 'link' || p.kind === 'links').map(([, p]) => p.fmKey);
const REQUIRED_KEYS = STORED.filter(([, p]) => p.onCreate === 'always').map(([, p]) => p.fmKey);

/**
 * Keys from before the `ttask_` prefix (MD-1). The rename rule was `ttask_` +
 * the field name, so each stored key's bare name is a legacy key; plus the keys
 * the cutover converted or dropped rather than renamed.
 */
export const LEGACY_KEYS: readonly string[] = [
	...STORED.map(([, p]) => p.fmKey.replace(/^ttask_/, '')),
	EXTRA_FM_KEYS.archiveHistory.replace(/^ttask_/, ''),
	'recurrence', 'recurrence_type', 'recurrence_anchor_day', 'blocks', 'category',
];

const asList = (value: unknown): unknown[] => (Array.isArray(value) ? value : value === undefined || value === null ? [] : [value]);
const linkStrings = (fm: Record<string, unknown>): Array<{ key: string; value: string }> =>
	LINK_KEYS.flatMap((key) => asList(fm[key]).flatMap((value) => (typeof value === 'string' ? [{ key, value }] : [])));

/** One format problem, in words, with the repair when it is mechanical. */
interface Drift {
	message: string;
	repair?: Repair;
}

/** What is off about a current-format note's frontmatter. */
function formatDrift(note: CliNote, fm: Record<string, unknown>, ctx: CliContext, targets: LinkTargets): Drift[] {
	const problems: Drift[] = [];
	const say = (message: string) => problems.push({ message });
	const file = stripMd(leaf(note.path));
	if (!TASK_FILE.test(file)) say(`the filename "${leaf(note.path)}" isn't {6hex}-{slug}.md`);
	const css = asList(fm[EXTRA_FM_KEYS.cssclasses]);
	if (!css.includes('ttask')) say('cssclasses is missing ttask');
	for (const key of REQUIRED_KEYS) if (fm[key] === undefined || fm[key] === null || fm[key] === '') say(`${key} is missing`);

	const type = fm[fmKey('type')];
	if (type !== undefined && type !== 'task' && type !== 'project') say(`${fmKey('type')} is "${String(type)}"; use task or project`);
	const closed: Array<[keyof Task, readonly string[]]> = [
		['status', ctx.validValues.statuses], ['priority', ctx.validValues.priorities], ['area', ctx.validValues.areas],
	];
	for (const [field, valid] of closed) {
		const value = fm[fmKey(field)];
		if (value !== undefined && value !== null && !valid.includes(String(value))) {
			say(`${fmKey(field)} "${String(value)}" isn't a configured value`);
		}
	}
	for (const label of asList(fm[fmKey('labels')])) {
		if (!ctx.validValues.labels.includes(String(label))) say(`label "${String(label)}" isn't configured`);
	}
	for (const [, p] of STORED) {
		const value = fm[p.fmKey];
		if (value === undefined || value === null) continue;
		if (p.kind === 'date' && !(typeof value === 'string' && isIsoDateString(value))) say(`${p.fmKey} "${String(value)}" isn't YYYY-MM-DD`);
		if (p.kind === 'dates' && asList(value).some((entry) => !(typeof entry === 'string' && isIsoDateString(entry)))) say(`${p.fmKey} has a value that isn't YYYY-MM-DD`);
		if (p.kind === 'time' && !(typeof value === 'string' && /^\d{2}:\d{2}$/.test(value))) say(`${p.fmKey} "${String(value)}" isn't HH:MM`);
		if (p.kind === 'number' && typeof value !== 'number') say(`${p.fmKey} "${String(value)}" isn't a number`);
	}
	for (const { key, value } of linkStrings(fm)) {
		if (!/^\[\[[^\]]+\]\]$/.test(value.trim())) say(`${key} "${value}" isn't a [[wiki-link]]`);
		else if (!value.includes('|')) {
			const target = /^\s*\[\[([^\]|#]+)/.exec(value)?.[1].trim() ?? '';
			const bare = taskLinks(value, targets)[0]?.bare;
			problems.push({
				message: `${key} ${value} has no |Name alias`,
				...(bare && targets.resolve(target) ? { repair: { kind: 'frontmatter', key, from: value, to: bare } as Repair } : {}),
			});
		}
	}
	return problems;
}

// ── ttask:lint ────────────────────────────────────────────────────────────────

export const LINT_CHECKS = [
	'dangling-link', 'prefixed-link', 'format-drift', 'legacy-keys',
	'stalled-without-reason', 'thin-body', 'overdue', 'open-under-finished-parent',
] as const;
export type LintCheck = typeof LINT_CHECKS[number];

/** Below this many non-whitespace characters, a live task's note body is thin. */
export const THIN_BODY_CHARS = 50;

/** A note body's length as `thin-body` measures it: non-whitespace characters. */
export const bodyChars = (notes: string): number => notes.replace(/\s/g, '').length;

/** A mechanical fix `ttasks:lint fix` can make: one link string, in the frontmatter or the body. */
export type Repair =
	| { kind: 'frontmatter'; key: string; from: string; to: string }
	| { kind: 'body'; from: string; to: string };

export interface LintIssue {
	check: LintCheck;
	/** The task hash; for a note the store refuses, its filename's id. */
	ref: string;
	name: string;
	path: string;
	message: string;
	/** A command that fixes it, where one exists. */
	fix?: string;
	/** The fix `ttasks:lint fix` makes itself. Not printed. */
	repair?: Repair;
}

export interface LintOptions {
	checks: readonly LintCheck[];
	minBody: number;
	/** The statuses `thin-body` reads; null = every open status but the parked ones. */
	thinStatuses?: readonly string[] | null;
}

const daysBetween = (from: string, to: string): number =>
	Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

/** Every issue in the tasks folder. Exported for tests. */
export function lintTasks(ctx: CliContext, options: LintOptions): LintIssue[] {
	const targets = linkTargets(ctx);
	const enabled = new Set(options.checks);
	const byPath = new Map(ctx.tasks.map((task) => [task.path, task]));
	const { block, hold, future } = ctx.statusPolicy;
	const parked = new Set([block, hold, future].filter((status): status is string => !!status));
	const thinScope = (status: string) => (options.thinStatuses ? options.thinStatuses.includes(status) : !parked.has(status));
	const issues: LintIssue[] = [];

	// Every note in the folder; a store task the folder listing lacks (a test
	// fixture, a note not yet indexed) still gets its work checks.
	const notes: CliNote[] = [...ctx.folderNotes];
	for (const task of ctx.tasks) if (!notes.some((note) => note.path === task.path)) notes.push({ path: task.path, frontmatter: null });

	for (const note of notes) {
		const task = byPath.get(note.path) ?? null;
		const fm = note.frontmatter;
		const fallbackName = (fm && (fm[fmKey('name')] ?? fm.name)) ?? stripMd(leaf(note.path));
		const ref = task?.id ?? stripMd(leaf(note.path)).split('-')[0];
		const name = task?.name ?? String(fallbackName);
		const at = (check: LintCheck, message: string, fix?: string, repair?: Repair) => {
			if (!enabled.has(check)) return;
			const fixHint = repair ? 'ttasks:lint fix' : fix;
			issues.push({ check, ref, name, path: note.path, message, ...(fixHint ? { fix: fixHint } : {}), ...(repair ? { repair } : {}) });
		};

		// ── Format checks: every note ─────────────────────────────────────────
		const schema = classifyNote(fm);
		const legacy = fm ? LEGACY_KEYS.filter((key) => Object.prototype.hasOwnProperty.call(fm, key)) : [];
		if (schema === 'legacy') {
			at('legacy-keys', `uses the old property names (${legacy.join(', ')}); the board doesn't show it`,
				'run Scripts/migrate-prefixed-schema.mjs from the TTasks 0.2.2 source');
			continue;
		}
		if (legacy.length) at('legacy-keys', `carries old property names beside the ttask_ ones: ${legacy.join(', ')}`, 'delete those properties');

		if (fm && schema === 'current') {
			for (const problem of formatDrift(note, fm, ctx, targets)) at('format-drift', problem.message, undefined, problem.repair);
		} else if (!task) {
			at('format-drift', fm ? `has no ${fmKey('name')}, so the board doesn't show it` : 'has no frontmatter; it isn\'t a task note');
		}

		// Frontmatter links: the raw strings when there are any, else the store's resolved paths.
		const fmLinks = fm ? linkStrings(fm) : [];
		for (const { key, value } of fmLinks) {
			// Any link here is meant to be a task, whatever its filename looks like.
			const target = /^\s*\[\[([^\]|#]+)/.exec(value)?.[1].trim();
			if (!target) continue;
			if (!targets.resolve(target)) {
				at('dangling-link', `${key} links to ${target}, which doesn't exist (open or archived)`, danglingFix(key, task, target));
			} else if (target.includes('/')) {
				const bare = taskLinks(value, targets)[0]?.bare;
				at('prefixed-link', `${key} is ${value}; write it bare, as ${bare}`, undefined,
					bare ? { kind: 'frontmatter', key, from: value, to: bare } : undefined);
			}
		}
		if (!fm && task) {
			for (const [key, path] of [[fmKey('parent_task'), task.parent_task], ...task.depends_on.map((dep) => [fmKey('depends_on'), dep])] as Array<[string, string | null]>) {
				if (path && !targets.resolve(path)) at('dangling-link', `${key} links to ${stripMd(path)}, which doesn't exist (open or archived)`, danglingFix(key, task, path));
			}
		}

		if (task) {
			for (const link of taskLinks(task.notes, targets)) {
				if (!link.resolved) at('dangling-link', `the body links to ${link.raw}, which doesn't exist (open or archived)`);
				else if (link.target.includes('/')) {
					at('prefixed-link', `the body links to ${link.raw}; write it bare, as ${link.bare}`, undefined,
						link.bare ? { kind: 'body', from: link.raw, to: link.bare } : undefined);
				}
			}
		}

		// ── Work checks: open tasks ───────────────────────────────────────────
		if (!task || task.is_complete) continue;

		if (task.status === block && !task.blocked_reason.trim()) {
			at('stalled-without-reason', `${block} with no reason; say what it is waiting on`,
				`ttasks:update id=${task.id} blocked-reason=<what it waits on>`);
		}
		const chars = bodyChars(task.notes);
		if (thinScope(task.status) && chars < options.minBody) {
			at('thin-body', chars
				? `the note body is ${chars} characters (not counting spaces); say what done looks like`
				: 'the note body is empty; say what done looks like',
			`ttasks:update id=${task.id} append-notes=<text>`);
		}
		if (task.due_date && task.due_date < ctx.today) {
			const late = daysBetween(task.due_date, ctx.today);
			at('overdue', `was due ${task.due_date}, ${late} day${late === 1 ? '' : 's'} ago`,
				`ttasks:complete id=${task.id}, or ttasks:update id=${task.id} due-date=<new date|none>`);
		}
		const parent = task.parent_task ? targets.resolve(task.parent_task) : null;
		const parentDone = parent ? (parent.task ? parent.task.is_complete : true) : false;
		if (parent && parentDone) {
			at('open-under-finished-parent', `still open, but its project "${parent.name}" is ${parent.task ? parent.task.status : 'archived'}`,
				`ttasks:complete id=${task.id}, or ttasks:update id=${task.id} parent=none`);
		}
	}
	return issues;
}

function danglingFix(key: string, task: Task | null, target: string): string | undefined {
	if (!task) return undefined;
	if (key === fmKey('parent_task')) return `ttasks:update id=${task.id} parent=none`;
	if (key === fmKey('depends_on')) return `ttasks:update id=${task.id} remove-depends-on=${stripMd(leaf(target)).split('-')[0]}`;
	return undefined;
}

const printable = ({ repair: _repair, ...issue }: LintIssue): Omit<LintIssue, 'repair'> => issue;
const issueLine = (issue: LintIssue) => `${issue.check}  ${issue.ref}  ${issue.name} — ${issue.message}`;

/** Make every mechanical repair: body links through the body writer, frontmatter links in place. */
async function applyRepairs(ctx: CliContext, actions: CliActions, repairs: LintIssue[]): Promise<void> {
	const byPath = new Map<string, LintIssue[]>();
	for (const issue of repairs) byPath.set(issue.path, [...(byPath.get(issue.path) ?? []), issue]);
	for (const [path, issues] of byPath) {
		const frontmatter = issues.flatMap((issue) => (issue.repair?.kind === 'frontmatter' ? [issue.repair] : []));
		if (frontmatter.length) await actions.replaceFrontmatterLinks(path, frontmatter.map(({ key, from, to }) => ({ key, from, to })));
		const body = issues.flatMap((issue) => (issue.repair?.kind === 'body' ? [issue.repair] : []));
		const task = ctx.tasks.find((candidate) => candidate.path === path);
		if (body.length && task) {
			const notes = body.reduce((text, { from, to }) => text.split(from).join(to), task.notes);
			if (notes !== task.notes) await actions.updateNotes(path, notes);
		}
	}
}

async function runLint(params: CliParams, ctx: CliContext, actions: CliActions): Promise<string> {
	const format = outputFormat(params, ['json', 'text'] as const);
	return guardedAsync(format, async () => {
		const checks = canonical(listParam(params, 'check') ?? [...LINT_CHECKS], LINT_CHECKS, 'check') as LintCheck[];
		const minBody = positiveInt(params, 'min-body') ?? THIN_BODY_CHARS;
		const thinRaw = listParam(params, 'thin-status');
		const thinStatuses = thinRaw ? canonical(thinRaw, ctx.validValues.statuses, 'thin-status') : null;
		const fixing = params.fix !== undefined && params.fix.toLowerCase() !== 'false';
		const dryRun = params['dry-run'] !== undefined && params['dry-run'].toLowerCase() !== 'false';
		const found = lintTasks(ctx, { checks, minBody, thinStatuses });
		const checked = new Set([...ctx.folderNotes.map((note) => note.path), ...ctx.tasks.map((task) => task.path)]).size;

		const fixed = fixing ? found.filter((issue) => issue.repair) : [];
		if (fixed.length && !dryRun) await applyRepairs(ctx, actions, fixed);
		const issues = found.filter((issue) => !fixed.includes(issue));

		if (format === 'text') {
			const lines: string[] = [];
			if (fixing) {
				lines.push(fixed.length ? `${dryRun ? 'Would fix' : 'Fixed'} ${fixed.length}:` : 'Nothing to fix mechanically.');
				for (const issue of fixed) lines.push(`  ${issue.check}  ${issue.ref}  ${issue.repair!.from} → ${issue.repair!.to}`);
			}
			lines.push(issues.length ? `${issues.length} issue${issues.length === 1 ? '' : 's'} in ${checked} notes:` : `No ${fixing ? 'other ' : ''}issues in ${checked} notes.`);
			lines.push(...issues.map(issueLine));
			if (fixing && dryRun && fixed.length) lines.push('Dry run: nothing was written.');
			return lines.join('\n');
		}
		const byCheck = Object.fromEntries(checks.map((check) => [check, issues.filter((issue) => issue.check === check).length]));
		return pretty({
			today: ctx.today,
			...(fixing && dryRun ? { dry_run: true } : {}),
			checked,
			archived: ctx.archived.length,
			...(fixing ? { fixed: fixed.map((issue) => ({ ...printable(issue), from: issue.repair!.from, to: issue.repair!.to })) } : {}),
			count: issues.length,
			by_check: byCheck,
			issues: issues.map(printable),
		});
	});
}

export const LINT_COMMAND: CliCommand = {
	id: 'ttasks:lint',
	description: 'Hygiene check over the tasks folder: links, format, old keys, blocked without a reason, thin bodies, overdue, open tasks in finished projects. fix repairs link form.',
	flags: {
		check: { value: `<${LINT_CHECKS.join(',')}>`, description: 'Only these checks (default all)' },
		'min-body': { value: '<chars>', description: `A body with fewer non-whitespace characters is thin (default ${THIN_BODY_CHARS})` },
		'thin-status': { value: '<a,b>', description: 'Only check bodies of these statuses (default: open and not blocked, on hold or future)' },
		fix: { description: 'Repair what is mechanical (link form) and report the rest' },
		'dry-run': { description: 'With fix: report the repairs without writing them' },
		format: FORMAT_FLAG('json|text'),
	},
	run: runLint,
};
