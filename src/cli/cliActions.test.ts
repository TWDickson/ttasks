import { describe, expect, it } from 'vitest';
import type { Task, TaskCreateInput } from '../types';
import { CLI_COMMANDS, type CliActions, type CliContext, type CliParams } from './cliCommands';
import { FIELD_FLAG_NAMES, buildCreateInput, wouldCreateCycle } from './cliActions';

const TODAY = '2026-11-06';

function task(overrides: Partial<Task> & Pick<Task, 'id' | 'name'>): Task {
	const slug = overrides.name.toLowerCase().replace(/\s+/g, '-');
	return {
		slug,
		path: `Tasks/${overrides.id}-${slug}.md`,
		type: 'task',
		status: 'Active',
		priority: 'None',
		area: 'Work',
		labels: [],
		parent_task: null,
		depends_on: [],
		blocks: [],
		blocked_reason: '',
		assigned_to: '',
		source: '',
		start_date: null,
		due_date: null,
		due_time: null,
		estimated_days: null,
		workweek_only: false,
		holiday_dates: [],
		created: '2026-10-01',
		completed: null,
		status_changed: '2026-10-01',
		repeat: null,
		notes: '',
		reminder_override: null,
		is_complete: false,
		is_inbox: false,
		...overrides,
	};
}

const roof = task({ id: 'ppp000', name: 'Roof', type: 'project', area: 'Home' });
const quotes = task({ id: 'aaa111', name: 'Get quotes', area: 'Home', parent_task: 'Tasks/ppp000-roof.md' });
const pick = task({ id: 'bbb222', name: 'Pick roofer', area: 'Home', depends_on: ['Tasks/aaa111-get-quotes.md'] });
const done = task({ id: 'ccc333', name: 'Old thing', status: 'Done', is_complete: true, completed: '2026-11-02' });
const weekly = task({ id: 'ddd444', name: 'Water plants', due_date: TODAY, repeat: { every: 1, unit: 'week' } as Task['repeat'] });

function context(tasks: Task[]): CliContext {
	return {
		tasks,
		views: [],
		validValues: { statuses: ['Active', 'In Progress', 'Hold', 'Blocked', 'Done'], priorities: ['High', 'Medium', 'Low', 'None'], areas: ['Work', 'Home'], labels: ['action', 'bug'] },
		derivedContext: { allTasks: tasks, statuses: { blockStatus: 'Blocked', holdStatus: 'Hold', futureStatus: null } },
		schedule: new Map(),
		today: TODAY,
		weekStart: 1,
		now: '2026-11-06T12:00:00.000Z',
		presets: [],
		statusPolicy: { initial: 'Active', completion: 'Done', start: 'In Progress', block: 'Blocked', hold: 'Hold', future: null },
		folderNotes: [],
		archived: [],
	};
}

/**
 * A stand-in for TaskStore: updates patch the store at once (as its optimistic
 * patch does), while dependency writes and creates only reach the file, so the
 * snapshot lags as the real metadata cache does.
 */
function fakeStore(initial: Task[], options: { dropUpdates?: boolean } = {}) {
	let tasks = initial.map((entry) => ({ ...entry }));
	const calls: string[] = [];
	const patch = (path: string, updates: Partial<Task>) => {
		tasks = tasks.map((entry) => (entry.path === path ? { ...entry, ...updates } : entry));
	};
	const actions: CliActions = {
		openBoard: async () => { calls.push('openBoard'); },
		openTask: async (path) => { calls.push(`openTask ${path}`); },
		openCreate: (type, prefill) => { calls.push(`openCreate ${type} ${JSON.stringify(prefill)}`); },
		create: async (input: TaskCreateInput) => {
			calls.push(`create ${input.name}`);
			return { ...input, id: 'eee555', slug: 'new', path: 'Tasks/eee555-new.md', blocks: [], status_changed: TODAY, is_complete: false, is_inbox: input.area === null };
		},
		complete: async (target) => {
			calls.push(`complete ${target.id}`);
			if (!options.dropUpdates) patch(target.path, { status: 'Done', completed: TODAY, is_complete: true });
			return target.repeat ? task({ id: 'fff666', name: target.name, due_date: '2026-11-13', repeat: target.repeat, repeat_of: target.path }) : null;
		},
		update: async (path, updates) => {
			calls.push(`update ${path} ${JSON.stringify(updates)}`);
			if (!options.dropUpdates) patch(path, updates);
		},
		addDependency: async (path, dependency) => { calls.push(`add ${path} -> ${dependency}`); },
		removeDependency: async (path, dependency) => { calls.push(`remove ${path} -> ${dependency}`); },
		setParent: async (path, parent) => { calls.push(`parent ${path} -> ${parent}`); },
		updateNotes: async (path, notes) => { calls.push(`notes ${path} ${JSON.stringify(notes)}`); },
		replaceFrontmatterLinks: async (path, changes) => { calls.push(`links ${path} ${JSON.stringify(changes)}`); },
		snapshot: () => context(tasks),
	};
	return { actions, calls, ctx: () => context(tasks) };
}

