import { describe, expect, it, vi } from 'vitest';
import type { Task } from '../types';
import { runArchiveFlow, runDeleteFlow, runMarkCompleteFlow } from './taskDetailActions';

function makeTask(overrides: Partial<Task> = {}): Task {
	return {
		id: 'abc123',
		slug: 'task',
		path: 'Planner/Tasks/abc123-task.md',
		name: 'Test Task',
		type: 'task',
		status: 'Active',
		priority: 'None',
		area: null,
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
		status_changed: '2026-05-19',
		recurrence: null,
		recurrence_type: null,
		reminder_override: null,
		notes: '',
		is_complete: false,
		is_inbox: false,
		...overrides,
	};
}

describe('runMarkCompleteFlow', () => {
	it('completes non-recurring tasks via saveImmediate', async () => {
		const saveImmediate = vi.fn(async (_updates: Partial<Task>) => {});
		const completeAndRecur = vi.fn(async (_task: Task) => null);
		const notice = vi.fn();

		await runMarkCompleteFlow({
			task: makeTask(),
			completionStatus: 'Done',
			today: '2026-05-19',
			saveImmediate,
			completeAndRecur,
			notice,
		});

		expect(saveImmediate).toHaveBeenCalledWith({ status: 'Done', completed: '2026-05-19' });
		expect(completeAndRecur).not.toHaveBeenCalled();
		expect(notice).not.toHaveBeenCalled();
	});

	it('completes recurring tasks via completeAndRecur and shows notice', async () => {
		const saveImmediate = vi.fn(async (_updates: Partial<Task>) => {});
		const nextTask = makeTask({ name: 'Next Task', due_date: '2026-05-21' });
		const completeAndRecur = vi.fn(async (_task: Task) => nextTask);
		const notice = vi.fn();

		await runMarkCompleteFlow({
			task: makeTask({ recurrence: 'weekly' }),
			completionStatus: 'Done',
			today: '2026-05-19',
			saveImmediate,
			completeAndRecur,
			notice,
		});

		expect(completeAndRecur).toHaveBeenCalledTimes(1);
		expect(saveImmediate).not.toHaveBeenCalled();
		expect(notice).toHaveBeenCalledWith('Completed. Next due 2026-05-21 (Next Task)');
	});

	it('handles recurring completion with no returned next task', async () => {
		const saveImmediate = vi.fn(async (_updates: Partial<Task>) => {});
		const completeAndRecur = vi.fn(async (_task: Task) => null);
		const notice = vi.fn();

		await runMarkCompleteFlow({
			task: makeTask({ recurrence: 'weekly' }),
			completionStatus: 'Done',
			today: '2026-05-19',
			saveImmediate,
			completeAndRecur,
			notice,
		});

		expect(completeAndRecur).toHaveBeenCalledTimes(1);
		expect(saveImmediate).not.toHaveBeenCalled();
		expect(notice).not.toHaveBeenCalled();
	});
});

describe('runDeleteFlow', () => {
	it('deletes and clears selection when confirmed', async () => {
		const confirmDelete = vi.fn(async (_name: string) => true);
		const setActiveTaskPath = vi.fn();
		const deleteTask = vi.fn(async (_path: string) => {});
		const task = makeTask({ name: 'Danger Zone', path: 'Planner/Tasks/abc123-danger.md' });

		await runDeleteFlow({ task, confirmDelete, setActiveTaskPath, deleteTask });

		expect(confirmDelete).toHaveBeenCalledWith('Danger Zone');
		expect(setActiveTaskPath).toHaveBeenCalledWith(null);
		expect(deleteTask).toHaveBeenCalledWith('Planner/Tasks/abc123-danger.md');
	});

	it('does nothing when delete is not confirmed', async () => {
		const confirmDelete = vi.fn(async (_name: string) => false);
		const setActiveTaskPath = vi.fn();
		const deleteTask = vi.fn(async (_path: string) => {});

		await runDeleteFlow({
			task: makeTask(),
			confirmDelete,
			setActiveTaskPath,
			deleteTask,
		});

		expect(deleteTask).not.toHaveBeenCalled();
		expect(setActiveTaskPath).not.toHaveBeenCalled();
	});
});

describe('runArchiveFlow', () => {
	it('archives completed tasks and clears active path', async () => {
		const archiveTask = vi.fn(async (_path: string) => {});
		const setActiveTaskPath = vi.fn();

		await runArchiveFlow({
			task: makeTask({ is_complete: true, path: 'Planner/Tasks/abc123-complete.md' }),
			archiveTask,
			setActiveTaskPath,
		});

		expect(archiveTask).toHaveBeenCalledWith('Planner/Tasks/abc123-complete.md');
		expect(setActiveTaskPath).toHaveBeenCalledWith(null);
	});

	it('skips archive for incomplete tasks', async () => {
		const archiveTask = vi.fn(async (_path: string) => {});
		const setActiveTaskPath = vi.fn();

		await runArchiveFlow({
			task: makeTask({ is_complete: false }),
			archiveTask,
			setActiveTaskPath,
		});

		expect(archiveTask).not.toHaveBeenCalled();
		expect(setActiveTaskPath).not.toHaveBeenCalled();
	});
});
