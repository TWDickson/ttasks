import { Notice, TFile, normalizePath } from 'obsidian';
import { writable, type Writable } from 'svelte/store';
import type TTasksPlugin from '../main';
import type { Task, TaskCreateInput, TaskStatus, TaskPriority, TaskType, TaskRecordType } from '../types';
import { getUniqueTaskPath, sanitizeDependsOnPaths } from './taskCreateGuards';

export class TaskStore {
	readonly tasks: Writable<Task[]> = writable([]);

	private plugin: TTasksPlugin;

	constructor(plugin: TTasksPlugin) {
		this.plugin = plugin;
	}

	get app() { return this.plugin.app; }

	get folderPath(): string {
		return normalizePath(this.plugin.settings.tasksFolder);
	}

	// ── Load ────────────────────────────────────────────────────────────────────

	async load(): Promise<void> {
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

		this.plugin.log(`loaded ${loaded.length} task(s)`);
		this.tasks.set(loaded);
	}

	// ── Watchers ─────────────────────────────────────────────────────────────

	register(): void {
		this.plugin.registerEvent(
			this.app.metadataCache.on('changed', (file) => {
				if (!file.path.startsWith(this.folderPath + '/')) return;
				this.fileToTask(file).then(task => {
					if (!task) return;
					this.tasks.update(all => {
						const idx = all.findIndex(t => t.path === file.path);
						if (idx >= 0) { all[idx] = task; return [...all]; }
						return [...all, task];
					});
				});
			})
		);

		this.plugin.registerEvent(
			this.app.vault.on('delete', (file) => {
				if (!(file instanceof TFile)) return;
				if (!file.path.startsWith(this.folderPath + '/')) return;
				this.tasks.update(all => all.filter(t => t.path !== file.path));
			})
		);

		this.plugin.registerEvent(
			this.app.vault.on('rename', (file, oldPath) => {
				if (!(file instanceof TFile)) return;
				this.tasks.update(all => all.filter(t => t.path !== oldPath));
				if (file.path.startsWith(this.folderPath + '/')) {
					this.fileToTask(file).then(task => {
						if (!task) return;
						this.tasks.update(all => [...all, task]);
					});
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

	async updateNotes(path: string, notes: string): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) return;
		await this.app.vault.process(file, (content) => {
			const fmEnd = content.indexOf('\n---', 3);
			const frontmatter = fmEnd >= 0 ? content.substring(0, fmEnd + 4) : content;
			return frontmatter + (notes ? '\n\n' + notes : '') + '\n';
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

		return {
			id, slug,
			path: file.path,
			type:           (fm.type as TaskRecordType)  ?? 'task',
			name:           fm.name                       ?? '',
			category:       fm.category                   ?? null,
			status:         (fm.status as TaskStatus)     ?? 'Active',
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
