import { Notice, TFile, normalizePath } from 'obsidian';
import { get, writable, type Writable } from 'svelte/store';
import type TTasksPlugin from '../main';
import type { Task, TaskCreateInput, TaskPriority, TaskRecordType } from '../types';
import { resolveCompletionStatus } from '../settings';
import { localDateString, addDaysLocal } from '../utils/dateUtils';
import { ensureMdExt } from '../utils/pathUtils';
import { parseWikiLink } from '../utils/wikiLink';
import { TaskWriter } from './TaskWriter';
import { TaskMigrations, type MigratableField } from './TaskMigrations';
import { TaskRelationships } from './TaskRelationships';

export class TaskStore {
	readonly tasks: Writable<Task[]> = writable([]);

	private plugin: TTasksPlugin;
	private writer: TaskWriter;
	readonly migrations: TaskMigrations;
	readonly relationships: TaskRelationships;
	private changedTaskPaths = new Set<string>();
	private changedFlushTimer: ReturnType<typeof setTimeout> | null = null;
	private changedFlushInFlight = false;
	private readonly changedFlushDelayMs = 80;

	constructor(plugin: TTasksPlugin) {
		this.plugin = plugin;
		this.writer = new TaskWriter(plugin, this.tasks, this.folderPath);
		this.migrations = new TaskMigrations(plugin);
		this.relationships = new TaskRelationships(plugin);
	}

	get app() { return this.plugin.app; }

