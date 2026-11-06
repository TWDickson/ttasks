/**
 * Note-body text for the CLI, and `ttasks:lint`, the hygiene check.
 *
 * **Body text.** `notes=` / `append=` arrive as one shell argument, so a caller
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
 *   `open-under-finished-parent`) read open tasks only; `thin-body` only tasks in
 *   the initial (Active) status, the ones about to be picked up.
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
	FORMAT_FLAG, canonical, guarded, listParam, outputFormat, positiveInt, pretty, stripMd,
	type CliCommand, type CliContext, type CliNote, type CliParams,
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

/** What is off about a current-format note's frontmatter, in words. */
function formatDrift(note: CliNote, fm: Record<string, unknown>, ctx: CliContext): string[] {
	const problems: string[] = [];
	const file = stripMd(leaf(note.path));
	if (!TASK_FILE.test(file)) problems.push(`the filename "${leaf(note.path)}" isn't {6hex}-{slug}.md`);
	const css = asList(fm[EXTRA_FM_KEYS.cssclasses]);
	if (!css.includes('ttask')) problems.push('cssclasses is missing ttask');
	for (const key of REQUIRED_KEYS) if (fm[key] === undefined || fm[key] === null || fm[key] === '') problems.push(`${key} is missing`);

	const type = fm[fmKey('type')];
	if (type !== undefined && type !== 'task' && type !== 'project') problems.push(`${fmKey('type')} is "${String(type)}"; use task or project`);
	const closed: Array<[keyof Task, readonly string[]]> = [
		['status', ctx.validValues.statuses], ['priority', ctx.validValues.priorities], ['area', ctx.validValues.areas],
	];
	for (const [field, valid] of closed) {
		const value = fm[fmKey(field)];
		if (value !== undefined && value !== null && !valid.includes(String(value))) {
			problems.push(`${fmKey(field)} "${String(value)}" isn't a configured value`);
		}
	}
	for (const label of asList(fm[fmKey('labels')])) {
		if (!ctx.validValues.labels.includes(String(label))) problems.push(`label "${String(label)}" isn't configured`);
	}
	for (const [, p] of STORED) {
		const value = fm[p.fmKey];
		if (value === undefined || value === null) continue;
		if (p.kind === 'date' && !(typeof value === 'string' && isIsoDateString(value))) problems.push(`${p.fmKey} "${String(value)}" isn't YYYY-MM-DD`);
		if (p.kind === 'dates' && asList(value).some((entry) => !(typeof entry === 'string' && isIsoDateString(entry)))) problems.push(`${p.fmKey} has a value that isn't YYYY-MM-DD`);
		if (p.kind === 'time' && !(typeof value === 'string' && /^\d{2}:\d{2}$/.test(value))) problems.push(`${p.fmKey} "${String(value)}" isn't HH:MM`);
		if (p.kind === 'number' && typeof value !== 'number') problems.push(`${p.fmKey} "${String(value)}" isn't a number`);
	}
	for (const { key, value } of linkStrings(fm)) {
		if (!/^\[\[[^\]]+\]\]$/.test(value.trim())) problems.push(`${key} "${value}" isn't a [[wiki-link]]`);
		else if (!value.includes('|')) problems.push(`${key} ${value} has no |Name alias`);
	}
	return problems;
}

// ── ttask:lint ────────────────────────────────────────────────────────────────

export const LINT_CHECKS = [
	'dangling-link', 'prefixed-link', 'format-drift', 'legacy-keys',
	'stalled-without-reason', 'thin-body', 'overdue', 'open-under-finished-parent',
] as const;
export type LintCheck = typeof LINT_CHECKS[number];

/** Below this many characters of body (whitespace trimmed), an Active task's note is thin. */
export const THIN_BODY_CHARS = 40;

export interface LintIssue {
	check: LintCheck;
	/** The task hash; for a note the store refuses, its filename's id. */
	ref: string;
	name: string;
	path: string;
	message: string;
	/** A command that fixes it, where one exists. */
	fix?: string;
}

export interface LintOptions {
	checks: readonly LintCheck[];
	minBody: number;
}

const daysBetween = (from: string, to: string): number =>
	Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

