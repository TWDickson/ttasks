import { Notice, TFile, normalizePath } from 'obsidian';
import { get, writable, type Writable } from 'svelte/store';
import type TTasksPlugin from '../main';
import type { Task, TaskCreateInput, TaskPriority, TaskType, TaskRecordType } from '../types';
import { getUniqueTaskPath, sanitizeDependsOnPaths } from './taskCreateGuards';
import { materializeChecklistChildren } from './checklistMaterializer';
import { resolveCompletionStatus, resolveInboxStatus } from '../settings';
import { nextDueDate, nextStartDate } from './recurrence';
import { resetChecklistCompletionInNotes } from './recurrenceNotes';
import { deleteFileSafely } from '../integration/safeDelete';
import { buildAliasedLink } from '../integration/relationshipLink';
import { localDateString, addDaysLocal } from '../utils/dateUtils';

type MigratableField = 'status' | 'category' | 'task_type';

export class TaskStore {
	readonly tasks: Writable<Task[]> = writable([]);

	private plugin: TTasksPlugin;
	private changedTaskPaths = new Set<string>();
	private changedFlushTimer: ReturnType<typeof setTimeout> | null = null;
	private changedFlushInFlight = false;
	private readonly changedFlushDelayMs = 80;

	constructor(plugin: TTasksPlugin) {
		this.plugin = plugin;
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

			await Promise.all(parsed.map((task) => this.syncParentChecklistFromChild(task)));
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

	// ── CRUD ────────────────────────────────────────────────────────────────────

	async create(input: TaskCreateInput): Promise<Task> {
		const unique = getUniqueTaskPath(
			this.folderPath,
			input.name,
			(path) => !!this.app.vault.getAbstractFileByPath(normalizePath(path))
		);

		if (!unique) {
			throw new Error('Unable to allocate a unique task filename after multiple attempts');
		}

		const shortId = unique.shortId;
		const slug = unique.slug;
		const filePath = normalizePath(unique.filePath);

		const today = localDateString();
		const sanitizedDependsOn = sanitizeDependsOnPaths(
			input.depends_on,
			filePath,
			(pathWithoutExt) => {
				const depFile = this.app.vault.getAbstractFileByPath(normalizePath(pathWithoutExt + '.md'));
				return depFile instanceof TFile;
			}
		);

		const completionStatus = resolveCompletionStatus(this.plugin.settings.statuses, this.plugin.settings.completionStatus);
		const inboxStatus = resolveInboxStatus(this.plugin.settings.statuses, this.plugin.settings.inboxStatus);
		const full: Task = {
			...input,
			depends_on: sanitizedDependsOn,
			id: shortId,
			slug,
			path: filePath,
			blocks: [],
			created: today,
			is_complete: input.status === completionStatus,
			is_inbox:    input.status === inboxStatus,
		};

		const body = full.notes?.trim() ? '\n\n' + full.notes.trim() : '';
		await this.app.vault.create(filePath, this.buildFrontmatter(full) + body + '\n');

		// Sync blocks on depends_on targets
		for (const depPath of sanitizedDependsOn) {
			await this.addToBlocks(depPath, filePath, input.name);
		}

		return full;
	}

	async update(path: string, updates: Partial<Task>): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(normalizePath(path));
		if (!(file instanceof TFile)) return;

		await this.app.fileManager.processFrontMatter(file, (fm) => {
			const fields: (keyof Task)[] = [
				'name', 'status', 'priority', 'category', 'task_type',
				'blocked_reason', 'assigned_to', 'source',
				'start_date', 'due_date', 'estimated_days', 'completed',
				'recurrence', 'recurrence_type',
			];
			for (const key of fields) {
				if (key in updates) fm[key] = (updates as Record<string, unknown>)[key] ?? null;
			}
		});
	}

	/**
	 * Check whether a file is currently open in an active editor.
	 * vault.process() can conflict with the editor's requestSave debounce
	 * (~2s window), so callers that rewrite file bodies should be aware.
	 */
	private isFileOpenInEditor(file: TFile): boolean {
		return this.app.workspace.getLeavesOfType('markdown')
			.some(leaf => (leaf.view as any)?.file?.path === file.path);
	}

