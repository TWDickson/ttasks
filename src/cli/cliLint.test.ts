import { describe, expect, it } from 'vitest';
import type { Task } from '../types';
import { CLI_COMMANDS, type CliContext } from './cliCommands';
import type { CliNote } from './cliCore';
import { LEGACY_KEYS, LINT_CHECKS, lintTasks, unescapeCliText, type LintOptions } from './cliLint';

const BODY = 'Done when the thing is shipped, announced to the team, and the old path is switched off.';
const FOLDER = 'Planner/Tasks';

function task(overrides: Partial<Task> & Pick<Task, 'id' | 'name'>): Task {
	const slug = overrides.name.toLowerCase().replace(/\s+/g, '-');
	return {
		slug, path: `${FOLDER}/${overrides.id}-${slug}.md`, type: 'task', status: 'Active', priority: 'None', area: 'work',
		labels: [], parent_task: null, depends_on: [], blocks: [], blocked_reason: '', assigned_to: '', source: '',
		start_date: null, due_date: null, due_time: null, estimated_days: null, workweek_only: false, holiday_dates: [],
		created: '2026-10-01', completed: null, status_changed: '2026-10-01', repeat: null, notes: BODY,
		reminder_override: null, is_complete: false, is_inbox: false,
		...overrides,
	};
}

/** The frontmatter the store would have read `t` from. Links are given raw. */
function fm(t: Task, extra: Record<string, unknown> = {}): CliNote {
	return {
		path: t.path,
		frontmatter: {
			ttask_type: t.type, ttask_name: t.name, cssclasses: ['ttask'], ttask_status: t.status, ttask_area: t.area,
			ttask_created: t.created, ttask_status_changed: t.status_changed,
			...(t.due_date ? { ttask_due_date: t.due_date } : {}),
			...extra,
		},
	};
}

function context(tasks: Task[], folderNotes: CliNote[] = [], archived: CliContext['archived'] = []): CliContext {
	return {
		tasks, views: [],
		validValues: { statuses: ['Active', 'Future', 'Blocked', 'Hold', 'Completed'], priorities: ['High', 'Medium', 'Low', 'None'], areas: ['work', 'personal'], labels: ['action'] },
		derivedContext: { allTasks: tasks, statuses: { blockStatus: 'Blocked', holdStatus: 'Hold', futureStatus: 'Future' } },
		schedule: new Map(), today: '2026-11-06', weekStart: 1, now: '2026-11-06T12:00:00.000Z', presets: [],
		statusPolicy: { initial: 'Active', completion: 'Completed', start: 'Active', block: 'Blocked', hold: 'Hold', future: 'Future' },
		folderNotes, archived,
	};
}

const ARCHIVED = [{ path: 'Planner/Archive/2026/10/7c2f9a-old-work.md', name: 'Old work' }];
const all: LintOptions = { checks: LINT_CHECKS, minBody: 50 };
const found = (ctx: CliContext, options = all) => lintTasks(ctx, options).map((issue) => `${issue.check} ${issue.ref}`);

