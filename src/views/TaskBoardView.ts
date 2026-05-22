import { ItemView, WorkspaceLeaf } from 'obsidian';
import { get } from 'svelte/store';
import type TTasksPlugin from '../main';
import TaskBoard from '../components/TaskBoard.svelte';
import { type BoardShortcutId, DEFAULT_KEYMAP, isInputFocused, resolveShortcut } from '../integration/boardKeymap';
import { moveBoardFocus } from '../integration/boardFocus';
import { runArchiveAndClear } from '../integration/taskActionPorts';
import {
	createBoardStateService,
	type BoardStateStores,
} from '../store/BoardStateService';

export const TASK_BOARD_VIEW_TYPE = 'ttasks-board';

export class TaskBoardView extends ItemView {
	private plugin: TTasksPlugin;
	private component: TaskBoard | null = null;
	private boardState: BoardStateStores;

	constructor(leaf: WorkspaceLeaf, plugin: TTasksPlugin) {
		super(leaf);
		this.plugin = plugin;
		this.boardState = createBoardStateService({ defaultViewId: 'list' });
	}

	getViewType():    string { return TASK_BOARD_VIEW_TYPE; }
	getDisplayText(): string { return 'TTasks'; }
	getIcon():        string { return 'check-square'; }

	async onOpen(): Promise<void> {
		this.boardState = createBoardStateService({
			defaultViewId: 'list',
			activeTaskPath: this.plugin.activeTaskPath,
			focusedTaskPath: this.plugin.focusedTaskPath,
		});

		this.contentEl.addClass('tt-board-view');
		this.component = new TaskBoard({
			target: this.contentEl,
			props: { plugin: this.plugin, boardState: this.boardState },
		});

		this.registerDomEvent(document, 'keydown', (e: KeyboardEvent) => {
			// Only fire when this leaf is the active leaf
			if (this.app.workspace.activeLeaf !== this.leaf) return;
			// Don't intercept when user is typing in an input
			if (isInputFocused(document.activeElement)) return;

			const id = resolveShortcut(e, DEFAULT_KEYMAP);
			if (!id) return;

			e.preventDefault();
			this.handleShortcut(id);
		});
	}

	async onClose(): Promise<void> {
		this.component?.$destroy();
		this.component = null;
		this.contentEl.empty();
	}

	private getVisibleListTaskPaths(): string[] {
		return Array.from(this.contentEl.querySelectorAll<HTMLButtonElement>('.tt-list .tt-task-btn[data-task-path]'))
			.map((el) => el.dataset.taskPath)
			.filter((path): path is string => typeof path === 'string' && path.length > 0);
	}

	private moveFocusedTask(direction: 'next' | 'prev'): void {
		const paths = this.getVisibleListTaskPaths();
		const current = get(this.boardState.focusedTaskPath);
		const next = moveBoardFocus(paths, current, direction);
		if (next) this.boardState.focusedTaskPath.set(next);
	}

	private getActionPath(): string | null {
		return get(this.boardState.focusedTaskPath) ?? get(this.boardState.activeTaskPath);
	}

	private handleShortcut(id: BoardShortcutId): void {
		switch (id) {
			case 'next':
				this.moveFocusedTask('next');
				break;
			case 'prev':
				this.moveFocusedTask('prev');
				break;
			case 'newTask':
				this.plugin.openNewTask();
				break;
			case 'escape':
				if (get(this.boardState.activeTaskPath) !== null) {
					this.boardState.activeTaskPath.set(null);
				} else {
					this.boardState.focusedTaskPath.set(null);
				}
				break;
			case 'open':
			case 'start':
			case 'complete':
			case 'defer':
			case 'archive': {
				const path = this.getActionPath();
				if (!path) break;
				if (id === 'open') {
					this.boardState.focusedTaskPath.set(path);
					void this.plugin.taskStore.openDetail(path);
				} else if (id === 'archive') {
					void runArchiveAndClear(path, {
						archiveTask: (taskPath) => this.plugin.archiveService.archiveTask(taskPath),
						setActiveTaskPath: (nextPath) => this.boardState.activeTaskPath.set(nextPath),
					});
				} else {
					const action = id as 'start' | 'complete' | 'defer';
					void this.plugin.runQuickAction(action, path);
				}
				break;
			}
			case 'search': {
				const searchInput = this.contentEl.querySelector<HTMLInputElement>('.tt-search-input');
				searchInput?.focus();
				break;
			}
		}
	}
}
