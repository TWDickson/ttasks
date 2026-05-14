import { describe, expect, it } from 'vitest';
import {
	addToSelection,
	batchEligibility,
	clearSelection,
	removeFromSelection,
	selectAll,
	toggleSelection,
} from './taskSelection';

describe('addToSelection', () => {
	it('adds a path to an empty set', () => {
		const result = addToSelection(new Set(), 'Tasks/a.md');
		expect(result.has('Tasks/a.md')).toBe(true);
	});

	it('adds a path to a non-empty set', () => {
		const result = addToSelection(new Set(['Tasks/a.md']), 'Tasks/b.md');
		expect(result.size).toBe(2);
	});

	it('does not mutate the original set', () => {
		const original = new Set(['Tasks/a.md']);
		addToSelection(original, 'Tasks/b.md');
		expect(original.size).toBe(1);
	});

	it('is idempotent when path already in set', () => {
		const result = addToSelection(new Set(['Tasks/a.md']), 'Tasks/a.md');
		expect(result.size).toBe(1);
	});
});

describe('removeFromSelection', () => {
	it('removes a path from the set', () => {
		const result = removeFromSelection(new Set(['Tasks/a.md', 'Tasks/b.md']), 'Tasks/a.md');
		expect(result.has('Tasks/a.md')).toBe(false);
		expect(result.has('Tasks/b.md')).toBe(true);
	});

	it('is safe when path is not in set', () => {
		const result = removeFromSelection(new Set(['Tasks/a.md']), 'Tasks/missing.md');
		expect(result.size).toBe(1);
	});

	it('does not mutate the original set', () => {
		const original = new Set(['Tasks/a.md']);
		removeFromSelection(original, 'Tasks/a.md');
		expect(original.size).toBe(1);
	});
});

describe('toggleSelection', () => {
	it('adds path when not selected', () => {
		const result = toggleSelection(new Set(), 'Tasks/a.md');
		expect(result.has('Tasks/a.md')).toBe(true);
	});

	it('removes path when already selected', () => {
		const result = toggleSelection(new Set(['Tasks/a.md']), 'Tasks/a.md');
		expect(result.has('Tasks/a.md')).toBe(false);
	});
});

describe('selectAll', () => {
	it('creates a set from all paths', () => {
		const result = selectAll(['Tasks/a.md', 'Tasks/b.md', 'Tasks/c.md']);
		expect(result.size).toBe(3);
		expect(result.has('Tasks/b.md')).toBe(true);
	});

	it('returns empty set for empty array', () => {
		expect(selectAll([]).size).toBe(0);
	});
});

describe('clearSelection', () => {
	it('returns an empty set', () => {
		expect(clearSelection().size).toBe(0);
	});
});

describe('batchEligibility', () => {
	const completedTask = { path: 'Tasks/done.md', is_complete: true };
	const activeTask = { path: 'Tasks/active.md', is_complete: false };

	it('returns all false when selection is empty', () => {
		const result = batchEligibility(new Set(), [completedTask, activeTask]);
		expect(result).toEqual({ canArchive: false, canComplete: false, canDelete: false });
	});

	it('canArchive true when all selected tasks are complete', () => {
		const result = batchEligibility(new Set([completedTask.path]), [completedTask, activeTask]);
		expect(result.canArchive).toBe(true);
		expect(result.canDelete).toBe(true);
	});

	it('canArchive false when any selected task is not complete', () => {
		const result = batchEligibility(
			new Set([completedTask.path, activeTask.path]),
			[completedTask, activeTask],
		);
		expect(result.canArchive).toBe(false);
	});

	it('canComplete true when at least one selected task is not complete', () => {
		const result = batchEligibility(new Set([activeTask.path]), [completedTask, activeTask]);
		expect(result.canComplete).toBe(true);
	});

	it('canComplete false when all selected tasks are complete', () => {
		const result = batchEligibility(new Set([completedTask.path]), [completedTask, activeTask]);
		expect(result.canComplete).toBe(false);
	});

	it('canDelete always true when selection is non-empty', () => {
		expect(batchEligibility(new Set([activeTask.path]), [activeTask]).canDelete).toBe(true);
		expect(batchEligibility(new Set([completedTask.path]), [completedTask]).canDelete).toBe(true);
	});

	it('canArchive false when selected path not found in tasks list', () => {
		const result = batchEligibility(new Set(['Tasks/ghost.md']), [completedTask]);
		expect(result.canArchive).toBe(false);
	});
});