describe('ttasks:lint links', () => {
	it('resolves links to archived tasks, in frontmatter and the body', () => {
		const t = task({
			id: 'aaa111', name: 'Follow on', depends_on: [ARCHIVED[0].path],
			notes: `${BODY} After [[7c2f9a-old-work|Old work]].`,
		});
		const ctx = context([t], [fm(t, { ttask_depends_on: ['[[7c2f9a-old-work|Old work]]'] })], ARCHIVED);
		expect(found(ctx)).toEqual([]);
	});

	it('reports a link to a task that is neither open nor archived', () => {
		const t = task({ id: 'aaa111', name: 'Follow on', depends_on: [`${FOLDER}/999999-gone.md`], notes: `${BODY} [[888888-also-gone|X]]` });
		const ctx = context([t], [fm(t, { ttask_depends_on: ['[[999999-gone|Gone]]'] })], ARCHIVED);
		const issues = lintTasks(ctx, all);
		expect(issues.map((issue) => issue.check)).toEqual(['dangling-link', 'dangling-link']);
		expect(issues[0].fix).toBe('ttasks:update id=aaa111 remove-depends-on=999999');
	});

	it('flags a folder prefix in frontmatter links, completed tasks included', () => {
		const project = task({ id: '87c471', name: 'Dim model', type: 'project' });
		const done = task({ id: '403b64', name: 'Update spreadsheet', status: 'Completed', is_complete: true, completed: '2026-10-14', parent_task: project.path });
		const ctx = context([project, done], [fm(project), fm(done, { ttask_parent_task: `[[${FOLDER}/87c471-dim-model|Dim model]]`, ttask_completed: '2026-10-14' })]);
		const issues = lintTasks(ctx, all);
		expect(issues.map((issue) => `${issue.check} ${issue.ref}`)).toEqual(['prefixed-link 403b64']);
		expect(issues[0].message).toContain('write it bare, as [[87c471-dim-model|Dim model]]');
	});

	it('does not flag a bare body link that only lacks an alias', () => {
		const dep = task({ id: 'a1f302', name: 'Open account' });
		const t = task({ id: 'b7c914', name: 'Update payment info', status: 'Future', notes: `Depends on: [[a1f302-open-account]]\n\n${BODY}` });
		expect(found(context([dep, t], [fm(dep), fm(t)]))).toEqual([]);
	});
});

describe('ttasks:lint format', () => {
	it('reports drift in a current-format note', () => {
		const t = task({ id: 'aaa111', name: 'Drifted' });
		const note = fm(t, { cssclasses: ['planner-task'], ttask_status: 'Doing', ttask_labels: ['nope'], ttask_due_date: '14/10/2026', ttask_estimated_days: 'two', ttask_parent_task: 'Planner/Tasks/x' });
		const conflict = task({ id: '2b70c3', name: 'Copy' });
		const copied: CliNote = { ...fm(conflict), path: `${FOLDER}/2026-08-23T13-11 - 2b70c3-copy.md` };
		const issues = lintTasks(context([t], [note, copied]), { checks: ['format-drift'], minBody: 40 });
		expect(issues.map((issue) => issue.message)).toEqual([
			'cssclasses is missing ttask',
			'ttask_status "Doing" isn\'t a configured value',
			'label "nope" isn\'t configured',
			'ttask_due_date "14/10/2026" isn\'t YYYY-MM-DD',
			'ttask_estimated_days "two" isn\'t a number',
			'ttask_parent_task "Planner/Tasks/x" isn\'t a [[wiki-link]]',
			'the filename "2026-08-23T13-11 - 2b70c3-copy.md" isn\'t {6hex}-{slug}.md',
		]);
	});

	it('reports a note the store refuses for want of a name', () => {
		const note: CliNote = { path: `${FOLDER}/abc123-nameless.md`, frontmatter: { ttask_type: 'task', ttask_status: 'Active' } };
		expect(lintTasks(context([], [note]), all).map((issue) => issue.message)).toEqual(['has no ttask_name, so the board doesn\'t show it']);
	});

	it('reports old property names, on an old-format note and beside new ones', () => {
		const t = task({ id: 'aaa111', name: 'Mixed' });
		const old: CliNote = { path: `${FOLDER}/bbb222-old.md`, frontmatter: { type: 'task', name: 'Old', status: 'Active', category: 'work' } };
		const issues = lintTasks(context([t], [fm(t, { due_date: '2026-11-10', blocks: [] }), old]), { checks: ['legacy-keys'], minBody: 40 });
		expect(issues.map((issue) => `${issue.ref} ${issue.message}`)).toEqual([
			'aaa111 carries old property names beside the ttask_ ones: due_date, blocks',
			'bbb222 uses the old property names (type, name, status, category); the board doesn\'t show it',
		]);
		expect(LEGACY_KEYS).toEqual(expect.arrayContaining(['depends_on', 'parent_task', 'recurrence', 'archive_history']));
	});
});

