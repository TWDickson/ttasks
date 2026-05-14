import { ItemView, WorkspaceLeaf } from 'obsidian';
import type TTasksPlugin from '../main';
import TaskBoard from '../components/TaskBoard.svelte';
import { DEFAULT_KEYMAP, isInputFocused, resolveShortcut } from '../integration/boardKeymap';

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

		this.registerDomEvent(document, 'keydown', (e: KeyboardEvent) => {
			// Only fire when this leaf is the active leaf
			if (this.app.workspace.activeLeaf !== this.leaf) return;
			// Don't intercept when user is typing in an input
			if (isInputFocused(document.activeElement)) return;

			const id = resolveShortcut(e, DEFAULT_KEYMAP);
			if (!id) return;

			e.preventDefault();
			this.handleShortcut(id);
		});
	}

	async onClose(): Promise<void> {
		this.component?.$destroy();
		this.component = null;
		this.contentEl.empty();
	}

	private handleShortcut(id: string): void {
		switch (id) {
			case 'newTask':
				(this.plugin as any).openNewTask?.();
				break;
			case 'escape':
				this.plugin.activeTaskPath.set(null);
				break;
			case 'open':
			case 'start':
			case 'complete':
			case 'defer':
			case 'archive': {
				const path = this.plugin.activeTaskPath
					? (() => { let v: string | null = null; this.plugin.activeTaskPath.subscribe(p => { v = p; })(); return v; })()
					: null;
				if (!path) break;
				if (id === 'open') {
					void this.plugin.taskStore.openDetail(path);
				} else if (id === 'archive') {
					void this.plugin.archiveService.archiveTask(path).then(() => {
						this.plugin.activeTaskPath.set(null);
					});
				} else {
					const action = id as 'start' | 'complete' | 'defer';
					void this.plugin.runQuickAction(action, path);
				}
				break;
			}
			case 'search': {
				const searchInput = this.contentEl.querySelector<HTMLInputElement>('.tt-search-input');
				searchInput?.focus();
				break;
			}
		}
	}
}
