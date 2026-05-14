import { Notice, TFile, TFolder, normalizePath } from 'obsidian';
import { get } from 'svelte/store';
import type TTasksPlugin from '../main';
import { localDateString } from '../utils/dateUtils';
import { archiveEligible, deriveArchiveFolder, getArchivePath, isArchivedPath } from './archiveUtils';

export interface ArchivedTaskSummary {
	path: string;
	name: string;
	status: string;
	completed: string | null;
	area: string | null;
	archiveYear: string;
	archiveMonth: string;
}

export class ArchiveService {
	constructor(private plugin: TTasksPlugin) {}

	private get app() { return this.plugin.app; }

	get archiveFolder(): string {
		return normalizePath(deriveArchiveFolder(this.plugin.settings.tasksFolder));
	}

	get tasksFolder(): string {
		return normalizePath(this.plugin.settings.tasksFolder);
	}

	isArchived(path: string): boolean {
		return isArchivedPath(normalizePath(path), this.archiveFolder);
	}

	// ── Archive ──────────────────────────────────────────────────────────────

	async archiveTask(path: string, reason: string = 'manual'): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(normalizePath(path));
		if (!(file instanceof TFile)) return;

		const archivePath = normalizePath(getArchivePath(this.archiveFolder, file.name));
		const archiveDir = archivePath.substring(0, archivePath.lastIndexOf('/'));

		await this.ensureFolder(archiveDir);
		await this.app.fileManager.renameFile(file, archivePath);
		await this.logArchiveAction(archivePath, 'archived', reason);

		this.plugin.log(`Archived: ${path} → ${archivePath}`);
	}

	async archiveEligibleTasks(thresholdDays: number): Promise<number> {
		const today = localDateString();
		const tasks = get(this.plugin.taskStore.tasks);
		const eligible = tasks.filter((t) => archiveEligible(t, thresholdDays, today));

		let count = 0;
		for (const task of eligible) {
			await this.archiveTask(task.path, 'auto-scheduled');
			count++;
		}

		if (count > 0) {
			new Notice(`TTasks: auto-archived ${count} completed task(s).`);
		}
		return count;
	}

	/** Load all tasks from the archive folder for the archive view. */
	async loadArchivedTasks(): Promise<ArchivedTaskSummary[]> {
		const archiveFolder = this.app.vault.getAbstractFileByPath(this.archiveFolder);
		if (!(archiveFolder instanceof TFolder)) return [];

		const results: ArchivedTaskSummary[] = [];
		const collect = (folder: TFolder) => {
			for (const child of folder.children) {
				if (child instanceof TFile && child.extension === 'md') {
					const fm = this.app.metadataCache.getFileCache(child)?.frontmatter;
					if (!fm?.name) continue;
					// Path: {archiveFolder}/{year}/{month}/{file}
					const parts = child.path.split('/');
					const n = parts.length;
					results.push({
						path: child.path,
						name: String(fm.name),
						status: typeof fm.status === 'string' ? fm.status : '',
						completed: typeof fm.completed === 'string' ? fm.completed : null,
						area: typeof fm.area === 'string' ? fm.area : null,
						archiveYear: n >= 3 ? parts[n - 3] : '',
						archiveMonth: n >= 2 ? parts[n - 2] : '',
					});
				} else if (child instanceof TFolder) {
					collect(child);
				}
			}
		};
		collect(archiveFolder);

		return results.sort((a, b) => {
			const dateA = `${a.archiveYear}-${a.archiveMonth}`;
			const dateB = `${b.archiveYear}-${b.archiveMonth}`;
			if (dateA !== dateB) return dateB.localeCompare(dateA); // newest first
			return a.name.localeCompare(b.name);
		});
	}

	/** Archive ALL completed tasks regardless of age — used for migration. */
	async archiveAllCompleted(): Promise<number> {
		const tasks = get(this.plugin.taskStore.tasks);
		const completed = tasks.filter((t) => t.is_complete);

		let count = 0;
		for (const task of completed) {
			await this.archiveTask(task.path, 'migration');
			count++;
		}
		return count;
	}

	// ── Restore ──────────────────────────────────────────────────────────────

	async restoreTask(path: string): Promise<void> {
		const normalized = normalizePath(path);
		if (!this.isArchived(normalized)) return;

		const file = this.app.vault.getAbstractFileByPath(normalized);
		if (!(file instanceof TFile)) return;

		const destPath = normalizePath(`${this.tasksFolder}/${file.name}`);
		await this.app.fileManager.renameFile(file, destPath);

		// Reset status to Active after restore
		const movedFile = this.app.vault.getAbstractFileByPath(destPath);
		if (movedFile instanceof TFile) {
			const firstStatus = this.plugin.settings.statuses[0] ?? 'Active';
			await this.app.fileManager.processFrontMatter(movedFile, (fm) => {
				fm.status = firstStatus;
				fm.completed = null;
			});
		}

		await this.logArchiveAction(destPath, 'restored', 'user');
		this.plugin.log(`Restored: ${path} → ${destPath}`);
	}

	// ── Logbook ───────────────────────────────────────────────────────────────

	/** Appends an archive/restore entry to a task file's archive_history frontmatter field. */
	private async logArchiveAction(
		filePath: string,
		action: 'archived' | 'restored',
		reason: string,
	): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(normalizePath(filePath));
		if (!(file instanceof TFile)) return;

		const entry = {
			action,
			date: new Date().toISOString(),
			reason,
		};

		await this.app.fileManager.processFrontMatter(file, (fm) => {
			const history: unknown[] = Array.isArray(fm.archive_history) ? fm.archive_history : [];
			history.push(entry);
			// Cap at 50 entries to prevent frontmatter bloat
			fm.archive_history = history.length > 50 ? history.slice(-50) : history;
		});
	}

	// ── Helpers ──────────────────────────────────────────────────────────────

	private async ensureFolder(folderPath: string): Promise<void> {
		const segments = folderPath.split('/').filter(Boolean);
		let current = '';
		for (const segment of segments) {
			current = current ? `${current}/${segment}` : segment;
			if (!this.app.vault.getAbstractFileByPath(current)) {
				await this.app.vault.createFolder(current);
			}
		}
	}
}
