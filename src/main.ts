import { Notice, Plugin } from 'obsidian';
import { get, writable, type Writable } from 'svelte/store';
import { type QuickActionId, type TTasksSettings, DEFAULT_SETTINGS, TTasksSettingTab, normalizeStatuses, normalizeColorMap, resolveCompletionStatus, resolveConfiguredStatus } from './settings';
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

		this.addCommand({
			id: 'sync-blocks',
			name: 'Sync blocks (rebuild reverse index)',
			callback: () => this.taskStore.syncBlocks(),
		});

		this.addCommand({
			id: 'migrate-css-classes',
			name: 'Migrate CSS classes (add ttask to existing notes)',
			callback: () => this.taskStore.migrateCssClasses(),
		});

		this.addCommand({
			id: 'quick-start',
			name: 'Quick action: Start task',
			callback: () => this.runQuickAction('start'),
		});

		this.addCommand({
			id: 'quick-complete',
			name: 'Quick action: Complete task',
			callback: () => this.runQuickAction('complete'),
		});

		this.addCommand({
			id: 'quick-block',
			name: 'Quick action: Block task',
			callback: () => this.runQuickAction('block'),
		});

		this.addCommand({
			id: 'quick-defer',
			name: 'Quick action: Defer task',
			callback: () => this.runQuickAction('defer'),
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
		this.settings.quickActions = Object.assign({}, DEFAULT_SETTINGS.quickActions, this.settings.quickActions ?? {});
		this.settings.statuses = normalizeStatuses(this.settings.statuses);
		this.settings.completionStatus = resolveCompletionStatus(this.settings.statuses, this.settings.completionStatus);
		this.settings.quickActions.startStatus = resolveConfiguredStatus(this.settings.statuses, this.settings.quickActions.startStatus, DEFAULT_SETTINGS.quickActions.startStatus);
		this.settings.quickActions.blockStatus = resolveConfiguredStatus(this.settings.statuses, this.settings.quickActions.blockStatus, DEFAULT_SETTINGS.quickActions.blockStatus);
		this.settings.statusColors = normalizeColorMap(this.settings.statuses, this.settings.statusColors);
		this.settings.categoryColors = normalizeColorMap(this.settings.categories ?? [], this.settings.categoryColors);
		this.settings.taskTypeColors = normalizeColorMap(this.settings.taskTypes ?? [], this.settings.taskTypeColors);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	log(msg: string) {
		console.log(`[TTasks] ${msg}`);
	}

	async runQuickAction(action: QuickActionId, path?: string, options?: { showNotice?: boolean }): Promise<boolean> {
		const showNotice = options?.showNotice ?? true;
		if (action === 'none') return false;

		const resolvedPath = path ?? get(this.activeTaskPath);
		if (!resolvedPath) {
			if (showNotice) new Notice('TTasks: no task selected - open a task in the detail panel first.');
			return false;
		}

		const task = get(this.taskStore.tasks).find(t => t.path === resolvedPath);
		if (!task) {
			if (showNotice) new Notice('TTasks: selected task not found.');
			return false;
		}

		if (action === 'defer') {
			const days = this.settings.quickActions.deferDays;
			const base = task.due_date ?? new Date().toISOString().slice(0, 10);
			const date = new Date(base + 'T00:00:00');
			date.setDate(date.getDate() + days);
			const newDate = date.toISOString().slice(0, 10);
			await this.taskStore.update(resolvedPath, { due_date: newDate });
			if (showNotice) new Notice(`TTasks: Deferred "${task.name}" to ${newDate}`);
			return true;
		}

		const completionStatus = this.settings.completionStatus;
		const startStatus = resolveConfiguredStatus(this.settings.statuses, this.settings.quickActions.startStatus, DEFAULT_SETTINGS.quickActions.startStatus);
		const blockStatus = resolveConfiguredStatus(this.settings.statuses, this.settings.quickActions.blockStatus, DEFAULT_SETTINGS.quickActions.blockStatus);
		const targetStatus = action === 'start'
			? startStatus
			: action === 'block'
				? blockStatus
				: completionStatus;

		if (!this.settings.statuses.includes(targetStatus)) {
			if (showNotice) new Notice(`TTasks: status "${targetStatus}" is not configured - check Quick Actions settings.`);
			return false;
		}

		const updates = action === 'complete'
			? { status: targetStatus, completed: new Date().toISOString().slice(0, 10) }
			: { status: targetStatus, completed: null };

		await this.taskStore.update(resolvedPath, updates);
		if (showNotice) {
			const label = action === 'start' ? 'Started' : action === 'block' ? 'Blocked' : 'Completed';
			new Notice(`TTasks: ${label} "${task.name}"`);
		}
		return true;
	}
}
