import { ItemView, WorkspaceLeaf } from 'obsidian';
import type TTasksPlugin from '../main';
import TaskDetail from '../components/TaskDetail.svelte';

export const TASK_DETAIL_VIEW_TYPE = 'ttasks-detail';

export class TaskDetailView extends ItemView {
	private plugin: TTasksPlugin;
	private component: TaskDetail | null = null;

	constructor(leaf: WorkspaceLeaf, plugin: TTasksPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string { return TASK_DETAIL_VIEW_TYPE; }
	getDisplayText(): string { return 'Task Detail'; }
	getIcon(): string { return 'file-text'; }

	async onOpen(): Promise<void> {
		this.component = new TaskDetail({
			target: this.contentEl,
			props: {
				tasks: this.plugin.taskStore.tasks,
				activeTaskPath: this.plugin.activeTaskPath,
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
