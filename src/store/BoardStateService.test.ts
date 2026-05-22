import { describe, expect, it } from 'vitest';
import { get, writable } from 'svelte/store';
import {
	clearSelectionOnViewChange,
	createBoardStateService,
	isTaskActive,
	isViewActive,
} from './BoardStateService';

describe('createBoardStateService', () => {
	it('creates all stores with default values', () => {
		const state = createBoardStateService({ defaultViewId: 'list' });

		expect(get(state.activeTaskPath)).toBeNull();
		expect(get(state.focusedTaskPath)).toBeNull();
		expect(get(state.currentViewId)).toBe('list');
		expect(get(state.searchQuery)).toBe('');
		expect(get(state.selectedPaths).size).toBe(0);
	});

	it('uses provided active and focused stores', () => {
		const activeTaskPath = writable<string | null>('Tasks/a.md');
		const focusedTaskPath = writable<string | null>('Tasks/b.md');
		const state = createBoardStateService({
			defaultViewId: 'list',
			activeTaskPath,
			focusedTaskPath,
		});

		expect(get(state.activeTaskPath)).toBe('Tasks/a.md');
		expect(get(state.focusedTaskPath)).toBe('Tasks/b.md');
	});
});

describe('isTaskActive', () => {
	it('returns true when paths match', () => {
		const activeTaskPath = writable<string | null>('Tasks/a.md');
		expect(get(isTaskActive(activeTaskPath, 'Tasks/a.md'))).toBe(true);
	});

	it('updates reactively when active task path changes', () => {
		const activeTaskPath = writable<string | null>('Tasks/a.md');
		const active = isTaskActive(activeTaskPath, 'Tasks/b.md');
		expect(get(active)).toBe(false);
		activeTaskPath.set('Tasks/b.md');
		expect(get(active)).toBe(true);
	});
});

describe('isViewActive', () => {
	it('returns true when view IDs match', () => {
		const currentViewId = writable('list');
		expect(get(isViewActive(currentViewId, 'list'))).toBe(true);
	});

	it('updates reactively when current view changes', () => {
		const currentViewId = writable('list');
		const active = isViewActive(currentViewId, 'kanban');
		expect(get(active)).toBe(false);
		currentViewId.set('kanban');
		expect(get(active)).toBe(true);
	});
});

describe('clearSelectionOnViewChange', () => {
	it('clears selection when view changes', () => {
		const currentViewId = writable('list');
		const selectedPaths = writable(new Set(['Tasks/a.md', 'Tasks/b.md']));
		const unsubscribe = clearSelectionOnViewChange(currentViewId, selectedPaths);

		currentViewId.set('kanban');
		expect(get(selectedPaths).size).toBe(0);

		unsubscribe();
	});

	it('does not clear selection when same view value is set', () => {
		const currentViewId = writable('list');
		const selectedPaths = writable(new Set(['Tasks/a.md']));
		const unsubscribe = clearSelectionOnViewChange(currentViewId, selectedPaths);

		currentViewId.set('list');
		expect(get(selectedPaths).size).toBe(1);

		unsubscribe();
	});

	it('unsubscribe stops side effects', () => {
		const currentViewId = writable('list');
		const selectedPaths = writable(new Set(['Tasks/a.md']));
		const unsubscribe = clearSelectionOnViewChange(currentViewId, selectedPaths);
		unsubscribe();

		currentViewId.set('kanban');
		expect(get(selectedPaths).size).toBe(1);
	});
});
