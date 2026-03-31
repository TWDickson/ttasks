import { ItemView, WorkspaceLeaf } from 'obsidian';
import type TTasksPlugin from '../main';
import TaskBoard from '../components/TaskBoard.svelte';

export const TASK_BOARD_VIEW_TYPE = 'ttasks-board';

export class TaskBoardView extends ItemView {
	private plugin: TTasksPlugin;
	private component: TaskBoard | null = null;

	constructor(leaf: WorkspaceLeaf, plugin: TTasksPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType():    string { return TASK_BOARD_VIEW_TYPE; }
	getDisplayText(): string { return 'TTasks'; }
	getIcon():        string { return 'check-square'; }

	async onOpen(): Promise<void> {
		this.contentEl.addClass('tt-board-view');
		this.component = new TaskBoard({
			target: this.contentEl,
			props: { plugin: this.plugin },
		});
	}

	async onClose(): Promise<void> {
		this.component?.$destroy();
		this.component = null;
		this.contentEl.empty();
	}
}
