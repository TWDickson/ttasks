import { Menu, Notice, Platform, Plugin, setTooltip, TFile } from 'obsidian';
import { get, writable, type Writable } from 'svelte/store';
import {
	type QuickActionId,
	type TTasksSettings,
	DEFAULT_SETTINGS,
	TTasksSettingTab,
	resolveConfiguredStatus,
	normalizeSettingsFromSources,
} from './settings';
import {
	buildAutoDetectedSources,
	mergeAutoDetectedSources,
} from './settings/captureSourcesSettings';
import { TaskStore } from './store/TaskStore';
import { TaskBoardView, TASK_BOARD_VIEW_TYPE } from './views/TaskBoardView';
import { TaskRailView, TASK_RAIL_VIEW_TYPE } from './views/TaskRailView';
import { TaskDetailView, TASK_DETAIL_VIEW_TYPE } from './views/TaskDetailView';
import { createBoardStateService, type BoardStateStores } from './store/BoardStateService';
import { resolveTaskViewId } from './views/viewRegistry';
import { CreateTaskModal } from './modals/CreateTaskModal';
import { ReminderService } from './store/ReminderService';
import type { Task } from './types';
import { addTaskContextMenuItems, type TaskContextMenuDeps } from './integration/contextMenu';
import { resolveQuickAction } from './integration/quickActions';
import { ArchiveService } from './store/ArchiveService';
import { PomodoroService } from './store/PomodoroService';
import { dispatchProtocolAction, parseProtocolAction } from './integration/protocol';
import { buildStatusSummary } from './integration/statusSummary';
import { pathToLinktext } from './integration/hoverLink';
import { TaskLinkSuggestModal } from './editor/TaskLinkSuggestModal';
import { TaskJumpSuggestModal } from './editor/TaskJumpSuggestModal';
import { buildAliasedLink } from './integration/relationshipLink';
import { TaskLinkEditorSuggest } from './editor/TaskLinkEditorSuggest';
import { localDateString } from './utils/dateUtils';
import { createTaskContextMenuDeps } from './integration/taskActionPorts';
import { ScanEngine } from './integration/ScanEngine';
import type { ExternalTask } from './integration/types';
import { AUTO_ARCHIVE_CHECK_INTERVAL_MS, METADATA_CACHE_TIMEOUT_MS } from './constants';
import type { ExtendedWorkspace, HoverLinkPayload, SidedockWithSize } from './types/obsidianExtended';
import type { SettingsHost } from './types/settingsHost';

export type BoardViewMode = string;

export default class TTasksPlugin extends Plugin {
	settings!: TTasksSettings;
	taskStore!: TaskStore;
	archiveService!: ArchiveService;
	reminderService!: ReminderService;
	pomodoroService!: PomodoroService;
	scanEngine!: ScanEngine;
	activeTaskPath: Writable<string | null> = writable(null);
	focusedTaskPath: Writable<string | null> = writable(null);
	activeViewMode: Writable<BoardViewMode | null> = writable(null);
	/** Bumped after every saveSettings() so open views re-derive settings-based state. */
	settingsRevision: Writable<number> = writable(0);
	/** Shared UI state for the board, rail, and detail leaves. */
	boardState!: BoardStateStores;
	private statusBarEl: HTMLElement | null = null;
	private isApplyingExternalSettings = false;
	private reminderStartTimeoutId: number | null = null;

	private get extendedWorkspace(): ExtendedWorkspace {
		return this.app.workspace as ExtendedWorkspace;
	}

