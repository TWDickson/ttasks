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
		created: '2026-04-16',
		completed: null,
		repeat: null,
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
			restoreTask: vi.fn(async () => {}),
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
			restoreTask: vi.fn(async () => {}),
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
			restoreTask: vi.fn(async () => {}),
			deleteTask: vi.fn(async () => {}),
		};

		addTaskContextMenuItems(menu as never, task, deps);
		const titles = menu.items.map(i => i.title);
		expect(titles).toContain('Open');
		expect(titles).not.toContain('Start');
		expect(titles).not.toContain('Complete');
		expect(titles).not.toContain('Convert to Project');
	});

	it('shows "New task after this" when createDependent callback is provided', () => {
		const menu = new FakeMenu();
		const task = makeTask({ type: 'task' });
		const createDependent = vi.fn(async () => {});
		const deps = {
			openTask: vi.fn(),
			runQuickAction: vi.fn(async () => true),
			convertToProject: vi.fn(async () => {}),
			duplicateTask: vi.fn(async () => {}),
			restoreTask: vi.fn(async () => {}),
			deleteTask: vi.fn(async () => {}),
			createDependent,
		};

		addTaskContextMenuItems(menu as never, task, deps);
		const titles = menu.items.map(i => i.title);
		expect(titles).toContain('New task after this');

		menu.items.find(i => i.title === 'New task after this')?.onClick?.();
		expect(createDependent).toHaveBeenCalledWith(task.path);
	});

	it('omits "New task after this" when createDependent is not provided', () => {
		const menu = new FakeMenu();
		const task = makeTask({ type: 'task' });
		const deps = {
			openTask: vi.fn(),
			runQuickAction: vi.fn(async () => true),
			convertToProject: vi.fn(async () => {}),
			duplicateTask: vi.fn(async () => {}),
			restoreTask: vi.fn(async () => {}),
			deleteTask: vi.fn(async () => {}),
		};

		addTaskContextMenuItems(menu as never, task, deps);
		expect(menu.items.map(i => i.title)).not.toContain('New task after this');
	});

	it('omits "New task after this" for projects even when callback is provided', () => {
		const menu = new FakeMenu();
		const task = makeTask({ type: 'project' });
		const deps = {
			openTask: vi.fn(),
			runQuickAction: vi.fn(async () => true),
			convertToProject: vi.fn(async () => {}),
			duplicateTask: vi.fn(async () => {}),
			restoreTask: vi.fn(async () => {}),
			deleteTask: vi.fn(async () => {}),
			createDependent: vi.fn(async () => {}),
		};

		addTaskContextMenuItems(menu as never, task, deps);
		expect(menu.items.map(i => i.title)).not.toContain('New task after this');
	});

	it('offers "New task before this" ahead of "after" when createBlocker is provided', () => {
		const menu = new FakeMenu();
		const task = makeTask({ type: 'task' });
		const createBlocker = vi.fn(async () => {});
		const deps = {
			openTask: vi.fn(),
			runQuickAction: vi.fn(async () => true),
			convertToProject: vi.fn(async () => {}),
			duplicateTask: vi.fn(async () => {}),
			restoreTask: vi.fn(async () => {}),
			deleteTask: vi.fn(async () => {}),
			createDependent: vi.fn(async () => {}),
			createBlocker,
		};

		addTaskContextMenuItems(menu as never, task, deps);
		const titles = menu.items.map(i => i.title);
		expect(titles.indexOf('New task before this')).toBeGreaterThan(-1);
		expect(titles.indexOf('New task before this')).toBeLessThan(titles.indexOf('New task after this'));

		menu.items.find(i => i.title === 'New task before this')?.onClick?.();
		expect(createBlocker).toHaveBeenCalledWith(task.path);
	});

	it('offers "Copy task ID" right after Open, passing the task id', () => {
		const menu = new FakeMenu();
		const task = makeTask({ id: 'fb7ee6' });
		const copyTaskId = vi.fn(async () => {});
		const deps = {
			openTask: vi.fn(),
			runQuickAction: vi.fn(async () => true),
			convertToProject: vi.fn(async () => {}),
			duplicateTask: vi.fn(async () => {}),
			restoreTask: vi.fn(async () => {}),
			deleteTask: vi.fn(async () => {}),
			copyTaskId,
		};

		addTaskContextMenuItems(menu as never, task, deps);
		const titles = menu.items.map(i => i.title);
		expect(titles.indexOf('Copy task ID')).toBe(titles.indexOf('Open') + 1);

		menu.items.find(i => i.title === 'Copy task ID')?.onClick?.();
		expect(copyTaskId).toHaveBeenCalledWith('fb7ee6');
	});

	it('omits "Copy task ID" without a clipboard callback', () => {
		const menu = new FakeMenu();
		const deps = {
			openTask: vi.fn(),
			runQuickAction: vi.fn(async () => true),
			convertToProject: vi.fn(async () => {}),
			duplicateTask: vi.fn(async () => {}),
			restoreTask: vi.fn(async () => {}),
			deleteTask: vi.fn(async () => {}),
		};

		addTaskContextMenuItems(menu as never, makeTask(), deps);
		expect(menu.items.map(i => i.title)).not.toContain('Copy task ID');
	});
});
