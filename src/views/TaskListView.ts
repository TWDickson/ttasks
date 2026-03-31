import { ItemView, WorkspaceLeaf } from 'obsidian';
import type TTasksPlugin from '../main';
import TaskList from '../components/TaskList.svelte';

export const TASK_LIST_VIEW_TYPE = 'ttasks-list';

export class TaskListView extends ItemView {
	private plugin: TTasksPlugin;
	private component: TaskList | null = null;

	constructor(leaf: WorkspaceLeaf, plugin: TTasksPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string { return TASK_LIST_VIEW_TYPE; }
	getDisplayText(): string { return 'TTasks'; }
	getIcon(): string { return 'check-square'; }

	async onOpen(): Promise<void> {
		this.component = new TaskList({
			target: this.contentEl,
			props: {
				tasks: this.plugin.taskStore.tasks,
				onOpen: (path: string) => this.plugin.taskStore.openFile(path),
			},
		});
	}

	async onClose(): Promise<void> {
		this.component?.$destroy();
		this.component = null;
	}
}
