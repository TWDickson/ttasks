import { describe, expect, it } from 'vitest';
import type { Task } from '../types';
import { CLI_COMMANDS, type CliActions, type CliContext, type CliParams } from './cliCommands';

const TODAY = '2026-11-06'; // a Friday

function task(overrides: Partial<Task> & Pick<Task, 'id' | 'name'>): Task {
	const slug = overrides.name.toLowerCase().replace(/\s+/g, '-');
	return {
		slug, path: `Tasks/${overrides.id}-${slug}.md`, type: 'task', status: 'Active', priority: 'None', area: 'Work',
		labels: [], parent_task: null, depends_on: [], blocks: [], blocked_reason: '', assigned_to: '', source: '',
		start_date: null, due_date: null, due_time: null, estimated_days: null, workweek_only: false, holiday_dates: [],
		created: '2026-10-01', completed: null, status_changed: '2026-10-01', repeat: null, notes: '',
		reminder_override: null, is_complete: false, is_inbox: false, ...overrides,
	};
}

const survey = task({ id: 'a00001', name: 'Survey', status: 'Blocked', blocked_reason: 'Waiting on permit', start_date: '2026-11-02', estimated_days: 2 });
const design = task({ id: 'b00001', name: 'Design', estimated_days: 3, depends_on: [survey.path] });
const started = task({ id: 'c00001', name: 'Fix gate', status: 'In Progress', due_date: '2026-11-20' });
const urgent = task({ id: 'd00001', name: 'Pay invoice', priority: 'High', due_date: '2026-11-10' });
const later = task({ id: 'e00001', name: 'Plant bulbs', start_date: '2026-11-20' });
const parked = task({ id: 'f00001', name: 'Someday', status: 'Hold' });
const done = task({ id: 'g00001', name: 'Old', status: 'Done', is_complete: true, completed: '2026-11-01' });
const TASKS = [survey, design, started, urgent, later, parked, done];

function context(tasks: Task[] = TASKS): CliContext {
	return {
		tasks,
		views: [],
		validValues: { statuses: ['Active', 'In Progress', 'Hold', 'Blocked', 'Done'], priorities: ['High', 'Medium', 'Low', 'None'], areas: ['Work', 'Home'], labels: ['bug'] },
		derivedContext: { allTasks: tasks, statuses: { blockStatus: 'Blocked', holdStatus: 'Hold', futureStatus: null }, calendarConfig: { holidays: [], areaWorkweek: { Work: true } } },
		schedule: new Map(),
		today: TODAY,
		weekStart: 1,
		now: '2026-11-06T12:00:00.000Z',
		presets: [],
		statusPolicy: { initial: 'Active', completion: 'Done', start: 'In Progress', block: 'Blocked', hold: 'Hold', future: null },
	};
}

const NO_ACTIONS = new Proxy({}, { get: (_target, key) => () => { throw new Error(`guide command called actions.${String(key)}`); } }) as CliActions;

function run(id: string, params: CliParams = {}): string {
	const out = CLI_COMMANDS.find((command) => command.id === id)!.run(params, context(), NO_ACTIONS);
	if (typeof out !== 'string') throw new Error(`${id} is asynchronous`);
	return out;
}
const json = (out: string) => JSON.parse(out);

describe('ttasks:context', () => {
	it('gives today, the status roles and the scheduling rules', () => {
		const out = json(run('ttasks:context'));
		expect(out).toMatchObject({ today: TODAY, weekday: 'Friday', week_starts_on: 'Monday', areas_skipping_weekends: ['Work'] });
		expect(out.statuses).toEqual([
			{ name: 'Active', roles: ['new'] },
			{ name: 'In Progress', roles: ['started'] },
			{ name: 'Hold', roles: ['on-hold'] },
			{ name: 'Blocked', roles: ['blocked'] },
			{ name: 'Done', roles: ['done'] },
		]);
		expect(out.rules.deadlines).toMatch(/only for a real external deadline/);
		expect(out.rules.impediments).toMatch(/^Set Blocked only on the task that is actually stuck/);
		expect(out.rules.dates).toMatch(/Today is 2026-11-06 \(Friday\)/);
		expect(out.commands.map((command: { id: string }) => command.id)).toContain('ttasks:why');
	});

	it('reads as prose with format=text', () => {
		expect(run('ttasks:context', { format: 'text' })).toMatch(/^Today is 2026-11-06 \(Friday\)\. Weeks start on Monday\./);
	});
});

describe('ttasks:next', () => {
	it('lists startable, unimpeded work: started first, then by date and priority', () => {
		const out = json(run('ttasks:next'));
		// Survey is Blocked, Design waits on it, Plant bulbs starts later, Someday is on hold.
		expect(out.tasks.map((t: { ref: string }) => t.ref)).toEqual(['c00001', 'd00001']);
		expect(out).toMatchObject({ today: TODAY, ready_total: 2, waiting_to_start: 1 });
	});

	it('says so when nothing is ready', () => {
		expect(run('ttasks:next', { area: 'home', format: 'text' })).toBe('Nothing is ready to work on today (2026-11-06).');
	});
});

describe('ttasks:why', () => {
	it('explains an impeded task down its chain', () => {
		const out = json(run('ttasks:why', { id: 'b00001' }));
		expect(out.ready).toBe(false);
		expect(out.reasons[0]).toBe('It is impeded (Blocked) by Survey. Clear that, not this task.');
		expect(out.waiting_on).toEqual([expect.objectContaining({ ref: 'a00001', status: 'Blocked', blocked_reason: 'Waiting on permit' })]);
	});

	it('names what finishing a blocker unblocks', () => {
		const out = json(run('ttasks:why', { id: 'a00001' }));
		expect(out.reasons[0]).toBe('Its status is Blocked: Waiting on permit.');
		expect(out.unblocks).toEqual(['Design']);
	});

	it('explains a task that starts later', () => {
		expect(json(run('ttasks:why', { id: 'e00001' })).reasons).toEqual(['Its start date is 2026-11-20.']);
	});

	it('says when nothing is in the way', () => {
		expect(json(run('ttasks:why', { id: 'd00001' }))).toMatchObject({ ready: true, reasons: ['Nothing is holding it up; it can be worked on now.'] });
	});
});
