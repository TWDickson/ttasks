import { describe, expect, it } from 'vitest';
import type { Task } from '../types';
import type { ParsedImportTask } from './taskJsonImport';
import { changesToPatch, planImport, summarizeImportPlan } from './taskImportPlan';

function task(overrides: Partial<Task> = {}): Task {
	return {
		id: 'aaa111',
		slug: 't',
		path: 'Tasks/aaa111-t.md',
		name: 'Task',
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
		created: '2026-07-19',
		completed: null,
		status_changed: '2026-07-19',
		recurrence: null,
		recurrence_type: null,
		notes: '',
		reminder_override: null,
		is_complete: false,
		is_inbox: false,
		...overrides,
	};
}

function parsed(overrides: Partial<ParsedImportTask> = {}): ParsedImportTask {
	return {
		action: 'auto',
		ref: null,
		type: 'task',
		name: 'Task',
		area: null,
		status: null,
		priority: null,
		labels: [],
		parent: null,
		remove_parent: false,
		depends_on: [],
		remove_depends_on: [],
		blocked_reason: '',
		assigned_to: '',
		source: '',
		start_date: null,
		due_date: null,
		due_time: null,
		estimated_days: null,
		created: null,
		completed: null,
		recurrence: null,
		recurrence_type: null,
		pomodoro_count: null,
		focused_minutes: null,
		notes: '',
		...overrides,
	};
}

