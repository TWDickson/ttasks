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
 * task are touched. Embeds (`![[…]]`) and links to other notes are left alone.
 *
 * **Lint.** Read-only checks for the things that make a plan go stale without
 * anything failing: a link to a task that no longer exists, a blocked task with
 * no reason, a task with almost no body, an open task in a finished project,
 * and a body link in the non-bare form.
 *
 * Pure (boundary-listed).
 */
import type { Task } from '../types';
import { buildTaskRefIndex, resolveTaskRef, type TaskRefIndex } from '../utils/taskRef';
import {
	CliArgumentError, FORMAT_FLAG, canonical, guarded, listParam, outputFormat, positiveInt, pretty, stripMd,
	type CliCommand, type CliContext, type CliParams,
} from './cliCore';

// ── Escapes ───────────────────────────────────────────────────────────────────

const ESCAPES: Record<string, string> = { n: '\n', t: '\t', '\\': '\\' };

/** `\n` → newline, `\t` → tab, `\\` → a backslash. Any other backslash is kept as typed. */
export function unescapeCliText(raw: string): string {
	return raw.replace(/\\([nt\\])/g, (_, code: string) => ESCAPES[code]);
}

// ── Body links ────────────────────────────────────────────────────────────────

/** `[[target#heading|alias]]`, with an optional `!` for an embed. */
const WIKILINK = /(!?)\[\[([^\]|#\n]+)(#[^\]|\n]*)?(?:\|([^\]\n]*))?\]\]/g;

/** A task note's filename: the 6-hex id, a dash, then the slug. */
const TASK_FILE = /^[0-9a-f]{6}-/i;

const leaf = (path: string): string => path.split('/').pop() ?? path;

export interface BodyLink {
	/** The link as written. */
	raw: string;
	/** The task it resolves to, or null for a task-shaped link to nothing. */
	task: Task | null;
	/** The bare form, when the link resolves to a task. */
	bare: string | null;
}

/**
 * The task links in a note body: links that resolve to a task, plus links
 * whose filename has the task-note shape but resolve to nothing (dangling).
 * Embeds and links to other notes are skipped.
 */
export function bodyTaskLinks(body: string, index: TaskRefIndex): BodyLink[] {
	const links: BodyLink[] = [];
	for (const match of body.matchAll(WIKILINK)) {
		const [raw, embed, target, heading = '', alias] = match;
		if (embed) continue;
		const path = target.trim();
		const ref = resolveTaskRef(path, index);
		if (ref?.kind === 'task') {
			const name = alias?.trim() ? alias : ref.task.name;
			links.push({ raw, task: ref.task, bare: `[[${stripMd(leaf(ref.task.path))}${heading}|${name}]]` });
		} else if (TASK_FILE.test(leaf(path))) {
			links.push({ raw, task: null, bare: null });
		}
	}
	return links;
}

/** The body with every resolvable task link in its bare form, and the links that changed. */
export function bareTaskLinks(body: string, index: TaskRefIndex): { text: string; rewritten: Array<{ from: string; to: string }> } {
	const changes = new Map<string, string>();
	for (const link of bodyTaskLinks(body, index)) {
		if (link.bare && link.bare !== link.raw) changes.set(link.raw, link.bare);
	}
	if (!changes.size) return { text: body, rewritten: [] };
	const text = body.replace(WIKILINK, (raw) => changes.get(raw) ?? raw);
	return { text, rewritten: [...changes].map(([from, to]) => ({ from, to })) };
}

/** Note text from a CLI flag: escapes resolved, task links made bare. */
export function cliText(raw: string, ctx: CliContext): { text: string; rewritten: Array<{ from: string; to: string }> } {
	return bareTaskLinks(unescapeCliText(raw), buildTaskRefIndex(ctx.tasks));
}

// ── ttasks:lint ───────────────────────────────────────────────────────────────

export const LINT_CHECKS = ['dangling-link', 'stalled-without-reason', 'thin-body', 'open-under-finished-parent', 'prefixed-link'] as const;
export type LintCheck = typeof LINT_CHECKS[number];

/** Below this many characters of body (whitespace trimmed), a task's note is thin. */
export const THIN_BODY_CHARS = 40;

export interface LintIssue {
	check: LintCheck;
	ref: string;
	name: string;
	path: string;
	message: string;
	/** A command that fixes it, where one exists. */
	fix?: string;
}

export interface LintOptions {
	checks: readonly LintCheck[];
	/** Include completed tasks (default: open work only). */
	includeCompleted: boolean;
	minBody: number;
}

/** Every issue in the store. Exported for tests. */
export function lintTasks(ctx: CliContext, options: LintOptions): LintIssue[] {
	const index = buildTaskRefIndex(ctx.tasks);
	const enabled = new Set(options.checks);
	const block = ctx.statusPolicy.block;
	const issues: LintIssue[] = [];

	for (const task of ctx.tasks) {
		if (task.is_complete && !options.includeCompleted) continue;
		const at = (check: LintCheck, message: string, fix?: string) => {
			if (enabled.has(check)) issues.push({ check, ref: task.id, name: task.name, path: task.path, message, ...(fix ? { fix } : {}) });
		};

		// Relationship links that resolve to nothing.
		const parent = resolveTaskRef(task.parent_task, index);
		if (parent?.kind === 'missing') {
			at('dangling-link', `parent_task links to ${stripMd(parent.path)}, which doesn't exist`, `ttasks:update id=${task.id} project=none`);
		}
		for (const dep of task.depends_on) {
			const ref = resolveTaskRef(dep, index);
			if (ref?.kind === 'missing') {
				at('dangling-link', `depends_on links to ${stripMd(ref.path)}, which doesn't exist`,
					`ttasks:depend id=${task.id} on=${ref.id || stripMd(leaf(ref.path))} remove`);
			}
		}

		const links = bodyTaskLinks(task.notes, index);
		for (const link of links) {
			if (!link.task) at('dangling-link', `the body links to ${link.raw}, which doesn't exist`);
			else if (link.bare !== link.raw) {
				at('prefixed-link', `the body links to ${link.raw}; write it bare, as ${link.bare}`,
					`ttasks:update id=${task.id} notes=… (CLI writes make task links bare)`);
			}
		}

		if (task.status === block && !task.blocked_reason.trim()) {
			at('stalled-without-reason', `${block} with no reason; say what it is waiting on`,
				`ttasks:status id=${task.id} status=${block} reason=<what it waits on>`);
		}

		if (task.notes.trim().length < options.minBody) {
			at('thin-body', task.notes.trim()
				? `the note body is ${task.notes.trim().length} characters; say what done looks like`
				: 'the note body is empty; say what done looks like',
			`ttasks:update id=${task.id} append=<text>`);
		}

		if (!task.is_complete && parent?.kind === 'task' && parent.task.is_complete) {
			at('open-under-finished-parent', `still open, but its project "${parent.task.name}" is ${parent.task.status}`,
				`ttasks:complete id=${task.id}, or ttasks:update id=${task.id} project=none`);
		}
	}
	return issues;
}

function runLint(params: CliParams, ctx: CliContext): string {
	const format = outputFormat(params, ['json', 'text'] as const);
	return guarded(format, () => {
		const checks = canonical(listParam(params, 'check') ?? [...LINT_CHECKS], LINT_CHECKS, 'check') as LintCheck[];
		const completedRaw = params.completed?.toLowerCase();
		if (completedRaw !== undefined && completedRaw !== 'include' && completedRaw !== 'exclude') {
			throw new CliArgumentError(`completed=${params.completed} is not recognised`, ['exclude', 'include']);
		}
		const includeCompleted = completedRaw === 'include';
		const minBody = positiveInt(params, 'min-body') ?? THIN_BODY_CHARS;
		const issues = lintTasks(ctx, { checks, includeCompleted, minBody });
		const checked = ctx.tasks.filter((task) => includeCompleted || !task.is_complete).length;

		if (format === 'text') {
			if (!issues.length) return `No issues in ${checked} tasks.`;
			return [
				`${issues.length} issue${issues.length === 1 ? '' : 's'} in ${checked} tasks:`,
				...issues.map((issue) => `${issue.check}  ${issue.ref}  ${issue.name} — ${issue.message}`),
			].join('\n');
		}
		const byCheck = Object.fromEntries(checks.map((check) => [check, issues.filter((issue) => issue.check === check).length]));
		return pretty({ today: ctx.today, checked, count: issues.length, by_check: byCheck, issues });
	});
}

export const LINT_COMMAND: CliCommand = {
	id: 'ttasks:lint',
	description: 'Hygiene check: dangling links, blocked without a reason, thin bodies, open tasks in finished projects, non-bare body links.',
	flags: {
		check: { value: `<${LINT_CHECKS.join(',')}>`, description: 'Only these checks (default all)' },
		completed: { value: '<exclude|include>', description: 'Lint completed tasks too (default exclude)' },
		'min-body': { value: '<chars>', description: `A body shorter than this is thin (default ${THIN_BODY_CHARS})` },
		format: FORMAT_FLAG('json|text'),
	},
	run: runLint,
};