const ALL = [roof, quotes, pick, done, weekly];

async function run(id: string, params: CliParams, store = fakeStore(ALL)): Promise<{ out: string; calls: string[] }> {
	const command = CLI_COMMANDS.find((candidate) => candidate.id === id);
	if (!command) throw new Error(`no ${id}`);
	const out = await command.run(params, store.ctx(), store.actions);
	return { out, calls: store.calls };
}

const json = (out: string) => JSON.parse(out);

const only = (out: string) => {
	const reply = json(out);
	expect(reply.tasks).toHaveLength(1);
	return reply.tasks[0];
};

describe('the reply shape', () => {
	it('is the same for every write: verb, changed, tasks[], and spawned for completions', async () => {
		const created = json((await run('ttasks:create', { name: 'Call bank', 'dry-run': 'true' })).out);
		expect(Object.keys(created)).toEqual(['today', 'dry_run', 'verb', 'changed', 'tasks']);
		expect(created).toMatchObject({ verb: 'created', changed: true, tasks: [{ ref: 'new', changed: true }] });
		const completed = json((await run('ttasks:complete', { id: 'aaa111', 'dry-run': 'true' })).out);
		expect(completed).toMatchObject({ verb: 'completed', tasks: [{ ref: 'aaa111', status: 'Done' }], spawned: [] });
	});

	it('gives every error a code', async () => {
		expect(json((await run('ttasks:update', { id: 'zzz', priority: 'High' })).out)).toMatchObject({ code: 'not-found' });
		expect(json((await run('ttasks:update', { id: 'aaa111' })).out)).toMatchObject({ code: 'nothing-to-change' });
		expect(json((await run('ttasks:update', { id: 'aaa111', area: 'Garden' })).out)).toMatchObject({ code: 'unknown-value', valid: ['Work', 'Home'] });
		expect(json((await run('ttasks:update', { id: 'aaa111', 'due-date': 'friday' })).out)).toMatchObject({ code: 'not-a-date' });
		expect(json((await run('ttasks:update', { id: 'aaa111', 'add-depends-on': 'bbb222' })).out)).toMatchObject({ code: 'dependency-loop' });
	});

	it('rejects a flag the command doesn\'t take, so an old or misspelt name can\'t be ignored', async () => {
		const { out, calls } = await run('ttasks:create', { name: 'x', due: '2026-11-20' });
		expect(json(out)).toMatchObject({ error: 'due= is not a flag of ttasks:create', code: 'bad-argument' });
		expect(json(out).valid).toContain('due-date');
		expect(calls).toEqual([]);
		expect(json((await run('ttasks:open', { id: 'aaa111', notes: 'full' })).out).code).toBe('bad-argument');
	});

	it('names every field flag after the output field it sets', () => {
		const shown = Object.keys(json(CLI_COMMANDS.find((command) => command.id === 'ttasks:show')!.run({ id: 'aaa111' }, context(ALL), fakeStore(ALL).actions) as string));
		const output = new Set([...shown, 'parent', 'recurrence', 'recurrence_type', 'source', 'workweek_only', 'assigned_to', 'blocked_reason', 'start_date', 'due_date', 'due_time', 'estimated_days']);
		for (const flag of FIELD_FLAG_NAMES) expect(output, flag).toContain(flag.replace(/-/g, '_'));
	});
});

