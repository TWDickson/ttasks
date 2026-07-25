import { Notice, TFile, normalizePath } from 'obsidian';
import { get, writable, type Writable } from 'svelte/store';
import type TTasksPlugin from '../main';
import type { Task, TaskCreateInput, TaskPriority, TaskRecordType } from '../types';
import { resolveCompletionStatus } from '../settings';
import { ensureMdExt } from '../utils/pathUtils';
import { toCalendarDate } from '../utils/dateUtils';
import {
	toFrontmatterBoolean,
	toFrontmatterEnum,
	toFrontmatterNumber,
	toFrontmatterOptionalEnum,
	toFrontmatterScalar,
	toFrontmatterString,
	toFrontmatterStringArray,
	toFrontmatterStringOrNull,
} from '../utils/frontmatterValue';
import { PRIORITIES, REMINDER_OVERRIDES, TASK_RECORD_TYPES } from '../constants';
import { parseWikiLink } from '../utils/wikiLink';
import { ensureFolderPath } from '../utils/vaultSafe';
import { seedGraphTestData } from './graphSandboxSeeder';
import { TaskWriter } from './TaskWriter';
import { TaskMigrations, type MigratableField } from './TaskMigrations';
import { TaskRelationships } from './TaskRelationships';
import { TaskStoreSyncQueue } from './TaskStoreSyncQueue';

export class TaskStore {
	readonly tasks: Writable<Task[]> = writable([]);
	private taskMap: Map<string, Task> = new Map();

	private plugin: TTasksPlugin;
	private writer: TaskWriter;
	readonly migrations: TaskMigrations;
	readonly relationships: TaskRelationships;
	private syncQueue: TaskStoreSyncQueue<TFile>;

	constructor(plugin: TTasksPlugin) {
		this.plugin = plugin;
		this.tasks.subscribe((tasks) => {
			this.taskMap = new Map(tasks.map((task) => [normalizePath(task.path), task]));
		});
		this.writer = new TaskWriter(plugin, this.tasks, this.folderPath, (path) => this.getByPath(path));
		this.migrations = new TaskMigrations(plugin);
		this.relationships = new TaskRelationships(plugin);
		this.syncQueue = new TaskStoreSyncQueue({
			shouldTrackPath: (path, extension) => path.startsWith(this.folderPath + '/') && extension === 'md',
			resolveFileByPath: (path) => {
				const file = this.app.vault.getAbstractFileByPath(path);
				if (!(file instanceof TFile)) return null;
				return file;
			},
			parseFile: (file) => this.fileToTask(file),
			applyParsedTasks: (parsed) => this.applyParsedTasks(parsed),
			onTaskParsed: (task) => this.writer.syncParentChecklistFromChildPublic(task),
			log: (message) => this.plugin.log(message),
		});
	}

	get app() { return this.plugin.app; }

	get folderPath(): string {
		return normalizePath(this.plugin.settings.tasksFolder);
	}

	getByPath(path: string): Task | undefined {
		const normalized = normalizePath(path.endsWith('.md') ? path : `${path}.md`);
		return this.taskMap.get(normalized);
	}

	getAll(): Task[] {
		return get(this.tasks);
	}

	// ── Load ────────────────────────────────────────────────────────────────────

	async load(): Promise<void> {
		const startedAt = Date.now();
		const folder = this.app.vault.getFolderByPath(this.folderPath);
		if (!folder) {
			this.plugin.log(`folder not found — "${this.folderPath}"`);
			this.tasks.set([]);
			return;
		}

		const files = folder.children.filter(
			(f): f is TFile => f instanceof TFile && f.extension === 'md'
		);

		this.plugin.log(`found ${files.length} file(s) in ${this.folderPath}`);

		const loaded = (await Promise.all(files.map(f => this.fileToTask(f))))
			.filter((t): t is Task => t !== null);

		this.plugin.log(`loaded ${loaded.length} task(s) in ${Date.now() - startedAt}ms`);
		this.tasks.set(loaded);
	}