/** Every issue in the tasks folder. Exported for tests. */
export function lintTasks(ctx: CliContext, options: LintOptions): LintIssue[] {
	const targets = linkTargets(ctx);
	const enabled = new Set(options.checks);
	const byPath = new Map(ctx.tasks.map((task) => [task.path, task]));
	const { block, initial } = ctx.statusPolicy;
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
		const at = (check: LintCheck, message: string, fix?: string) => {
			if (enabled.has(check)) issues.push({ check, ref, name, path: note.path, message, ...(fix ? { fix } : {}) });
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
			for (const problem of formatDrift(note, fm, ctx)) at('format-drift', problem);
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
				at('prefixed-link', `${key} is ${value}; write it bare, as ${bare}`);
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
				else if (link.target.includes('/')) at('prefixed-link', `the body links to ${link.raw}; write it bare, as ${link.bare}`, `ttasks:update id=${task.id} notes=… (CLI writes make task links bare)`);
			}
		}

		// ── Work checks: open tasks ───────────────────────────────────────────
		if (!task || task.is_complete) continue;

		if (task.status === block && !task.blocked_reason.trim()) {
			at('stalled-without-reason', `${block} with no reason; say what it is waiting on`,
				`ttasks:status id=${task.id} status=${block} reason=<what it waits on>`);
		}
		if (task.status === initial && task.notes.trim().length < options.minBody) {
			at('thin-body', task.notes.trim()
				? `the note body is ${task.notes.trim().length} characters; say what done looks like`
				: 'the note body is empty; say what done looks like',
			`ttasks:update id=${task.id} append=<text>`);
		}
		if (task.due_date && task.due_date < ctx.today) {
			const late = daysBetween(task.due_date, ctx.today);
			at('overdue', `was due ${task.due_date}, ${late} day${late === 1 ? '' : 's'} ago`,
				`ttasks:complete id=${task.id}, or ttasks:update id=${task.id} due=<new date|none>`);
		}
		const parent = task.parent_task ? targets.resolve(task.parent_task) : null;
		const parentDone = parent ? (parent.task ? parent.task.is_complete : true) : false;
		if (parent && parentDone) {
			at('open-under-finished-parent', `still open, but its project "${parent.name}" is ${parent.task ? parent.task.status : 'archived'}`,
				`ttasks:complete id=${task.id}, or ttasks:update id=${task.id} project=none`);
		}
	}
	return issues;
}

function danglingFix(key: string, task: Task | null, target: string): string | undefined {
	if (!task) return undefined;
	if (key === fmKey('parent_task')) return `ttasks:update id=${task.id} project=none`;
	if (key === fmKey('depends_on')) return `ttasks:depend id=${task.id} on=${stripMd(leaf(target)).split('-')[0]} remove`;
	return undefined;
}

function runLint(params: CliParams, ctx: CliContext): string {
	const format = outputFormat(params, ['json', 'text'] as const);
	return guarded(format, () => {
		const checks = canonical(listParam(params, 'check') ?? [...LINT_CHECKS], LINT_CHECKS, 'check') as LintCheck[];
		const minBody = positiveInt(params, 'min-body') ?? THIN_BODY_CHARS;
		const issues = lintTasks(ctx, { checks, minBody });
		const checked = new Set([...ctx.folderNotes.map((note) => note.path), ...ctx.tasks.map((task) => task.path)]).size;

		if (format === 'text') {
			if (!issues.length) return `No issues in ${checked} notes.`;
			return [
				`${issues.length} issue${issues.length === 1 ? '' : 's'} in ${checked} notes:`,
				...issues.map((issue) => `${issue.check}  ${issue.ref}  ${issue.name} — ${issue.message}`),
			].join('\n');
		}
		const byCheck = Object.fromEntries(checks.map((check) => [check, issues.filter((issue) => issue.check === check).length]));
		return pretty({ today: ctx.today, checked, archived: ctx.archived.length, count: issues.length, by_check: byCheck, issues });
	});
}

export const LINT_COMMAND: CliCommand = {
	id: 'ttasks:lint',
	description: 'Hygiene check over the tasks folder: links, format, old keys, blocked without a reason, thin bodies, overdue, open tasks in finished projects.',
	flags: {
		check: { value: `<${LINT_CHECKS.join(',')}>`, description: 'Only these checks (default all)' },
		'min-body': { value: '<chars>', description: `An Active task's body shorter than this is thin (default ${THIN_BODY_CHARS})` },
		format: FORMAT_FLAG('json|text'),
	},
	run: runLint,
};
