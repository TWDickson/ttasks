import { ItemView, type ViewStateResult, WorkspaceLeaf, setIcon } from 'obsidian';
import { get } from 'svelte/store';
import type TTasksPlugin from '../main';
import type { Task } from '../types';
import TaskDetail from '../components/TaskDetail.svelte';
import { combineBoardTasks } from '../store/BoardStateService';
import { resolveDetailHeaderActions } from './detailHeaderActions';

export const TASK_DETAIL_VIEW_TYPE = 'ttasks-detail';

/**
 * Right-sidebar leaf hosting the task detail form. On mobile the right sidebar
 * is a drawer, so revealing this leaf slides the detail over the main view —
 * the sidebar chrome (tab header, collapse, drawer gestures) replaces the old
 * in-board overlay, backdrop, and Back/Close topbar.
 */
export class TaskDetailView extends ItemView {
	private plugin: TTasksPlugin;
	private component: TaskDetail | null = null;
	private completeActionEl: HTMLElement | null = null;
	private editActionEl: HTMLElement | null = null;

	constructor(leaf: WorkspaceLeaf, plugin: TTasksPlugin) {
		super(leaf);
		this.plugin = plugin;
		this.navigation = false;
	}

	getViewType():    string { return TASK_DETAIL_VIEW_TYPE; }
	getDisplayText(): string { return 'Task details'; }
	getIcon():        string { return 'panel-right'; }

	async onOpen(): Promise<void> {
		this.contentEl.addClass('tt-detail-view');

		// Native header actions (P6/N1): reachable without scrolling on desktop
		// and in the mobile drawer header alike.
		this.completeActionEl = this.addAction('check', 'Mark complete', () => {
			void this.runCompleteAction();
		});
		this.editActionEl = this.addAction('pencil', 'Open in editor', () => {
			const task = this.getActiveTask();
			if (task) void this.plugin.taskStore.openFile(task.path);
		});
		const refresh = () => this.updateHeaderActions();
		this.register(this.plugin.boardState.activeTaskPath.subscribe(refresh));
		this.register(this.plugin.taskStore.tasks.subscribe(refresh));

		// N2: persist the selected task path into Obsidian's workspace layout so a
		// restart restores the same selection. Skip the initial subscribe emit so
		// merely opening the leaf doesn't request a layout save.
		let skipInitialPathEmit = true;
		this.register(this.plugin.boardState.activeTaskPath.subscribe(() => {
			if (skipInitialPathEmit) { skipInitialPathEmit = false; return; }
			this.app.workspace.requestSaveLayout();
		}));

		this.component = new TaskDetail({
			target: this.contentEl,
			props: {
				plugin: this.plugin,
				tasks: combineBoardTasks(this.plugin.taskStore.tasks, this.plugin.scanEngine.tasks),
				activeTaskPath: this.plugin.boardState.activeTaskPath,
				store: this.plugin.taskStore,
			},
		});
	}

	async onClose(): Promise<void> {
		this.component?.$destroy();
		this.component = null;
		this.completeActionEl = null;
		this.editActionEl = null;
		this.contentEl.empty();
	}

	/**
	 * N2: snapshot the selected task path for workspace layout persistence.
	 */
	getState(): Record<string, unknown> {
		return {
			...super.getState(),
			taskPath: get(this.plugin.boardState.activeTaskPath),
		};
	}

	async setState(state: unknown, result: ViewStateResult): Promise<void> {
		if (state && typeof state === 'object') {
			const taskPath = (state as { taskPath?: unknown }).taskPath;
			// Apply optimistically: the store loads async, so getByPath may miss on
			// startup. The component's reactive derivation resolves the path once
			// tasks are parsed; if it never exists the pane just shows empty state.
			if (typeof taskPath === 'string' && taskPath) {
				this.plugin.boardState.activeTaskPath.set(taskPath);
			}
		}
		await super.setState(state, result);
	}

	/**
	 * Native task behind the current selection, or null. Captured (external)
	 * tasks aren't in the store, so the header actions hide for them — their
	 * lifecycle is Promote, not complete/edit.
	 */
	private getActiveTask(): Task | null {
		const path = get(this.plugin.boardState.activeTaskPath);
		return path ? (this.plugin.taskStore.getByPath(path) ?? null) : null;
	}

	private updateHeaderActions(): void {
		if (!this.completeActionEl || !this.editActionEl) return;
		const state = resolveDetailHeaderActions(this.getActiveTask());
		this.completeActionEl.toggleClass('tt-view-action-hidden', state.hidden);
		this.editActionEl.toggleClass('tt-view-action-hidden', state.hidden);
		setIcon(this.completeActionEl, state.completeIcon);
		this.completeActionEl.setAttribute('aria-label', state.completeLabel);
	}

	private async runCompleteAction(): Promise<void> {
		const task = this.getActiveTask();
		if (!task) return;
		if (task.is_complete) {
			// Same reopen path as the context menu — clears completed/blocked_reason.
			await this.plugin.taskStore.restore(task.path);
			return;
		}
		// Quick-action path stamps completion and recurs (guarded) like the board.
		await this.plugin.runQuickAction('complete', task.path);
	}
}
