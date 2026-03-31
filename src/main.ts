import { Plugin, WorkspaceLeaf } from 'obsidian';
import { type TTasksSettings, DEFAULT_SETTINGS, TTasksSettingTab } from './settings';
import { TaskStore } from './store/TaskStore';
import { TaskListView, TASK_LIST_VIEW_TYPE } from './views/TaskListView';

export default class TTasksPlugin extends Plugin {
	settings!: TTasksSettings;
	taskStore!: TaskStore;

	async onload() {
		await this.loadSettings();

		this.taskStore = new TaskStore(this);
		this.taskStore.register();

		this.registerView(
			TASK_LIST_VIEW_TYPE,
			leaf => new TaskListView(leaf, this)
		);

		this.addRibbonIcon('check-square', 'TTasks', () => this.openTaskList());

		this.addCommand({
			id: 'open-task-list',
			name: 'Open task list',
			callback: () => this.openTaskList(),
		});

		this.addSettingTab(new TTasksSettingTab(this.app, this));

		// Load tasks once the layout is ready
		this.app.workspace.onLayoutReady(() => this.taskStore.load());
	}

	onunload() {
		this.app.workspace.detachLeavesOfType(TASK_LIST_VIEW_TYPE);
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
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
