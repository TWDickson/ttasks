import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { writable } from 'svelte/store';
import { TFile } from 'obsidian';
import { ArchiveService } from './ArchiveService';
import type { Task } from '../types';
import type TTasksPlugin from '../main';

function makeTask(overrides: Omit<Partial<Task>, 'path'> & { path: string }): Task {
	const { path, ...rest } = overrides;
	return {
		id: path.slice(0, 6),
		slug: 'task',
		path,
		type: 'task',
		name: 'Task',
		area: null,
		status: 'Done',
		priority: 'None',
		labels: [],
		parent_task: null,
		depends_on: [],
		blocks: [],
		blocked_reason: '',
		assigned_to: '',
		source: '',
		start_date: null,
		due_date: null,
		due_time: null,
		estimated_days: null,
		workweek_only: false,
		holiday_dates: [],
		created: '2026-01-01',
		completed: '2026-01-10',
		notes: '',
		recurrence: null,
		recurrence_type: null,
		is_complete: true,
		is_inbox: true,
		status_changed: null,
		...rest,
	};
}

function makePlugin(tasks: Task[]): TTasksPlugin {
	const tasksStore = writable(tasks);
	// cast through unknown — test mock intentionally only implements what ArchiveService uses
	return {
		settings: {
			tasksFolder: 'Planner/Tasks',
			archive: { mode: 'scheduled', daysAfterComplete: 45 },
			statuses: ['Active', 'Done'],
		},
		taskStore: { tasks: tasksStore, update: vi.fn(async () => {}) },
		app: {
			vault: {
				getAbstractFileByPath: vi.fn(() => null),
				read: vi.fn(async () => '---\nname: Task\n---\n'),
				createFolder: vi.fn(async () => {}),
			},
			fileManager: {
				renameFile: vi.fn(),
				processFrontMatter: vi.fn(),
			},
			metadataCache: { getFileCache: vi.fn(() => null) },
		},
		log: vi.fn(),
	} as unknown as TTasksPlugin;
}

function makeFile(path: string, name: string): TFile {
	const file = Object.create(TFile.prototype) as TFile & { path: string; name: string; extension: string; basename: string };
	file.path = path;
	file.name = name;
	file.extension = 'md';
	file.basename = name.replace(/\.md$/, '');
	return file;
}

describe('ArchiveService.archiveEligibleTasks', () => {
	// Pin the clock so the relative "days ago" fixtures below are deterministic.
	// Without this the tests use the real system date and become time-bombs:
	// a task "completed" 2026-05-19 is <45 days old only until 2026-07-03.
	beforeAll(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date(2026, 5, 15)); // 2026-06-15 (month is 0-indexed)
	});
	afterAll(() => {
		vi.useRealTimers();
	});

	it('returns 0 when no tasks are eligible', async () => {
		const tasks = [
			makeTask({ path: 'Planner/Tasks/abc-recent.md', completed: '2026-05-19', is_complete: true }),
		];
		const archiveSpy = vi.fn(async () => true);
		const plugin = makePlugin(tasks);
		const service = new ArchiveService(plugin);
		vi.spyOn(service, 'archiveTask').mockImplementation(archiveSpy);

		const count = await service.archiveEligibleTasks(45);
		expect(count).toBe(0);
		expect(archiveSpy).not.toHaveBeenCalled();
	});

	it('archives tasks completed more than threshold days ago', async () => {
		const tasks = [
			makeTask({ path: 'Planner/Tasks/old-task.md', completed: '2026-01-01', is_complete: true }),
			makeTask({ path: 'Planner/Tasks/new-task.md', completed: '2026-05-19', is_complete: true }),
		];
		const archiveSpy = vi.fn(async () => true);
		const plugin = makePlugin(tasks);
		const service = new ArchiveService(plugin);
		vi.spyOn(service, 'archiveTask').mockImplementation(archiveSpy);

		const count = await service.archiveEligibleTasks(45);
		expect(count).toBe(1);
		expect(archiveSpy).toHaveBeenCalledWith('Planner/Tasks/old-task.md', 'auto-scheduled');
	});

	it('skips incomplete tasks even if old', async () => {
		const tasks = [
			makeTask({ path: 'Planner/Tasks/active.md', is_complete: false, completed: null, status: 'Active' }),
		];
		const archiveSpy = vi.fn(async () => true);
		const plugin = makePlugin(tasks);
		const service = new ArchiveService(plugin);
		vi.spyOn(service, 'archiveTask').mockImplementation(archiveSpy);

		const count = await service.archiveEligibleTasks(0);
		expect(count).toBe(0);
	});

	it('archives all eligible tasks when threshold is 0', async () => {
		const tasks = [
			makeTask({ path: 'Planner/Tasks/t1.md', completed: '2026-05-20', is_complete: true }),
			makeTask({ path: 'Planner/Tasks/t2.md', completed: '2026-05-20', is_complete: true }),
		];
		const archiveSpy = vi.fn(async () => true);
		const plugin = makePlugin(tasks);
		const service = new ArchiveService(plugin);
		vi.spyOn(service, 'archiveTask').mockImplementation(archiveSpy);

		const count = await service.archiveEligibleTasks(0);
		expect(count).toBe(2);
	});

	it('does not count failed archives', async () => {
		const tasks = [
			makeTask({ path: 'Planner/Tasks/fail.md', completed: '2026-05-20', is_complete: true }),
		];
		const archiveSpy = vi.fn(async () => false);
		const plugin = makePlugin(tasks);
		const service = new ArchiveService(plugin);
		vi.spyOn(service, 'archiveTask').mockImplementation(archiveSpy);

		const count = await service.archiveEligibleTasks(0);
		expect(count).toBe(0);
	});
});

