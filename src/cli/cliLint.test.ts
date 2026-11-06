import { describe, expect, it } from 'vitest';
import type { Task } from '../types';
import { CLI_COMMANDS, type CliContext } from './cliCommands';
import { LINT_CHECKS, lintTasks, unescapeCliText, type LintOptions } from './cliLint';

const BODY = 'Done when the thing is shipped and announced to the team.';

function task(overrides: Partial<Task> & Pick<Task, 'id' | 'name'>): Task {
	const slug = overrides.name.toLowerCase().replace(/\s+/g, '-');
	return {
		slug, path: `Tasks/${overrides.id}-${slug}.md`, type: 'task', status: 'Active', priority: 'None', area: 'Work',
		labels: [], parent_task: null, depends_on: [], blocks: [], blocked_reason: '', assigned_to: '', source: '',
		start_date: null, due_date: null, due_time: null, estimated_days: null, workweek_only: false, holiday_dates: [],
		created: '2026-10-01', completed: null, status_changed: '2026-10-01', repeat: null, notes: BODY,
		reminder_override: null, is_complete: false, is_inbox: false,
		...overrides,
	};
}

function context(tasks: Task[]): CliContext {
	return {
		tasks, views: [],
		validValues: { statuses: ['Active', 'Blocked', 'Hold', 'Done'], priorities: ['High', 'Medium', 'Low', 'None'], areas: ['Work'], labels: [] },
		derivedContext: { allTasks: tasks, statuses: { blockStatus: 'Blocked', holdStatus: 'Hold', futureStatus: null } },
		schedule: new Map(), today: '2026-11-06', weekStart: 1, now: '2026-11-06T12:00:00.000Z', presets: [],
		statusPolicy: { initial: 'Active', completion: 'Done', start: 'Active', block: 'Blocked', hold: 'Hold', future: null },
	};
}

const finished = task({ id: 'ppp000', name: 'Roof', type: 'project', status: 'Done', is_complete: true });
const clean = task({ id: 'aaa111', name: 'Clean' });
const TASKS = [
	finished,
	clean,
	task({ id: 'bbb222', name: 'Dangling', parent_task: 'Tasks/999999-gone.md', depends_on: ['Tasks/888888-also-gone.md', clean.path] }),
	task({ id: 'ccc333', name: 'Stuck', status: 'Blocked' }),
	task({ id: 'ddd444', name: 'Thin', notes: 'tbd' }),
	task({ id: 'eee555', name: 'Leftover', parent_task: finished.path }),
	task({ id: 'fff666', name: 'Linker', notes: `${BODY} After [[Tasks/aaa111-clean|Clean]], [[aaa111-clean|Clean]] and [[777777-nowhere|Gone]].` }),
	task({ id: 'ggg777', name: 'Done thin', status: 'Done', is_complete: true, notes: '' }),
];

const all: LintOptions = { checks: LINT_CHECKS, includeCompleted: false, minBody: 40 };
const found = (ctx = context(TASKS), options = all) =>
	lintTasks(ctx, options).map((issue) => `${issue.check} ${issue.ref}`);

describe('ttasks:lint', () => {
	it('finds each kind of issue, on open work only by default', () => {
		expect(found()).toEqual([
			'dangling-link bbb222', 'dangling-link bbb222',
			'stalled-without-reason ccc333',
			'thin-body ddd444',
			'open-under-finished-parent eee555',
			'prefixed-link fff666', 'dangling-link fff666',
		]);
	});

	it('includes completed tasks on request, and narrows to the checks asked for', () => {
		expect(found(context(TASKS), { ...all, includeCompleted: true })).toContain('thin-body ggg777');
		expect(found(context(TASKS), { ...all, checks: ['thin-body'] })).toEqual(['thin-body ddd444']);
	});

	it('gives a command that fixes the issue', () => {
		const issues = lintTasks(context(TASKS), all);
		expect(issues.find((issue) => issue.ref === 'ccc333')?.fix).toBe('ttasks:status id=ccc333 status=Blocked reason=<what it waits on>');
		expect(issues.find((issue) => issue.message.includes('888888'))?.fix).toBe('ttasks:depend id=bbb222 on=888888 remove');
	});

	it('runs as a command, with a count per check and a text form', async () => {
		const command = CLI_COMMANDS.find((candidate) => candidate.id === 'ttasks:lint')!;
		const out = JSON.parse(await command.run({}, context(TASKS), undefined as never));
		expect(out).toMatchObject({ checked: 6, count: 7, by_check: { 'dangling-link': 3, 'thin-body': 1 } });
		expect(await command.run({ format: 'text' }, context([clean]), undefined as never)).toBe('No issues in 1 tasks.');
		expect(JSON.parse(await command.run({ check: 'nope' }, context(TASKS), undefined as never)).valid).toEqual([...LINT_CHECKS]);
	});
});

describe('unescapeCliText', () => {
	it('resolves \\n, \\t and \\\\, and keeps any other backslash', () => {
		expect(unescapeCliText('a\\nb\\tc\\\\d\\x')).toBe('a\nb\tc\\d\\x');
	});
});
