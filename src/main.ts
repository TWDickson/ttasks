import { Notice, Plugin, WorkspaceLeaf } from 'obsidian';
import { writable, type Writable } from 'svelte/store';
import { type TTasksSettings, DEFAULT_SETTINGS, TTasksSettingTab } from './settings';
import { TaskStore } from './store/TaskStore';
import { TaskListView, TASK_LIST_VIEW_TYPE } from './views/TaskListView';
import { TaskDetailView, TASK_DETAIL_VIEW_TYPE } from './views/TaskDetailView';
import { CreateTaskModal } from './modals/CreateTaskModal';

export default class TTasksPlugin extends Plugin {
	settings!: TTasksSettings;
	taskStore!: TaskStore;
	activeTaskPath: Writable<string | null> = writable(null);

	async onload() {
		await this.loadSettings();

		this.taskStore = new TaskStore(this);
		this.taskStore.register();

		this.registerView(
			TASK_LIST_VIEW_TYPE,
			leaf => new TaskListView(leaf, this)
		);

		this.registerView(
			TASK_DETAIL_VIEW_TYPE,
			leaf => new TaskDetailView(leaf, this)
		);

		this.addRibbonIcon('check-square', 'TTasks', () => this.openTaskList());

		this.addCommand({
			id: 'open-task-list',
			name: 'Open task list',
			callback: () => this.openTaskList(),
		});

		this.addCommand({
			id: 'new-task',
			name: 'New task',
			callback: () => new CreateTaskModal(this.app, this).open(),
		});

		this.addSettingTab(new TTasksSettingTab(this.app, this));

		// Load tasks once the layout is ready
		this.app.workspace.onLayoutReady(() => this.taskStore.load());
	}

	onunload() {
		this.app.workspace.detachLeavesOfType(TASK_LIST_VIEW_TYPE);
		this.app.workspace.detachLeavesOfType(TASK_DETAIL_VIEW_TYPE);
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	debug(msg: string) {
		if (this.settings.debug) new Notice(`TTasks: ${msg}`, 8000);
		console.log(`[TTasks] ${msg}`);
	}

	private async openTaskList(): Promise<void> {
		const existing = this.app.workspace.getLeavesOfType(TASK_LIST_VIEW_TYPE);
		if (existing.length > 0) {
			this.app.workspace.revealLeaf(existing[0]);
			return;
		}
		const leaf = this.app.workspace.getLeftLeaf(false) as WorkspaceLeaf;
		await leaf.setViewState({ type: TASK_LIST_VIEW_TYPE, active: true });
		this.app.workspace.revealLeaf(leaf);
	}
}
