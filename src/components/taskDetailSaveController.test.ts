import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Task } from '../types';
import { createTaskDetailSaveController, normalizeDateValue } from './taskDetailSaveController';

describe('normalizeDateValue', () => {
	it('returns null for blank values', () => {
		expect(normalizeDateValue('')).toBeNull();
	});

	it('returns null for non-YYYY-MM-DD values', () => {
		expect(normalizeDateValue('2026/05/19')).toBeNull();
		expect(normalizeDateValue('invalid')).toBeNull();
	});

	it('returns value for YYYY-MM-DD format', () => {
		expect(normalizeDateValue('2026-05-19')).toBe('2026-05-19');
	});
});

describe('createTaskDetailSaveController', () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it('saves immediately using active task path and reports pending transitions', async () => {
		const updateTask = vi.fn(async (_taskPath: string, _updates: Partial<Task>) => {});
		const pendingStates: number[] = [];

		const controller = createTaskDetailSaveController({
			updateTask,
			getActiveTaskPath: () => 'Tasks/a.md',
			onPendingChange: (count) => pendingStates.push(count),
		});

		await controller.saveImmediate({ name: 'A' } as Partial<Task>);

		expect(updateTask).toHaveBeenCalledTimes(1);
		expect(updateTask).toHaveBeenCalledWith('Tasks/a.md', { name: 'A' });
		expect(pendingStates).toEqual([1, 0]);
	});

	it('debounces by key and only keeps the latest payload', async () => {
		vi.useFakeTimers();
		const updateTask = vi.fn(async (_taskPath: string, _updates: Partial<Task>) => {});
		const controller = createTaskDetailSaveController({
			updateTask,
			getActiveTaskPath: () => 'Tasks/a.md',
		});

		controller.saveDebounced('name', { name: 'First' } as Partial<Task>);
		controller.saveDebounced('name', { name: 'Second' } as Partial<Task>);

		await vi.advanceTimersByTimeAsync(600);

		expect(updateTask).toHaveBeenCalledTimes(1);
		expect(updateTask).toHaveBeenCalledWith('Tasks/a.md', { name: 'Second' });
	});

	it('captures task path at schedule time for debounced saves', async () => {
		vi.useFakeTimers();
		const updateTask = vi.fn(async (_taskPath: string, _updates: Partial<Task>) => {});
		let activePath: string | null = 'Tasks/a.md';
		const controller = createTaskDetailSaveController({
			updateTask,
			getActiveTaskPath: () => activePath,
		});

		controller.saveDebounced('assigned_to', { assigned_to: 'Taylor' } as Partial<Task>);
		activePath = 'Tasks/b.md';
		await vi.advanceTimersByTimeAsync(600);

		expect(updateTask).toHaveBeenCalledTimes(1);
		expect(updateTask).toHaveBeenCalledWith('Tasks/a.md', { assigned_to: 'Taylor' });
	});

	it('runWithPending restores pending state when work throws', async () => {
		const updateTask = vi.fn(async (_taskPath: string, _updates: Partial<Task>) => {});
		const pendingStates: number[] = [];
		const controller = createTaskDetailSaveController({
			updateTask,
			getActiveTaskPath: () => 'Tasks/a.md',
			onPendingChange: (count) => pendingStates.push(count),
		});

		await expect(controller.runWithPending(async () => {
			throw new Error('boom');
		})).rejects.toThrow('boom');

		expect(pendingStates).toEqual([1, 0]);
	});
});