	async onload() {
		await this.loadSettings();

		this.boardState = createBoardStateService({
			defaultViewId: resolveTaskViewId(this.settings, null),
			activeTaskPath: this.activeTaskPath,
			focusedTaskPath: this.focusedTaskPath,
		});

		this.taskStore = new TaskStore(this);
		this.taskStore.register();
		this.archiveService = new ArchiveService(this);
		this.pomodoroService = new PomodoroService({
			getConfig: () => this.settings.pomodoro,
			logFocus: (path, minutes) => this.logPomodoroFocus(path, minutes),
			notify: (message) => { new Notice(message); },
		});
		this.register(() => this.pomodoroService.dispose());
		this.scanEngine = new ScanEngine();
		this.registerEditorSuggest(new TaskLinkEditorSuggest(this.app, this));

		this.registerView(
			TASK_BOARD_VIEW_TYPE,
			leaf => new TaskBoardView(leaf, this)
		);
		this.registerView(
			TASK_RAIL_VIEW_TYPE,
			leaf => new TaskRailView(leaf, this)
		);
		this.registerView(
			TASK_DETAIL_VIEW_TYPE,
			leaf => new TaskDetailView(leaf, this)
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
			id: 'jump-to-task',
			name: 'Jump to task…',
			callback: () => this.openJumpToTask(),
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
			id: 'migrate-phase6-data-model',
			name: 'Migrate to Phase 6 data model (category→area, task_type→labels)',
			callback: async () => {
				const count = await this.taskStore.migrateToPhase6DataModel();
				new Notice(`TTasks: migrated ${count} task file(s) to Phase 6 data model.`);
				await this.taskStore.load();
			},
		});

