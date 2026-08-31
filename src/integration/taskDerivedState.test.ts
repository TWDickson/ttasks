import { describe, expect, it } from 'vitest';
import type { Task } from '../types';
import { computeDerivedTaskState } from './taskDerivedState';
import { buildTaskJsonDocument } from './taskJsonExport';

const STATUSES = { blockStatus: 'Blocked', holdStatus: 'Hold' };

function makeTask(overrides: Partial<Task> = {}): Task {
	return {
		id: '0a1b2c',
		slug: 'task',
		path: 'Planner/Tasks/0a1b2c-task.md',
		type: 'task',
		name: 'A task',
		area: 'Work',
		status: 'Active',
		priority: 'Medium',
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
		created: '2026-07-01',
		completed: null,
		status_changed: '2026-07-01',
		recurrence: null,
		recurrence_type: null,
		notes: '',
		is_complete: false,
		...overrides,
	} as Task;
}

/** `a` <- `b` <- `c`: c depends on b depends on a. */
function chain(aStatus: string): Task[] {
	const a = makeTask({ id: 'aaa', path: 'T/a.md', name: 'Alpha', status: aStatus });
	const b = makeTask({ id: 'bbb', path: 'T/b.md', name: 'Bravo', depends_on: ['T/a.md'] });
	const c = makeTask({ id: 'ccc', path: 'T/c.md', name: 'Charlie', depends_on: ['T/b.md'] });
	return [a, b, c];
}

describe('computeDerivedTaskState — impediment', () => {
	it('names the upstream blocker on every task behind it, transitively', () => {
		const derived = computeDerivedTaskState({ allTasks: chain('Blocked'), statuses: STATUSES });

		expect(derived.get('T/b.md')?.impeded).toBe('Blocked');
		expect(derived.get('T/b.md')?.impeded_by).toEqual(['Alpha']);
		// Two hops down, and it still names the thing that actually has to clear —
		// not the intermediate that is merely also stuck.
		expect(derived.get('T/c.md')?.impeded).toBe('Blocked');
		expect(derived.get('T/c.md')?.impeded_by).toEqual(['Alpha']);
	});

	// The task's own `status` already says "Blocked". Repeating it in `impeded`
	// would make the field mean two different things, and the AI would then have
	// to work out which — exactly the reasoning this change exists to remove.
	it('leaves the blocker itself unmarked — its own status already says so', () => {
		const derived = computeDerivedTaskState({ allTasks: chain('Blocked'), statuses: STATUSES });

		expect(derived.get('T/a.md')?.impeded).toBeUndefined();
	});

	it('carries Hold downstream as the weaker signal', () => {
		const derived = computeDerivedTaskState({ allTasks: chain('Hold'), statuses: STATUSES });

		expect(derived.get('T/b.md')?.impeded).toBe('Hold');
	});

	// Blocked beats Hold, and the result must not depend on traversal order.
	it('resolves to Blocked when both reach the same task, either way round', () => {
		const held = makeTask({ id: 'h', path: 'T/h.md', name: 'Held', status: 'Hold' });
		const blocked = makeTask({ id: 'k', path: 'T/k.md', name: 'Stuck', status: 'Blocked' });
		const target = makeTask({ id: 't', path: 'T/t.md', name: 'Target', depends_on: ['T/h.md', 'T/k.md'] });

		for (const order of [[held, blocked, target], [blocked, held, target], [target, held, blocked]]) {
			const derived = computeDerivedTaskState({ allTasks: order, statuses: STATUSES });
			expect(derived.get('T/t.md')?.impeded).toBe('Blocked');
			expect(derived.get('T/t.md')?.impeded_by).toEqual(['Stuck']);
		}
	});

	it('uses the vault\'s configured status name, not the word "Blocked"', () => {
		const tasks = chain('Escalated');
		const derived = computeDerivedTaskState({
			allTasks: tasks,
			statuses: { blockStatus: 'Escalated', holdStatus: 'Parked' },
		});

		expect(derived.get('T/b.md')?.impeded).toBe('Escalated');
	});

	// A vault with no Hold status must not fall back to one, or every Active task
	// downstream reads as impeded.
	it('derives nothing from Hold when the vault has no Hold status', () => {
		const derived = computeDerivedTaskState({
			allTasks: chain('Hold'),
			statuses: { blockStatus: 'Blocked', holdStatus: null },
		});

		expect(derived.get('T/b.md')?.impeded).toBeUndefined();
	});

	it('clears the impediment once the blocker completes', () => {
		const tasks = chain('Blocked');
		tasks[0].is_complete = true;
		tasks[0].completed = '2026-08-01';

		const derived = computeDerivedTaskState({ allTasks: tasks, statuses: STATUSES });

		expect(derived.get('T/b.md')?.impeded).toBeUndefined();
	});
});

