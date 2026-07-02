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
		recurrence: null,
		recurrence_type: null,
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
