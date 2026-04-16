import { Menu, Notice, Platform, Plugin, TFile } from 'obsidian';
import { get, writable, type Writable } from 'svelte/store';
import { type QuickActionId, type TTasksSettings, DEFAULT_SETTINGS, TTasksSettingTab, resolveConfiguredStatus, normalizeSettingsFromSources } from './settings';
import { TaskStore } from './store/TaskStore';
import { TaskBoardView, TASK_BOARD_VIEW_TYPE } from './views/TaskBoardView';
import { CreateTaskModal } from './modals/CreateTaskModal';
import { ReminderService } from './reminders';
import type { Task } from './types';
import { addTaskContextMenuItems } from './integration/contextMenu';
import { dispatchProtocolAction, parseProtocolAction } from './integration/protocol';
import { buildStatusSummary } from './integration/statusSummary';
import { pathToLinktext } from './integration/hoverLink';
import { TaskLinkSuggestModal } from './editor/TaskLinkSuggestModal';
import { buildAliasedLink } from './integration/relationshipLink';
import { TaskLinkEditorSuggest } from './editor/TaskLinkEditorSuggest';
import { localDateString, addDaysLocal } from './utils/dateUtils';

export type BoardViewMode = 'list' | 'kanban' | 'agenda' | 'graph';

export default class TTasksPlugin extends Plugin {
	settings!: TTasksSettings;
	taskStore!: TaskStore;
	reminderService!: ReminderService;
	activeTaskPath: Writable<string | null> = writable(null);
	activeViewMode: Writable<BoardViewMode | null> = writable(null);
	private statusBarEl: HTMLElement | null = null;
	private isApplyingExternalSettings = false;

