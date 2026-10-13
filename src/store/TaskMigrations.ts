import { TFile, normalizePath } from 'obsidian';
import type TTasksPlugin from '../main';
import { fmKey } from '../schema/taskPersistence';
import { writeStoredField } from '../schema/taskCodec';
import type { Task } from '../types';

/**
 * Value-level rewrites across every task note, run when the user renames or
 * removes a status, area or label in Settings. (The dev-era *schema* migrations
 * that used to live here were deleted at the `ttask_*` cutover — the one-shot
 * script in `Scripts/` replaced them.)
 */
export type MigratableField = 'status' | 'area' | 'label';

// ── Pure helpers (exported for testing) ─────────────────────────────────────

export function isInvalidStatus(status: unknown, validStatuses: string[]): boolean {
	return !(typeof status === 'string' && status && validStatuses.includes(status));
}

/**
 * Apply rename/removal mappings to a label list. A label mapped to `null` is
 * removed; a rename that collides with a label already present is de-duplicated.
 * Returns `null` when nothing changed.
 */
export function remapLabels(labels: unknown, mappings: Record<string, string | null>): string[] | null {
	const list = Array.isArray(labels) ? labels.filter((v): v is string => typeof v === 'string')
		: typeof labels === 'string' && labels ? [labels] : [];
	if (!list.some((label) => Object.prototype.hasOwnProperty.call(mappings, label))) return null;
	const next: string[] = [];
	for (const label of list) {
		const mapped = Object.prototype.hasOwnProperty.call(mappings, label) ? mappings[label] : label;
		if (mapped && !next.includes(mapped)) next.push(mapped);
	}
	return next;
}

const FIELD_FOR: Record<Exclude<MigratableField, 'label'>, keyof Task> = { status: 'status', area: 'area' };

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

	async migrateFieldValues(field: MigratableField, mappings: Record<string, string | null>): Promise<number> {
		const files = this.taskFiles();
		let patched = 0;
		for (const file of files) {
			await this.app.fileManager.processFrontMatter(file, (fm) => {
				if (field === 'label') {
					// Labels are a list; this used to read a non-existent `label` key, so
					// label renames silently never reached the notes.
					const next = remapLabels(fm[fmKey('labels')], mappings);
					if (next === null) return;
					writeStoredField(fm, 'labels', next);
					patched++;
					return;
				}
				const key = fmKey(FIELD_FOR[field]);
				const current = typeof fm[key] === 'string' ? fm[key] : null;
				if (!current) return;
				if (!Object.prototype.hasOwnProperty.call(mappings, current)) return;
				writeStoredField(fm, FIELD_FOR[field], mappings[current] ?? null);
				patched++;
			});
		}
		this.plugin.log(`MigrateFieldValues(${field}): patched ${patched} of ${files.length} files`);
		return patched;
	}

	async migrateStatuses(validStatuses: string[]): Promise<number> {
		const files = this.taskFiles();
		const fallback = validStatuses[0] ?? 'Active';
		let patched = 0;
		for (const file of files) {
			await this.app.fileManager.processFrontMatter(file, (fm) => {
				if (!isInvalidStatus(fm[fmKey('status')], validStatuses)) return;
				writeStoredField(fm, 'status', fallback);
				patched++;
			});
		}
		this.plugin.log(`MigrateStatuses: patched ${patched} of ${files.length} files`);
		return patched;
	}
}
