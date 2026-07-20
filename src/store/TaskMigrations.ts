import { TFile, normalizePath } from 'obsidian';
import type TTasksPlugin from '../main';
import { localDateString, toCalendarDate } from '../utils/dateUtils';

export type MigratableField = 'status' | 'area' | 'label';

// ── Pure helpers (exported for testing) ─────────────────────────────────────

export function needsCssClassMigration(cssclasses: unknown): boolean {
	const existing: string[] = Array.isArray(cssclasses)
		? cssclasses
		: typeof cssclasses === 'string' ? [cssclasses] : [];
	return !existing.includes('ttask');
}

export function applyNormalizeCssClasses(cssclasses: unknown): string[] {
	const existing: string[] = Array.isArray(cssclasses)
		? cssclasses
		: typeof cssclasses === 'string' ? [cssclasses] : [];
	return [...existing, 'ttask'];
}

export function resolveStatusChangedFallback(
	fm: { status_changed?: unknown; start_date?: unknown; created?: unknown },
	today: string
): string {
	// Use toCalendarDate so a value that YAML decoded to a Date (an unquoted date
	// scalar) is still recognised — a bare `typeof === 'string'` check would miss
	// it and wrongly clobber a good status_changed with today.
	return toCalendarDate(fm.status_changed)
		?? toCalendarDate(fm.start_date)
		?? toCalendarDate(fm.created)
		?? today;
}

export function needsStatusChangedMigration(fm: { status_changed?: unknown }): boolean {
	return toCalendarDate(fm.status_changed) === null;
}

export function needsPhase6Migration(fm: Record<string, unknown>): boolean {
	const needsAreaMigration = 'category' in fm && !('area' in fm);
	const needsLabelsMigration = 'task_type' in fm && !('labels' in fm);
	return needsAreaMigration || needsLabelsMigration;
}

export function applyPhase6Migration(fm: Record<string, unknown>): boolean {
	let changed = false;
	if ('category' in fm && !('area' in fm)) {
		fm.area = fm.category ?? null;
		delete fm.category;
		changed = true;
	}
	if ('task_type' in fm && !('labels' in fm)) {
		fm.labels = typeof fm.task_type === 'string' && fm.task_type ? [fm.task_type] : [];
		delete fm.task_type;
		changed = true;
	}
	return changed;
}

export function isInvalidStatus(status: unknown, validStatuses: string[]): boolean {
	return !(typeof status === 'string' && status && validStatuses.includes(status));
}

// ── TaskMigrations class ─────────────────────────────────────────────────────

export class TaskMigrations {
	constructor(private plugin: TTasksPlugin) {}

	private get app() { return this.plugin.app; }
	private get folderPath() { return normalizePath(this.plugin.settings.tasksFolder); }

	private taskFiles(): TFile[] {
		const folder = this.app.vault.getFolderByPath(this.folderPath);
		if (!folder) return [];
		return folder.children.filter(
			(f): f is TFile => f instanceof TFile && f.extension === 'md'
		);
	}

	async migrateCssClasses(): Promise<void> {
		const files = this.taskFiles();
		let patched = 0;
		for (const file of files) {
			await this.app.fileManager.processFrontMatter(file, (fm) => {
				if (!needsCssClassMigration(fm.cssclasses)) return;
				fm.cssclasses = applyNormalizeCssClasses(fm.cssclasses);
				patched++;
			});
		}
		this.plugin.log(`MigrateCssClasses: patched ${patched} of ${files.length} files`);
	}

	async migrateFieldValues(field: MigratableField, mappings: Record<string, string | null>): Promise<number> {
		const files = this.taskFiles();
		let patched = 0;
		for (const file of files) {
			await this.app.fileManager.processFrontMatter(file, (fm) => {
				const current = typeof fm[field] === 'string' ? fm[field] : null;
				if (!current) return;
				if (!Object.prototype.hasOwnProperty.call(mappings, current)) return;
				fm[field] = mappings[current] ?? null;
				patched++;
			});
		}
		this.plugin.log(`MigrateFieldValues(${field}): patched ${patched} of ${files.length} files`);
		return patched;
	}

	async migrateStatusChanged(): Promise<number> {
		const files = this.taskFiles();
		const today = localDateString();
		let patched = 0;
		for (const file of files) {
			await this.app.fileManager.processFrontMatter(file, (fm) => {
				if (!needsStatusChangedMigration(fm)) return;
				fm.status_changed = resolveStatusChangedFallback(fm, today);
				patched++;
			});
		}
		this.plugin.log(`MigrateStatusChanged: patched ${patched} of ${files.length} files`);
		return patched;
	}

	async migrateToPhase6DataModel(): Promise<number> {
		const files = this.taskFiles();
		let patched = 0;
		for (const file of files) {
			await this.app.fileManager.processFrontMatter(file, (fm) => {
				if (applyPhase6Migration(fm)) patched++;
			});
		}
		this.plugin.log(`MigrateToPhase6DataModel: patched ${patched} of ${files.length} files`);
		return patched;
	}

	async migrateStatuses(validStatuses: string[]): Promise<number> {
		const files = this.taskFiles();
		const fallback = validStatuses[0] ?? 'Active';
		let patched = 0;
		for (const file of files) {
			await this.app.fileManager.processFrontMatter(file, (fm) => {
				if (!isInvalidStatus(fm.status, validStatuses)) return;
				fm.status = fallback;
				patched++;
			});
		}
		this.plugin.log(`MigrateStatuses: patched ${patched} of ${files.length} files`);
		return patched;
	}
}