describe('ttasks:open', () => {
	it('opens the board when no task is given', async () => {
		const { out, calls } = await run('ttasks:open', {});
		expect(json(out)).toEqual({ opened: 'board' });
		expect(calls).toEqual(['openBoard']);
	});

	it('opens a task by hash prefix, or by exact name', async () => {
		expect(json((await run('ttasks:open', { id: 'aaa' })).out).opened).toEqual({ ref: 'aaa111', name: 'Get quotes', path: quotes.path });
		expect(json((await run('ttasks:open', { id: 'get quotes' })).out).opened.ref).toBe('aaa111');
	});

	it('reports an unknown task without opening anything', async () => {
		const { out, calls } = await run('ttasks:open', { id: 'zzz', format: 'text' });
		expect(out).toMatch(/^Error: id=zzz is not a task hash, path or name/);
		expect(calls).toEqual([]);
	});
});

describe('ttasks:new', () => {
	it('opens the dialog with a validated prefill in the vault\'s spelling', async () => {
		const { out, calls } = await run('ttasks:new', { name: 'Fix gutter', area: 'home', parent: 'roof', 'due-date': 'tomorrow', priority: 'high' });
		expect(json(out)).toEqual({
			opened: 'create',
			type: 'task',
			prefill: { name: 'Fix gutter', area: 'Home', parent_task: 'Tasks/ppp000-roof', priority: 'High', due_date: '2026-11-07' },
		});
		expect(calls).toHaveLength(1);
	});

	it('refuses an unconfigured area rather than prefilling it', async () => {
		const { out, calls } = await run('ttasks:new', { area: 'Garden' });
		expect(json(out)).toMatchObject({ error: 'area=Garden is not a configured value', valid: ['Work', 'Home'] });
		expect(calls).toEqual([]);
	});
});

describe('ttasks:create', () => {
	it('builds a sparse input with the initial status and the inbox when no area is given', () => {
		const input = buildCreateInput({ name: 'Call bank' }, context(ALL));
		expect(input).toMatchObject({ type: 'task', name: 'Call bank', status: 'Active', area: null, priority: 'None', depends_on: [], completed: null, created: TODAY });
	});

	it('resolves the parent and dependencies by hash or name', () => {
		const input = buildCreateInput({ name: 'Sign contract', parent: 'ppp0', 'depends-on': 'Pick roofer,#aaa111' }, context(ALL));
		expect(input.parent_task).toBe('Tasks/ppp000-roof');
		expect(input.depends_on).toEqual(['Tasks/bbb222-pick-roofer', 'Tasks/aaa111-get-quotes']);
	});

	it('sets every field the UI can', () => {
		const input = buildCreateInput({
			name: 'Pay invoice', 'assigned-to': 'Sam', source: 'Email from Kevin', 'workweek-only': 'true',
			'due-date': '2026-11-20', recurrence: 'monthly', status: 'Blocked', 'blocked-reason': 'Waiting on PO',
		}, context(ALL));
		expect(input).toMatchObject({
			assigned_to: 'Sam', source: 'Email from Kevin', workweek_only: true, status: 'Blocked', blocked_reason: 'Waiting on PO',
			repeat: { every: 1, unit: 'month', monthday: 20 },
		});
		expect(buildCreateInput({ name: 'x', recurrence: 'every 2 weeks', 'recurrence-type': 'from_completion' }, context(ALL)).repeat)
			.toEqual({ every: 2, unit: 'week', basis: 'completion' });
	});

	it('validates dates, times, reasons and recurrences', () => {
		const ctx = context(ALL);
		expect(buildCreateInput({ name: 'x', 'due-date': '2026-11-20', 'due-time': '9:05' }, ctx)).toMatchObject({ due_date: '2026-11-20', due_time: '09:05' });
		expect(() => buildCreateInput({ name: 'x', 'due-time': '09:00' }, ctx)).toThrow(/needs a due/);
		expect(() => buildCreateInput({ name: 'x', 'due-date': 'friday' }, ctx)).toThrow(/not a date/);
		expect(() => buildCreateInput({ name: 'x', 'start-date': '2026-12-01', 'due-date': '2026-11-01' }, ctx)).toThrow(/after due/);
		expect(() => buildCreateInput({ name: 'x', 'blocked-reason': 'y' }, ctx)).toThrow(/goes with status=Blocked/);
		expect(() => buildCreateInput({ name: 'x', recurrence: 'every 3rd tuesday' }, ctx)).toThrow(/repeat builder/);
	});

	it('refuses labels on a project', () => {
		expect(() => buildCreateInput({ name: 'x', type: 'project', labels: 'bug' }, context(ALL))).toThrow(/projects carry no labels/);
	});

	it('creates and reports the new task, though the store has not caught up', async () => {
		const { out, calls } = await run('ttasks:create', { name: 'Call bank', area: 'work' });
		expect(only(out)).toMatchObject({ ref: 'eee555', name: 'Call bank', area: 'Work', path: 'Tasks/eee555-new.md' });
		expect(calls).toEqual(['create Call bank']);
	});

	it('reports the new task\'s links by name', async () => {
		const { out } = await run('ttasks:create', { name: 'Sign contract', parent: 'roof', 'depends-on': 'bbb222' });
		expect(only(out)).toMatchObject({ parent: 'Roof', depends_on: ['Pick roofer'] });
	});

	it('creates nothing when one dependency is unknown', async () => {
		const { out, calls } = await run('ttasks:create', { name: 'x', 'depends-on': 'bbb222,zzz999' });
		expect(json(out).error).toMatch(/zzz999/);
		expect(calls).toEqual([]);
	});

	it('writes nothing without a name', async () => {
		const { out, calls } = await run('ttasks:create', { area: 'Work' });
		expect(json(out).error).toMatch(/name=/);
		expect(calls).toEqual([]);
	});
});

