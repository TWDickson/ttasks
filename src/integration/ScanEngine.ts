import type { App, Plugin, TFile } from 'obsidian';
import { writable, type Readable, type Writable } from 'svelte/store';
import type { CaptureSourceConfig } from '../settings/types';
import type { TTasksSettings } from '../settings';
import type { ExternalTask } from './types';
import { isInCaptureScope, scanFileForCapturableTasks } from './fileScanner';
import { resolveCaptureSourceFileEntries } from './captureSourceFiles';
import { VAULT_MODIFY_DEBOUNCE_MS } from '../constants';
import { handleScanError, type ScanErrorMeta, type ScanFlowContext } from './scanErrorPolicy';
import { withConcurrencyLimit } from '../utils/concurrency';

const DEFAULT_FULL_SCAN_CONCURRENCY = 4;

type DailyNotesInterface = {
	getDateFromFile: (file: TFile, granularity: 'day') => Date | null;
	getDailyNote: (date: Date, files: TFile[]) => TFile | null;
};

function loadDailyNotesInterface(): DailyNotesInterface | null {
	try {
		// Lazy require: the package depends on Obsidian runtime globals and may be
		// absent, so it must load on demand inside this try/catch, not statically.
		// eslint-disable-next-line @typescript-eslint/no-require-imports
		return require('obsidian-daily-notes-interface') as DailyNotesInterface;
	} catch {
		return null;
	}
}

export class ScanEngine {
	private store: Writable<ExternalTask[]> = writable([]);
	private debounceByFilePath = new Map<string, ReturnType<typeof setTimeout>>();
	private pendingResolveByFilePath = new Map<string, () => void>();
	private reportError: (context: ScanFlowContext, error: unknown, meta: ScanErrorMeta) => void;
	private fullScanConcurrency: number;

	constructor(options?: {
		reportError?: (context: ScanFlowContext, error: unknown, meta: ScanErrorMeta) => void;
		fullScanConcurrency?: number;
	}) {
		this.reportError = options?.reportError ?? ((context, error, meta) => {
			handleScanError(context, error, meta, {
				log: (message, loggedError) => {
					console.error(message, loggedError);
				},
			});
		});
		this.fullScanConcurrency = options?.fullScanConcurrency ?? DEFAULT_FULL_SCAN_CONCURRENCY;
	}

	get tasks(): Readable<ExternalTask[]> {
		return this.store;
	}

	onload(plugin: Plugin & { settings: TTasksSettings; log?: (message: string) => void }, app: App): void {
		this.reportError = (context, error, meta) => {
			handleScanError(context, error, meta, {
				log: (message, loggedError) => {
					const details = loggedError instanceof Error
						? `${message}: ${loggedError.message}`
						: `${message}: ${String(loggedError)}`;
					if (typeof plugin.log === 'function') {
						plugin.log(details);
						if (loggedError != null) {
							console.error(message, loggedError);
						}
						return;
					}
					console.error(message, loggedError);
				},
			});
		};

		void this.runFullScan(app, plugin.settings).catch((error) => {
			this.reportError('background_non_blocking', error, { operation: 'scan.runFullScan' });
		});

		plugin.registerEvent(app.vault.on('modify', (file) => {
			if (!(file as TFile).path?.toLowerCase().endsWith('.md')) return;
			const config = this.findConfig((file as TFile).path, plugin.settings.captureSources);
			if (!config) return;
			void this.rescanFile(app, file as TFile, config, plugin.settings.tasksFolder, 'background_non_blocking');
		}));

		plugin.registerEvent(app.vault.on('create', (file) => {
			if (!(file as TFile).path?.toLowerCase().endsWith('.md')) return;
			if (!this.isDailyNoteFile(file as TFile)) return;
			void this.surfacePreviousDayTasks(app, plugin.settings).catch((error) => {
				this.reportError('background_non_blocking', error, { operation: 'scan.surfacePreviousDayTasks' });
			});
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

	async rescanFile(
		app: App,
		file: TFile,
		config: CaptureSourceConfig,
		tasksFolder: string,
		flowContext: ScanFlowContext = 'background_non_blocking',
	): Promise<void> {
		const existingTimer = this.debounceByFilePath.get(file.path);
		if (existingTimer != null) {
			globalThis.clearTimeout(existingTimer);
			const pendingResolve = this.pendingResolveByFilePath.get(file.path);
			if (pendingResolve) {
				pendingResolve();
				this.pendingResolveByFilePath.delete(file.path);
			}
		}

		await new Promise<void>((resolve, reject) => {
			this.pendingResolveByFilePath.set(file.path, resolve);
			const timer = globalThis.setTimeout(async () => {
				this.debounceByFilePath.delete(file.path);
				this.pendingResolveByFilePath.delete(file.path);
				try {
					const content = await app.vault.cachedRead(file);
					const tasks = scanFileForCapturableTasks(content, file.path, config, tasksFolder);
					this.upsertFileTasks(file.path, tasks);
					resolve();
				} catch (error) {
					if (flowContext === 'background_non_blocking') {
						this.reportError('background_non_blocking', error, {
							operation: 'scan.rescanFile',
							filePath: file.path,
						});
						resolve();
						return;
					}
					reject(error);
				}
			}, VAULT_MODIFY_DEBOUNCE_MS);
			this.debounceByFilePath.set(file.path, timer);
		});
	}

	async runFullScan(app: App, settings: TTasksSettings): Promise<void> {
		const allFiles = app.vault.getMarkdownFiles();
		const entries = resolveCaptureSourceFileEntries(allFiles, settings.captureSources, settings.tasksFolder);
		const perEntryTasks = await withConcurrencyLimit(entries.map((entry) => async () => {
			try {
				const content = await app.vault.cachedRead(entry.file);
				return scanFileForCapturableTasks(content, entry.file.path, entry.config, settings.tasksFolder);
			} catch (error) {
				this.reportError('background_non_blocking', error, {
					operation: 'scan.runFullScan.entry',
					filePath: entry.file.path,
				});
				return undefined;
			}
		}), this.fullScanConcurrency);

		const nextTasks = perEntryTasks.flatMap((tasks) => tasks ?? []);

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

		try {
			const content = await app.vault.cachedRead(previousDailyFile);
			const tasks = scanFileForCapturableTasks(content, previousDailyFile.path, config, settings.tasksFolder)
				.map((task) => ({ ...task, fromPreviousDay: true }));
			this.upsertFileTasks(previousDailyFile.path, tasks);
		} catch (error) {
			this.reportError('background_non_blocking', error, {
				operation: 'scan.surfacePreviousDayTasks',
				filePath: previousDailyFile.path,
			});
		}
	}

	removeTasksForFile(filePath: string): void {
		const normalizedPath = filePath.replace(/\\/g, '/');
		this.store.update((current) => current.filter((task) => task.location.filePath !== normalizedPath));
	}
}
