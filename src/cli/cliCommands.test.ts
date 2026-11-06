import { describe, expect, it } from 'vitest';
import type { Task } from '../types';
import type { RegisteredTaskViewDefinition } from '../views/viewRegistry';
import { SHARE_PREAMBLE_PRESETS } from '../integration/sharePreamble';
import { CLI_COMMANDS, buildListQuery, type CliActions, type CliContext, type CliParams } from './cliCommands';

const TODAY = '2026-11-06'; // a Friday

function task(overrides: Partial<Task> & Pick<Task, 'id' | 'name'>): Task {
	return {
		slug: overrides.name.toLowerCase().replace(/\s+/g, '-'),
		path: `Tasks/${overrides.id}-${overrides.name.toLowerCase().replace(/\s+/g, '-')}.md`,
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

const project = task({ id: 'ppp000', name: 'Roof', type: 'project', area: 'Home' });
const TASKS: Task[] = [
	project,
	task({ id: 'aaa111', name: 'Get quotes', area: 'Home', parent_task: project.path, due_date: TODAY, priority: 'High', labels: ['action'], notes: 'Call three roofers.' }),
	task({ id: 'aab222', name: 'Pick roofer', area: 'Home', parent_task: project.path, status: 'Blocked', blocked_reason: 'Waiting on quotes', due_date: '2026-11-08' }),
	task({ id: 'bbb333', name: 'Expense report', due_date: '2026-11-01' }),
	task({ id: 'ccc444', name: 'Old thing', status: 'Done', is_complete: true, completed: '2026-11-02' }),
	task({ id: 'ddd555', name: 'Someday idea', status: 'Future' }),
];

const TODAY_VIEW: RegisteredTaskViewDefinition = {
	id: 'today',
	name: 'Today',
	icon: null,
	renderer: 'list',
	query: {
		filter: { logic: 'and', conditions: [{ field: 'due_date', operator: 'is', value: 'today' }, { field: 'is_complete', operator: 'is', value: false }] },
		sort: [],
		group: { kind: 'none' },
	},
	presentation: { hierarchy: 'flat', graphMode: 'dependency' },
	source: 'builtin',
} as RegisteredTaskViewDefinition;

function context(tasks: Task[] = TASKS): CliContext {
	return {
		tasks,
		views: [TODAY_VIEW],
		validValues: { statuses: ['Active', 'Future', 'In Progress', 'Hold', 'Blocked', 'Cancelled', 'Done'], priorities: ['High', 'Medium', 'Low', 'None'], areas: ['Work', 'Home'], labels: ['action', 'bug'] },
		derivedContext: { allTasks: tasks, statuses: { blockStatus: 'Blocked', holdStatus: 'Hold', futureStatus: 'Future' } },
		schedule: new Map(),
		today: TODAY,
		weekStart: 1,
		now: '2026-11-06T12:00:00.000Z',
		presets: SHARE_PREAMBLE_PRESETS,
		statusPolicy: { initial: 'Active', completion: 'Done', start: 'In Progress', block: 'Blocked', hold: 'Hold', future: 'Future' },
	};
}

/** The read commands cause no side effects; any call is a test failure. */
const NO_ACTIONS = new Proxy({}, { get: (_target, key) => () => { throw new Error(`read command called actions.${String(key)}`); } }) as CliActions;

function run(id: string, params: CliParams = {}, ctx = context()): string {
	const command = CLI_COMMANDS.find((candidate) => candidate.id === id);
	if (!command) throw new Error(`no ${id}`);
	const out = command.run(params, ctx, NO_ACTIONS);
	if (typeof out !== 'string') throw new Error(`${id} is asynchronous`);
	return out;
}

const json = (out: string) => JSON.parse(out);
const refs = (out: string): string[] => json(out).tasks.map((t: { ref: string }) => t.ref);

describe('ttasks:list', () => {
	it('lists open tasks by default, in the Share/Sync ai shape', () => {
		const out = json(run('ttasks:list'));
		expect(out.count).toBe(5);
		expect(out.tasks.map((t: { ref: string }) => t.ref)).not.toContain('ccc444');
		const quotes = out.tasks.find((t: { ref: string }) => t.ref === 'aaa111');
		expect(quotes).toMatchObject({ name: 'Get quotes', parent: 'Roof', priority: 'High' });
		// Notes are off by default in a list — they dominate the size.
		expect(quotes.notes).toBe('');
	});

	it('sorts by due date', () => {
		expect(refs(run('ttasks:list', { type: 'task' }))).toEqual(['bbb333', 'aaa111', 'aab222', 'ddd555']);
	});

	it('filters by status case-insensitively, and by several values', () => {
		expect(refs(run('ttasks:list', { status: 'blocked' }))).toEqual(['aab222']);
		expect(refs(run('ttasks:list', { status: 'Blocked,Future' })).sort()).toEqual(['aab222', 'ddd555']);
	});

	it('rejects an unknown value with the valid list, instead of matching nothing', () => {
		const out = json(run('ttasks:list', { status: 'Doing' }));
		expect(out.error).toMatch(/status=Doing/);
		expect(out.valid).toContain('In Progress');
	});

	it('filters by due keyword', () => {
		expect(refs(run('ttasks:list', { due: 'today' }))).toEqual(['aaa111']);
		expect(refs(run('ttasks:list', { due: 'overdue' }))).toEqual(['bbb333']);
		// Friday, Monday-start week: today through Sunday the 8th.
		expect(refs(run('ttasks:list', { due: 'week' }))).toEqual(['aaa111', 'aab222']);
		expect(json(run('ttasks:list', { due: 'soon' })).valid).toContain('overdue');
	});

	it('filters to a project by name or hash, project included', () => {
		const byName = refs(run('ttasks:list', { project: 'roof' })).sort();
		expect(byName).toEqual(['aaa111', 'aab222', 'ppp000']);
		expect(refs(run('ttasks:list', { project: 'ppp' })).sort()).toEqual(byName);
	});

	it('starts from a Smart List by name', () => {
		expect(refs(run('ttasks:list', { view: 'today' }))).toEqual(['aaa111']);
		expect(json(run('ttasks:list', { view: 'Nope' })).valid).toEqual(['Today']);
	});

	it('includes or isolates completed work on request', () => {
		expect(refs(run('ttasks:list', { completed: 'only' }))).toEqual(['ccc444']);
		expect(json(run('ttasks:list', { completed: 'include' })).count).toBe(6);
	});

	it('searches by hash', () => {
		expect(refs(run('ttasks:list', { search: '#bbb' }))).toEqual(['bbb333']);
	});

	it('caps with limit', () => {
		expect(json(run('ttasks:list', { limit: '2' })).count).toBe(2);
		expect(json(run('ttasks:list', { limit: 'lots' })).error).toMatch(/whole number/);
	});

	it('prints one line per task with format=text', () => {
		const out = run('ttasks:list', { format: 'text', due: 'today' });
		expect(out).toBe('aaa111  Active  High  Get quotes  · Home · due 2026-11-06 · in Roof');
		expect(run('ttasks:list', { format: 'text', status: 'Hold' })).toBe('No tasks match.');
	});

	it('prints a header row and one row per task with format=tsv', () => {
		const lines = run('ttasks:list', { format: 'tsv', due: 'today' }).split('\n');
		expect(lines[0].split('\t')[0]).toBe('ref');
		expect(lines[1].split('\t').slice(0, 2)).toEqual(['aaa111', 'Get quotes']);
	});

	it('prints errors in the requested format', () => {
		expect(run('ttasks:list', { format: 'text', status: 'Doing' })).toMatch(/^Error: status=Doing.*\nValid: /s);
	});

	it('keeps a Smart List filter and ANDs the extra flags onto it', () => {
		const query = buildListQuery({ view: 'Today', area: 'Work' }, context());
		expect(query.filter.conditions).toHaveLength(2);
	});
});

describe('ttasks:show', () => {
	it('shows a task by hash prefix, with its notes and path', () => {
		const out = json(run('ttasks:show', { id: 'aaa' }));
		expect(out).toMatchObject({ ref: 'aaa111', notes: 'Call three roofers.', path: 'Tasks/aaa111-get-quotes.md' });
	});

	it('accepts a path', () => {
		expect(json(run('ttasks:show', { path: 'Tasks/bbb333-expense-report' })).ref).toBe('bbb333');
	});

	it('refuses an ambiguous prefix and lists the candidates', () => {
		const out = json(run('ttasks:show', { id: 'aa' }));
		expect(out.error).toMatch(/matches 2 tasks/);
		expect(out.valid).toEqual(['aaa111 Get quotes', 'aab222 Pick roofer']);
	});

	it('explains what it needs when given nothing', () => {
		expect(json(run('ttasks:show')).error).toMatch(/id=<hash>/);
	});

	it('prints a readable block with format=text', () => {
		const out = run('ttasks:show', { id: 'aab222', format: 'text' });
		expect(out).toContain('blocked because: Waiting on quotes');
		expect(out).toContain('path: Tasks/aab222-pick-roofer.md');
	});
});

describe('ttasks:export', () => {
	it('defaults to the ai-mode JSON document, completed work included', () => {
		const doc = json(run('ttasks:export'));
		expect(doc.mode).toBe('ai');
		expect(doc.meta).toBeDefined();
		expect(doc.taskCount).toBe(6);
	});

	it('narrows with the Share/Sync filters', () => {
		const doc = json(run('ttasks:export', { area: 'home', completed: 'exclude' }));
		expect(doc.tasks.map((t: { ref: string }) => t.ref).sort()).toEqual(['aaa111', 'aab222', 'ppp000']);
	});

	it('speaks TOON on request', () => {
		const out = run('ttasks:export', { format: 'toon' });
		expect(() => JSON.parse(out)).toThrow();
		expect(out).toContain('Get quotes');
	});

	it('refuses TOON for a full export', () => {
		expect(json(run('ttasks:export', { format: 'toon', mode: 'full' })).error).toMatch(/mode=ai only/);
	});

	it('wraps the payload with a Share/Sync prompt', () => {
		const out = run('ttasks:export', { preamble: 'review' });
		expect(out).toMatch(/```json\n\{/);
		expect(out.indexOf('```json')).toBeGreaterThan(0);
		expect(json(run('ttasks:export', { preamble: 'nope' })).valid).toContain('review');
	});
});

describe('the command registry', () => {
	it('names every command ttasks:<action>', () => {
		for (const command of CLI_COMMANDS) expect(command.id).toMatch(/^ttasks:[a-z-]+$/);
	});

	it('has no duplicate ids', () => {
		const ids = CLI_COMMANDS.map((command) => command.id);
		expect(new Set(ids).size).toBe(ids.length);
	});
});