describe('planImport', () => {
	it('creates when no existing task matches by type+name', () => {
		const plan = planImport([parsed({ name: 'Brand new' })], [task({ name: 'Existing' })]);
		expect(plan.creates).toHaveLength(1);
		expect(plan.creates[0].parsed.name).toBe('Brand new');
		expect(plan.updates).toHaveLength(0);
	});

	it('matches case-insensitively and records only changed fields', () => {
		const existing = task({ name: 'Write Report', status: 'Active', priority: 'None' });
		const plan = planImport(
			[parsed({ name: 'write report', status: 'Done', priority: 'None' })],
			[existing],
		);
		expect(plan.creates).toHaveLength(0);
		expect(plan.updates).toHaveLength(1);
		expect(plan.updates[0].path).toBe(existing.path);
		expect(plan.updates[0].changes).toEqual([{ field: 'status', from: 'Active', to: 'Done' }]);
		expect(plan.fieldChangeCounts).toEqual({ status: 1 });
	});

	it('counts a matched-but-identical task as unchanged', () => {
		const existing = task({ name: 'A', status: 'Active' });
		const plan = planImport([parsed({ name: 'A', status: 'Active' })], [existing]);
		expect(plan.updates).toHaveLength(0);
		expect(plan.unchangedCount).toBe(1);
	});

	it('never clears a field from an omitted (null/empty) parsed value', () => {
		const existing = task({ area: 'Work', labels: ['feature'], due_date: '2026-08-01' });
		const plan = planImport([parsed({ area: null, labels: [], due_date: null })], [existing]);
		expect(plan.updates).toHaveLength(0);
		expect(plan.unchangedCount).toBe(1);
	});

	it('diffs labels as a set, ignoring order', () => {
		const existing = task({ labels: ['a', 'b'] });
		const same = planImport([parsed({ labels: ['b', 'a'] })], [existing]);
		expect(same.unchangedCount).toBe(1);
		const changed = planImport([parsed({ labels: ['a', 'c'] })], [existing]);
		expect(changed.updates[0].changes[0].field).toBe('labels');
	});

	it('skips ambiguous names that match multiple tasks', () => {
		const plan = planImport(
			[parsed({ name: 'Dup', status: 'Done' })],
			[task({ name: 'Dup', path: 'Tasks/1.md' }), task({ name: 'Dup', path: 'Tasks/2.md' })],
		);
		expect(plan.updates).toHaveLength(0);
		expect(plan.creates).toHaveLength(0);
		expect(plan.ambiguousNames).toEqual(['Dup']);
	});

	it('does not match a task to a project of the same name', () => {
		const plan = planImport(
			[parsed({ name: 'Website', type: 'project', status: 'Done' })],
			[task({ name: 'Website', type: 'task' })],
		);
		expect(plan.creates).toHaveLength(1);
	});

	it('plans a delete when action:delete matches exactly one task', () => {
		const existing = task({ name: 'Drop me', path: 'Tasks/drop.md' });
		const plan = planImport([parsed({ name: 'drop me', action: 'delete' })], [existing]);
		expect(plan.deletes).toEqual([{ path: 'Tasks/drop.md', name: 'Drop me' }]);
		expect(plan.creates).toHaveLength(0);
		expect(plan.updates).toHaveLength(0);
	});

	it('does not create a matched task from an action:delete entry carrying fields', () => {
		const existing = task({ name: 'Drop me', status: 'Active' });
		const plan = planImport([parsed({ name: 'Drop me', status: 'Done', action: 'delete' })], [existing]);
		expect(plan.deletes).toHaveLength(1);
		expect(plan.updates).toHaveLength(0);
	});

	it('records a not-found name when action:delete matches nothing', () => {
		const plan = planImport([parsed({ name: 'Ghost', action: 'delete' })], [task({ name: 'Other' })]);
		expect(plan.deletes).toHaveLength(0);
		expect(plan.missingNames).toEqual(['Ghost']);
	});

	it('treats an ambiguous action:delete as ambiguous, not a delete', () => {
		const plan = planImport(
			[parsed({ name: 'Dup', action: 'delete' })],
			[task({ name: 'Dup', path: 'Tasks/1.md' }), task({ name: 'Dup', path: 'Tasks/2.md' })],
		);
		expect(plan.deletes).toHaveLength(0);
		expect(plan.ambiguousNames).toEqual(['Dup']);
	});

	it('forces a new task for action:create even when a same-name task exists', () => {
		const plan = planImport([parsed({ name: 'Task', action: 'create' })], [task({ name: 'Task' })]);
		expect(plan.creates).toHaveLength(1);
		expect(plan.updates).toHaveLength(0);
		expect(plan.unchangedCount).toBe(0);
	});

	it('records a not-found name when action:update matches nothing', () => {
		const plan = planImport([parsed({ name: 'Nope', status: 'Done', action: 'update' })], [task({ name: 'Other' })]);
		expect(plan.creates).toHaveLength(0);
		expect(plan.missingNames).toEqual(['Nope']);
	});

	it('matches by ref exactly, even when the name differs (a rename)', () => {
		const existing = task({ id: 'ref123', name: 'Old name', status: 'Active' });
		const plan = planImport([parsed({ ref: 'ref123', name: 'New name', status: 'Done' })], [existing]);
		expect(plan.creates).toHaveLength(0);
		expect(plan.updates).toHaveLength(1);
		expect(plan.updates[0].path).toBe(existing.path);
	});

	it('matches and updates by ref alone, with no name (the AI meta promises this is enough)', () => {
		const existing = task({ id: 'ref123', name: 'Existing name', status: 'Active' });
		const plan = planImport([parsed({ ref: 'ref123', name: '', status: 'Done' })], [existing]);
		expect(plan.creates).toHaveLength(0);
		expect(plan.updates).toHaveLength(1);
		expect(plan.updates[0].path).toBe(existing.path);
	});

	it('skips a create-fallback record with neither a matching ref nor a name', () => {
		const plan = planImport([parsed({ ref: 'unknown-ref', name: '', status: 'Done' })], [task({ name: 'Other' })]);
		expect(plan.creates).toHaveLength(0);
		expect(plan.updates).toHaveLength(0);
		expect(plan.missingNames).toEqual(['unknown-ref']);
	});

	it('ref disambiguates what a duplicate name cannot', () => {
		const a = task({ id: 'aaa', name: 'Dup', path: 'Tasks/a.md', status: 'Active' });
		const b = task({ id: 'bbb', name: 'Dup', path: 'Tasks/b.md', status: 'Active' });
		const plan = planImport([parsed({ ref: 'bbb', name: 'Dup', status: 'Done' })], [a, b]);
		expect(plan.ambiguousNames).toHaveLength(0);
		expect(plan.updates).toHaveLength(1);
		expect(plan.updates[0].path).toBe('Tasks/b.md');
	});
});