describe('ArchiveService.isArchived', () => {
	it('returns true for paths inside the archive folder', () => {
		const plugin = makePlugin([]);
		const service = new ArchiveService(plugin);
		expect(service.isArchived('Planner/Archive/2026/05/abc-task.md')).toBe(true);
	});

	it('returns false for paths inside the tasks folder', () => {
		const plugin = makePlugin([]);
		const service = new ArchiveService(plugin);
		expect(service.isArchived('Planner/Tasks/abc-task.md')).toBe(false);
	});
});

describe('ArchiveService.restoreTask', () => {
	it('reopens via taskStore.update with the restore input after moving the file', async () => {
		const plugin = makePlugin([]);
		const archivedPath = 'Planner/Archive/2026/05/abc-task.md';
		const destPath = 'Planner/Tasks/abc-task.md';
		const archivedFile = makeFile(archivedPath, 'abc-task.md');
		const movedFile = makeFile(destPath, 'abc-task.md');
		(plugin.app.vault.getAbstractFileByPath as any).mockImplementation((p: string) =>
			p === archivedPath ? archivedFile : p === destPath ? movedFile : null,
		);
		(plugin.app.fileManager.renameFile as any).mockResolvedValue(undefined);
		const service = new ArchiveService(plugin);
		vi.spyOn(service as any, 'logArchiveAction').mockResolvedValue(undefined);

		await service.restoreTask(archivedPath);

		expect(plugin.app.fileManager.renameFile).toHaveBeenCalledWith(archivedFile, destPath);
		expect(plugin.taskStore.update).toHaveBeenCalledWith(destPath, {
			status: 'Active',
			is_complete: false,
			completed: null,
			blocked_reason: '',
		});
	});
});

describe('ArchiveService.archiveTask', () => {
	it('does not attempt logbook write when file move fails', async () => {
		const plugin = makePlugin([]);
		const file = makeFile('Planner/Tasks/a-task.md', 'a-task.md');
		(plugin.app.vault.getAbstractFileByPath as any).mockReturnValue(file);
		(plugin.app.fileManager.renameFile as any).mockRejectedValue(new Error('locked'));
		const service = new ArchiveService(plugin);
		vi.spyOn(service as any, 'ensureFolder').mockResolvedValue(undefined);
		const logSpy = vi.spyOn(service as any, 'logArchiveAction').mockResolvedValue(undefined);

		const result = await service.archiveTask('Planner/Tasks/a-task.md');
		expect(result).toBe(false);
		expect(logSpy).not.toHaveBeenCalled();
	});
});