	// ── Watchers ─────────────────────────────────────────────────────────────

	private applyParsedTasks(parsed: Task[]): void {
		this.tasks.update((all) => {
			const next = [...all];
			const indexByPath = new Map(next.map((task, idx) => [task.path, idx]));

			for (const task of parsed) {
				const existingIdx = indexByPath.get(task.path);
				if (existingIdx === undefined) {
					next.push(task);
					indexByPath.set(task.path, next.length - 1);
				} else {
					next[existingIdx] = task;
				}
			}

			return next;
		});
	}

	register(): void {
		this.plugin.register(() => {
			this.syncQueue.dispose();
		});

		this.plugin.registerEvent(
			this.app.metadataCache.on('changed', (file) => {
				this.syncQueue.queueFile(file);
			})
		);

		this.plugin.registerEvent(
			this.app.vault.on('delete', (file) => {
				if (!(file instanceof TFile)) return;
				if (!file.path.startsWith(this.folderPath + '/')) return;
				this.syncQueue.dropPath(file.path);
				this.tasks.update(all => all.filter(t => t.path !== file.path));
				void this.removeRelationshipReferences(file.path).catch((err: unknown) => this.plugin.log(`removeRelationshipReferences failed: ${String(err)}`));
			})
		);

		this.plugin.registerEvent(
			this.app.vault.on('rename', (file, oldPath) => {
				if (!(file instanceof TFile)) return;
				this.syncQueue.dropPath(oldPath);
				this.tasks.update(all => all.filter(t => t.path !== oldPath));
				if (file.path.startsWith(this.folderPath + '/')) {
					this.syncQueue.queueFile(file);
				}
				// Update relationship references (depends_on, blocks, parent_task)
				// in other tasks that pointed to the old path.
				if (oldPath.startsWith(this.folderPath + '/')) {
					void this.rewriteRelationshipReferences(oldPath, file.path).catch((err: unknown) => this.plugin.log(`rewriteRelationshipReferences failed: ${String(err)}`));
				}
			})
		);
	}

	// ── CRUD (delegated to TaskWriter) ──────────────────────────────────────────

	async create(input: TaskCreateInput): Promise<Task> {
		return this.writer.create(input);
	}

	async update(path: string, updates: Partial<Task>): Promise<void> {
		return this.writer.update(path, updates);
	}

	async updateNotes(path: string, notes: string): Promise<string> {
		return this.writer.updateNotes(path, notes);
	}

	async delete(path: string, options?: { prompt?: boolean }): Promise<void> {
		return this.writer.delete(path, options);
	}

	// ── Dependency mutations (delegated to TaskWriter) ──────────────────────────

	async addDependency(taskPath: string, depPathWithoutExt: string): Promise<void> {
		return this.writer.addDependency(taskPath, depPathWithoutExt);
	}

	async removeDependency(taskPath: string, depPathWithoutExt: string): Promise<void> {
		return this.writer.removeDependency(taskPath, depPathWithoutExt);
	}

	async updateParentTask(taskPath: string, parentPath: string | null): Promise<void> {
		return this.writer.updateParentTask(taskPath, parentPath);
	}

	// ── Higher-level operations (delegated to TaskWriter) ────────────────────────

	async completeAndRecur(task: Task): Promise<Task | null> {
		return this.writer.completeAndRecur(task);
	}

	async setStatus(task: Task, newStatus: string): Promise<void> {
		return this.writer.setStatus(task, newStatus);
	}

	async duplicate(path: string): Promise<Task | null> {
		return this.writer.duplicate(path);
	}

	async restore(path: string): Promise<void> {
		return this.writer.restore(path);
	}

	/**
	 * Convert a task to a project by flipping its `type` field.
	 * Clears `task_type` (a task-only field) as part of the conversion.
	 */
	async convertToProject(path: string): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(normalizePath(path));
		if (!(file instanceof TFile)) return;