		this.addCommand({
			id: 'archive-migrate-completed',
			name: 'Archive: move all completed tasks to archive folder',
			callback: async () => {
				const count = await this.archiveService.archiveAllCompleted();
				new Notice(`TTasks: archived ${count} completed task(s).`);
				await this.taskStore.load();
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

		this.addCommand({
			id: 'start-pomodoro',
			name: 'Start Pomodoro on active task',
			checkCallback: (checking) => {
				const path = get(this.activeTaskPath);
				const task = path ? this.taskStore.getByPath(path) : undefined;
				if (!task) return false;
				if (checking) return true;
				this.pomodoroService.start(task.path, task.name);
				return true;
			},
		});

		this.addCommand({
			id: 'pomodoro-toggle',
			name: 'Pomodoro: pause / resume',
			checkCallback: (checking) => {
				if (!this.pomodoroService.isActive()) return false;
				if (checking) return true;
				this.pomodoroService.toggle();
				return true;
			},
		});

		this.addCommand({
			id: 'pomodoro-skip',
			name: 'Pomodoro: skip to next phase',
			checkCallback: (checking) => {
				if (!this.pomodoroService.isActive()) return false;
				if (checking) return true;
				this.pomodoroService.skip();
				return true;
			},
		});

		this.addCommand({
			id: 'pomodoro-stop',
			name: 'Pomodoro: stop',
			checkCallback: (checking) => {
				if (!this.pomodoroService.isActive()) return false;
				if (checking) return true;
				this.pomodoroService.stop();
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
		this.scanEngine.onload(this, this.app);

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
			// Start reminders when metadata is ready, with timeout fallback.
			this.startReminderServiceWhenReady();
			// Scheduled auto-archive: check once on load, then hourly.
			this.startAutoArchive();
		});
	}

	private startReminderServiceWhenReady(): void {
		let started = false;
		const start = () => {
			if (started) return;
			started = true;
			if (this.reminderStartTimeoutId !== null) {
				window.clearTimeout(this.reminderStartTimeoutId);
				this.reminderStartTimeoutId = null;
			}
			void this.reminderService.start().catch((err: unknown) => this.log(`reminderService.start failed: ${String(err)}`));
		};

		const resolvedRef = this.app.metadataCache.on('resolved', start);
		this.registerEvent(resolvedRef);

		this.reminderStartTimeoutId = window.setTimeout(start, METADATA_CACHE_TIMEOUT_MS);
		this.register(() => {
			if (this.reminderStartTimeoutId !== null) {
				window.clearTimeout(this.reminderStartTimeoutId);
				this.reminderStartTimeoutId = null;
			}
		});
	}

	onunload() {
		if (this.reminderStartTimeoutId !== null) {
			window.clearTimeout(this.reminderStartTimeoutId);
			this.reminderStartTimeoutId = null;
		}
		// Leaves are intentionally NOT detached here: per the plugin guidelines,
		// detaching in onunload resets the user's layout on every plugin update.
	}

	openNewTask(): void {
		new CreateTaskModal(this.app, this).open();
	}

	/**
	 * One-shot workspace setup: board in the main area plus, on desktop, the
	 * rail and detail panes revealed alongside it. On mobile the sidebars are
	 * drawers that would cover the board, so only the rail leaf is ensured
	 * (reachable via the left drawer) and nothing is force-revealed.
	 */
	async openBoard(): Promise<void> {
		await this.revealBoardLeaf();
		if (Platform.isMobile) {
			await this.app.workspace.ensureSideLeaf(TASK_RAIL_VIEW_TYPE, 'left', { reveal: false });
			return;
		}
		await this.app.workspace.ensureSideLeaf(TASK_RAIL_VIEW_TYPE, 'left', { reveal: true, active: false });
		await this.openDetailPane();
	}

	/** Reveal (or create) just the board leaf, leaving the sidebars alone. */
	async revealBoardLeaf(): Promise<void> {
		const existing = this.app.workspace.getLeavesOfType(TASK_BOARD_VIEW_TYPE);
		if (existing.length > 0) {
			await this.app.workspace.revealLeaf(existing[0]);
			return;
		}
		const leaf = this.app.workspace.getLeaf('tab');
		await leaf.setViewState({ type: TASK_BOARD_VIEW_TYPE, active: true });
		await this.app.workspace.revealLeaf(leaf);
	}

	/**
	 * Open (or reveal) the task detail pane in the right sidebar. On mobile the
	 * right sidebar is a drawer, so this slides the detail over the main view.
	 */
	async openDetailPane(): Promise<void> {
		const hadLeaf = this.app.workspace.getLeavesOfType(TASK_DETAIL_VIEW_TYPE).length > 0;
		// On mobile the right sidebar is a slide-over drawer: unless the detail leaf
		// is made the active leaf it can reveal *underneath* the board and never
		// surface (GP1-follow). On desktop we keep `active: false` so opening a task
		// doesn't steal keyboard focus from the board list/kanban.
		await this.app.workspace.ensureSideLeaf(TASK_DETAIL_VIEW_TYPE, 'right', {
			reveal: true,
			active: Platform.isMobile,
		});
		if (!hadLeaf) this.applyDefaultDetailPaneWidth();
	}

	/**
	 * Give the right sidebar a workable width the first time the detail leaf is
	 * created, clamped for laptop screens. Only runs on creation, so any manual
	 * resize the user makes afterwards is persisted by Obsidian and untouched.
	 */
	private applyDefaultDetailPaneWidth(): void {
		if (Platform.isMobile) return; // drawers are always full-width
		const rightSplit = this.app.workspace.rightSplit as SidedockWithSize | null;
		if (!rightSplit?.setSize) return;
		const width = Math.max(360, Math.min(480, Math.round(window.innerWidth * 0.3)));
		rightSplit.setSize(width);
	}

	/** Collapse the right sidebar drawer/dock that hosts the detail pane. */
	closeDetailPane(): void {
		this.app.workspace.rightSplit?.collapse();
	}

	/**
	 * Persist a completed Pomodoro focus session onto its task: bump
	 * `pomodoro_count` and add the focus minutes to `focused_minutes`. Wired into
	 * PomodoroService via its `logFocus` dep. No-op if the task has since vanished.
	 */
	private async logPomodoroFocus(path: string, minutes: number): Promise<void> {
		const task = this.taskStore.getByPath(path);
		if (!task) return;
		await this.taskStore.update(path, {
			pomodoro_count: (task.pomodoro_count ?? 0) + 1,
			focused_minutes: (task.focused_minutes ?? 0) + minutes,
		});
	}

	async loadSettings() {
		const persisted = await this.loadData();
		this.settings = normalizeSettingsFromSources([DEFAULT_SETTINGS, persisted]);
		const detectedSources = buildAutoDetectedSources(this.app);
		const mergedSources = mergeAutoDetectedSources(this.settings.captureSources, detectedSources);
		if (JSON.stringify(mergedSources) !== JSON.stringify(this.settings.captureSources)) {
			this.settings.captureSources = mergedSources;
			await this.saveData(this.settings);
		}
	}

	async saveSettings() {
		this.settings = normalizeSettingsFromSources([DEFAULT_SETTINGS, this.settings]);
		await this.saveData(this.settings);
		this.settingsRevision.update((n) => n + 1);
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
			if (changed) this.settingsRevision.update((n) => n + 1);
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
		addTaskContextMenuItems(menu, task, this.buildContextCallbacks());
		menu.showAtMouseEvent(event);
	}

	private buildContextCallbacks(): TaskContextMenuDeps {
		return createTaskContextMenuDeps({
			openTaskDetail: (path) => this.taskStore.openDetail(path),
			runQuickAction: (action, path) => this.runQuickAction(action, path),
			convertToProject: (path) => this.taskStore.convertToProject(path),
			duplicateTask: (path) => this.taskStore.duplicate(path),
			deleteTask: (path, options) => this.taskStore.delete(path, options),
			restoreTask: (path) => this.taskStore.restore(path),
			archiveTask: (path) => this.archiveService.archiveTask(path),
			setActiveTaskPath: (path) => this.activeTaskPath.set(path),
			notice: (message) => { new Notice(message); },
			createDependentTask: (path) => {
				const depPath = path.replace(/\.md$/, '');
				// Inherit project/area/labels/priority so the new task lands in the
				// same context as the task it depends on.
				const source = this.taskStore.getByPath(path);
				new CreateTaskModal(this.app, this, 'task', {
					initialDependsOn: [depPath],
					prefill: source
						? {
							parent_task: source.parent_task,
							area: source.area,
							labels: source.labels,
							priority: source.priority,
						}
						: undefined,
				}).open();
			},
		});
	}

	private startAutoArchive(): void {
		if (this.settings.archive.mode !== 'scheduled') return;
		const run = () => {
			void this.archiveService.archiveEligibleTasks(this.settings.archive.daysAfterComplete).catch((err: unknown) => this.log(`auto-archive failed: ${String(err)}`));
		};
		run(); // check on startup
		// Check hourly — registered interval cleaned up automatically on plugin unload
		this.registerInterval(window.setInterval(run, AUTO_ARCHIVE_CHECK_INTERVAL_MS));
	}

	taskStoreTasksSnapshot(): Task[] {
		return get(this.taskStore.tasks);
	}

	triggerTaskHoverPreview(pathLike: string, event: MouseEvent): void {
		const linktext = pathToLinktext(pathLike);
		const sourcePath = this.app.workspace.getActiveFile()?.path ?? `${linktext}.md`;
		const payload: HoverLinkPayload = {
			event,
			source: 'ttasks-board',
			hoverParent: this,
			targetEl: event.currentTarget as HTMLElement | null,
			linktext,
			sourcePath,
		};
		this.extendedWorkspace.trigger('hover-link', payload);
	}

	openPluginSettings(): void {
		const host = this.app as SettingsHost;
		if (host.setting?.open && host.setting.openTabById) {
			host.setting.open();
			host.setting.openTabById(this.manifest.id);
			return;
		}
		host.commands?.executeCommandById?.('app:open-settings');
	}

	async openCapturedTask(task: ExternalTask): Promise<void> {
		const file = this.app.vault.getFileByPath(task.location.filePath);
		if (!file) {
			new Notice(`Could not open source note: ${task.location.filePath}`);
			return;
		}

		const leaf = this.app.workspace.getLeaf('tab');
		await leaf.openFile(file);
		const editor = this.extractEditor(leaf.view);
		if (editor?.setCursor) {
			editor.setCursor({ line: Math.max(0, task.location.line - 1), ch: 0 });
		}
	}

	private extractEditor(view: unknown): { setCursor?: (pos: { line: number; ch: number }) => void } | null {
		if (!view || typeof view !== 'object') return null;
		const maybeEditor = (view as { editor?: unknown }).editor;
		if (!maybeEditor || typeof maybeEditor !== 'object') return null;
		const setCursor = (maybeEditor as { setCursor?: unknown }).setCursor;
		if (typeof setCursor !== 'function') return null;
		return { setCursor: setCursor as (pos: { line: number; ch: number }) => void };
	}

	private getTaskByPath(path: string): Task | null {
		return this.taskStore.getByPath(path) ?? null;
	}

	private registerProtocolHandler(): void {
		this.registerObsidianProtocolHandler('ttasks', (params) => {
			const parsed = parseProtocolAction(params as Record<string, unknown>);
			void dispatchProtocolAction(parsed, {
				openBoard: () => this.openBoard(),
				openTask: (path) => this.taskStore.openDetail(path),
				createTask: async (prefill) => { new CreateTaskModal(this.app, this, 'task', prefill ? { prefill } : undefined).open(); },
				createProject: async () => { new CreateTaskModal(this.app, this, 'project').open(); },
				runQuickAction: (action, path) => this.runQuickAction(action, path),
				openJump: async (query) => { this.openJumpToTask(query); },
				notice: (message) => { new Notice(message); },
			});
		});
	}

	private registerNativeContextMenus(): void {
		const addForTask = (menu: Menu, task: Task): void => {
			addTaskContextMenuItems(menu, task, this.buildContextCallbacks());
		};

		this.registerEvent(this.app.workspace.on('file-menu', (menu, file) => {
			if (!(file instanceof TFile)) return;
			const task = this.getTaskByPath(file.path);
			if (!task) return;
			addForTask(menu, task);
		}));

		this.registerEvent(this.extendedWorkspace.on('editor-menu', (menu: Menu, _editor, view) => {
			const file = view?.file;
			if (!(file instanceof TFile)) return;
			const task = this.getTaskByPath(file.path);
			if (!task) return;
			addForTask(menu, task);
		}));

		this.registerEvent(this.extendedWorkspace.on('files-menu', (menu: Menu, files) => {
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
		this.statusBarEl.addEventListener('click', () => {
			const target = this.settings.statusBar.clickTarget;
			void this.openBoard().then(() => {
				// 'board' keeps whatever view is current; the others switch to it.
				if (target !== 'board') this.activeViewMode.set(target);
			});
		});

		const unsubscribeTasks = this.taskStore.tasks.subscribe(() => {
			this.updateStatusBar();
		});
		this.register(() => unsubscribeTasks());
		// Settings changes (hide-when-zero, block/start status) re-render the item.
		const unsubscribeSettings = this.settingsRevision.subscribe(() => {
			this.updateStatusBar();
		});
		this.register(() => unsubscribeSettings());
		this.updateStatusBar();
	}

	/**
	 * Open the "Jump to task" fuzzy switcher. Open (non-complete) tasks only —
	 * archived tasks never reach the store, so no extra filtering is needed.
	 */
	openJumpToTask(initialQuery?: string): void {
		const tasks = get(this.taskStore.tasks).filter((task) => !task.is_complete);
		if (tasks.length === 0) {
			new Notice('TTasks: no open tasks to jump to.');
			return;
		}
		new TaskJumpSuggestModal(this.app, tasks, (task) => {
			void this.taskStore.openDetail(task.path);
		}, initialQuery ?? '').open();
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
			inProgressStatus: this.settings.quickActions.startStatus,
		});
		const attentionZero = summary.overdue === 0 && summary.blocked === 0;
		this.statusBarEl.toggleClass('ttasks-statusbar-hidden', attentionZero && this.settings.statusBar.hideWhenZero);
		this.statusBarEl.toggleClass('ttasks-statusbar-warning', summary.overdue > 0);
		this.statusBarEl.setText(summary.label);
		setTooltip(this.statusBarEl, summary.tooltip, { placement: 'top' });
	}

	async runQuickAction(action: QuickActionId, path?: string, options?: { showNotice?: boolean }): Promise<boolean> {
		const showNotice = options?.showNotice ?? true;
		if (action === 'none') return false;

		const resolvedPath = path ?? get(this.activeTaskPath);
		if (!resolvedPath) {
			if (showNotice) new Notice('TTasks: no task selected - open a task in the detail panel first.');
			return false;
		}

		const task = this.taskStore.getByPath(resolvedPath);
		if (!task) {
			if (showNotice) new Notice('TTasks: selected task not found.');
			return false;
		}

		const result = resolveQuickAction(action, task, {
			today: localDateString(),
			completionStatus: this.settings.completionStatus,
			startStatus: resolveConfiguredStatus(this.settings.statuses, this.settings.quickActions.startStatus, DEFAULT_SETTINGS.quickActions.startStatus),
			blockStatus: resolveConfiguredStatus(this.settings.statuses, this.settings.quickActions.blockStatus, DEFAULT_SETTINGS.quickActions.blockStatus),
			statuses: this.settings.statuses,
			deferDays: this.settings.quickActions.deferDays,
		});

		if (result.kind === 'error') {
			if (showNotice) new Notice(`TTasks: ${result.reason}`);
			return false;
		}

		// The 'complete' action routes through the shared completion helper so
		// recurring tasks spawn their next instance (guarded) from this path too.
		if (action === 'complete') {
			await this.taskStore.completeAndRecur(task);
		} else {
			await this.taskStore.update(resolvedPath, result.updates);
		}
		if (showNotice) new Notice(`TTasks: ${result.noticeLabel}`);
		return true;
	}
}