describe('ttasks:lint work', () => {
	const project = task({ id: 'ppp000', name: 'Roof', type: 'project', status: 'Completed', is_complete: true });
	const TASKS = [
		project,
		task({ id: 'ccc333', name: 'Stuck', status: 'Blocked' }),
		task({ id: 'ddd444', name: 'Thin', notes: 'tbd' }),
		task({ id: 'ddd555', name: 'Thin but future', status: 'Future', notes: 'tbd' }),
		task({ id: 'eee555', name: 'Leftover', parent_task: project.path }),
		task({ id: 'eee666', name: 'In archived project', parent_task: ARCHIVED[0].path }),
		task({ id: 'fff666', name: 'Late', due_date: '2026-11-01' }),
		task({ id: 'ggg777', name: 'Done late thin', status: 'Completed', is_complete: true, notes: '', due_date: '2026-10-01' }),
	];

	it('checks open work only; thin-body skips parked statuses', () => {
		expect(found(context(TASKS, [], ARCHIVED), { ...all, checks: ['stalled-without-reason', 'thin-body', 'overdue', 'open-under-finished-parent'] })).toEqual([
			'stalled-without-reason ccc333',
			'thin-body ddd444',
			'open-under-finished-parent eee555',
			'open-under-finished-parent eee666',
			'overdue fff666',
		]);
	});

	it('says how late an overdue task is, and how to fix it', () => {
		const late = lintTasks(context(TASKS), { checks: ['overdue'], minBody: 40 })[0];
		expect(late).toMatchObject({ message: 'was due 2026-11-01, 5 days ago', fix: 'ttasks:complete id=fff666, or ttasks:update id=fff666 due-date=<new date|none>' });
	});

	it('runs as a command, with a count per check and a text form', async () => {
		const command = CLI_COMMANDS.find((candidate) => candidate.id === 'ttasks:lint')!;
		const out = JSON.parse(await command.run({}, context(TASKS, [], ARCHIVED), undefined as never));
		expect(out).toMatchObject({ checked: 8, archived: 1, count: 5, by_check: { overdue: 1, 'thin-body': 1 } });
		const clean = task({ id: 'aaa111', name: 'Clean' });
		expect(await command.run({ format: 'text' }, context([clean], [fm(clean)]), undefined as never)).toBe('No issues in 1 notes.');
		expect(JSON.parse(await command.run({ check: 'nope' }, context(TASKS), undefined as never)).valid).toEqual([...LINT_CHECKS]);
	});
});

describe('ttasks:lint thin-body (planner.py parity)', () => {
	// The regression: 0.2.7 read thin-body as "the initial status", which is the
	// first configured status. In a vault whose list doesn't start with Active,
	// no Active task was ever checked.
	const ctx = (tasks: Task[]) => ({
		...context(tasks),
		validValues: { ...context([]).validValues, statuses: ['Future', 'Active', 'In Progress', 'Blocked', 'Hold', 'Completed'] },
		statusPolicy: { ...context([]).statusPolicy, initial: 'Future' },
	});
	const empty = task({ id: '4cf3a1', name: 'Add technical code', notes: '' });
	const short = task({ id: 'ac0956', name: 'Follow up', notes: "\nProvide Sample of what's removed and that logic is correct\n" });
	const parkedStub = task({ id: 'b7c914', name: 'Later', status: 'Future', notes: '' });
	const thin = (c: CliContext, options: Partial<LintOptions> = {}) =>
		lintTasks(c, { checks: ['thin-body'], minBody: 50, ...options }).map((issue) => `${issue.ref} ${issue.message}`);

	it('checks every open status but the parked ones, whatever the first status is', () => {
		expect(thin(ctx([empty, short, parkedStub]))).toEqual([
			'4cf3a1 the note body is empty; say what done looks like',
			'ac0956 the note body is 49 characters (not counting spaces); say what done looks like',
		]);
	});

	it('narrows to named statuses with thin-status=', async () => {
		const progressing = task({ id: 'ddd111', name: 'Doing', status: 'In Progress', notes: '' });
		expect(thin(ctx([empty, progressing]), { thinStatuses: ['Active'] })).toEqual(['4cf3a1 the note body is empty; say what done looks like']);
		const command = CLI_COMMANDS.find((candidate) => candidate.id === 'ttasks:lint')!;
		const out = JSON.parse(await command.run({ check: 'thin-body', 'thin-status': 'active' }, ctx([empty, progressing]), undefined as never));
		expect(out.issues.map((issue: { ref: string }) => issue.ref)).toEqual(['4cf3a1']);
	});
});

