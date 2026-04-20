import type { Menu } from 'obsidian';
import type { QuickActionId } from '../settings';
import type { Task } from '../types';

export interface TaskContextMenuDeps {
	openTask: (path: string) => void;
	runQuickAction: (action: Exclude<QuickActionId, 'none'>, path: string) => Promise<boolean>;
	convertToProject: (path: string) => Promise<void>;
	duplicateTask: (path: string) => Promise<void>;
	deleteTask: (path: string) => Promise<void>;
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
	}

	menu.addSeparator();
	addMenuItem(menu, 'Duplicate', 'copy', () => {
		void deps.duplicateTask(task.path);
	});
	addMenuItem(menu, 'Delete', 'trash-2', () => {
		void deps.deleteTask(task.path);
	});
}
