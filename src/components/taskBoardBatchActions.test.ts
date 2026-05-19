import { describe, expect, it, vi } from 'vitest';
import type { Task } from '../types';
import { runBatchArchive, runBatchComplete, runBatchDelete } from './taskBoardBatchActions';

function makeSet(values: string[]): Set<string> {
	return new Set(values);
}

describe('runBatchComplete', () => {
	it('updates each selected task and clears selection', async () => {
		const updateTask = vi.fn(async (_path: string, _updates: Partial<Task>) => {});
		const clearSelection = vi.fn(() => new Set<string>());
		const selectedPaths = makeSet(['Tasks/a.md', 'Tasks/b.md']);

		const nextSelection = await runBatchComplete({
			selectedPaths,
			completionStatus: 'Done',
			today: '2026-05-19',
			updateTask,
			clearSelection,
		});

		expect(updateTask).toHaveBeenCalledTimes(2);
		expect(updateTask).toHaveBeenNthCalledWith(1, 'Tasks/a.md', { status: 'Done', completed: '2026-05-19' });
		expect(updateTask).toHaveBeenNthCalledWith(2, 'Tasks/b.md', { status: 'Done', completed: '2026-05-19' });
		expect(clearSelection).toHaveBeenCalledTimes(1);
		expect(nextSelection.size).toBe(0);
	});
});

describe('runBatchArchive', () => {
	it('archives each selected task and clears selection', async () => {
		const archiveTask = vi.fn(async (_path: string) => {});
		const clearSelection = vi.fn(() => new Set<string>());
		const selectedPaths = makeSet(['Tasks/a.md', 'Tasks/b.md']);

		const nextSelection = await runBatchArchive({
			selectedPaths,
			archiveTask,
			clearSelection,
		});

		expect(archiveTask).toHaveBeenCalledTimes(2);
		expect(archiveTask).toHaveBeenNthCalledWith(1, 'Tasks/a.md');
		expect(archiveTask).toHaveBeenNthCalledWith(2, 'Tasks/b.md');
		expect(clearSelection).toHaveBeenCalledTimes(1);
		expect(nextSelection.size).toBe(0);
	});
});

describe('runBatchDelete', () => {
	it('deletes each selected task when confirmed and clears selection', async () => {
		const confirmDelete = vi.fn(() => true);
		const deleteTask = vi.fn(async (_path: string) => {});
		const clearSelection = vi.fn(() => new Set<string>());
		const selectedPaths = makeSet(['Tasks/a.md', 'Tasks/b.md']);

		const nextSelection = await runBatchDelete({
			selectedPaths,
			confirmDelete,
			deleteTask,
			clearSelection,
		});

		expect(confirmDelete).toHaveBeenCalledWith(2);
		expect(deleteTask).toHaveBeenCalledTimes(2);
		expect(deleteTask).toHaveBeenNthCalledWith(1, 'Tasks/a.md');
		expect(deleteTask).toHaveBeenNthCalledWith(2, 'Tasks/b.md');
		expect(clearSelection).toHaveBeenCalledTimes(1);
		expect(nextSelection.size).toBe(0);
	});

	it('keeps selection unchanged when delete is cancelled', async () => {
		const confirmDelete = vi.fn(() => false);
		const deleteTask = vi.fn(async (_path: string) => {});
		const clearSelection = vi.fn(() => new Set<string>());
		const selectedPaths = makeSet(['Tasks/a.md', 'Tasks/b.md']);

		const nextSelection = await runBatchDelete({
			selectedPaths,
			confirmDelete,
			deleteTask,
			clearSelection,
		});

		expect(confirmDelete).toHaveBeenCalledWith(2);
		expect(deleteTask).not.toHaveBeenCalled();
		expect(clearSelection).not.toHaveBeenCalled();
		expect(nextSelection).toBe(selectedPaths);
	});
});
