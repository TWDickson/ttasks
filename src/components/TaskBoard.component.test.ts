// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/svelte';
import { writable, type Writable } from 'svelte/store';

vi.mock('obsidian', async () => {
	const actual = await vi.importActual<typeof import('obsidian')>('obsidian');
	class Menu {
		addItem(cb: (item: { setTitle: () => any; setIcon: () => any; onClick: () => any }) => void) {
			const item = {
				setTitle: () => item,
				setIcon: () => item,
				onClick: () => item,
			};
			cb(item);
			return this;
		}
		showAtMouseEvent() {}
	}
	return { ...actual, Menu };
});

import TaskBoard from './TaskBoard.svelte';

type ModeListener = (value: string | null) => void;

function createTrackedModeStore(initial: string | null = null) {
	let value = initial;
	const listeners = new Set<ModeListener>();
	const setHistory: Array<string | null> = [];

	return {
		subscribe(listener: ModeListener) {
			listeners.add(listener);
			listener(value);
			return () => {
				listeners.delete(listener);
			};
		},
		set(next: string | null) {
			value = next;
			setHistory.push(next);
			for (const listener of [...listeners]) listener(next);
		},
		countSubscribers() {
			return listeners.size;
		},
		countNullResets() {
			return setHistory.filter((entry) => entry === null).length;
		},
		clearHistory() {
			setHistory.length = 0;
		},
	};
}

function buildPlugin(activeViewMode: ReturnType<typeof createTrackedModeStore>) {
	const activeTaskPath: Writable<string | null> = writable(null);
	const focusedTaskPath: Writable<string | null> = writable(null);

	return {
		app: {},
		settings: {
			customViews: [],
			statuses: ['Active', 'Blocked', 'Done'],
			statusColors: {},
			areaColors: {},
			labelColors: {},
			areas: [],
			labelValues: [],
			completionStatus: 'Done',
			logbookRendererMode: 'list',
			kanbanCardFields: ['area', 'labels'],
			quickActions: { blockStatus: 'Blocked' },
			fabPosition: 'hidden',
		},
		taskStore: {
			tasks: writable([]),
			openDetail: vi.fn(),
			restore: vi.fn(async () => {}),
			update: vi.fn(async () => {}),
			delete: vi.fn(async () => {}),
			updateParentTask: vi.fn(async () => {}),
			completeAndRecur: vi.fn(async () => null),
			addDependency: vi.fn(async () => {}),
			removeDependency: vi.fn(async () => {}),
			openFile: vi.fn(),
			updateNotes: vi.fn(async (_path: string, notes: string) => notes),
			getByPath: vi.fn(() => null),
		},
		scanEngine: {
			tasks: writable([]),
		},
		archiveService: {
			archiveTask: vi.fn(async () => {}),
		},
		activeTaskPath,
		focusedTaskPath,
		activeViewMode,
		saveSettings: vi.fn(async () => {}),
		openPluginSettings: vi.fn(),
		showTaskContextMenu: vi.fn(),
		triggerTaskHoverPreview: vi.fn(),
	};
}

describe('TaskBoard.svelte', () => {
	it('unsubscribes from activeViewMode on destroy', () => {
		const activeViewMode = createTrackedModeStore();
		const view = render(TaskBoard, {
			props: {
				plugin: buildPlugin(activeViewMode),
			},
		});

		expect(activeViewMode.countSubscribers()).toBe(1);

		view.unmount();

		expect(activeViewMode.countSubscribers()).toBe(0);
	});

	it('does not duplicate activeViewMode handling across unmount/remount', () => {
		const activeViewMode = createTrackedModeStore();
		const firstMount = render(TaskBoard, {
			props: {
				plugin: buildPlugin(activeViewMode),
			},
		});
		firstMount.unmount();

		const secondMount = render(TaskBoard, {
			props: {
				plugin: buildPlugin(activeViewMode),
			},
		});

		activeViewMode.clearHistory();
		activeViewMode.set('kanban');

		expect(activeViewMode.countNullResets()).toBe(1);

		secondMount.unmount();
	});
});
