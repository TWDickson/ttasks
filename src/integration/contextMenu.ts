import type { Menu } from 'obsidian';
import type { QuickActionId } from '../settings';
import type { Task } from '../types';
import { t } from '../i18n';

export interface TaskContextMenuDeps {
	openTask: (path: string) => void;
	runQuickAction: (action: Exclude<QuickActionId, 'none'>, path: string) => Promise<boolean>;
	convertToProject: (path: string) => Promise<void>;
	duplicateTask: (path: string) => Promise<void>;
	restoreTask: (path: string) => Promise<void>;
	deleteTask: (path: string) => Promise<void>;
	/** Optional: offers "a new task after this one" (it will wait on this). */
	createDependent?: (path: string) => Promise<void>;
	/** Optional: offers "a new task before this one" (this will wait on it). */
	createBlocker?: (path: string) => Promise<void>;
	/** Optional: archive the task (move to archive folder). Shown for completed tasks. */
	archiveTask?: (path: string) => Promise<void>;
}

function addMenuItem(
	menu: Pick<Menu, 'addItem'>,
	title: string,
	icon: string,
	onClick: () => void
): void {
	menu.addItem((item) => {
		item.setTitle(title);
		item.setIcon(icon);
		item.onClick(onClick);
	});
}

export function addTaskContextMenuItems(
	menu: Pick<Menu, 'addItem' | 'addSeparator'>,
	task: Task,
	deps: TaskContextMenuDeps,
): void {
	addMenuItem(menu, 'Open', 'file-text', () => deps.openTask(task.path));

	if (task.type === 'task') {
		menu.addSeparator();
		const actions: Array<{ title: string; icon: string; action: Exclude<QuickActionId, 'none'> }> = [
			{ title: 'Start', icon: 'play', action: 'start' },
			{ title: 'Complete', icon: 'check-circle', action: 'complete' },
			{ title: 'Block', icon: 'pause-circle', action: 'block' },
			{ title: 'Defer', icon: 'calendar-clock', action: 'defer' },
		];
		for (const entry of actions) {
			addMenuItem(menu, entry.title, entry.icon, () => {
				void deps.runQuickAction(entry.action, task.path);
			});
		}
		menu.addSeparator();
		addMenuItem(menu, 'Convert to Project', 'folder', () => {
			void deps.convertToProject(task.path);
		});
		// Before/after match the graph's left and right `+` handles.
		if (deps.createBlocker) {
			addMenuItem(menu, t('contextMenu.createBefore'), 'arrow-left-to-line', () => {
				void deps.createBlocker!(task.path);
			});
		}
		if (deps.createDependent) {
			addMenuItem(menu, t('contextMenu.createAfter'), 'arrow-right-from-line', () => {
				void deps.createDependent!(task.path);
			});
		}
	}

	menu.addSeparator();
	if (task.is_complete) {
		addMenuItem(menu, 'Reopen', 'undo-2', () => {
			void deps.restoreTask(task.path);
		});
		if (deps.archiveTask) {
			addMenuItem(menu, 'Archive', 'archive', () => {
				void deps.archiveTask!(task.path);
			});
		}
	}
	addMenuItem(menu, 'Duplicate', 'copy', () => {
		void deps.duplicateTask(task.path);
	});
	addMenuItem(menu, 'Delete', 'trash-2', () => {
		void deps.deleteTask(task.path);
	});
}