describe('ttasks:complete', () => {
	it('completes a task', async () => {
		const { out, calls } = await run('ttasks:complete', { id: 'aaa111' });
		expect(json(out)).toMatchObject({ verb: 'completed', changed: true, tasks: [{ ref: 'aaa111', status: 'Done' }], spawned: [] });
		expect(calls).toEqual(['complete aaa111']);
	});

	it('reports the next instance of a repeating task', async () => {
		const { out } = await run('ttasks:complete', { id: 'ddd', format: 'text' });
		expect(out).toMatch(/^Completed {2}ddd444/);
		expect(out).toMatch(/\nNext {2}fff666 .*due 2026-11-13/);
	});

	it('completes several at once, and skips one already done', async () => {
		const { out, calls } = await run('ttasks:complete', { id: 'aaa111,ccc333,ddd444' });
		const reply = json(out);
		expect(reply.tasks.map((entry: { ref: string; changed: boolean }) => `${entry.ref} ${entry.changed}`)).toEqual(['aaa111 true', 'ccc333 false', 'ddd444 true']);
		expect(reply.spawned.map((entry: { ref: string }) => entry.ref)).toEqual(['fff666']);
		expect(calls).toEqual(['complete aaa111', 'complete ddd444']);
	});

	it('says so when the write did not land', async () => {
		const store = fakeStore(ALL, { dropUpdates: true });
		await expect(run('ttasks:complete', { id: 'aaa111' }, store)).rejects.toThrow(/didn't land/);
	});
});

describe('ttasks:update status', () => {
	it('sets a status, matched case-insensitively', async () => {
		const { out, calls } = await run('ttasks:update', { id: 'aaa111', status: 'in progress' });
		expect(only(out)).toMatchObject({ ref: 'aaa111', status: 'In Progress' });
		expect(calls).toEqual([`update ${quotes.path} {"status":"In Progress"}`]);
	});

	it('writes the blocked reason with the blocked status, or on its own', async () => {
		const { calls } = await run('ttasks:update', { id: 'aaa111', status: 'Blocked', 'blocked-reason': 'Waiting on HOA' });
		expect(calls).toEqual([`update ${quotes.path} {"status":"Blocked","blocked_reason":"Waiting on HOA"}`]);
		const stuck = task({ id: 'sss001', name: 'Stuck', status: 'Blocked' });
		expect((await run('ttasks:update', { id: 'sss001', 'blocked-reason': 'HOA' }, fakeStore([stuck]))).calls)
			.toEqual([`update ${stuck.path} {"blocked_reason":"HOA"}`]);
	});

	it('refuses a reason with any other status, but keeps an old reason when unblocking', async () => {
		const { out, calls } = await run('ttasks:update', { id: 'aaa111', status: 'Hold', 'blocked-reason': 'x' });
		expect(json(out).error).toMatch(/status=Blocked/);
		expect(calls).toEqual([]);
		const stuck = task({ id: 'sss001', name: 'Stuck', status: 'Blocked', blocked_reason: 'HOA' });
		expect((await run('ttasks:update', { id: 'sss001', status: 'Active' }, fakeStore([stuck]))).calls)
			.toEqual([`update ${stuck.path} {"status":"Active"}`]);
	});

	it('routes the completion status through completion, so repeats recur, after the other fields', async () => {
		const { out, calls } = await run('ttasks:update', { id: 'ddd444', status: 'done', priority: 'High' });
		expect(calls).toEqual([`update ${weekly.path} {"priority":"High"}`, 'complete ddd444']);
		expect(json(out).spawned[0].ref).toBe('fff666');
	});

	it('is a no-op when the task already has the status', async () => {
		const { out, calls } = await run('ttasks:update', { id: 'aaa111', status: 'Active' });
		expect(json(out).changed).toBe(false);
		expect(calls).toEqual([]);
	});
});

describe('ttasks:update dependencies', () => {
	it('adds dependencies and reports the new state before the store catches up', async () => {
		const { out, calls } = await run('ttasks:update', { id: 'aaa111', 'add-depends-on': 'ccc333,Water plants' });
		expect(only(out).depends_on).toEqual(['Old thing', 'Water plants']);
		expect(calls).toEqual([`add ${quotes.path} -> Tasks/ccc333-old-thing`, `add ${quotes.path} -> Tasks/ddd444-water-plants`]);
	});

	it('is a no-op for one it already has', async () => {
		const { out, calls } = await run('ttasks:update', { id: 'bbb222', 'add-depends-on': 'aaa111' });
		expect(json(out).changed).toBe(false);
		expect(calls).toEqual([]);
	});

	it('removes, and replaces the whole list with depends-on= (none clears)', async () => {
		const removed = await run('ttasks:update', { id: 'bbb222', 'remove-depends-on': 'aaa111' });
		expect(only(removed.out).depends_on).toEqual([]);
		expect(removed.calls).toEqual([`remove ${pick.path} -> Tasks/aaa111-get-quotes`]);
		const replaced = await run('ttasks:update', { id: 'bbb222', 'depends-on': 'ccc333' });
		expect(replaced.calls).toEqual([`remove ${pick.path} -> Tasks/aaa111-get-quotes`, `add ${pick.path} -> Tasks/ccc333-old-thing`]);
		expect((await run('ttasks:update', { id: 'bbb222', 'depends-on': 'none' })).calls).toEqual([`remove ${pick.path} -> Tasks/aaa111-get-quotes`]);
	});

	it('refuses a loop, and writes none of it', async () => {
		const { out, calls } = await run('ttasks:update', { id: 'aaa111', 'add-depends-on': 'ccc333,bbb222' });
		expect(json(out)).toMatchObject({ code: 'dependency-loop' });
		expect(calls).toEqual([]);
	});

	it('refuses a task depending on itself', async () => {
		expect(json((await run('ttasks:update', { id: 'aaa111', 'add-depends-on': 'aaa111' })).out).error).toMatch(/itself/);
	});

	it('removes a dependency whose task no longer exists, by its hash', async () => {
		const orphaned = task({ id: 'ooo001', name: 'Orphaned', depends_on: ['Tasks/999999-gone.md', quotes.path] });
		const { calls } = await run('ttasks:update', { id: 'ooo001', 'remove-depends-on': '999999' }, fakeStore([quotes, orphaned]));
		expect(calls).toEqual([`remove ${orphaned.path} -> Tasks/999999-gone`]);
	});
});

describe('wouldCreateCycle', () => {
	it('follows the chain transitively, whatever the extension', () => {
		const a = task({ id: 'a00001', name: 'A' });
		const b = task({ id: 'b00001', name: 'B', depends_on: ['Tasks/a00001-a.md'] });
		const c = task({ id: 'c00001', name: 'C', depends_on: ['Tasks/b00001-b'] });
		expect(wouldCreateCycle([a, b, c], a, c)).toBe(true);
		expect(wouldCreateCycle([a, b, c], c, a)).toBe(false);
	});
});

// ── The schedule: dry-run, impact and warnings ───────────────────────────────

/** A dated chain: A (starts Monday, 2 days) → B (3 days) → C (1 day). */
const chainA = task({ id: 'a00001', name: 'Survey', start_date: '2026-11-09', estimated_days: 2 });
const chainB = task({ id: 'b00001', name: 'Design', estimated_days: 3, depends_on: [chainA.path] });
const chainC = task({ id: 'c00001', name: 'Build', estimated_days: 1, depends_on: [chainB.path] });
const CHAIN = [chainA, chainB, chainC];

describe('ttasks:update fields', () => {
	it('changes fields and reports what moves downstream', async () => {
		const { out, calls } = await run('ttasks:update', { id: 'a00001', 'estimated-days': '5' }, fakeStore(CHAIN));
		const result = json(out);
		expect(result).toMatchObject({ today: TODAY, changed: true, tasks: [{ ref: 'a00001', estimated_days: 5 }] });
		expect(result.impact.map((entry: { ref: string }) => entry.ref)).toEqual(['b00001', 'c00001']);
		expect(result.impact[0].scheduled_end).toEqual({ from: '2026-11-13', to: '2026-11-16' });
		expect(calls).toEqual([`update ${chainA.path} {"estimated_days":5}`]);
	});

	it('previews with dry-run and writes nothing', async () => {
		const { out, calls } = await run('ttasks:update', { id: 'a00001', 'estimated-days': '5', 'dry-run': 'true' }, fakeStore(CHAIN));
		expect(json(out)).toMatchObject({ dry_run: true, changed: true, tasks: [{ estimated_days: 5 }] });
		expect(json(out).impact).toHaveLength(2);
		expect(calls).toEqual([]);
	});

	it('applies one change to several tasks, with one combined impact', async () => {
		const { out, calls } = await run('ttasks:update', { id: 'a00001,b00001', 'estimated-days': '4' }, fakeStore(CHAIN));
		const reply = json(out);
		expect(reply.tasks.map((entry: { ref: string }) => entry.ref)).toEqual(['a00001', 'b00001']);
		expect(reply.impact.map((entry: { ref: string }) => entry.ref)).toEqual(['c00001']);
		expect(calls).toEqual([`update ${chainA.path} {"estimated_days":4}`, `update ${chainB.path} {"estimated_days":4}`]);
	});

	it('validates the whole batch before writing any of it', async () => {
		const { out, calls } = await run('ttasks:update', { id: 'a00001,zzz', 'estimated-days': '4' }, fakeStore(CHAIN));
		expect(json(out).code).toBe('not-found');
		expect(calls).toEqual([]);
	});

	it('sets and clears the newer fields', async () => {
		const { calls } = await run('ttasks:update', { id: 'a00001', 'assigned-to': 'Sam', source: 'Teams chat', 'workweek-only': 'true', recurrence: 'weekly' }, fakeStore(CHAIN));
		expect(calls).toEqual([`update ${chainA.path} {"assigned_to":"Sam","source":"Teams chat","workweek_only":true,"repeat":{"every":1,"unit":"week"}}`]);
		const busy = task({ id: 'x00001', name: 'Busy', assigned_to: 'Sam', repeat: { every: 1, unit: 'week' } as Task['repeat'] });
		expect((await run('ttasks:update', { id: 'x00001', 'assigned-to': 'none', recurrence: 'none' }, fakeStore([busy]))).calls)
			.toEqual([`update ${busy.path} {"assigned_to":"","repeat":null}`]);
	});

	it('warns only about real problems: a deadline the chain can\'t meet, not the rule itself', async () => {
		const missed = json((await run('ttasks:update', { id: 'b00001', 'due-date': '2026-11-10', 'dry-run': 'true' }, fakeStore(CHAIN))).out);
		expect(missed.warnings).toEqual([{ ref: 'b00001', message: 'The dependency chain and estimates finish this task on 2026-11-13, after due 2026-11-10.' }]);
		const fine = json((await run('ttasks:update', { id: 'c00001', 'due-date': '2026-12-31', 'dry-run': 'true' }, fakeStore(CHAIN))).out);
		expect(fine.warnings).toBeUndefined();
	});

	it('flags a date in the past', async () => {
		const { out } = await run('ttasks:update', { id: 'c00001', 'due-date': '2026-11-01', 'dry-run': 'true' }, fakeStore(CHAIN));
		expect(json(out).warnings[0].message).toBe('due 2026-11-01 is in the past (today is 2026-11-06).');
	});

	it('clears with none, and a cleared due date takes its time with it', async () => {
		const timed = task({ id: 'ttt001', name: 'Call', due_date: '2026-11-20', due_time: '09:00', area: 'Home' });
		const { calls } = await run('ttasks:update', { id: 'ttt001', 'due-date': 'none', area: 'none' }, fakeStore([timed]));
		expect(calls).toEqual([`update ${timed.path} {"area":null,"due_date":null,"due_time":null}`]);
	});

	it('adds and removes labels, moves projects and appends to notes through their own writers', async () => {
		const noted = task({ id: 'nnn001', name: 'Write up', labels: ['bug'], notes: 'First.' });
		const { calls } = await run('ttasks:update',
			{ id: 'nnn001', 'add-labels': 'action', 'remove-labels': 'bug', parent: 'roof', 'append-notes': 'Second.' },
			fakeStore([roof, noted]));
		expect(calls).toEqual([
			`update ${noted.path} {"labels":["action"]}`,
			`parent ${noted.path} -> Tasks/ppp000-roof`,
			`notes ${noted.path} "First.\\n\\nSecond."`,
		]);
	});

	it('is a no-op when nothing differs', async () => {
		expect(json((await run('ttasks:update', { id: 'aaa111', area: 'home' })).out).changed).toBe(false);
		expect(json((await run('ttasks:update', { id: 'aaa111' })).out).valid).toContain('estimated-days');
	});

	it('explains a date it cannot read, naming today', async () => {
		const { out } = await run('ttasks:update', { id: 'aaa111', 'due-date': 'friday' });
		expect(json(out).error).toBe('due-date=friday is not a date. Today is 2026-11-06 (Friday); work the date out and give it as YYYY-MM-DD');
	});
});

describe('impact of other writes', () => {
	it('blocking a task shows everything downstream as impeded, and warns against restatusing them', async () => {
		const { out } = await run('ttasks:update', { id: 'a00001', status: 'blocked', 'dry-run': 'true' }, fakeStore(CHAIN));
		const result = json(out);
		expect(result.impact.map((entry: { impeded: unknown }) => entry.impeded)).toEqual([
			{ from: null, to: 'Blocked' }, { from: null, to: 'Blocked' },
		]);
		expect(result.warnings.map((warning: { message: string }) => warning.message)).toEqual([
			'Blocked impedes 2 open tasks downstream (see impact). They clear when this one does; don\'t restatus them.',
			'No blocked-reason= given; say what it is waiting on.',
		]);
	});

	it('blocking a task with nothing downstream doesn\'t warn about downstream', async () => {
		const { out } = await run('ttasks:update', { id: 'c00001', status: 'Hold', 'dry-run': 'true' }, fakeStore(CHAIN));
		expect(json(out).warnings).toBeUndefined();
	});

	it('a new dependency shows the dates it pushes', async () => {
		const loose = task({ id: 'd00001', name: 'Order parts', estimated_days: 1 });
		const { out } = await run('ttasks:update', { id: 'd00001', 'add-depends-on': 'c00001', 'dry-run': 'true' }, fakeStore([...CHAIN, loose]));
		expect(only(out)).toMatchObject({ scheduled_start: '2026-11-15', depends_on: ['Build'] });
	});

	it('a dry-run completion previews the repeat\'s next instance', async () => {
		const { out, calls } = await run('ttasks:complete', { id: 'ddd444', 'dry-run': 'true' });
		expect(json(out)).toMatchObject({ dry_run: true, tasks: [{ status: 'Done' }], spawned: [{ ref: 'new', due_date: '2026-11-13' }] });
		expect(calls).toEqual([]);
	});

	it('a dry-run create shows the task with ref new', async () => {
		const { out, calls } = await run('ttasks:create', { name: 'Ship', 'due-date': 'tomorrow', 'dry-run': 'true' });
		expect(json(out)).toMatchObject({ dry_run: true, tasks: [{ ref: 'new', due_date: '2026-11-07' }] });
		expect(calls).toEqual([]);
	});
});

describe('note text and the reply echo', () => {
	it('turns \\n, \\t and \\\\ in notes= into what they stand for', async () => {
		const { out } = await run('ttasks:create', { name: 'Ship', notes: 'One\\nTwo\\tTab \\\\n kept', 'dry-run': 'true' });
		expect(only(out).notes).toBe('One\nTwo\tTab \\n kept');
	});

	it('echoes labels and notes on a dry-run create, in both formats', async () => {
		const params = { name: 'Ship', labels: 'action', notes: 'Done when it ships.', 'dry-run': 'true' };
		expect(only((await run('ttasks:create', params)).out)).toMatchObject({ labels: ['action'], notes: 'Done when it ships.' });
		const text = (await run('ttasks:create', { ...params, format: 'text' })).out;
		expect(text).toContain('  labels: action');
		expect(text).toContain('  notes:\n    Done when it ships.');
	});

	it('writes task links bare, and reports what it rewrote', async () => {
		const { out } = await run('ttasks:create', {
			name: 'Ship',
			notes: 'After [[Tasks/aaa111-get-quotes|the quotes]] and [[bbb222-pick-roofer.md]]; see [[Some other note]] and ![[Tasks/aaa111-get-quotes]].',
			'dry-run': 'true',
		});
		const reply = json(out);
		expect(reply.tasks[0].notes).toBe('After [[aaa111-get-quotes|the quotes]] and [[bbb222-pick-roofer|Pick roofer]]; see [[Some other note]] and ![[Tasks/aaa111-get-quotes]].');
		expect(reply.links_made_bare).toEqual([
			{ ref: 'new', from: '[[Tasks/aaa111-get-quotes|the quotes]]', to: '[[aaa111-get-quotes|the quotes]]' },
			{ ref: 'new', from: '[[bbb222-pick-roofer.md]]', to: '[[bbb222-pick-roofer|Pick roofer]]' },
		]);
	});

	it('applies the same rules to append-notes= on a real write', async () => {
		const noted = task({ id: 'nnn002', name: 'Write up', notes: 'First.' });
		const { calls } = await run('ttasks:update', { id: 'nnn002', 'append-notes': 'Line\\nNext, see [[Tasks/aaa111-get-quotes]]' }, fakeStore([quotes, noted]));
		expect(calls).toEqual([`notes ${noted.path} ${JSON.stringify('First.\n\nLine\nNext, see [[aaa111-get-quotes|Get quotes]]')}`]);
	});

	it('shows the source and workweek flag it set', async () => {
		const { out } = await run('ttasks:create', { name: 'Ship', source: 'Teams chat', 'workweek-only': 'yes', 'dry-run': 'true' });
		expect(only(out)).toMatchObject({ source: 'Teams chat', workweek_only: true });
	});
});

describe('archived tasks in CLI writes', () => {
	const ARCHIVED = [{ path: 'Archive/2026/10/7c2f9a-old-work.md', name: 'Old work' }];

	it('makes a body link to an archived task bare too', async () => {
		const store = fakeStore(ALL);
		const command = CLI_COMMANDS.find((candidate) => candidate.id === 'ttasks:create')!;
		const out = await command.run({ name: 'Ship', notes: 'After [[Archive/2026/10/7c2f9a-old-work]]', 'dry-run': 'true' }, { ...store.ctx(), archived: ARCHIVED }, store.actions);
		expect(only(out).notes).toBe('After [[7c2f9a-old-work|Old work]]');
	});

	it('removes a dependency on an archived task by its hash', async () => {
		const waiting = task({ id: 'www001', name: 'Waiting', depends_on: ['Archive/2026/10/7c2f9a-old-work.md'] });
		const store = fakeStore([waiting]);
		const command = CLI_COMMANDS.find((candidate) => candidate.id === 'ttasks:update')!;
		await command.run({ id: 'www001', 'remove-depends-on': '7c2f9a' }, { ...store.ctx(), archived: ARCHIVED }, store.actions);
		expect(store.calls).toEqual([`remove ${waiting.path} -> Archive/2026/10/7c2f9a-old-work`]);
	});
});
