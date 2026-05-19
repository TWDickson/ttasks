import type { QuickActionId } from '../settings';
import type { Task } from '../types';
import type { TaskContextMenuDeps } from './contextMenu';

export interface TaskActionPorts {
	openTaskDetail: (path: string) => Promise<void>;
	runQuickAction: (action: Exclude<QuickActionId, 'none'>, path: string) => Promise<boolean>;
	convertToProject: (path: string) => Promise<void>;
	duplicateTask: (path: string) => Promise<Task | null>;
	deleteTask: (path: string, options?: { prompt?: boolean }) => Promise<void>;
	restoreTask: (path: string) => Promise<void>;
	archiveTask: (path: string) => Promise<void>;
	setActiveTaskPath: (path: string | null) => void;
	notice: (message: string) => void;
	createDependentTask?: (path: string) => void;
}

export interface ArchiveActionPorts {
	archiveTask: (path: string) => Promise<void>;
	setActiveTaskPath: (path: string | null) => void;
}

export async function runArchiveAndClear(path: string, ports: ArchiveActionPorts): Promise<void> {
	await ports.archiveTask(path);
	ports.setActiveTaskPath(null);
}

export function createTaskContextMenuDeps(ports: TaskActionPorts): TaskContextMenuDeps {
	return {
		openTask: (path) => { void ports.openTaskDetail(path); },
		runQuickAction: (action, path) => ports.runQuickAction(action, path),
		convertToProject: async (path) => {
			await ports.convertToProject(path);
			ports.notice('TTasks: converted to project');
		},
		duplicateTask: async (path) => {
			const created = await ports.duplicateTask(path);
			if (!created) return;
			ports.setActiveTaskPath(created.path);
			ports.notice(`TTasks: duplicated as "${created.name}"`);
		},
		deleteTask: (path) => ports.deleteTask(path, { prompt: true }),
		restoreTask: async (path) => {
			await ports.restoreTask(path);
			ports.notice('TTasks: task reopened');
		},
		createDependent: ports.createDependentTask
			? async (path) => {
				ports.createDependentTask!(path);
			}
			: undefined,
		archiveTask: async (path) => {
			await runArchiveAndClear(path, {
				archiveTask: ports.archiveTask,
				setActiveTaskPath: ports.setActiveTaskPath,
			});
			ports.notice('TTasks: task archived.');
		},
	};
}