describe('unescapeCliText', () => {
	it('resolves \\n, \\t and \\\\, and keeps any other backslash', () => {
		expect(unescapeCliText('a\\nb\\tc\\\\d\\x')).toBe('a\nb\tc\\d\\x');
	});
});

describe('ttasks:lint fix', () => {
	const project = task({ id: '87c471', name: 'Dim model', type: 'project' });
	const dep = task({ id: 'eb588f', name: 'Test court filtering' });
	const messy = task({
		id: '403b64', name: 'Update spreadsheet', parent_task: project.path, depends_on: [dep.path],
		notes: `${BODY} See [[${FOLDER}/eb588f-test-court-filtering|the tests]] and [[999999-gone|Gone]].`,
	});
	const notes = [fm(project), fm(dep), fm(messy, {
		ttask_parent_task: `[[${FOLDER}/87c471-dim-model|Dim model]]`,
		ttask_depends_on: ['[[eb588f-test-court-filtering]]'],
	})];
	const fake = () => {
		const calls: string[] = [];
		const actions = {
			replaceFrontmatterLinks: async (path: string, changes: unknown) => { calls.push(`links ${path} ${JSON.stringify(changes)}`); },
			updateNotes: async (path: string, body: string) => { calls.push(`notes ${path} ${JSON.stringify(body)}`); },
		};
		return { calls, actions: actions as never };
	};
	const lint = CLI_COMMANDS.find((candidate) => candidate.id === 'ttasks:lint')!;

	it('repairs link form in frontmatter and the body, and reports what it can\'t', async () => {
		const { calls, actions } = fake();
		const out = JSON.parse(await lint.run({ fix: 'true' }, context([project, dep, messy], notes), actions));
		expect(out.fixed.map((issue: { check: string; to: string }) => `${issue.check} ${issue.to}`)).toEqual([
			'format-drift [[eb588f-test-court-filtering|Test court filtering]]',
			'prefixed-link [[87c471-dim-model|Dim model]]',
			'prefixed-link [[eb588f-test-court-filtering|the tests]]',
		]);
		expect(out.issues.map((issue: { check: string }) => issue.check)).toEqual(['dangling-link']);
		expect(calls).toEqual([
			`links ${messy.path} ${JSON.stringify([
				{ key: 'ttask_depends_on', from: '[[eb588f-test-court-filtering]]', to: '[[eb588f-test-court-filtering|Test court filtering]]' },
				{ key: 'ttask_parent_task', from: `[[${FOLDER}/87c471-dim-model|Dim model]]`, to: '[[87c471-dim-model|Dim model]]' },
			])}`,
			`notes ${messy.path} ${JSON.stringify(`${BODY} See [[eb588f-test-court-filtering|the tests]] and [[999999-gone|Gone]].`)}`,
		]);
	});

	it('previews with dry-run, and points a mechanical issue at fix', async () => {
		const { calls, actions } = fake();
		const out = JSON.parse(await lint.run({ fix: 'true', 'dry-run': 'true' }, context([project, dep, messy], notes), actions));
		expect(out).toMatchObject({ dry_run: true });
		expect(out.fixed).toHaveLength(3);
		expect(calls).toEqual([]);
		const plain = JSON.parse(await lint.run({}, context([project, dep, messy], notes), actions));
		expect(plain.issues.filter((issue: { fix?: string }) => issue.fix === 'ttasks:lint fix')).toHaveLength(3);
		expect(plain.issues[0]).not.toHaveProperty('repair');
	});
});
