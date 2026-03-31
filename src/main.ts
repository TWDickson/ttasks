import { Plugin } from 'obsidian';
import { writable, type Writable } from 'svelte/store';
import { type TTasksSettings, DEFAULT_SETTINGS, TTasksSettingTab } from './settings';
import { TaskStore } from './store/TaskStore';
import { TaskBoardView, TASK_BOARD_VIEW_TYPE } from './views/TaskBoardView';
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
			TASK_BOARD_VIEW_TYPE,
			leaf => new TaskBoardView(leaf, this)
		);

		this.addRibbonIcon('check-square', 'TTasks', () => this.openBoard());

		this.addCommand({
			id: 'open-board',
			name: 'Open board',
			callback: () => this.openBoard(),
		});

		this.addCommand({
			id: 'new-task',
			name: 'New task',
			callback: () => new CreateTaskModal(this.app, this).open(),
		});

		this.addCommand({
			id: 'new-project',
			name: 'New project',
			callback: () => new CreateTaskModal(this.app, this, 'project').open(),
		});

		this.addSettingTab(new TTasksSettingTab(this.app, this));

		this.app.workspace.onLayoutReady(() => this.taskStore.load());
	}

	onunload() {
		this.app.workspace.detachLeavesOfType(TASK_BOARD_VIEW_TYPE);
	}

	async openBoard(): Promise<void> {
		const existing = this.app.workspace.getLeavesOfType(TASK_BOARD_VIEW_TYPE);
		if (existing.length > 0) {
			this.app.workspace.revealLeaf(existing[0]);
			return;
		}
		const leaf = this.app.workspace.getLeaf('tab');
		await leaf.setViewState({ type: TASK_BOARD_VIEW_TYPE, active: true });
		this.app.workspace.revealLeaf(leaf);
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	log(msg: string) {
		console.log(`[TTasks] ${msg}`);
	}
}
