import { ItemView, WorkspaceLeaf } from 'obsidian';
import { derived } from 'svelte/store';
import type TTasksPlugin from '../main';
import TaskRail from '../components/TaskRail.svelte';
import { CreateTaskModal } from '../modals/CreateTaskModal';
import { getVisibleTaskViews } from './viewRegistry';
import { addSmartList, openSmartListMenu } from './smartListActions';

export const TASK_RAIL_VIEW_TYPE = 'ttasks-rail';

/**
 * Left-sidebar leaf hosting the TTasks nav rail (views, Smart Lists, actions).
 * On mobile the left sidebar is a drawer, so the rail sits alongside the file
 * explorer instead of being hidden behind a horizontal tab bar.
 */
export class TaskRailView extends ItemView {
	private plugin: TTasksPlugin;
	private component: TaskRail | null = null;

	constructor(leaf: WorkspaceLeaf, plugin: TTasksPlugin) {
		super(leaf);
		this.plugin = plugin;
		this.navigation = false;
	}

	getViewType():    string { return TASK_RAIL_VIEW_TYPE; }
	getDisplayText(): string { return 'TTasks views'; }
	getIcon():        string { return 'check-square'; }

	async onOpen(): Promise<void> {
		this.contentEl.addClass('tt-rail-view');

		// Native header action (N1): quick-add a Smart List from the rail chrome.
		this.addAction('plus', 'New Smart List', () => {
			void addSmartList(this.plugin);
		});

		const views = derived(
			this.plugin.settingsRevision,
			() => getVisibleTaskViews(this.plugin.settings),
		);
		const inboxCount = derived(
			this.plugin.taskStore.tasks,
			(tasks) => tasks.filter((task) => task.is_inbox && !task.is_complete).length,
		);
		this.component = new TaskRail({
			target: this.contentEl,
			props: {
				views,
				inboxCount,
				currentViewId: this.plugin.boardState.currentViewId,
				onSelectView: (viewId: string) => {
					this.plugin.boardState.currentViewId.set(viewId);
					// Reveal the board so picking a view on mobile dismisses the drawer.
					void this.plugin.revealBoardLeaf();
				},
				onAddSmartList: () => { void addSmartList(this.plugin); },
				onSmartListContextMenu: (viewId: string, event: MouseEvent) => openSmartListMenu(this.plugin, viewId, event),
				onNewTask: () => new CreateTaskModal(this.app, this.plugin).open(),
				onNewProject: () => new CreateTaskModal(this.app, this.plugin, 'project').open(),
				onShareSync: () => this.plugin.openShareSync(),
				onOpenPomodoro: () => { void this.plugin.openPomodoroPane(); },
				onOpenSettings: () => this.plugin.openPluginSettings(),
			},
		});
	}

	async onClose(): Promise<void> {
		this.component?.$destroy();
		this.component = null;
		this.contentEl.empty();
	}
}