		await this.app.fileManager.processFrontMatter(file, (fm) => {
			fm.type = 'project';
			fm.labels = [];
		});
	}

	async openDetail(path: string): Promise<void> {
		this.plugin.activeTaskPath.set(path);
		// Reveal only the board + detail; openBoard() would also pop the rail
		// sidebar open, which is intrusive on every task click.
		await this.plugin.revealBoardLeaf();
		await this.plugin.openDetailPane();
	}

	async openFile(path: string): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(normalizePath(path));
		if (!(file instanceof TFile)) return;
		await this.app.workspace.getLeaf('tab').openFile(file);
	}

	// ── Relationship maintenance (delegated to TaskRelationships) ───────────────

	private rewriteRelationshipReferences(oldPath: string, newPath: string): Promise<void> {
		return this.relationships.rewriteRelationshipReferences(oldPath, newPath);
	}

	private removeRelationshipReferences(deletedPath: string): Promise<void> {
		return this.relationships.removeRelationshipReferences(deletedPath);
	}

	// ── Bulk operations (delegated) ──────────────────────────────────────────────

	async syncBlocks(): Promise<void> {
		return this.relationships.syncBlocks();
	}

	async migrateCssClasses(): Promise<void> {
		return this.migrations.migrateCssClasses();
	}

	async migrateFieldValues(field: MigratableField, mappings: Record<string, string | null>): Promise<number> {
		return this.migrations.migrateFieldValues(field, mappings);
	}

	async migrateStatusChanged(): Promise<number> {
		return this.migrations.migrateStatusChanged();
	}

	async migrateToPhase6DataModel(): Promise<number> {
		return this.migrations.migrateToPhase6DataModel();
	}

	async migrateStatuses(validStatuses: string[]): Promise<number> {
		return this.migrations.migrateStatuses(validStatuses);
	}

	async seedGraphTestData(): Promise<{ created: number; skipped: boolean }> {
		return seedGraphTestData({
			create: (input) => this.create(input),
			addDependency: (taskPath, depPathWithoutExt) => this.addDependency(taskPath, depPathWithoutExt),
			syncBlocks: () => this.syncBlocks(),
			load: () => this.load(),
			getAll: () => get(this.tasks),
			ensureFolder: () => this.ensureFolderPathExists(this.folderPath),
			settings: this.plugin.settings,
			notice: (message) => { new Notice(message); },
		});
	}

	// ── Parsing ─────────────────────────────────────────────────────────────────

	private async fileToTask(file: TFile): Promise<Task | null> {
		const cache = this.app.metadataCache.getFileCache(file);
		const fm = cache?.frontmatter;
		// Coerce before the presence check: a List-typed `name` arrives as
		// ['Ship it'], which is truthy but not a usable title.
		const name = toFrontmatterString(toFrontmatterScalar(fm?.name));
		if (!fm || name === '') {
			console.log(`[TTasks] skipping ${file.name} — cache not ready yet`);
			return null;
		}

		const dashIdx = file.basename.indexOf('-');
		const id = dashIdx >= 0 ? file.basename.substring(0, dashIdx) : file.basename;
		const slug = dashIdx >= 0 ? file.basename.substring(dashIdx + 1) : '';

		const content = await this.app.vault.cachedRead(file);
		const fmEndOffset = cache?.frontmatterPosition?.end?.offset;
		const notes = this.extractNotes(content, fmEndOffset);

		const allowedStatuses = this.plugin.settings.statuses ?? ['Active'];
		const fallbackStatus = allowedStatuses[0] ?? 'Active';
		const normalizedStatus = toFrontmatterEnum(fm.status, allowedStatuses, fallbackStatus);

		const completionStatus = resolveCompletionStatus(this.plugin.settings.statuses, this.plugin.settings.completionStatus);

		const rawArea = toFrontmatterString(toFrontmatterScalar(fm.area));
		const area: string | null = rawArea === '' ? null : rawArea;

		const labels: string[] = toFrontmatterStringArray(fm.labels);

		const holiday_dates: string[] = (Array.isArray(fm.holiday_dates) ? fm.holiday_dates : [fm.holiday_dates])
			.map((v) => toCalendarDate(v))
			.filter((v): v is string => v !== null);

		return {
			id, slug,
			path: file.path,
			type:           toFrontmatterEnum<TaskRecordType>(fm.type, TASK_RECORD_TYPES, 'task'),
			name,
			area,
			status:         normalizedStatus,
			priority:       toFrontmatterEnum<TaskPriority>(fm.priority, PRIORITIES, 'None'),
			labels,
			parent_task:    this.resolveWikiLinkPath(fm.parent_task, file.path),
			depends_on:     this.resolveWikiLinkPaths(fm.depends_on, file.path),
			blocks:         this.resolveWikiLinkPaths(fm.blocks, file.path),
			blocked_reason: toFrontmatterString(fm.blocked_reason),
			assigned_to:    toFrontmatterString(fm.assigned_to),
			source:         toFrontmatterString(fm.source),
			start_date:     toCalendarDate(fm.start_date),
			due_date:       toCalendarDate(fm.due_date),
			due_time:       toFrontmatterStringOrNull(fm.due_time),
			estimated_days: toFrontmatterNumber(toFrontmatterScalar(fm.estimated_days)),
			workweek_only: toFrontmatterBoolean(fm.workweek_only),
			holiday_dates,
			created:         toCalendarDate(fm.created),
			completed:       toCalendarDate(fm.completed),
			status_changed:  toCalendarDate(fm.status_changed),
			pomodoro_count:  toFrontmatterNumber(toFrontmatterScalar(fm.pomodoro_count)),
			focused_minutes: toFrontmatterNumber(toFrontmatterScalar(fm.focused_minutes)),
			notes,
			recurrence:      toFrontmatterStringOrNull(fm.recurrence),
			recurrence_type: toFrontmatterStringOrNull(fm.recurrence_type),
			// Same Obsidian-native-property-type hardening as the other numbers: a
			// List- or Text-typed value must still resolve (see feedback #19).
			recurrence_anchor_day: toFrontmatterNumber(toFrontmatterScalar(fm.recurrence_anchor_day)),
			reminder_override: toFrontmatterOptionalEnum(fm.reminder_override, REMINDER_OVERRIDES),
			is_complete: normalizedStatus === completionStatus,
			is_inbox:    area === null,
		};
	}

	private extractNotes(content: string, fmEndOffset?: number): string {
		if (fmEndOffset !== undefined && fmEndOffset > 0) {
			// Use the cache's exact frontmatter boundary when available
			return content.substring(fmEndOffset).trim();
		}
		// Fallback: manual scan for closing ---
		const fmEnd = content.indexOf('\n---', 3);
		if (fmEnd < 0) return '';
		return content.substring(fmEnd + 4).trim();
	}

	private resolveWikiLinkPath(raw: unknown, sourcePath: string): string | null {
		const linkpath = parseWikiLink(raw);
		if (!linkpath) return null;
		const resolved = this.app.metadataCache.getFirstLinkpathDest(linkpath, sourcePath);
		return resolved ? resolved.path : ensureMdExt(linkpath);
	}

	/**
	 * Resolve a link-list field. A bare scalar is accepted as a one-entry list —
	 * that is what `depends_on` looks like once a user retypes the property to
	 * Text in Obsidian's property settings, and dropping it would silently lose
	 * the relationship.
	 */
	private resolveWikiLinkPaths(raw: unknown, sourcePath: string): string[] {
		const entries: unknown[] = Array.isArray(raw) ? raw : [raw];
		return entries
			.map(v => this.resolveWikiLinkPath(v, sourcePath))
			.filter((v): v is string => v !== null);
	}

	private async ensureFolderPathExists(path: string): Promise<void> {
		await ensureFolderPath(this.app.vault, normalizePath(path));
	}

}
