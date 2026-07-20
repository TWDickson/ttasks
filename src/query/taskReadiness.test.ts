import { describe, expect, it } from 'vitest';
import type { Task } from '../types';
import { isTaskReady, sortReadyFirst } from './taskReadiness';

function makeTask(overrides: Partial<Task> = {}): Task {
	return {
		id: 'abc123',
		slug: 'task',
		path: 'Tasks/abc123-task.md',
		type: 'task',
		name: 'Default task',
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
		created: '2026-04-01',
		completed: null,
		recurrence: null,
		recurrence_type: null,
		notes: '',
		is_complete: false,
		is_inbox: false,
		status_changed: null,
		...overrides,
	};
}

describe('isTaskReady', () => {
	it('is ready when it has no dependencies', () => {
		const task = makeTask();
		expect(isTaskReady(task, new Map())).toBe(true);
	});

	it('is not ready when a dependency is incomplete', () => {
		const blocker = makeTask({ path: 'Tasks/blocker.md', is_complete: false });
		const task = makeTask({ depends_on: ['Tasks/blocker.md'] });
		expect(isTaskReady(task, new Map([[blocker.path, blocker]]))).toBe(false);
	});

	it('is ready when every dependency is complete', () => {
		const blocker = makeTask({ path: 'Tasks/blocker.md', is_complete: true });
		const task = makeTask({ depends_on: ['Tasks/blocker.md'] });
		expect(isTaskReady(task, new Map([[blocker.path, blocker]]))).toBe(true);
	});

	it('is never ready if already complete, even with no dependencies', () => {
		const task = makeTask({ is_complete: true });
		expect(isTaskReady(task, new Map())).toBe(false);
	});

	it('does not block on an unresolved (dangling) dependency link', () => {
		const task = makeTask({ depends_on: ['Tasks/missing.md'] });
		expect(isTaskReady(task, new Map())).toBe(true);
	});

	it('resolves wiki-link syntax in depends_on entries', () => {
		const blocker = makeTask({ path: 'Tasks/blocker.md', is_complete: false });
		const task = makeTask({ depends_on: ['[[Tasks/blocker|Blocker]]'] });
		expect(isTaskReady(task, new Map([[blocker.path, blocker]]))).toBe(false);
	});
});

describe('sortReadyFirst', () => {
	it('keeps relative order within each partition (stable)', () => {
		const blocker = makeTask({ path: 'Tasks/blocker.md', is_complete: false });
		const a = makeTask({ path: 'Tasks/a.md', name: 'A', depends_on: ['Tasks/blocker.md'] });
		const b = makeTask({ path: 'Tasks/b.md', name: 'B' });
		const c = makeTask({ path: 'Tasks/c.md', name: 'C', depends_on: ['Tasks/blocker.md'] });
		const d = makeTask({ path: 'Tasks/d.md', name: 'D' });

		const result = sortReadyFirst([a, b, c, d], [a, b, c, d, blocker]);
		expect(result.map((t) => t.name)).toEqual(['B', 'D', 'A', 'C']);
	});
});