describe('computeDerivedTaskState — schedule', () => {
	it('projects a start and end for a task whose dates come from its chain', () => {
		const a = makeTask({ id: 'aaa', path: 'T/a.md', name: 'Alpha', start_date: '2026-09-01', estimated_days: 2 });
		const b = makeTask({ id: 'bbb', path: 'T/b.md', name: 'Bravo', depends_on: ['T/a.md'], estimated_days: 3 });

		const derived = computeDerivedTaskState({ allTasks: [a, b], statuses: STATUSES });

		// Alpha: 09-01 + 2 days. Bravo starts the day after, and runs 3 days.
		expect(derived.get('T/b.md')?.scheduled_start).toBe('2026-09-03');
		expect(derived.get('T/b.md')?.scheduled_end).toBe('2026-09-05');
	});

	// Restating dates the export already carries is noise, and noise in a field
	// labelled "computed" teaches the model the field is not worth reading.
	it('omits the projection when it only restates the explicit dates', () => {
		const task = makeTask({ path: 'T/x.md', start_date: '2026-09-01', due_date: '2026-09-01' });

		const derived = computeDerivedTaskState({ allTasks: [task], statuses: STATUSES });

		expect(derived.get('T/x.md')?.scheduled_start).toBeUndefined();
	});

	it('omits the projection for completed work — history, not a plan', () => {
		const task = makeTask({ path: 'T/x.md', is_complete: true, completed: '2026-08-01', status: 'Done' });

		const derived = computeDerivedTaskState({ allTasks: [task], statuses: STATUSES });

		expect(derived.get('T/x.md')?.scheduled_start).toBeUndefined();
	});

	it('marks a dependency cycle, which is why those tasks have no schedule', () => {
		const a = makeTask({ id: 'aaa', path: 'T/a.md', name: 'Alpha', depends_on: ['T/b.md'] });
		const b = makeTask({ id: 'bbb', path: 'T/b.md', name: 'Bravo', depends_on: ['T/a.md'] });

		const derived = computeDerivedTaskState({ allTasks: [a, b], statuses: STATUSES });

		expect(derived.get('T/a.md')?.in_cycle).toBe(true);
		expect(derived.get('T/b.md')?.in_cycle).toBe(true);
		expect(derived.get('T/a.md')?.scheduled_start).toBeUndefined();
	});

	it('respects the working calendar so projections match what the app shows', () => {
		// 2026-09-04 is a Friday; a workweek-only area pushes the next start to Monday.
		const a = makeTask({ id: 'aaa', path: 'T/a.md', name: 'Alpha', area: 'Work', start_date: '2026-09-04' });
		const b = makeTask({ id: 'bbb', path: 'T/b.md', name: 'Bravo', area: 'Work', depends_on: ['T/a.md'] });

		const derived = computeDerivedTaskState({
			allTasks: [a, b],
			statuses: STATUSES,
			calendarConfig: { holidays: [], areaWorkweek: { Work: true } },
		});

		expect(derived.get('T/b.md')?.scheduled_start).toBe('2026-09-07');
	});
});

describe('derived state in the export document', () => {
	// The trap this whole context parameter exists for: exports are filtered, and a
	// blocker outside the filter still blocks.
	it('sees a blocker that the export filter left out', () => {
		const [blocker, middle, tail] = chain('Blocked');
		const doc = buildTaskJsonDocument([middle, tail], 'ai', 'now', undefined, 'full', {
			allTasks: [blocker, middle, tail],
			statuses: STATUSES,
		});

		expect(doc.tasks).toHaveLength(2);
		expect(doc.tasks[0].impeded).toBe('Blocked');
		// Named, even though Alpha is not in the export at all.
		expect(doc.tasks[0].impeded_by).toEqual(['Alpha']);
	});

	// Without the full list the link resolver falls back to the basename, which is
	// a filename, not a title.
	it('resolves a dependency outside the selection to its real name', () => {
		const [blocker, middle] = chain('Active');
		const doc = buildTaskJsonDocument([middle], 'ai', 'now', undefined, 'full', {
			allTasks: [blocker, middle],
			statuses: STATUSES,
		});

		expect(doc.tasks[0].depends_on).toEqual(['Alpha']);
	});

	it('omits every derived field from a task that has none', () => {
		const task = makeTask({ path: 'T/x.md', start_date: '2026-09-01', due_date: '2026-09-01' });
		const doc = buildTaskJsonDocument([task], 'ai', 'now', undefined, 'full', {
			allTasks: [task],
			statuses: STATUSES,
		});

		for (const field of ['impeded', 'impeded_by', 'in_cycle', 'scheduled_start', 'scheduled_end']) {
			expect(doc.tasks[0]).not.toHaveProperty(field);
		}
	});

	// 'full' mode round-trips vault state. Derived state is not vault state.
	it('never emits derived fields in full mode', () => {
		const doc = buildTaskJsonDocument(chain('Blocked'), 'full', 'now', undefined, 'full', {
			allTasks: chain('Blocked'),
			statuses: STATUSES,
		});

		for (const task of doc.tasks) {
			expect(task).not.toHaveProperty('impeded');
			expect(task).not.toHaveProperty('scheduled_start');
		}
	});
});