	async updateNotes(path: string, notes: string): Promise<string> {
		const file = this.app.vault.getAbstractFileByPath(normalizePath(path));
		if (!(file instanceof TFile)) return notes;

		const rewritten = await this.materializeChecklistChildrenFromBody(path, notes);

		if (this.isFileOpenInEditor(file)) {
			// Delay slightly to let the editor's requestSave debounce settle.
			// vault.process() can silently conflict with pending editor saves.
			await new Promise(resolve => setTimeout(resolve, 100));
		}

		await this.app.vault.process(file, (content) => {
			const fmEnd = content.indexOf('\n---', 3);
			const frontmatter = fmEnd >= 0 ? content.substring(0, fmEnd + 4) : content;
			return frontmatter + (rewritten ? '\n\n' + rewritten : '') + '\n';
		});

		await this.syncChildrenFromParentChecklist(path, rewritten);
		return rewritten;
	}

	private normalizeTaskPath(pathLike: string): string {
		const trimmed = pathLike.trim();
		if (!trimmed) return '';
		return trimmed.endsWith('.md') ? trimmed : `${trimmed}.md`;
	}

	private completionStatus(): string {
		return resolveCompletionStatus(this.plugin.settings.statuses, this.plugin.settings.completionStatus);
	}

	private isCompleteStatus(status: string): boolean {
		return status === this.completionStatus();
	}

	private extractChecklistLink(line: string): { checked: boolean; path: string } | null {
		const match = line.match(/^\s*- \[( |x|X)\]\s+\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/);
		if (!match) return null;
		return {
			checked: (match[1] ?? ' ').toLowerCase() === 'x',
			path: this.normalizeTaskPath(match[2] ?? ''),
		};
	}

	private async syncChildrenFromParentChecklist(parentPath: string, body: string): Promise<void> {
		if (!body) return;
		const wanted = new Map<string, boolean>();
		const lines = body.split('\n');

		for (const line of lines) {
			const parsed = this.extractChecklistLink(line);
			if (!parsed?.path) continue;
			wanted.set(parsed.path, parsed.checked);
		}

		if (wanted.size === 0) return;

		const complete = this.completionStatus();
		const fallback = this.plugin.settings.statuses?.[0] ?? 'Active';
		const tasksByPath = new Map(get(this.tasks).map((t) => [t.path, t]));
		const today = localDateString();
		const updates: Promise<void>[] = [];

		for (const [childPath, checked] of wanted.entries()) {
			if (childPath === parentPath) continue;
			const child = tasksByPath.get(childPath);
			if (!child) continue;

			const targetStatus = checked ? complete : (child.status === complete ? fallback : child.status);
			const targetCompleted = checked ? today : null;
			const statusChanged = child.status !== targetStatus;
			const completedChanged = (child.completed ?? null) !== targetCompleted;
			if (!statusChanged && !completedChanged) continue;

			updates.push(this.update(child.path, {
				status: targetStatus,
				completed: targetCompleted,
			}));
		}

		if (updates.length > 0) {
			await Promise.all(updates);
		}
	}

