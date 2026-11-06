import { describe, expect, it } from 'vitest';
import type { Task, TaskCreateInput } from '../types';
import { CLI_COMMANDS, type CliActions, type CliContext, type CliParams } from './cliCommands';
import { buildCreateInput, wouldCreateCycle } from './cliActions';

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
		statusPolicy: { initial: 'Active', completion: 'Done' },
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

describe('ttasks:open', () => {
	it('opens the board when no task is given', async () => {
		const { out, calls } = await run('ttasks:open', {});
		expect(json(out)).toEqual({ opened: 'board' });
		expect(calls).toEqual(['openBoard']);
	});

	it('opens a task by hash prefix', async () => {
		const { out, calls } = await run('ttasks:open', { id: 'aaa' });
		expect(json(out).opened).toEqual({ ref: 'aaa111', name: 'Get quotes', path: quotes.path });
		expect(calls).toEqual([`openTask ${quotes.path}`]);
	});

	it('reports an unknown task without opening anything', async () => {
		const { out, calls } = await run('ttasks:open', { id: 'zzz', format: 'text' });
		expect(out).toMatch(/^Error: no task has the hash/);
		expect(calls).toEqual([]);
	});
});

describe('ttasks:new', () => {
	it('opens the dialog with a validated prefill in the vault\'s spelling', async () => {
		const { out, calls } = await run('ttasks:new', { name: 'Fix gutter', area: 'home', project: 'roof', due: 'tomorrow', priority: 'high' });
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

	it('resolves the project and dependencies to vault paths', () => {
		const input = buildCreateInput({ name: 'Sign contract', project: 'ppp0', depends: 'bbb,#aaa111' }, context(ALL));
		expect(input.parent_task).toBe('Tasks/ppp000-roof');
		expect(input.depends_on).toEqual(['Tasks/bbb222-pick-roofer', 'Tasks/aaa111-get-quotes']);
	});

	it('validates dates and times', () => {
		const ctx = context(ALL);
		expect(buildCreateInput({ name: 'x', due: '2026-11-20', 'due-time': '9:05' }, ctx)).toMatchObject({ due_date: '2026-11-20', due_time: '09:05' });
		expect(() => buildCreateInput({ name: 'x', 'due-time': '09:00' }, ctx)).toThrow(/needs a due/);
		expect(() => buildCreateInput({ name: 'x', due: 'friday' }, ctx)).toThrow(/not a date/);
		expect(() => buildCreateInput({ name: 'x', start: '2026-12-01', due: '2026-11-01' }, ctx)).toThrow(/after due/);
	});

	it('refuses labels on a project', () => {
		expect(() => buildCreateInput({ name: 'x', type: 'project', label: 'bug' }, context(ALL))).toThrow(/projects carry no labels/);
	});

	it('creates and reports the new task, though the store has not caught up', async () => {
		const { out, calls } = await run('ttasks:create', { name: 'Call bank', area: 'work' });
		expect(json(out).created).toMatchObject({ ref: 'eee555', name: 'Call bank', area: 'Work', path: 'Tasks/eee555-new.md' });
		expect(calls).toEqual(['create Call bank']);
	});

	it('reports the new task\'s links by name', async () => {
		const { out } = await run('ttasks:create', { name: 'Sign contract', project: 'roof', depends: 'bbb222' });
		expect(json(out).created).toMatchObject({ parent: 'Roof', depends_on: ['Pick roofer'] });
	});

	it('creates nothing when one dependency is unknown', async () => {
		const { out, calls } = await run('ttasks:create', { name: 'x', depends: 'bbb222,zzz999' });
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
		const result = json(out);
		expect(result.completed).toMatchObject({ ref: 'aaa111', status: 'Done' });
		expect(result).toMatchObject({ next: null, changed: true });
		expect(calls).toEqual(['complete aaa111']);
	});

	it('reports the next instance of a repeating task', async () => {
		const { out } = await run('ttasks:complete', { id: 'ddd', format: 'text' });
		expect(out.split('\n')).toHaveLength(2);
		expect(out).toMatch(/^Completed {2}ddd444/);
		expect(out).toMatch(/\nNext {7}fff666 .*due 2026-11-13/);
	});

	it('is a no-op on a completed task', async () => {
		const { out, calls } = await run('ttasks:complete', { id: 'ccc333' });
		expect(json(out).changed).toBe(false);
		expect(calls).toEqual([]);
	});

	it('says so when the write did not land', async () => {
		const store = fakeStore(ALL, { dropUpdates: true });
		await expect(run('ttasks:complete', { id: 'aaa111' }, store)).rejects.toThrow(/didn't land/);
	});
});

describe('ttasks:status', () => {
	it('sets a status, matched case-insensitively', async () => {
		const { out, calls } = await run('ttasks:status', { id: 'aaa111', status: 'in progress' });
		expect(json(out).updated).toMatchObject({ ref: 'aaa111', status: 'In Progress' });
		expect(calls).toEqual([`update ${quotes.path} {"status":"In Progress"}`]);
	});

	it('writes the blocked reason with the blocked status', async () => {
		const { calls } = await run('ttasks:status', { id: 'aaa111', status: 'Blocked', reason: 'Waiting on HOA' });
		expect(calls).toEqual([`update ${quotes.path} {"status":"Blocked","blocked_reason":"Waiting on HOA"}`]);
	});

	it('refuses a reason with any other status', async () => {
		const { out, calls } = await run('ttasks:status', { id: 'aaa111', status: 'Hold', reason: 'x' });
		expect(json(out).error).toMatch(/status=Blocked/);
		expect(calls).toEqual([]);
	});

	it('routes the completion status through completion, so repeats recur', async () => {
		const { out, calls } = await run('ttasks:status', { id: 'ddd444', status: 'done' });
		expect(calls).toEqual(['complete ddd444']);
		expect(json(out).next.ref).toBe('fff666');
	});

	it('is a no-op when the task already has the status', async () => {
		const { out, calls } = await run('ttasks:status', { id: 'aaa111', status: 'Active' });
		expect(json(out).changed).toBe(false);
		expect(calls).toEqual([]);
	});

	it('lists the statuses when given a bad one', async () => {
		const { out } = await run('ttasks:status', { id: 'aaa111', status: 'Doing' });
		expect(json(out).valid).toContain('In Progress');
	});
});

describe('ttasks:depend', () => {
	it('adds dependencies and reports the new state before the store catches up', async () => {
		const { out, calls } = await run('ttasks:depend', { id: 'aaa111', on: 'ccc333,ddd444' });
		const result = json(out);
		expect(result.added).toEqual(['Old thing', 'Water plants']);
		expect(result.updated.depends_on).toEqual(['Old thing', 'Water plants']);
		expect(calls).toEqual([`add ${quotes.path} -> Tasks/ccc333-old-thing`, `add ${quotes.path} -> Tasks/ddd444-water-plants`]);
	});

	it('skips one it already has', async () => {
		const { out, calls } = await run('ttasks:depend', { id: 'bbb222', on: 'aaa111' });
		expect(json(out)).toMatchObject({ added: [], unchanged: ['Get quotes'], changed: false });
		expect(calls).toEqual([]);
	});

	it('removes with the remove flag', async () => {
		const { out, calls } = await run('ttasks:depend', { id: 'bbb222', on: 'aaa111', remove: 'true' });
		expect(json(out)).toMatchObject({ removed: ['Get quotes'], changed: true });
		expect(json(out).updated.depends_on).toEqual([]);
		expect(calls).toEqual([`remove ${pick.path} -> Tasks/aaa111-get-quotes`]);
	});

	it('refuses a loop, and writes none of the batch', async () => {
		const { out, calls } = await run('ttasks:depend', { id: 'aaa111', on: 'ccc333,bbb222' });
		expect(json(out).error).toMatch(/would make a loop/);
		expect(calls).toEqual([]);
	});

	it('refuses a task depending on itself', async () => {
		expect(json((await run('ttasks:depend', { id: 'aaa111', on: 'aaa111' })).out).error).toMatch(/itself/);
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
