import { ItemView, type ViewStateResult, WorkspaceLeaf } from 'obsidian';
import { get } from 'svelte/store';
import type TTasksPlugin from '../main';
import TaskBoard from '../components/TaskBoard.svelte';
import { type BoardShortcutId, DEFAULT_KEYMAP, isInputFocused, resolveShortcut } from '../integration/boardKeymap';
import { moveBoardFocus } from '../integration/boardFocus';
import { runArchiveAndClear } from '../integration/taskActionPorts';
import type { BoardStateStores } from '../store/BoardStateService';
import { resolveTaskViewDefinition } from './viewRegistry';

export const TASK_BOARD_VIEW_TYPE = 'ttasks-board';

export class TaskBoardView extends ItemView {
	private plugin: TTasksPlugin;
	private component: TaskBoard | null = null;
	private boardState: BoardStateStores;

	constructor(leaf: WorkspaceLeaf, plugin: TTasksPlugin) {
		super(leaf);
		this.plugin = plugin;
		// Board state is plugin-owned so the rail and detail leaves share it.
		this.boardState = plugin.boardState;
	}

	getViewType():    string { return TASK_BOARD_VIEW_TYPE; }
	getDisplayText(): string { return 'TTasks'; }
	getIcon():        string { return 'check-square'; }

	async onOpen(): Promise<void> {
		this.contentEl.addClass('tt-board-view');

		// Native header actions (N1). addAction prepends, so add the rescan
		// first to keep "New task" as the leftmost, most prominent action.
		this.addAction('refresh-cw', 'Rescan tasks', () => {
			void this.plugin.taskStore.load();
		});
		this.addAction('plus', 'New task', () => {
			this.plugin.openNewTask();
		});

		this.component = new TaskBoard({
			target: this.contentEl,
			props: { plugin: this.plugin, boardState: this.boardState },
		});

		// N2: persist the current view id into Obsidian's workspace layout so a
		// restart (or saved workspace) reopens the same view / Smart List. The
		// subscribe fires once immediately with the current value — skip that so
		// opening the leaf doesn't trigger a spurious layout save.
		let skipInitialViewEmit = true;
		this.register(this.boardState.currentViewId.subscribe(() => {
			if (skipInitialViewEmit) { skipInitialViewEmit = false; return; }
			this.app.workspace.requestSaveLayout();
		}));

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

	/**
	 * N2: snapshot the shared board state (view / Smart List id) for workspace
	 * layout persistence. State stays small and serializable — an id only, no
	 * Task objects.
	 */
	getState(): Record<string, unknown> {
		return {
			...super.getState(),
			viewId: get(this.boardState.currentViewId),
		};
	}

	async setState(state: unknown, result: ViewStateResult): Promise<void> {
		if (state && typeof state === 'object') {
			const viewId = (state as { viewId?: unknown }).viewId;
			// Guard against unknown/deleted Smart List ids: only apply a saved id
			// that still resolves to a registered view, else keep the default.
			if (typeof viewId === 'string' && resolveTaskViewDefinition(this.plugin.settings, viewId)) {
				this.boardState.currentViewId.set(viewId);
			}
		}
		await super.setState(state, result);
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