	get folderPath(): string {
		return normalizePath(this.plugin.settings.tasksFolder);
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

	private queueChangedTask(file: TFile): void {
		if (!file.path.startsWith(this.folderPath + '/')) return;
		if (file.extension !== 'md') return;
		this.changedTaskPaths.add(file.path);
		this.scheduleChangedFlush();
	}

	private scheduleChangedFlush(): void {
		if (this.changedFlushTimer) return;
		this.changedFlushTimer = setTimeout(() => {
			this.changedFlushTimer = null;
			void this.flushChangedTasks();
		}, this.changedFlushDelayMs);
	}

	private async flushChangedTasks(): Promise<void> {
		if (this.changedFlushInFlight) return;
		if (this.changedTaskPaths.size === 0) return;

		this.changedFlushInFlight = true;
		const startedAt = Date.now();

		try {
			// Atomic swap — avoids losing paths queued during an async yield
			const paths = [...this.changedTaskPaths];
			this.changedTaskPaths = new Set();

			const files = paths
				.map((path) => this.app.vault.getAbstractFileByPath(normalizePath(path)))
				.filter((f): f is TFile => f instanceof TFile && f.extension === 'md');

			if (files.length === 0) return;

			const parsed = (await Promise.all(files.map((f) => this.fileToTask(f))))
				.filter((t): t is Task => t !== null);

			if (parsed.length === 0) return;

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

			await Promise.all(parsed.map((task) => this.writer.syncParentChecklistFromChildPublic(task)));
			this.plugin.log(`flushed ${parsed.length} changed task(s) in ${Date.now() - startedAt}ms`);
		} finally {
			this.changedFlushInFlight = false;
		}

		if (this.changedTaskPaths.size > 0) {
			this.scheduleChangedFlush();
		}
	}

	register(): void {
		this.plugin.registerEvent(
			this.app.metadataCache.on('changed', (file) => {
				this.queueChangedTask(file);
			})
		);

		this.plugin.registerEvent(
			this.app.vault.on('delete', (file) => {
				if (!(file instanceof TFile)) return;
				if (!file.path.startsWith(this.folderPath + '/')) return;
				this.changedTaskPaths.delete(file.path);
				this.tasks.update(all => all.filter(t => t.path !== file.path));
				void this.removeRelationshipReferences(file.path);
			})
		);

		this.plugin.registerEvent(
			this.app.vault.on('rename', (file, oldPath) => {
				if (!(file instanceof TFile)) return;
				this.changedTaskPaths.delete(oldPath);
				this.tasks.update(all => all.filter(t => t.path !== oldPath));
				if (file.path.startsWith(this.folderPath + '/')) {
					this.queueChangedTask(file);
				}
				// Update relationship references (depends_on, blocks, parent_task)
				// in other tasks that pointed to the old path.
				if (oldPath.startsWith(this.folderPath + '/')) {
					void this.rewriteRelationshipReferences(oldPath, file.path);
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
		await this.plugin.openBoard();
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
		const existing = get(this.tasks).filter((task) => task.name.startsWith('[GS]'));
		if (existing.length > 0) {
			new Notice(`TTasks: graph sandbox already exists (${existing.length} tasks).`);
			return { created: 0, skipped: true };
		}

		await this.ensureFolderPathExists(this.folderPath);

		const statuses = this.plugin.settings.statuses ?? ['Active'];
		const completion = resolveCompletionStatus(statuses, this.plugin.settings.completionStatus);
		const status = (preferred: string, fallbackIndex = 0): string => {
			if (statuses.includes(preferred)) return preferred;
			return statuses[fallbackIndex] ?? statuses[0] ?? 'Active';
		};

		const iso = (daysFromToday: number): string => {
			return addDaysLocal(localDateString(), daysFromToday);
		};

		const makeInput = (overrides: Partial<TaskCreateInput> & Pick<TaskCreateInput, 'name' | 'type'>): TaskCreateInput => ({
			type: overrides.type,
			name: overrides.name,
			area: overrides.area ?? 'graph-sandbox',
			status: overrides.status ?? status('Active'),
			priority: overrides.priority ?? 'Medium',
			labels: overrides.labels ?? [],
			parent_task: overrides.parent_task ?? null,
			depends_on: overrides.depends_on ?? [],
			blocked_reason: overrides.blocked_reason ?? '',
			assigned_to: overrides.assigned_to ?? 'team',
			source: overrides.source ?? 'GraphSandbox',
			start_date: overrides.start_date ?? null,
			due_date: overrides.due_date ?? null,
			due_time: overrides.due_time ?? null,
			estimated_days: overrides.estimated_days ?? null,
			created: overrides.created ?? iso(-2),
			completed: overrides.completed ?? null,
			notes: overrides.notes ?? '',
			recurrence: overrides.recurrence ?? null,
			recurrence_type: overrides.recurrence_type ?? null,
		});

		const created: Task[] = [];

		const platformProject = await this.create(makeInput({
			type: 'project',
			name: '[GS] Platform Revamp',
			area: 'Product',
			status: status('In Progress', 1),
			priority: 'High',
			start_date: iso(-8),
			due_date: iso(20),
			notes: 'Parent project for dependency and timeline graph testing.',
		}));
		created.push(platformProject);

		const dataProject = await this.create(makeInput({
			type: 'project',
			name: '[GS] Data Reliability Program',
			area: 'Data',
			status: status('Active', 1),
			priority: 'High',
			start_date: iso(-6),
			due_date: iso(24),
			notes: 'Parent project for migration and dependency testing.',
		}));
		created.push(dataProject);

		const platformParent = platformProject.path.replace(/\.md$/, '');
		const dataParent = dataProject.path.replace(/\.md$/, '');

		const apiContract = await this.create(makeInput({
			type: 'task',
			name: '[GS] API Contract Baseline',
			area: 'Product',
			status: status('In Progress', 1),
			priority: 'High',
			labels: ['feature'],
			parent_task: platformParent,
			start_date: iso(-5),
			due_date: iso(2),
			estimated_days: 7,
		}));
		created.push(apiContract);

		const detailPanel = await this.create(makeInput({
			type: 'task',
			name: '[GS] Detail Panel Integration',
			area: 'Product',
			status: status('Active', 1),
			priority: 'High',
			labels: ['feature'],
			parent_task: platformParent,
			depends_on: [apiContract.path.replace(/\.md$/, '')],
			start_date: iso(1),
			due_date: iso(8),
			estimated_days: 5,
		}));
		created.push(detailPanel);

		const smokeTests = await this.create(makeInput({
			type: 'task',
			name: '[GS] Integration Smoke Tests',
			area: 'QA',
			status: status('Future', 2),
			priority: 'Medium',
			labels: ['docs'],
			parent_task: platformParent,
			depends_on: [detailPanel.path.replace(/\.md$/, '')],
			start_date: iso(8),
			due_date: iso(12),
			estimated_days: 3,
		}));
		created.push(smokeTests);

		const releaseReadiness = await this.create(makeInput({
			type: 'task',
			name: '[GS] Release Readiness Review',
			area: 'Product',
			status: status('Future', 2),
			priority: 'Medium',
			labels: ['action'],
			parent_task: platformParent,
			depends_on: [smokeTests.path.replace(/\.md$/, '')],
			start_date: iso(12),
			due_date: iso(16),
			estimated_days: 2,
		}));
		created.push(releaseReadiness);

		const etlHardening = await this.create(makeInput({
			type: 'task',
			name: '[GS] ETL Pipeline Hardening',
			area: 'Data',
			status: status('In Progress', 1),
			priority: 'High',
			labels: ['feature'],
			parent_task: dataParent,
			start_date: iso(-4),
			due_date: iso(4),
			estimated_days: 6,
		}));
		created.push(etlHardening);

		const migrationDryRun = await this.create(makeInput({
			type: 'task',
			name: '[GS] Migration Dry Run',
			area: 'Data',
			status: status('Blocked', 1),
			priority: 'High',
			labels: ['research'],
			parent_task: dataParent,
			depends_on: [etlHardening.path.replace(/\.md$/, '')],
			blocked_reason: 'Waiting for ETL hardening sign-off.',
			start_date: iso(5),
			due_date: iso(10),
			estimated_days: 3,
		}));
		created.push(migrationDryRun);

		const backfillVerification = await this.create(makeInput({
			type: 'task',
			name: '[GS] Backfill Verification',
			area: 'Data',
			status: status('Future', 2),
			priority: 'Medium',
			labels: ['action'],
			parent_task: dataParent,
			depends_on: [migrationDryRun.path.replace(/\.md$/, ''), detailPanel.path.replace(/\.md$/, '')],
			start_date: iso(10),
			due_date: iso(18),
			estimated_days: 4,
		}));
		created.push(backfillVerification);

		const cycleA = await this.create(makeInput({
			type: 'task',
			name: '[GS] Incident Follow-up A',
			area: 'Operations',
			status: status('Active', 1),
			priority: 'Low',
			labels: ['action'],
			parent_task: platformParent,
			start_date: iso(-1),
			due_date: iso(6),
			estimated_days: 2,
		}));
		created.push(cycleA);

		const cycleB = await this.create(makeInput({
			type: 'task',
			name: '[GS] Incident Follow-up B',
			area: 'Operations',
			status: status('Active', 1),
			priority: 'Low',
			labels: ['action'],
			parent_task: platformParent,
			depends_on: [cycleA.path.replace(/\.md$/, '')],
			start_date: iso(0),
			due_date: iso(7),
			estimated_days: 2,
		}));
		created.push(cycleB);

		const cycleAFile = this.app.vault.getAbstractFileByPath(cycleA.path);
		if (cycleAFile instanceof TFile) {
			await this.app.fileManager.processFrontMatter(cycleAFile, (fm) => {
				fm.depends_on = [`[[${cycleB.path.replace(/\.md$/, '')}|${cycleB.name}]]`];
				if (fm.status === completion) {
					fm.status = status('Active', 1);
					fm.completed = null;
				}
			});
		}

		await this.syncBlocks();
		await this.load();

		new Notice(`TTasks: seeded ${created.length} graph sandbox tasks.`);
		return { created: created.length, skipped: false };
	}

	// ── Parsing ─────────────────────────────────────────────────────────────────

	private async fileToTask(file: TFile): Promise<Task | null> {
		const cache = this.app.metadataCache.getFileCache(file);
		const fm = cache?.frontmatter;
		if (!fm?.name) {
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
		const rawStatus = typeof fm.status === 'string' ? fm.status : '';
		const normalizedStatus = rawStatus && allowedStatuses.includes(rawStatus)
			? rawStatus
			: fallbackStatus;

		const completionStatus = resolveCompletionStatus(this.plugin.settings.statuses, this.plugin.settings.completionStatus);

		const area: string | null = typeof fm.area === 'string' ? fm.area : null;

		const labelsRaw = fm.labels;
		const labels: string[] = Array.isArray(labelsRaw)
			? labelsRaw.filter((v): v is string => typeof v === 'string')
			: [];

		return {
			id, slug,
			path: file.path,
			type:           (fm.type as TaskRecordType)  ?? 'task',
			name:           fm.name                       ?? '',
			area,
			status:         normalizedStatus,
			priority:       (fm.priority as TaskPriority) ?? 'None',
			labels,
			parent_task:    this.resolveWikiLinkPath(fm.parent_task, file.path),
			depends_on:     this.resolveWikiLinkPaths(fm.depends_on, file.path),
			blocks:         this.resolveWikiLinkPaths(fm.blocks, file.path),
			blocked_reason: fm.blocked_reason ?? '',
			assigned_to:    fm.assigned_to    ?? '',
			source:         fm.source         ?? '',
			start_date:     fm.start_date     ?? null,
			due_date:       fm.due_date       ?? null,
			due_time:       typeof fm.due_time === 'string' ? fm.due_time : null,
			estimated_days: fm.estimated_days ?? null,
			created:         fm.created         ?? null,
			completed:       fm.completed       ?? null,
			status_changed:  typeof fm.status_changed === 'string' ? fm.status_changed : null,
			notes,
			recurrence:      typeof fm.recurrence === 'string' ? fm.recurrence : null,
			recurrence_type: typeof fm.recurrence_type === 'string' ? fm.recurrence_type : null,
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

	private resolveWikiLinkPaths(raw: unknown, sourcePath: string): string[] {
		if (!Array.isArray(raw)) return [];
		return (raw as unknown[])
			.map(v => this.resolveWikiLinkPath(v, sourcePath))
			.filter((v): v is string => v !== null);
	}

	private async ensureFolderPathExists(path: string): Promise<void> {
		const segments = normalizePath(path).split('/').filter(Boolean);
		let current = '';

		for (const segment of segments) {
			current = current ? `${current}/${segment}` : segment;
			const existing = this.app.vault.getAbstractFileByPath(current);
			if (!existing) {
				await this.app.vault.createFolder(current);
			}
		}
	}

}
