import { describe, expect, it, vi } from 'vitest';
import type { Task } from '../types';
import { createTaskContextMenuDeps, runArchiveAndClear, type TaskActionPorts } from './taskActionPorts';

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
		recurrence: null,
		recurrence_type: null,
		notes: '',
		is_complete: false,
		is_inbox: false,
		status_changed: null,
		...overrides,
	};
}

function makePorts(overrides: Partial<TaskActionPorts> = {}): TaskActionPorts {
	return {
		openTaskDetail: vi.fn(async (_path: string) => {}),
		runQuickAction: vi.fn(async (_action, _path) => true),
		convertToProject: vi.fn(async (_path: string) => {}),
		duplicateTask: vi.fn(async (_path: string) => null),
		deleteTask: vi.fn(async (_path: string, _options?: { prompt?: boolean }) => {}),
		restoreTask: vi.fn(async (_path: string) => {}),
		archiveTask: vi.fn(async (_path: string) => {}),
		setActiveTaskPath: vi.fn((_path: string | null) => {}),
		notice: vi.fn((_message: string) => {}),
		createDependentTask: vi.fn((_path: string) => {}),
		...overrides,
	};
}

describe('runArchiveAndClear', () => {
	it('archives and clears active task path', async () => {
		const archiveTask = vi.fn(async (_path: string) => {});
		const setActiveTaskPath = vi.fn((_path: string | null) => {});

		await runArchiveAndClear('Tasks/a.md', { archiveTask, setActiveTaskPath });

		expect(archiveTask).toHaveBeenCalledWith('Tasks/a.md');
		expect(setActiveTaskPath).toHaveBeenCalledWith(null);
	});
});

describe('createTaskContextMenuDeps', () => {
	it('passes through openTask to openTaskDetail', () => {
		const ports = makePorts();
		const deps = createTaskContextMenuDeps(ports);

		deps.openTask('Tasks/a.md');

		expect(ports.openTaskDetail).toHaveBeenCalledWith('Tasks/a.md');
	});

	it('passes through quick actions', async () => {
		const ports = makePorts({
			runQuickAction: vi.fn(async (_action, _path) => true),
		});
		const deps = createTaskContextMenuDeps(ports);

		await deps.runQuickAction('start', 'Tasks/a.md');

		expect(ports.runQuickAction).toHaveBeenCalledWith('start', 'Tasks/a.md');
	});

	it('wraps convertToProject with migration notice', async () => {
		const ports = makePorts();
		const deps = createTaskContextMenuDeps(ports);

		await deps.convertToProject('Tasks/a.md');

		expect(ports.convertToProject).toHaveBeenCalledWith('Tasks/a.md');
		expect(ports.notice).toHaveBeenCalledWith('TTasks: converted to project');
	});

	it('wraps duplicate with active-task update and notice', async () => {
		const createdTask = makeTask({ path: 'Tasks/new.md', name: 'New Task' });
		const ports = makePorts({
			duplicateTask: vi.fn(async (_path: string) => createdTask),
		});
		const deps = createTaskContextMenuDeps(ports);

		await deps.duplicateTask('Tasks/a.md');

		expect(ports.duplicateTask).toHaveBeenCalledWith('Tasks/a.md');
		expect(ports.setActiveTaskPath).toHaveBeenCalledWith('Tasks/new.md');
		expect(ports.notice).toHaveBeenCalledWith('TTasks: duplicated as "New Task"');
	});

	it('does not update active task or notice when duplicate returns null', async () => {
		const ports = makePorts({
			duplicateTask: vi.fn(async (_path: string) => null),
		});
		const deps = createTaskContextMenuDeps(ports);

		await deps.duplicateTask('Tasks/a.md');

		expect(ports.setActiveTaskPath).not.toHaveBeenCalled();
		expect(ports.notice).not.toHaveBeenCalledWith(expect.stringContaining('duplicated as'));
	});

	it('deletes with prompt option enabled', async () => {
		const ports = makePorts();
		const deps = createTaskContextMenuDeps(ports);

		await deps.deleteTask('Tasks/a.md');

		expect(ports.deleteTask).toHaveBeenCalledWith('Tasks/a.md', { prompt: true });
	});

	it('wraps restore with reopen notice', async () => {
		const ports = makePorts();
		const deps = createTaskContextMenuDeps(ports);

		await deps.restoreTask('Tasks/a.md');

		expect(ports.restoreTask).toHaveBeenCalledWith('Tasks/a.md');
		expect(ports.notice).toHaveBeenCalledWith('TTasks: task reopened');
	});

	it('wraps archive with clear-selection and notice', async () => {
		const ports = makePorts();
		const deps = createTaskContextMenuDeps(ports);

		await deps.archiveTask?.('Tasks/a.md');

		expect(ports.archiveTask).toHaveBeenCalledWith('Tasks/a.md');
		expect(ports.setActiveTaskPath).toHaveBeenCalledWith(null);
		expect(ports.notice).toHaveBeenCalledWith('TTasks: task archived.');
	});

	it('exposes createDependent only when port is provided', async () => {
		const withDep = makePorts();
		const depsWith = createTaskContextMenuDeps(withDep);
		expect(depsWith.createDependent).toBeDefined();
		await depsWith.createDependent?.('Tasks/a.md');
		expect(withDep.createDependentTask).toHaveBeenCalledWith('Tasks/a.md');

		const withoutDep = makePorts();
		delete (withoutDep as Partial<TaskActionPorts>).createDependentTask;
		const depsWithout = createTaskContextMenuDeps(withoutDep);
		expect(depsWithout.createDependent).toBeUndefined();
	});
});