	private async syncParentChecklistFromChild(child: Task): Promise<void> {
		if (!child.parent_task) return;
		const parentPath = this.normalizeTaskPath(child.parent_task);
		const parentFile = this.app.vault.getAbstractFileByPath(normalizePath(parentPath));
		if (!(parentFile instanceof TFile)) return;

		const content = await this.app.vault.cachedRead(parentFile);
		const fmEnd = content.indexOf('\n---', 3);
		if (fmEnd < 0) return;

		const body = content.substring(fmEnd + 4).trim();
		if (!body) return;

		const lines = body.split('\n');
		const childPathWithoutExt = child.path.replace(/\.md$/, '');
		const shouldBeChecked = this.isCompleteStatus(child.status);
		let changed = false;

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			const match = line.match(/^(\s*)- \[( |x|X)\](\s+\[\[([^\]|]+)(?:\|[^\]]+)?\]\].*)$/);
			if (!match) continue;
			const linked = this.normalizeTaskPath(match[4] ?? '');
			if (linked !== child.path && linked.replace(/\.md$/, '') !== childPathWithoutExt) continue;

			const currentChecked = (match[2] ?? ' ').toLowerCase() === 'x';
			if (currentChecked === shouldBeChecked) continue;

			const marker = shouldBeChecked ? 'x' : ' ';
			lines[i] = `${match[1]}- [${marker}]${match[3]}`;
			changed = true;
		}

		if (!changed) return;

		if (this.isFileOpenInEditor(parentFile)) {
			await new Promise(resolve => setTimeout(resolve, 100));
		}

		const rewritten = lines.join('\n').trim();
		await this.app.vault.process(parentFile, (current) => {
			const currentFmEnd = current.indexOf('\n---', 3);
			if (currentFmEnd < 0) return current;
			const frontmatter = current.substring(0, currentFmEnd + 4);
			return frontmatter + (rewritten ? '\n\n' + rewritten : '') + '\n';
		});
	}

	private buildChildTaskInput(parent: Task, title: string, parentPath: string): TaskCreateInput {
		const today = localDateString();
		return {
			type: 'task',
			name: title,
			category: parent.category,
			status: parent.status,
			priority: parent.priority,
			task_type: parent.task_type,
			parent_task: parentPath.replace(/\.md$/, ''),
			depends_on: [],
			blocked_reason: '',
			assigned_to: parent.assigned_to,
			source: parent.source,
			start_date: parent.start_date,
			due_date: null,
			estimated_days: null,
			created: today,
			completed: null,
			notes: '',
			recurrence: null,
			recurrence_type: null,
		};
	}

	private async materializeChecklistChildrenFromBody(parentPath: string, body: string): Promise<string> {
		if (!body) return body;
		const parent = get(this.tasks).find(t => t.path === parentPath);
		if (!parent) return body;

		return materializeChecklistChildren({
			body,
			parentPath,
			extractChecklistLink: (line) => this.extractChecklistLink(line),
			createChecklistChild: async (content, effectiveParentPath) => {
				const child = await this.create(this.buildChildTaskInput(parent, content, effectiveParentPath));
				return { path: child.path, name: child.name };
			},
		});
	}

	async addDependency(taskPath: string, depPathWithoutExt: string): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(normalizePath(taskPath));
		if (!(file instanceof TFile)) return;
		const selfClean = taskPath.replace(/\.md$/, '');
		if (depPathWithoutExt === selfClean) return;

		const depFile = this.app.vault.getAbstractFileByPath(normalizePath(depPathWithoutExt + '.md'));
		if (!(depFile instanceof TFile)) return;

		const all = get(this.tasks);
		const depTask = all.find(t => t.path.replace(/\.md$/, '') === depPathWithoutExt);
		const depName = depTask?.name ?? depPathWithoutExt.split('/').pop() ?? depPathWithoutExt;
		const selfTask = all.find(t => t.path === taskPath);
		const selfName = selfTask?.name ?? taskPath.replace(/\.md$/, '').split('/').pop() ?? taskPath;
		const depLink = this.buildAliasedTaskLink(depPathWithoutExt, depName, file.path);

		await this.app.fileManager.processFrontMatter(file, (fm) => {
			const current: unknown[] = Array.isArray(fm.depends_on) ? fm.depends_on : [];
			const already = current.some(v => String(v ?? '').includes(depPathWithoutExt));
			if (!already) fm.depends_on = [...current, depLink];
		});

		await this.addToBlocks(depPathWithoutExt, taskPath, selfName);
	}

	async removeDependency(taskPath: string, depPathWithoutExt: string): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(normalizePath(taskPath));
		if (!(file instanceof TFile)) return;

		await this.app.fileManager.processFrontMatter(file, (fm) => {
			if (!Array.isArray(fm.depends_on)) return;
			fm.depends_on = fm.depends_on.filter((v: unknown) => !String(v ?? '').includes(depPathWithoutExt));
		});

		// Remove from blocks on the dependency target
		const depFile = this.app.vault.getAbstractFileByPath(normalizePath(depPathWithoutExt + '.md'));
		if (depFile instanceof TFile) {
			const selfClean = taskPath.replace(/\.md$/, '');
			await this.app.fileManager.processFrontMatter(depFile, (fm) => {
				if (!Array.isArray(fm.blocks)) return;
				fm.blocks = fm.blocks.filter((v: unknown) => !String(v ?? '').includes(selfClean));
			});
		}
	}

	async updateParentTask(taskPath: string, parentPath: string | null): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(normalizePath(taskPath));
		if (!(file instanceof TFile)) return;

		await this.app.fileManager.processFrontMatter(file, (fm) => {
			if (!parentPath) {
				fm.parent_task = null;
				return;
			}
			const all = get(this.tasks);
			const parent = all.find(t => t.path.replace(/\.md$/, '') === parentPath);
			const name = parent?.name ?? parentPath.split('/').pop() ?? parentPath;
			fm.parent_task = this.buildAliasedTaskLink(parentPath, name, file.path);
		});
	}

	async delete(path: string, options?: { prompt?: boolean }): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(normalizePath(path));
		if (!(file instanceof TFile)) return;

		const fileManager = this.app.fileManager as typeof this.app.fileManager & {
			promptForDeletion?: (file: TFile) => Promise<void> | void;
			trashFile?: (file: TFile) => Promise<void> | void;
		};

		await deleteFileSafely(file, {
			promptForDeletion: fileManager.promptForDeletion,
			trashFile: fileManager.trashFile,
			vaultDelete: (f) => this.app.vault.delete(f),
		}, { prompt: options?.prompt ?? false });
	}

	/**
	 * Mark the task complete and, if it has a recurrence rule, create the next
	 * instance with dates advanced by one interval. Returns the new task, or
	 * null if the task has no recurrence rule.
	 */
	async completeAndRecur(task: Task): Promise<Task | null> {
		const today = localDateString();
		const completionStatus = resolveCompletionStatus(this.plugin.settings.statuses, this.plugin.settings.completionStatus);

		await this.update(task.path, { status: completionStatus, completed: today });

		if (!task.recurrence) return null;

		const recurType = (task.recurrence_type ?? 'fixed') as import('./recurrence').RecurrenceType;
		const nextDue   = nextDueDate(task.recurrence, recurType, task.due_date, today);
		const nextStart = nextStartDate(task.recurrence, recurType, task.start_date, task.due_date, today);
		const inboxStatus = resolveInboxStatus(this.plugin.settings.statuses, this.plugin.settings.inboxStatus);

		const nextInput: TaskCreateInput = {
			type:            task.type,
			name:            task.name,
			category:        task.category,
			status:          inboxStatus,
			priority:        task.priority,
			task_type:       task.task_type,
			parent_task:     task.parent_task,
			depends_on:      [],
			blocked_reason:  '',
			assigned_to:     task.assigned_to,
			source:          task.source,
			start_date:      nextStart,
			due_date:        nextDue,
			estimated_days:  task.estimated_days,
			created:         today,
			completed:       null,
			notes:           resetChecklistCompletionInNotes(task.notes ?? ''),
			recurrence:      task.recurrence,
			recurrence_type: task.recurrence_type,
		};

		return this.create(nextInput);
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

	// ── Relationship maintenance ─────────────────────────────────────────────────

	private async rewriteRelationshipReferences(oldPath: string, newPath: string): Promise<void> {
		const oldClean = oldPath.replace(/\.md$/, '');
		const newClean = newPath.replace(/\.md$/, '');
		if (oldClean === newClean) return;

		const folder = this.app.vault.getFolderByPath(this.folderPath);
		if (!folder) return;

		const files = folder.children.filter(
			(f): f is TFile => f instanceof TFile && f.extension === 'md' && f.path !== newPath
		);

		const oldPattern = oldClean.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		const linkRegex = new RegExp(`\\[\\[${oldPattern}(\\|[^\\]]+)?\\]\\]`, 'g');

		for (const file of files) {
			const cache = this.app.metadataCache.getFileCache(file);
			const fm = cache?.frontmatter;
			if (!fm) continue;

			const raw = JSON.stringify(fm);
			if (!raw.includes(oldClean)) continue;

			await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
				const rewriteLink = (val: unknown): unknown => {
					if (typeof val !== 'string') return val;
					return val.replace(linkRegex, (match, alias) => `[[${newClean}${alias ?? ''}]]`);
				};

				for (const key of ['parent_task', 'blocked_reason']) {
					if (typeof frontmatter[key] === 'string' && frontmatter[key].includes(oldClean)) {
						frontmatter[key] = rewriteLink(frontmatter[key]);
					}
				}

				for (const key of ['depends_on', 'blocks']) {
					if (Array.isArray(frontmatter[key])) {
						frontmatter[key] = frontmatter[key].map((v: unknown) => rewriteLink(v));
					}
				}
			});
		}

		this.plugin.log(`Rewrote relationship references: ${oldClean} → ${newClean}`);
	}

	private async removeRelationshipReferences(deletedPath: string): Promise<void> {
		const deletedClean = deletedPath.replace(/\.md$/, '');
		const folder = this.app.vault.getFolderByPath(this.folderPath);
		if (!folder) return;

		const files = folder.children.filter(
			(f): f is TFile => f instanceof TFile && f.extension === 'md' && f.path !== deletedPath
		);

		let touched = 0;
		for (const file of files) {
			const cache = this.app.metadataCache.getFileCache(file);
			const fm = cache?.frontmatter;
			if (!fm) continue;

			const raw = JSON.stringify(fm);
			if (!raw.includes(deletedClean)) continue;

			let changed = false;
			await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
				const currentParent = this.parseWikiLink(frontmatter.parent_task);
				if (currentParent === deletedClean) {
					frontmatter.parent_task = null;
					changed = true;
				}

				for (const key of ['depends_on', 'blocks']) {
					if (!Array.isArray(frontmatter[key])) continue;
					const current = frontmatter[key] as unknown[];
					const next = current.filter((value: unknown) => this.parseWikiLink(value) !== deletedClean);
					if (next.length !== current.length) {
						frontmatter[key] = next;
						changed = true;
					}
				}
			});

			if (changed) touched += 1;
		}

		if (touched > 0) {
			this.plugin.log(`Removed relationship references to deleted task: ${deletedClean} (${touched} file(s))`);
		}
	}

	// ── Bulk operations ──────────────────────────────────────────────────────────

	async syncBlocks(): Promise<void> {
		const folder = this.app.vault.getFolderByPath(this.folderPath);
		if (!folder) { new Notice('TTasks: tasks folder not found'); return; }

		const files = folder.children.filter(
			(f): f is TFile => f instanceof TFile && f.extension === 'md'
		);

		// Build reverse index: cleanPath → tasks that depend on it
		const reverseMap = new Map<string, { path: string; name: string }[]>();

		for (const file of files) {
			const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
			if (!fm) continue;
			const name: string = fm.name ?? file.basename;
			const deps = this.parseWikiLinks(fm.depends_on);
			for (const dep of deps) {
				if (!reverseMap.has(dep)) reverseMap.set(dep, []);
				reverseMap.get(dep)!.push({ path: file.path.replace(/\.md$/, ''), name });
			}
		}

		for (const file of files) {
			const cleanPath = file.path.replace(/\.md$/, '');
			const blockers = reverseMap.get(cleanPath) ?? [];
			await this.app.fileManager.processFrontMatter(file, (fm) => {
				fm.blocks = blockers.map((b) => this.buildAliasedTaskLink(b.path, b.name, file.path));
			});
		}

		this.plugin.log(`SyncBlocks complete — ${files.length} files processed`);
	}

	async migrateCssClasses(): Promise<void> {
		const folder = this.app.vault.getFolderByPath(this.folderPath);
		if (!folder) { this.plugin.log('migrateCssClasses: tasks folder not found'); return; }

		const files = folder.children.filter(
			(f): f is TFile => f instanceof TFile && f.extension === 'md'
		);

		let patched = 0;
		for (const file of files) {
			await this.app.fileManager.processFrontMatter(file, (fm) => {
				const existing: string[] = Array.isArray(fm.cssclasses)
					? fm.cssclasses
					: typeof fm.cssclasses === 'string' ? [fm.cssclasses] : [];
				if (!existing.includes('ttask')) {
					fm.cssclasses = [...existing, 'ttask'];
					patched++;
				}
			});
		}

		this.plugin.log(`MigrateCssClasses: patched ${patched} of ${files.length} files`);
	}

	async migrateFieldValues(field: MigratableField, mappings: Record<string, string | null>): Promise<number> {
		const folder = this.app.vault.getFolderByPath(this.folderPath);
		if (!folder) return 0;

		const files = folder.children.filter(
			(f): f is TFile => f instanceof TFile && f.extension === 'md'
		);

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

	async migrateStatuses(validStatuses: string[]): Promise<number> {
		const folder = this.app.vault.getFolderByPath(this.folderPath);
		if (!folder) return 0;

		const allowed = new Set(validStatuses);
		const fallback = validStatuses[0] ?? 'Active';

		const files = folder.children.filter(
			(f): f is TFile => f instanceof TFile && f.extension === 'md'
		);

		let patched = 0;
		for (const file of files) {
			await this.app.fileManager.processFrontMatter(file, (fm) => {
				const current = typeof fm.status === 'string' ? fm.status : '';
				if (current && allowed.has(current)) return;
				fm.status = fallback;
				patched++;
			});
		}

		this.plugin.log(`MigrateStatuses: patched ${patched} of ${files.length} files`);
		return patched;
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
			category: overrides.category ?? 'graph-sandbox',
			status: overrides.status ?? status('Active'),
			priority: overrides.priority ?? 'Medium',
			task_type: overrides.task_type ?? null,
			parent_task: overrides.parent_task ?? null,
			depends_on: overrides.depends_on ?? [],
			blocked_reason: overrides.blocked_reason ?? '',
			assigned_to: overrides.assigned_to ?? 'team',
			source: overrides.source ?? 'GraphSandbox',
			start_date: overrides.start_date ?? null,
			due_date: overrides.due_date ?? null,
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
			category: 'Product',
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
			category: 'Data',
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
			category: 'Product',
			status: status('In Progress', 1),
			priority: 'High',
			task_type: 'feature',
			parent_task: platformParent,
			start_date: iso(-5),
			due_date: iso(2),
			estimated_days: 7,
		}));
		created.push(apiContract);

		const detailPanel = await this.create(makeInput({
			type: 'task',
			name: '[GS] Detail Panel Integration',
			category: 'Product',
			status: status('Active', 1),
			priority: 'High',
			task_type: 'feature',
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
			category: 'QA',
			status: status('Future', 2),
			priority: 'Medium',
			task_type: 'docs',
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
			category: 'Product',
			status: status('Future', 2),
			priority: 'Medium',
			task_type: 'action',
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
			category: 'Data',
			status: status('In Progress', 1),
			priority: 'High',
			task_type: 'feature',
			parent_task: dataParent,
			start_date: iso(-4),
			due_date: iso(4),
			estimated_days: 6,
		}));
		created.push(etlHardening);

		const migrationDryRun = await this.create(makeInput({
			type: 'task',
			name: '[GS] Migration Dry Run',
			category: 'Data',
			status: status('Blocked', 1),
			priority: 'High',
			task_type: 'research',
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
			category: 'Data',
			status: status('Future', 2),
			priority: 'Medium',
			task_type: 'action',
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
			category: 'Operations',
			status: status('Active', 1),
			priority: 'Low',
			task_type: 'action',
			parent_task: platformParent,
			start_date: iso(-1),
			due_date: iso(6),
			estimated_days: 2,
		}));
		created.push(cycleA);

		const cycleB = await this.create(makeInput({
			type: 'task',
			name: '[GS] Incident Follow-up B',
			category: 'Operations',
			status: status('Active', 1),
			priority: 'Low',
			task_type: 'action',
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
		const inboxStatus = resolveInboxStatus(this.plugin.settings.statuses, this.plugin.settings.inboxStatus);

		return {
			id, slug,
			path: file.path,
			type:           (fm.type as TaskRecordType)  ?? 'task',
			name:           fm.name                       ?? '',
			category:       fm.category                   ?? null,
			status:         normalizedStatus,
			priority:       (fm.priority as TaskPriority) ?? 'None',
			task_type:      (fm.task_type as TaskType)    ?? null,
			parent_task:    this.parseWikiLink(fm.parent_task),
			depends_on:     this.parseWikiLinks(fm.depends_on),
			blocks:         this.parseWikiLinks(fm.blocks),
			blocked_reason: fm.blocked_reason ?? '',
			assigned_to:    fm.assigned_to    ?? '',
			source:         fm.source         ?? '',
			start_date:     fm.start_date     ?? null,
			due_date:       fm.due_date       ?? null,
			estimated_days: fm.estimated_days ?? null,
			created:        fm.created        ?? null,
			completed:      fm.completed      ?? null,
			notes,
			recurrence:      typeof fm.recurrence === 'string' ? fm.recurrence : null,
			recurrence_type: typeof fm.recurrence_type === 'string' ? fm.recurrence_type : null,
			is_complete: normalizedStatus === completionStatus,
			is_inbox:    normalizedStatus === inboxStatus,
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

	private parseWikiLink(val: unknown): string | null {
		if (!val) return null;
		const match = String(val).match(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/);
		return match ? match[1] : null;
	}

	private parseWikiLinks(val: unknown): string[] {
		if (!Array.isArray(val)) return [];
		return val.map(v => this.parseWikiLink(v)).filter((v): v is string => v !== null);
	}

	private buildAliasedTaskLink(pathWithoutExt: string, alias: string, sourcePath: string): string {
		const cleanPath = pathWithoutExt.replace(/\.md$/, '');
		return buildAliasedLink({
			targetPathWithoutExt: cleanPath,
			alias,
			sourcePath,
			resolveFile: (path) => {
				const resolved = this.app.vault.getAbstractFileByPath(normalizePath(path));
				return resolved instanceof TFile ? resolved : null;
			},
			generateMarkdownLink: (file, src, subpath, linkAlias) => this.app.fileManager.generateMarkdownLink(file, src, subpath, linkAlias),
		});
	}

	private async addToBlocks(depPath: string, thisPath: string, thisName: string): Promise<void> {
		const fullPath = depPath.endsWith('.md') ? depPath : depPath + '.md';
		const depFile = this.app.vault.getAbstractFileByPath(normalizePath(fullPath));
		if (!(depFile instanceof TFile)) return;

		const cleanPath = thisPath.replace(/\.md$/, '');
		const thisLink = this.buildAliasedTaskLink(cleanPath, thisName, depFile.path);
		await this.app.fileManager.processFrontMatter(depFile, (fm) => {
			const current: unknown[] = Array.isArray(fm.blocks) ? fm.blocks : [];
			const already = current.some(b => String(b ?? '').includes(cleanPath));
			if (!already) fm.blocks = [...current, thisLink];
		});
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

	// ── Frontmatter builder (creation only) ──────────────────────────────────────

	private resolveNameForPath(pathWithoutExt: string): string {
		const all = get(this.tasks);
		const match = all.find(t => t.path === pathWithoutExt + '.md' || t.path.replace(/\.md$/, '') === pathWithoutExt);
		if (match) return match.name;
		return pathWithoutExt.split('/').pop()?.replace(/^[a-f0-9]+-/, '') ?? pathWithoutExt;
	}

	private buildFrontmatter(task: Task): string {
		const esc = (s: string) => String(s || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
		const strOrNull = (s: string | null | undefined) => s ? `"${esc(s)}"` : 'null';
		const link = (p: string | null) => {
			if (!p) return 'null';
			const clean = p.replace(/\.md$/, '');
			const name = this.resolveNameForPath(clean);
			return `'[[${clean}|${name}]]'`;
		};
		const depsStr = task.depends_on.length
			? `\n${task.depends_on.map(d => `  - ${link(d)}`).join('\n')}`
			: ' []';

		return [
			'---',
			`type: ${task.type}`,
			`name: "${esc(task.name)}"`,
			`cssclasses: [ttask]`,
			`category: ${strOrNull(task.category)}`,
			`status: "${esc(task.status)}"`,
			`priority: "${esc(task.priority)}"`,
			`task_type: ${strOrNull(task.task_type)}`,
			`parent_task: ${link(task.parent_task)}`,
			`depends_on:${depsStr}`,
			`blocks: []`,
			`blocked_reason: "${esc(task.blocked_reason)}"`,
			`assigned_to: "${esc(task.assigned_to)}"`,
			`source: "${esc(task.source)}"`,
			`start_date: ${task.start_date ? `'${task.start_date}'` : 'null'}`,
			`due_date: ${task.due_date ? `'${task.due_date}'` : 'null'}`,
			`estimated_days: ${task.estimated_days ?? 'null'}`,
			`created: '${task.created}'`,
			`completed: null`,
			`recurrence: ${task.recurrence ? `"${esc(task.recurrence)}"` : 'null'}`,
			`recurrence_type: ${task.recurrence_type ? `"${esc(task.recurrence_type)}"` : 'null'}`,
			'---',
		].join('\n');
	}
}
