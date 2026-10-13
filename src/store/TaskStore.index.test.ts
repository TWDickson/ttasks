import { describe, expect, it } from 'vitest';
import { TaskStore } from './TaskStore';
import type { Task } from '../types';

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
		repeat: null,
		notes: '',
		is_complete: false,
		is_inbox: true,
		status_changed: null,
		...overrides,
	};
}

function createStore(): TaskStore {
	const plugin = {
		app: {} as any,
		settings: { tasksFolder: 'Tasks' },
		log: () => undefined,
		logError: () => undefined,
		register: () => undefined,
		registerEvent: () => undefined,
	} as any;
	return new TaskStore(plugin);
}

describe('TaskStore path index', () => {
	it('returns tasks by normalized path after set', () => {
		const store = createStore();
		const task = makeTask({ path: 'Tasks/abc123-task.md' });
		store.tasks.set([task]);

		expect(store.getByPath('Tasks/abc123-task')).toBe(task);
		expect(store.getByPath('Tasks/abc123-task.md')).toBe(task);
	});

	it('returns undefined for unknown paths', () => {
		const store = createStore();
		store.tasks.set([makeTask()]);

		expect(store.getByPath('Tasks/missing')).toBeUndefined();
	});

	it('tracks updated tasks after the store changes', () => {
		const store = createStore();
		store.tasks.set([makeTask({ name: 'Old name' })]);
		const updated = makeTask({ name: 'New name' });
		store.tasks.set([updated]);

		expect(store.getByPath('Tasks/abc123-task')).toBe(updated);
	});

	it('drops removed tasks from the index', () => {
		const store = createStore();
		store.tasks.set([makeTask()]);
		store.tasks.set([]);

		expect(store.getByPath('Tasks/abc123-task')).toBeUndefined();
	});
});

describe('TaskStore derives blocks (MD-3)', () => {
	it('fills blocks on set and keeps them in step through update', () => {
		const store = createStore();
		store.tasks.set([
			makeTask({ path: 'Tasks/a.md' }),
			makeTask({ path: 'Tasks/b.md', depends_on: ['Tasks/a.md'] }),
		]);
		expect(store.getByPath('Tasks/a.md')?.blocks).toEqual(['Tasks/b.md']);

		// Removing the dependency (as a rescan of b would) clears a's reverse index.
		store.tasks.update((all) => all.map((x) => (x.path === 'Tasks/b.md' ? { ...x, depends_on: [] } : x)));
		expect(store.getByPath('Tasks/a.md')?.blocks).toEqual([]);

		// Deleting the dependent does too.
		store.tasks.update((all) => [...all, makeTask({ path: 'Tasks/c.md', depends_on: ['Tasks/a.md'] })]);
		expect(store.getByPath('Tasks/a.md')?.blocks).toEqual(['Tasks/c.md']);
		store.tasks.update((all) => all.filter((x) => x.path !== 'Tasks/c.md'));
		expect(store.getByPath('Tasks/a.md')?.blocks).toEqual([]);
	});
});
