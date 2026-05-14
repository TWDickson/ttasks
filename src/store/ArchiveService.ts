import { Notice, TFile, normalizePath } from 'obsidian';
import { get } from 'svelte/store';
import type TTasksPlugin from '../main';
import { localDateString } from '../utils/dateUtils';
import { archiveEligible, deriveArchiveFolder, getArchivePath, isArchivedPath } from './archiveUtils';

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

	async archiveTask(path: string): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(normalizePath(path));
		if (!(file instanceof TFile)) return;

		const archivePath = normalizePath(getArchivePath(this.archiveFolder, file.name));
		const archiveDir = archivePath.substring(0, archivePath.lastIndexOf('/'));

		await this.ensureFolder(archiveDir);
		await this.app.fileManager.renameFile(file, archivePath);

		this.plugin.log(`Archived: ${path} → ${archivePath}`);
	}

	async archiveEligibleTasks(thresholdDays: number): Promise<number> {
		const today = localDateString();
		const tasks = get(this.plugin.taskStore.tasks);
		const eligible = tasks.filter((t) => archiveEligible(t, thresholdDays, today));

		let count = 0;
		for (const task of eligible) {
			await this.archiveTask(task.path);
			count++;
		}

		if (count > 0) {
			new Notice(`TTasks: auto-archived ${count} completed task(s).`);
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

		this.plugin.log(`Restored: ${path} → ${destPath}`);
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