	async onload() {
		await this.loadSettings();

		this.taskStore = new TaskStore(this);
		this.taskStore.register();
		this.registerEditorSuggest(new TaskLinkEditorSuggest(this.app, this));

		this.registerView(
			TASK_BOARD_VIEW_TYPE,
			leaf => new TaskBoardView(leaf, this)
		);
        this.registerHoverLinkSource('ttasks-board', { display: 'TTasks Board', defaultMod: true });

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
			id: 'insert-task-link',
			name: 'Insert task link',
			callback: () => this.openTaskLinkSuggest(),
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
			id: 'migrate-status-changed',
			name: 'Migrate status_changed field (backfill existing tasks)',
			callback: async () => {
				const count = await this.taskStore.migrateStatusChanged();
				new Notice(`TTasks: backfilled status_changed on ${count} task(s).`);
			},
		});

		this.addCommand({
			id: 'duplicate-task',
			name: 'Duplicate active task',
			checkCallback: (checking) => {
				const path = get(this.activeTaskPath);
				if (!path) return false;
				if (checking) return true;
				void this.taskStore.duplicate(path).then((task) => {
					if (task) {
						this.activeTaskPath.set(task.path);
						new Notice(`TTasks: duplicated as "${task.name}"`);
					}
				});
				return true;
			},
		});

		if (process.env.NODE_ENV !== 'production') {
			this.addCommand({
				id: 'seed-graph-test-data',
				name: 'Seed graph sandbox tasks',
				callback: () => this.taskStore.seedGraphTestData(),
			});
		}

		this.addSettingTab(new TTasksSettingTab(this.app, this));
		this.registerProtocolHandler();
		this.registerNativeContextMenus();
		this.initializeStatusBar();

		this.reminderService = new ReminderService(this);

		this.app.workspace.onLayoutReady(() => {
			this.taskStore.load();
			// MetadataCache may not be fully resolved when layout is ready.
			// Re-sync once the cache finishes indexing to pick up any tasks
			// that were skipped due to missing frontmatter on first pass.
			const resolvedRef = this.app.metadataCache.on('resolved', () => {
				this.app.metadataCache.offref(resolvedRef);
				this.taskStore.load();
			});
			this.registerEvent(resolvedRef);
			// Start reminders after tasks are loaded so the first check has data.
			void this.reminderService.start();
		});
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
		const persisted = await this.loadData();
		this.settings = normalizeSettingsFromSources([DEFAULT_SETTINGS, persisted]);
	}

	async saveSettings() {
		this.settings = normalizeSettingsFromSources([DEFAULT_SETTINGS, this.settings]);
		await this.saveData(this.settings);
	}

	async onExternalSettingsChange() {
		if (this.isApplyingExternalSettings) return;
		this.isApplyingExternalSettings = true;
		try {
			const previous = this.settings;
			const persisted = await this.loadData();
			const merged = normalizeSettingsFromSources([DEFAULT_SETTINGS, previous, persisted]);
			const changed = JSON.stringify(previous) !== JSON.stringify(merged);
			this.settings = merged;

			if (this.taskStore && changed) {
				await this.taskStore.load();
			}

			if (this.statusBarEl) {
				this.updateStatusBar();
			}

			// Canonicalize persisted settings to remove legacy keys and stale fields.
			await this.saveData(this.settings);
		} finally {
			this.isApplyingExternalSettings = false;
		}
	}

	log(msg: string) {
		console.log(`[TTasks] ${msg}`);
	}

	showTaskContextMenu(task: Task, event: MouseEvent): void {
		event.preventDefault();
		const menu = new Menu();
		addTaskContextMenuItems(menu, task, {
			openTask: (path) => {
				void this.taskStore.openDetail(path);
			},
			runQuickAction: (action, path) => this.runQuickAction(action, path),
			duplicateTask: async (path) => {
				const created = await this.taskStore.duplicate(path);
				if (created) {
					this.activeTaskPath.set(created.path);
					new Notice(`TTasks: duplicated as "${created.name}"`);
				}
			},
			deleteTask: (path) => this.taskStore.delete(path, { prompt: true }),
		});
		menu.showAtMouseEvent(event);
	}

	taskStoreTasksSnapshot(): Task[] {
		return get(this.taskStore.tasks);
	}

	triggerTaskHoverPreview(pathLike: string, event: MouseEvent): void {
		const linktext = pathToLinktext(pathLike);
		const sourcePath = this.app.workspace.getActiveFile()?.path ?? `${linktext}.md`;
		const payload = {
			event,
			source: 'ttasks-board',
			hoverParent: this,
			targetEl: event.currentTarget as HTMLElement | null,
			linktext,
			sourcePath,
		};
		(this.app.workspace as any).trigger('hover-link', payload);
	}

	openPluginSettings(): void {
		type SettingsHost = {
			setting?: {
				open?: () => void;
				openTabById?: (id: string) => void;
			};
			commands?: {
				executeCommandById?: (id: string) => void;
			};
		};

		const host = this.app as unknown as SettingsHost;
		if (host.setting?.open && host.setting.openTabById) {
			host.setting.open();
			host.setting.openTabById(this.manifest.id);
			return;
		}
		host.commands?.executeCommandById?.('app:open-settings');
	}

	private getTaskByPath(path: string): Task | null {
		const normalized = path.endsWith('.md') ? path : `${path}.md`;
		return get(this.taskStore.tasks).find(task => task.path === normalized) ?? null;
	}

	private registerProtocolHandler(): void {
		this.registerObsidianProtocolHandler('ttasks', (params) => {
			const parsed = parseProtocolAction(params as Record<string, unknown>);
			void dispatchProtocolAction(parsed, {
				openBoard: () => this.openBoard(),
				openTask: (path) => this.taskStore.openDetail(path),
				createTask: async () => { new CreateTaskModal(this.app, this).open(); },
				createProject: async () => { new CreateTaskModal(this.app, this, 'project').open(); },
				runQuickAction: (action, path) => this.runQuickAction(action, path),
				notice: (message) => { new Notice(message); },
			});
		});
	}

	private registerNativeContextMenus(): void {
		const addForTask = (menu: Menu, task: Task): void => {
			addTaskContextMenuItems(menu, task, {
				openTask: (path) => {
					void this.taskStore.openDetail(path);
				},
				runQuickAction: (action, path) => this.runQuickAction(action, path),
				duplicateTask: async (path) => {
					const created = await this.taskStore.duplicate(path);
					if (created) {
						this.activeTaskPath.set(created.path);
						new Notice(`TTasks: duplicated as "${created.name}"`);
					}
				},
				deleteTask: (path) => this.taskStore.delete(path, { prompt: true }),
			});
		};

		this.registerEvent(this.app.workspace.on('file-menu', (menu, file) => {
			if (!(file instanceof TFile)) return;
			const task = this.getTaskByPath(file.path);
			if (!task) return;
			addForTask(menu, task);
		}));

		this.registerEvent((this.app.workspace as any).on('editor-menu', (menu: Menu, _editor: unknown, view: { file?: TFile } | null) => {
			const file = view?.file;
			if (!(file instanceof TFile)) return;
			const task = this.getTaskByPath(file.path);
			if (!task) return;
			addForTask(menu, task);
		}));

		this.registerEvent((this.app.workspace as any).on('files-menu', (menu: Menu, files: unknown[]) => {
			const taskFiles = files
				.filter((file): file is TFile => file instanceof TFile)
				.map((file) => this.getTaskByPath(file.path))
				.filter((task): task is Task => task !== null);

			if (taskFiles.length === 1) {
				addForTask(menu, taskFiles[0]);
				return;
			}

			if (taskFiles.length > 1) {
				menu.addSeparator();
				menu.addItem((item) => {
					item.setTitle('Open TTasks board');
					item.setIcon('check-square');
					item.onClick(() => {
						void this.openBoard();
					});
				});
			}
		}));
	}

	private initializeStatusBar(): void {
		if (Platform.isMobile) return;
		this.statusBarEl = this.addStatusBarItem();
		this.statusBarEl.addClass('ttasks-statusbar');
		this.statusBarEl.style.cursor = 'pointer';
		this.statusBarEl.addEventListener('click', () => {
			void this.openBoard().then(() => {
				this.activeViewMode.set('agenda');
			});
		});

		const unsubscribe = this.taskStore.tasks.subscribe(() => {
			this.updateStatusBar();
		});
		this.register(() => unsubscribe());
		this.updateStatusBar();
	}

	private openTaskLinkSuggest(): void {
		const editor = this.app.workspace.activeEditor?.editor;
		if (!editor) {
			new Notice('TTasks: open a markdown editor to insert a task link.');
			return;
		}

		const sourcePath = this.app.workspace.getActiveFile()?.path ?? '';
		const tasks = get(this.taskStore.tasks);
		if (tasks.length === 0) {
			new Notice('TTasks: no tasks available to link.');
			return;
		}

		new TaskLinkSuggestModal(this.app, tasks, (task) => {
			const pathWithoutExt = task.path.replace(/\.md$/, '');
			const link = buildAliasedLink({
				targetPathWithoutExt: pathWithoutExt,
				alias: task.name,
				sourcePath,
				resolveFile: (path) => {
					const resolved = this.app.vault.getAbstractFileByPath(path);
					return resolved instanceof TFile ? resolved : null;
				},
				generateMarkdownLink: (file, src, subpath, alias) => this.app.fileManager.generateMarkdownLink(file, src, subpath, alias),
			});
			editor.replaceSelection(link);
		}).open();
	}

	private updateStatusBar(): void {
		if (!this.statusBarEl) return;
		const summary = buildStatusSummary(get(this.taskStore.tasks), {
			blockStatus: this.settings.quickActions.blockStatus,
		});
		this.statusBarEl.setText(summary.label);
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
			const base = task.due_date ?? localDateString();
			const newDate = addDaysLocal(base, days);
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
			? { status: targetStatus, completed: localDateString() }
			: action === 'start'
				? { status: targetStatus, completed: null, start_date: localDateString() }
				: { status: targetStatus, completed: null };

		await this.taskStore.update(resolvedPath, updates);
		if (showNotice) {
			const label = action === 'start' ? 'Started' : action === 'block' ? 'Blocked' : 'Completed';
			new Notice(`TTasks: ${label} "${task.name}"`);
		}
		return true;
	}
}