describe('planImport — dependency links', () => {
	it('adds a depends_on edge between two existing tasks, resolving by name', () => {
		const a = task({ id: 'a', name: 'A', path: 'Tasks/a.md' });
		const b = task({ id: 'b', name: 'B', path: 'Tasks/b.md' });
		const plan = planImport([parsed({ name: 'B', depends_on: ['A'] })], [a, b]);
		expect(plan.linkAdds).toHaveLength(1);
		expect(plan.linkAdds[0].from).toEqual({ kind: 'existing', path: 'Tasks/b.md', name: 'B' });
		expect(plan.linkAdds[0].to).toEqual({ kind: 'existing', path: 'Tasks/a.md', name: 'A' });
	});

	it('does not re-add an edge that already exists', () => {
		const a = task({ id: 'a', name: 'A', path: 'Tasks/a.md' });
		const b = task({ id: 'b', name: 'B', path: 'Tasks/b.md', depends_on: ['Tasks/a.md'] });
		const plan = planImport([parsed({ name: 'B', depends_on: ['A'] })], [a, b]);
		expect(plan.linkAdds).toHaveLength(0);
	});

	it('wires a chain of brand-new tasks by name (new → new)', () => {
		const plan = planImport(
			[
				parsed({ name: 'Step 1' }),
				parsed({ name: 'Step 2', depends_on: ['Step 1'] }),
				parsed({ name: 'Step 3', depends_on: ['Step 2'] }),
			],
			[],
		);
		expect(plan.creates).toHaveLength(3);
		expect(plan.linkAdds).toHaveLength(2);
		expect(plan.linkAdds[0].from).toEqual({ kind: 'new', type: 'task', name: 'Step 2' });
		expect(plan.linkAdds[0].to).toEqual({ kind: 'new', type: 'task', name: 'Step 1' });
	});

	it('resolves a link target by ref', () => {
		const a = task({ id: 'target1', name: 'Anything', path: 'Tasks/a.md' });
		const b = task({ id: 'b', name: 'B', path: 'Tasks/b.md' });
		const plan = planImport([parsed({ name: 'B', depends_on: ['target1'] })], [a, b]);
		expect(plan.linkAdds[0].to).toEqual({ kind: 'existing', path: 'Tasks/a.md', name: 'Anything' });
	});

	it('surfaces an unresolved link target rather than guessing', () => {
		const b = task({ name: 'B', path: 'Tasks/b.md' });
		const plan = planImport([parsed({ name: 'B', depends_on: ['Ghost'] })], [b]);
		expect(plan.linkAdds).toHaveLength(0);
		expect(plan.unresolvedLinks).toEqual(['B → Ghost']);
	});

	it('surfaces an ambiguous link target', () => {
		const d1 = task({ id: '1', name: 'Dup', path: 'Tasks/1.md' });
		const d2 = task({ id: '2', name: 'Dup', path: 'Tasks/2.md' });
		const b = task({ id: 'b', name: 'B', path: 'Tasks/b.md' });
		const plan = planImport([parsed({ name: 'B', depends_on: ['Dup'] })], [d1, d2, b]);
		expect(plan.linkAdds).toHaveLength(0);
		expect(plan.unresolvedLinks).toEqual(['B → Dup']);
	});

	it('never adds a self-dependency', () => {
		const a = task({ id: 'a', name: 'A', path: 'Tasks/a.md' });
		const plan = planImport([parsed({ name: 'A', depends_on: ['A'] })], [a]);
		expect(plan.linkAdds).toHaveLength(0);
	});

	it('removes an existing edge listed under remove_depends_on', () => {
		const a = task({ id: 'a', name: 'A', path: 'Tasks/a.md' });
		const b = task({ id: 'b', name: 'B', path: 'Tasks/b.md', depends_on: ['Tasks/a.md'] });
		const plan = planImport([parsed({ name: 'B', remove_depends_on: ['A'] })], [a, b]);
		expect(plan.linkRemovals).toHaveLength(1);
		expect(plan.linkRemovals[0].to).toEqual({ kind: 'existing', path: 'Tasks/a.md', name: 'A' });
	});

	it('ignores a remove for an edge that is not present', () => {
		const a = task({ id: 'a', name: 'A', path: 'Tasks/a.md' });
		const b = task({ id: 'b', name: 'B', path: 'Tasks/b.md' });
		const plan = planImport([parsed({ name: 'B', remove_depends_on: ['A'] })], [a, b]);
		expect(plan.linkRemovals).toHaveLength(0);
	});

	it('dedupes a repeated link target', () => {
		const a = task({ id: 'a', name: 'A', path: 'Tasks/a.md' });
		const b = task({ id: 'b', name: 'B', path: 'Tasks/b.md' });
		const plan = planImport([parsed({ name: 'B', depends_on: ['A', 'a'] })], [a, b]);
		expect(plan.linkAdds).toHaveLength(1);
	});
});

