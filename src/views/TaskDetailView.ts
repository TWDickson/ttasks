import { ItemView, WorkspaceLeaf } from 'obsidian';
import type TTasksPlugin from '../main';
import TaskDetail from '../components/TaskDetail.svelte';
import { combineBoardTasks } from '../store/BoardStateService';

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
		this.contentEl.empty();
	}
}
