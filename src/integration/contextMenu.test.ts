import { describe, expect, it, vi } from 'vitest';
import type { Task } from '../types';
import { addTaskContextMenuItems } from './contextMenu';

class FakeMenu {
	items: Array<{ title: string; onClick?: () => void }> = [];
	addItem(cb: (item: { setTitle: (title: string) => any; setIcon: (icon: string) => any; onClick: (fn: () => void) => any }) => void): void {
		const entry: { title: string; onClick?: () => void } = { title: '' };
		cb({
			setTitle: (title: string) => { entry.title = title; return this; },
			setIcon: (_icon: string) => this,
			onClick: (fn: () => void) => { entry.onClick = fn; return this; },
		});
		this.items.push(entry);
	}
	addSeparator(): void {}
}

function makeTask(overrides: Partial<Task> = {}): Task {
	return {
		id: 'abc123',
		slug: 'task',
		path: 'Tasks/task.md',
		type: 'task',
		name: 'Task',
		category: null,
		status: 'Active',
		priority: 'None',
		task_type: null,
		parent_task: null,
		depends_on: [],
		blocks: [],
		blocked_reason: '',
		assigned_to: '',
		source: '',
		start_date: null,
		due_date: null,
		estimated_days: null,
		created: '2026-04-16',
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

describe('addTaskContextMenuItems', () => {
	it('adds common task actions and invokes callbacks', () => {
		const menu = new FakeMenu();
		const task = makeTask();
		const deps = {
			openTask: vi.fn(),
			runQuickAction: vi.fn(async () => true),
			convertToProject: vi.fn(async () => {}),
			duplicateTask: vi.fn(async () => {}),
			deleteTask: vi.fn(async () => {}),
		};

		addTaskContextMenuItems(menu as never, task, deps);

		const titles = menu.items.map(i => i.title);
		expect(titles).toContain('Open');
		expect(titles).toContain('Start');
		expect(titles).toContain('Complete');
		expect(titles).toContain('Block');
		expect(titles).toContain('Defer');
		expect(titles).toContain('Convert to Project');
		expect(titles).toContain('Duplicate');
		expect(titles).toContain('Delete');

		menu.items.find(i => i.title === 'Open')?.onClick?.();
		expect(deps.openTask).toHaveBeenCalledWith(task.path);

		menu.items.find(i => i.title === 'Duplicate')?.onClick?.();
		expect(deps.duplicateTask).toHaveBeenCalledWith(task.path);
	});

	it('invokes convertToProject callback', () => {
		const menu = new FakeMenu();
		const task = makeTask();
		const deps = {
			openTask: vi.fn(),
			runQuickAction: vi.fn(async () => true),
			convertToProject: vi.fn(async () => {}),
			duplicateTask: vi.fn(async () => {}),
			deleteTask: vi.fn(async () => {}),
		};

		addTaskContextMenuItems(menu as never, task, deps);
		menu.items.find(i => i.title === 'Convert to Project')?.onClick?.();
		expect(deps.convertToProject).toHaveBeenCalledWith(task.path);
	});

	it('omits quick actions and Convert to Project for projects', () => {
		const menu = new FakeMenu();
		const task = makeTask({ type: 'project' });
		const deps = {
			openTask: vi.fn(),
			runQuickAction: vi.fn(async () => true),
			convertToProject: vi.fn(async () => {}),
			duplicateTask: vi.fn(async () => {}),
			deleteTask: vi.fn(async () => {}),
		};

		addTaskContextMenuItems(menu as never, task, deps);
		const titles = menu.items.map(i => i.title);
		expect(titles).toContain('Open');
		expect(titles).not.toContain('Start');
		expect(titles).not.toContain('Complete');
		expect(titles).not.toContain('Convert to Project');
	});
});
