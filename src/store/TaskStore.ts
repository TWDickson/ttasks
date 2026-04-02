import { Notice, TFile, normalizePath } from 'obsidian';
import { get, writable, type Writable } from 'svelte/store';
import type TTasksPlugin from '../main';
import type { Task, TaskCreateInput, TaskPriority, TaskType, TaskRecordType } from '../types';
import { getUniqueTaskPath, sanitizeDependsOnPaths } from './taskCreateGuards';
import { resolveCompletionStatus } from '../settings';

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
			const paths = [...this.changedTaskPaths];
			this.changedTaskPaths.clear();

			const files = paths
				.map((path) => this.app.vault.getAbstractFileByPath(path))
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

		const today = new Date().toISOString().slice(0, 10);
		const sanitizedDependsOn = sanitizeDependsOnPaths(
			input.depends_on,
			filePath,
			(pathWithoutExt) => {
				const depFile = this.app.vault.getAbstractFileByPath(normalizePath(pathWithoutExt + '.md'));
				return depFile instanceof TFile;
			}
		);

		const full: Task = {
			...input,
			depends_on: sanitizedDependsOn,
			id: shortId,
			slug,
			path: filePath,
			blocks: [],
			created: today,
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
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) return;

		await this.app.fileManager.processFrontMatter(file, (fm) => {
			const fields: (keyof Task)[] = [
				'name', 'status', 'priority', 'category', 'task_type',
				'blocked_reason', 'assigned_to', 'source',
				'start_date', 'due_date', 'estimated_days', 'completed',
			];
			for (const key of fields) {
				if (key in updates) fm[key] = (updates as Record<string, unknown>)[key] ?? null;
			}
		});
	}

	async updateNotes(path: string, notes: string): Promise<string> {
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) return notes;

		const rewritten = await this.materializeChecklistChildrenFromBody(path, notes);
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
		const today = new Date().toISOString().slice(0, 10);
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
		const parentFile = this.app.vault.getAbstractFileByPath(parentPath);
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

		const rewritten = lines.join('\n').trim();
		await this.app.vault.process(parentFile, (current) => {
			const currentFmEnd = current.indexOf('\n---', 3);
			if (currentFmEnd < 0) return current;
			const frontmatter = current.substring(0, currentFmEnd + 4);
			return frontmatter + (rewritten ? '\n\n' + rewritten : '') + '\n';
		});
	}

	private buildChildTaskInput(parent: Task, title: string, parentPath: string): TaskCreateInput {
		const today = new Date().toISOString().slice(0, 10);
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
		};
	}

	private indentationWidth(indent: string): number {
		let width = 0;
		for (const ch of indent) {
			width += ch === '\t' ? 4 : 1;
		}
		return width;
	}

	private async materializeChecklistChildrenFromBody(parentPath: string, body: string): Promise<string> {
		if (!body) return body;
		const parent = get(this.tasks).find(t => t.path === parentPath);
		if (!parent) return body;

		const lines = body.split('\n');
		let inFence = false;
		let changed = false;
		const checklistStack: Array<{ indent: number; path: string }> = [];

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			const trimmed = line.trimStart();
			if (trimmed.startsWith('```')) {
				inFence = !inFence;
				continue;
			}
			if (inFence) continue;

			const match = line.match(/^(\s*)- \[( |x|X)\]\s+(.+)$/);
			if (!match) continue;

			const indent = match[1] ?? '';
			const checkedMarker = (match[2] ?? ' ').toLowerCase();
			const content = (match[3] ?? '').trim();
			const indentWidth = this.indentationWidth(indent);

			while (checklistStack.length > 0 && checklistStack[checklistStack.length - 1]!.indent >= indentWidth) {
				checklistStack.pop();
			}

			const linked = this.extractChecklistLink(line);
			if (linked?.path) {
				checklistStack.push({ indent: indentWidth, path: linked.path });
				continue;
			}

			if (!content || checkedMarker !== ' ') continue;

			const effectiveParentPath = checklistStack.length > 0
				? checklistStack[checklistStack.length - 1]!.path
				: parentPath;
			const child = await this.create(this.buildChildTaskInput(parent, content, effectiveParentPath));
			const childPath = child.path.replace(/\.md$/, '');
			lines[i] = `${indent}- [ ] [[${childPath}|${child.name}]]`;
			checklistStack.push({ indent: indentWidth, path: child.path });
			changed = true;
		}

		if (!changed) return body;
		return lines.join('\n').trim();
	}

	async updateParentTask(taskPath: string, parentPath: string | null): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(taskPath);
		if (!(file instanceof TFile)) return;

		await this.app.fileManager.processFrontMatter(file, (fm) => {
			if (!parentPath) {
				fm.parent_task = null;
				return;
			}
			const all = get(this.tasks);
			const parent = all.find(t => t.path.replace(/\.md$/, '') === parentPath);
			const name = parent?.name ?? parentPath.split('/').pop() ?? parentPath;
			fm.parent_task = `[[${parentPath}|${name}]]`;
		});
	}

	async delete(path: string): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) return;
		await this.app.vault.delete(file);
	}

	async openDetail(path: string): Promise<void> {
		this.plugin.activeTaskPath.set(path);
		await this.plugin.openBoard();
	}

	async openFile(path: string): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) return;
		await this.app.workspace.getLeaf('tab').openFile(file);
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
				fm.blocks = blockers.map(b => `[[${b.path}|${b.name}]]`);
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
		const notes = this.extractNotes(content);

		const allowedStatuses = this.plugin.settings.statuses ?? ['Active'];
		const fallbackStatus = allowedStatuses[0] ?? 'Active';
		const rawStatus = typeof fm.status === 'string' ? fm.status : '';
		const normalizedStatus = rawStatus && allowedStatuses.includes(rawStatus)
			? rawStatus
			: fallbackStatus;

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
		};
	}

	private extractNotes(content: string): string {
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

	private async addToBlocks(depPath: string, thisPath: string, thisName: string): Promise<void> {
		const fullPath = depPath.endsWith('.md') ? depPath : depPath + '.md';
		const depFile = this.app.vault.getAbstractFileByPath(fullPath);
		if (!(depFile instanceof TFile)) return;

		const cleanPath = thisPath.replace(/\.md$/, '');
		await this.app.fileManager.processFrontMatter(depFile, (fm) => {
			const current: unknown[] = Array.isArray(fm.blocks) ? fm.blocks : [];
			const already = current.some(b => String(b ?? '').includes(cleanPath));
			if (!already) fm.blocks = [...current, `[[${cleanPath}|${thisName}]]`];
		});
	}

	// ── Frontmatter builder (creation only) ──────────────────────────────────────

	private buildFrontmatter(task: Task): string {
		const esc = (s: string) => String(s || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
		const link = (p: string | null) => p ? `'[[${p.replace(/\.md$/, '')}|${p}]]'` : 'null';
		const depsStr = task.depends_on.length
			? `\n${task.depends_on.map(d => `  - ${link(d)}`).join('\n')}`
			: ' []';

		return [
			'---',
			`type: ${task.type}`,
			`name: "${esc(task.name)}"`,
			`cssclasses: [ttask]`,
			`category: ${task.category ?? 'null'}`,
			`status: ${task.status}`,
			`priority: ${task.priority}`,
			`task_type: ${task.task_type ?? 'null'}`,
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
			'---',
		].join('\n');
	}
}
