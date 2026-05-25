import type { App, Plugin, TFile } from 'obsidian';
import { writable, type Readable, type Writable } from 'svelte/store';
import type { CaptureSourceConfig } from '../settings/types';
import type { TTasksSettings } from '../settings';
import type { ExternalTask } from './types';
import { isInCaptureScope, scanFileForCapturableTasks } from './fileScanner';
import { resolveCaptureSourceFileEntries } from './captureSourceFiles';
import { VAULT_MODIFY_DEBOUNCE_MS } from '../constants';

type DailyNotesInterface = {
	getDateFromFile: (file: TFile, granularity: 'day') => Date | null;
	getDailyNote: (date: Date, files: TFile[]) => TFile | null;
};

function loadDailyNotesInterface(): DailyNotesInterface | null {
	try {
		return require('obsidian-daily-notes-interface') as DailyNotesInterface;
	} catch {
		return null;
	}
}

export class ScanEngine {
	private store: Writable<ExternalTask[]> = writable([]);
	private debounceByFilePath = new Map<string, number>();

	get tasks(): Readable<ExternalTask[]> {
		return this.store;
	}

	onload(plugin: Plugin & { settings: TTasksSettings }, app: App): void {
		void this.runFullScan(app, plugin.settings);

		plugin.registerEvent(app.vault.on('modify', (file) => {
			if (!(file as TFile).path?.toLowerCase().endsWith('.md')) return;
			const config = this.findConfig((file as TFile).path, plugin.settings.captureSources);
			if (!config) return;
			void this.rescanFile(app, file as TFile, config, plugin.settings.tasksFolder);
		}));

		plugin.registerEvent(app.vault.on('create', (file) => {
			if (!(file as TFile).path?.toLowerCase().endsWith('.md')) return;
			if (!this.isDailyNoteFile(file as TFile)) return;
			void this.surfacePreviousDayTasks(app, plugin.settings);
		}));

		plugin.registerEvent(app.vault.on('delete', (file) => {
			const path = (file as TFile).path;
			if (!path) return;
			this.removeTasksForFile(path);
		}));
	}

	private isDailyNoteFile(file: TFile): boolean {
		try {
			const daily = loadDailyNotesInterface();
			if (!daily) return false;
			return !!daily.getDateFromFile(file, 'day');
		} catch {
			return false;
		}
	}

	private findConfig(filePath: string, configs: CaptureSourceConfig[]): CaptureSourceConfig | null {
		for (const config of configs) {
			if (isInCaptureScope(filePath, config)) {
				return config;
			}
		}
		return null;
	}

	private upsertFileTasks(filePath: string, nextTasks: ExternalTask[]): void {
		const normalizedPath = filePath.replace(/\\/g, '/');
		this.store.update((current) => {
			const kept = current.filter((task) => task.location.filePath !== normalizedPath);
			return [...kept, ...nextTasks];
		});
	}

	async rescanFile(app: App, file: TFile, config: CaptureSourceConfig, tasksFolder: string): Promise<void> {
		const existingTimer = this.debounceByFilePath.get(file.path);
		if (existingTimer != null) {
			window.clearTimeout(existingTimer);
		}

		await new Promise<void>((resolve) => {
			const timer = window.setTimeout(async () => {
				this.debounceByFilePath.delete(file.path);
				const content = await app.vault.cachedRead(file);
				const tasks = scanFileForCapturableTasks(content, file.path, config, tasksFolder);
				this.upsertFileTasks(file.path, tasks);
				resolve();
			}, VAULT_MODIFY_DEBOUNCE_MS);
			this.debounceByFilePath.set(file.path, timer);
		});
	}

	async runFullScan(app: App, settings: TTasksSettings): Promise<void> {
		const allFiles = app.vault.getMarkdownFiles();
		const entries = resolveCaptureSourceFileEntries(allFiles, settings.captureSources, settings.tasksFolder);
		const nextTasks: ExternalTask[] = [];

		for (const entry of entries) {
			const content = await app.vault.cachedRead(entry.file);
			nextTasks.push(...scanFileForCapturableTasks(content, entry.file.path, entry.config, settings.tasksFolder));
		}

		this.store.set(nextTasks);
	}

	async surfacePreviousDayTasks(app: App, settings: TTasksSettings): Promise<void> {
		const daily = loadDailyNotesInterface();
		if (!daily) return;

		const yesterday = new Date();
		yesterday.setDate(yesterday.getDate() - 1);

		let previousDailyFile: TFile | null = null;
		try {
			const anyDaily = daily.getDailyNote(yesterday, app.vault.getMarkdownFiles());
			previousDailyFile = anyDaily ?? null;
		} catch {
			previousDailyFile = null;
		}

		if (!previousDailyFile) {
			return;
		}

		const config = this.findConfig(previousDailyFile.path, settings.captureSources);
		if (!config) {
			return;
		}

		const content = await app.vault.cachedRead(previousDailyFile);
		const tasks = scanFileForCapturableTasks(content, previousDailyFile.path, config, settings.tasksFolder)
			.map((task) => ({ ...task, fromPreviousDay: true }));
		this.upsertFileTasks(previousDailyFile.path, tasks);
	}

	removeTasksForFile(filePath: string): void {
		const normalizedPath = filePath.replace(/\\/g, '/');
		this.store.update((current) => current.filter((task) => task.location.filePath !== normalizedPath));
	}
}
