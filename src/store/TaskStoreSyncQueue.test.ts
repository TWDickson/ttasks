import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Task } from '../types';
import { TaskStoreSyncQueue } from './TaskStoreSyncQueue';

function makeTask(path: string, name: string): Task {
	return {
		id: 'abc123',
		slug: 'task',
		path,
		type: 'task',
		name,
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
		created: '2026-05-19',
		completed: null,
		recurrence: null,
		recurrence_type: null,
		notes: '',
		is_complete: false,
		is_inbox: false,
		status_changed: null,
	};
}

describe('TaskStoreSyncQueue', () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it('queues tracked files and flushes parsed tasks', async () => {
		vi.useFakeTimers();
		const parseFile = vi.fn(async (file: { path: string; extension: string }) => makeTask(file.path, 'Task'));
		const applyParsedTasks = vi.fn((_tasks: Task[]) => {});
		const onTaskParsed = vi.fn(async (_task: Task) => {});
		const log = vi.fn((_message: string) => {});

		const queue = new TaskStoreSyncQueue({
			shouldTrackPath: (path, extension) => path.startsWith('Planner/Tasks/') && extension === 'md',
			resolveFileByPath: (path) => ({ path, extension: 'md' }),
			parseFile,
			applyParsedTasks,
			onTaskParsed,
			log,
			delayMs: 10,
		});

		queue.queueFile({ path: 'Planner/Tasks/a.md', extension: 'md' });
		await vi.advanceTimersByTimeAsync(10);

		expect(parseFile).toHaveBeenCalledTimes(1);
		expect(applyParsedTasks).toHaveBeenCalledTimes(1);
		expect(onTaskParsed).toHaveBeenCalledTimes(1);
		expect(log).toHaveBeenCalledWith(expect.stringContaining('flushed 1 changed task(s)'));
	});

	it('ignores untracked files', async () => {
		vi.useFakeTimers();
		const parseFile = vi.fn(async (file: { path: string; extension: string }) => makeTask(file.path, 'Task'));

		const queue = new TaskStoreSyncQueue({
			shouldTrackPath: (_path, _extension) => false,
			resolveFileByPath: (path) => ({ path, extension: 'md' }),
			parseFile,
			applyParsedTasks: vi.fn(),
			onTaskParsed: vi.fn(async () => {}),
			log: vi.fn(),
			delayMs: 10,
		});

		queue.queueFile({ path: 'Other/file.md', extension: 'md' });
		await vi.advanceTimersByTimeAsync(20);

		expect(parseFile).not.toHaveBeenCalled();
	});

	it('drops queued paths before flush', async () => {
		vi.useFakeTimers();
		const parseFile = vi.fn(async (file: { path: string; extension: string }) => makeTask(file.path, 'Task'));

		const queue = new TaskStoreSyncQueue({
			shouldTrackPath: () => true,
			resolveFileByPath: (path) => ({ path, extension: 'md' }),
			parseFile,
			applyParsedTasks: vi.fn(),
			onTaskParsed: vi.fn(async () => {}),
			log: vi.fn(),
			delayMs: 10,
		});

		queue.queueFile({ path: 'Planner/Tasks/a.md', extension: 'md' });
		queue.dropPath('Planner/Tasks/a.md');
		await vi.advanceTimersByTimeAsync(20);

		expect(parseFile).not.toHaveBeenCalled();
	});

	it('flushes queued follow-up changes after in-flight parse', async () => {
		vi.useFakeTimers();
		let parseCalls = 0;
		const parseFile = vi.fn(async (file: { path: string; extension: string }) => {
			parseCalls += 1;
			if (parseCalls === 1) {
				queue.queueFile({ path: 'Planner/Tasks/b.md', extension: 'md' });
			}
			return makeTask(file.path, `Task ${parseCalls}`);
		});

		const applyParsedTasks = vi.fn((_tasks: Task[]) => {});
		const queue = new TaskStoreSyncQueue({
			shouldTrackPath: () => true,
			resolveFileByPath: (path) => ({ path, extension: 'md' }),
			parseFile,
			applyParsedTasks,
			onTaskParsed: vi.fn(async () => {}),
			log: vi.fn(),
			delayMs: 10,
		});

		queue.queueFile({ path: 'Planner/Tasks/a.md', extension: 'md' });
		await vi.advanceTimersByTimeAsync(40);

		expect(parseFile).toHaveBeenCalledTimes(2);
		expect(applyParsedTasks).toHaveBeenCalledTimes(2);
	});
});
