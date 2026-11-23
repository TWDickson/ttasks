import { describe, expect, it } from 'vitest';
import { groupDependencyCandidates, sortDependencyFirst } from './dependencySort';
import type { Task } from '../types';

function makeTask(overrides: Partial<Task> = {}): Task {
	return {
		id: 'abc',
		slug: 'task',
		path: 'Tasks/abc-task.md',
		type: 'task',
		name: 'Task',
		area: null,
		status: 'Active',
		priority: 'None',
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
		created: '2026-01-01',
		completed: null,
		repeat: null,
		notes: '',
		is_complete: false,
		is_inbox: true,
		status_changed: null,
		...overrides,
	};
}

describe('sortDependencyFirst', () => {
	const parent = 'Tasks/project-parent';

	it('puts same-project task before non-project task', () => {
		const sameProject = makeTask({ name: 'Zebra', parent_task: parent });
		const otherProject = makeTask({ name: 'Alpha', parent_task: null });
		expect(sortDependencyFirst(sameProject, otherProject, parent)).toBeLessThan(0);
		expect(sortDependencyFirst(otherProject, sameProject, parent)).toBeGreaterThan(0);
	});

	it('sorts alphabetically within same-project group', () => {
		const a = makeTask({ name: 'Alpha', parent_task: parent });
		const b = makeTask({ name: 'Beta', parent_task: parent });
		expect(sortDependencyFirst(a, b, parent)).toBeLessThan(0);
		expect(sortDependencyFirst(b, a, parent)).toBeGreaterThan(0);
	});

	it('sorts alphabetically within non-project group', () => {
		const a = makeTask({ name: 'Alpha', parent_task: null });
		const b = makeTask({ name: 'Beta', parent_task: 'Tasks/other-project' });
		expect(sortDependencyFirst(a, b, parent)).toBeLessThan(0);
	});

	it('treats tasks with different parent as non-same-project', () => {
		const sameProject = makeTask({ name: 'A', parent_task: parent });
		const differentProject = makeTask({ name: 'Z', parent_task: 'Tasks/other' });
		expect(sortDependencyFirst(sameProject, differentProject, parent)).toBeLessThan(0);
	});

	it('falls back to alphabetical when currentParentTask is null', () => {
		const a = makeTask({ name: 'Alpha', parent_task: 'Tasks/some-project' });
		const b = makeTask({ name: 'Beta', parent_task: 'Tasks/some-project' });
		expect(sortDependencyFirst(a, b, null)).toBeLessThan(0);
		expect(sortDependencyFirst(b, a, null)).toBeGreaterThan(0);
	});

	it('returns 0 for equal names with same project membership', () => {
		const a = makeTask({ name: 'Same', parent_task: parent });
		const b = makeTask({ name: 'Same', parent_task: parent });
		expect(sortDependencyFirst(a, b, parent)).toBe(0);
	});

	it('matches across `.md` and extensionless forms of the project path', () => {
		// Stored tasks carry `.md`; the create modal holds the bare path.
		const sameProject = makeTask({ name: 'Zebra', parent_task: `${parent}.md` });
		const other = makeTask({ name: 'Alpha', parent_task: 'Tasks/other.md' });
		expect(sortDependencyFirst(sameProject, other, parent)).toBeLessThan(0);
		expect(sortDependencyFirst(other, sameProject, parent)).toBeGreaterThan(0);
		expect(sortDependencyFirst(sameProject, other, `${parent}.md`)).toBeLessThan(0);
	});
});

describe('groupDependencyCandidates', () => {
	const t = (name: string, overrides: Partial<Task> = {}): Task =>
		makeTask({ id: name, slug: name, name, path: `Tasks/${name}.md`, ...overrides });
	const projA = t('Alpha', { type: 'project' });
	const projB = t('Beta', { type: 'project' });

	it('groups own project, other projects by name, no project, then done', () => {
		const self = t('self', { parent_task: 'Tasks/Beta' });
		const tasks = [
			projA, projB, self,
			t('zebra', { parent_task: 'Tasks/Beta' }),
			t('apple', { parent_task: 'Tasks/Beta' }),
			t('in-alpha', { parent_task: 'Tasks/Alpha' }),
			t('loose'),
			t('old', { is_complete: true, completed: '2026-01-01' }),
			t('recent', { is_complete: true, completed: '2026-03-01' }),
		];
		const groups = groupDependencyCandidates(self, tasks);
		expect(groups.map((g) => [g.kind, g.project?.name ?? null, g.tasks.map((x) => x.name)])).toEqual([
			['same-project', 'Beta', ['apple', 'zebra']],
			['project', 'Alpha', ['in-alpha']],
			['no-project', null, ['loose']],
			['done', null, ['recent', 'old']],
		]);
	});

	it('counts a subtask under its parent task\'s project', () => {
		const parent = t('parent', { parent_task: 'Tasks/Alpha' });
		const sub = t('sub', { parent_task: 'Tasks/parent' });
		const self = t('self', { parent_task: 'Tasks/Alpha' });
		const groups = groupDependencyCandidates(self, [projA, parent, sub, self]);
		expect(groups[0].kind).toBe('same-project');
		expect(groups[0].tasks.map((x) => x.name)).toEqual(['parent', 'sub']);
	});

	it('leaves out itself, existing blockers, projects and everything downstream', () => {
		const self = t('self', { depends_on: ['Tasks/already'] });
		const tasks = [
			projA, self,
			t('already'),
			t('child', { depends_on: ['[[Tasks/self|self]]'] }),
			t('grandchild', { depends_on: ['Tasks/child'] }),
			t('free'),
		];
		const names = groupDependencyCandidates(self, tasks).flatMap((g) => g.tasks.map((x) => x.name));
		expect(names).toEqual(['free']);
	});
});