describe('planImport — parent (project membership)', () => {
	it('sets a task under an existing project resolved by name', () => {
		const proj = task({ id: 'p', name: 'Website', type: 'project', path: 'Tasks/p.md' });
		const t = task({ id: 't', name: 'T', path: 'Tasks/t.md', parent_task: null });
		const plan = planImport([parsed({ name: 'T', parent: 'Website' })], [proj, t]);
		expect(plan.parentChanges).toHaveLength(1);
		expect(plan.parentChanges[0].from).toEqual({ kind: 'existing', path: 'Tasks/t.md', name: 'T' });
		expect(plan.parentChanges[0].to).toEqual({ kind: 'existing', path: 'Tasks/p.md', name: 'Website' });
	});

	it('is a no-op when the task already belongs to that project', () => {
		const proj = task({ id: 'p', name: 'Website', type: 'project', path: 'Tasks/p.md' });
		const t = task({ id: 't', name: 'T', path: 'Tasks/t.md', parent_task: 'Tasks/p' });
		const plan = planImport([parsed({ name: 'T', parent: 'Website' })], [proj, t]);
		expect(plan.parentChanges).toHaveLength(0);
	});

	it('parents a new task under a project created in the same import', () => {
		const plan = planImport(
			[
				parsed({ name: 'New Project', type: 'project' }),
				parsed({ name: 'New Task', parent: 'New Project' }),
			],
			[],
		);
		expect(plan.creates).toHaveLength(2);
		expect(plan.parentChanges).toHaveLength(1);
		expect(plan.parentChanges[0].from).toEqual({ kind: 'new', type: 'task', name: 'New Task' });
		expect(plan.parentChanges[0].to).toEqual({ kind: 'new', type: 'project', name: 'New Project' });
	});

	it('detaches a task from its project on remove_parent', () => {
		const t = task({ id: 't', name: 'T', path: 'Tasks/t.md', parent_task: 'Tasks/p' });
		const plan = planImport([parsed({ name: 'T', remove_parent: true })], [t]);
		expect(plan.parentChanges).toEqual([{ from: { kind: 'existing', path: 'Tasks/t.md', name: 'T' }, to: null }]);
	});

	it('ignores remove_parent when the task has no project', () => {
		const t = task({ id: 't', name: 'T', path: 'Tasks/t.md', parent_task: null });
		const plan = planImport([parsed({ name: 'T', remove_parent: true })], [t]);
		expect(plan.parentChanges).toHaveLength(0);
	});

	it('surfaces an unresolved parent rather than guessing', () => {
		const t = task({ id: 't', name: 'T', path: 'Tasks/t.md' });
		const plan = planImport([parsed({ name: 'T', parent: 'Ghost Project' })], [t]);
		expect(plan.parentChanges).toHaveLength(0);
		expect(plan.unresolvedLinks).toEqual(['T ⤴ Ghost Project']);
	});
});

describe('changesToPatch', () => {
	it('collapses changes into a Partial<Task>', () => {
		expect(
			changesToPatch([
				{ field: 'status', from: 'Active', to: 'Done' },
				{ field: 'priority', from: 'None', to: 'High' },
			]),
		).toEqual({ status: 'Done', priority: 'High' });
	});
});

describe('summarizeImportPlan', () => {
	it('produces headline + field-breakdown lines', () => {
		const existing = task({ name: 'A', status: 'Active', due_date: null });
		const plan = planImport(
			[
				parsed({ name: 'A', status: 'Done', due_date: '2026-08-02' }),
				parsed({ name: 'New one' }),
			],
			[existing],
		);
		const lines = summarizeImportPlan(plan);
		expect(lines[0]).toBe('1 new task');
		expect(lines[1]).toBe('1 task updated');
		expect(lines.some((l) => l.includes('status: 1') && l.includes('due date: 1'))).toBe(true);
	});
});
