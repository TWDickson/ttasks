import { Notice, TFile, normalizePath, type App } from 'obsidian';
import { get, type Writable } from 'svelte/store';
import type TTasksPlugin from '../main';
import type { Task, TaskCreateInput } from '../types';
import { getUniqueTaskPath, sanitizeDependsOnPaths } from './taskCreateGuards';
import { materializeChecklistChildren } from './checklistMaterializer';
import { resolveCompletionStatus } from '../settings';
import { nextStartDate } from './recurrence';
import { computeStatusChanged, computeCompletedOnStatusChange } from './statusChanged';
import { decideCompletion } from './completeTask';
import { buildDuplicateInput } from './taskDuplicate';
import { resetChecklistCompletionInNotes } from './recurrenceNotes';
import { deleteFileSafely, buildDeleteDeps } from '../integration/safeDelete';
import { buildAliasedLink } from '../integration/relationshipLink';
import { localDateString } from '../utils/dateUtils';
import { ensureMdExt, stripMdExt } from '../utils/pathUtils';
import { extractChecklistLink } from '../utils/wikiLink';
import { buildRestoreInput } from './taskRestore';
import { linkReferencesTaskPath } from './relationshipLinkMatch';
import { syncCompletionToSource } from '../integration/completionSync';
import { mutateLinkArray } from '../utils/arrayUtils';

export class TaskWriter {
	private plugin: TTasksPlugin;
	private tasks: Writable<Task[]>;
	private folderPath: string;
	private getTaskByPath: (path: string) => Task | undefined;

	constructor(plugin: TTasksPlugin, tasks: Writable<Task[]>, folderPath: string, getTaskByPath: (path: string) => Task | undefined) {
		this.plugin = plugin;
		this.tasks = tasks;
		this.folderPath = folderPath;
		this.getTaskByPath = getTaskByPath;
	}

	get app(): App { return this.plugin.app; }

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
		const full: Task = {
			...input,
			depends_on: sanitizedDependsOn,
			id: shortId,
			slug,
			path: filePath,
			blocks: [],
			created: today,
			status_changed: today,
			is_complete: input.status === completionStatus,
			is_inbox:    input.area === null,
		};

		const body = full.notes?.trim() ? '\n\n' + full.notes.trim() : '';
		try {
			await this.app.vault.create(filePath, this.buildFrontmatter(full) + body + '\n');
		} catch (error) {
			this.plugin.log(`create failed for ${filePath}: ${String(error)}`);
			new Notice('TTasks: failed to create task file. Check vault permissions or disk space.');
			throw error;
		}

		// Sync blocks on depends_on targets
		for (const depPath of sanitizedDependsOn) {
			try {
				await this.addToBlocks(depPath, filePath, input.name);
			} catch (error) {
				this.plugin.log(`addToBlocks failed for dependency ${depPath}: ${String(error)}`);
			}
		}

		return full;
	}

	async update(path: string, updates: Partial<Task>): Promise<void> {
		const normalizedPath = normalizePath(path);
		const file = this.app.vault.getAbstractFileByPath(normalizedPath);
		if (!(file instanceof TFile)) return;
		const currentTask = get(this.tasks).find((task) => task.path === normalizedPath) ?? null;

		try {
			await this.app.fileManager.processFrontMatter(file, (fm) => {
				const previousStatus = typeof fm.status === 'string' ? fm.status : undefined;
				const fields: (keyof Task)[] = [
					'name', 'status', 'priority', 'area', 'labels',
					'blocked_reason', 'assigned_to', 'source', 'due_time',
					'start_date', 'due_date', 'estimated_days', 'completed',
					'workweek_only', 'holiday_dates',
					'recurrence', 'recurrence_type', 'reminder_override',
				];
				for (const key of fields) {
					if (key in updates) fm[key] = (updates as Record<string, unknown>)[key] ?? null;
				}

				// Write status_changed whenever status actually transitions
				const today = localDateString();
				const changed = computeStatusChanged(
					previousStatus,
					updates.status,
					today,
				);
				if (changed !== undefined) fm.status_changed = changed;

				// Derive the completion date from status transitions unless the
				// caller supplied an explicit `completed` value (which wins).
				if (!('completed' in updates)) {
					const completionStatus = resolveCompletionStatus(
						this.plugin.settings.statuses,
						this.plugin.settings.completionStatus,
					);
					const nextCompleted = computeCompletedOnStatusChange(
						previousStatus,
						updates.status,
						completionStatus,
						today,
					);
					if (nextCompleted !== undefined) fm.completed = nextCompleted;
				}
			});
		} catch (error) {
			this.plugin.log(`update failed for ${normalizedPath}: ${String(error)}`);
			new Notice('TTasks: failed to update task file. Check vault permissions or disk space.');
			return;
		}

		if (currentTask && typeof updates.status === 'string') {
			const completionStatus = resolveCompletionStatus(this.plugin.settings.statuses, this.plugin.settings.completionStatus);
			try {
				await syncCompletionToSource(
					{ ...currentTask, status: updates.status },
					this.app,
					completionStatus,
					{
						resolver: (wikilinkPath, normalizedTaskPath, sourceFilePath) => {
							const resolved = this.app.metadataCache.getFirstLinkpathDest(wikilinkPath, sourceFilePath);
							if (!resolved?.path) return false;
							return stripMdExt(normalizePath(resolved.path)) === normalizedTaskPath;
						},
					},
				);
			} catch (error) {
				this.plugin.log(`syncCompletionToSource failed for ${normalizedPath}: ${String(error)}`);
			}
		}
	}

	async updateNotes(path: string, notes: string): Promise<string> {
		const file = this.app.vault.getAbstractFileByPath(normalizePath(path));
		if (!(file instanceof TFile)) return notes;

		const rewritten = await this.materializeChecklistChildrenFromBody(path, notes);

		if (this.isFileOpenInEditor(file)) {
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

	async delete(path: string, options?: { prompt?: boolean }): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(normalizePath(path));
		if (!(file instanceof TFile)) return;

		const fileManager = this.app.fileManager as typeof this.app.fileManager & {
			promptForDeletion?: (file: TFile) => Promise<void> | void;
			trashFile?: (file: TFile) => Promise<void> | void;
		};

		await deleteFileSafely(
			file,
			buildDeleteDeps(fileManager, (f) => this.app.vault.delete(f)),
			{ prompt: options?.prompt ?? false }
		);
	}

	// ── Dependency mutations ────────────────────────────────────────────────────

	async addDependency(taskPath: string, depPathWithoutExt: string): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(normalizePath(taskPath));
		if (!(file instanceof TFile)) return;
		const selfClean = taskPath.replace(/\.md$/, '');
		if (depPathWithoutExt === selfClean) return;

		const depFile = this.app.vault.getAbstractFileByPath(normalizePath(depPathWithoutExt + '.md'));
		if (!(depFile instanceof TFile)) return;

		const depTask = this.getTaskByPath(depPathWithoutExt);
		const depName = depTask?.name ?? depPathWithoutExt.split('/').pop() ?? depPathWithoutExt;
		const selfTask = this.getTaskByPath(taskPath);
		const selfName = selfTask?.name ?? taskPath.replace(/\.md$/, '').split('/').pop() ?? taskPath;
		const depLink = this.buildAliasedTaskLink(depPathWithoutExt, depName, file.path);

		await this.app.fileManager.processFrontMatter(file, (fm) => {
			const current = this.extractLinkStrings(fm.depends_on);
			const already = current.some((v) => this.linkTargetsPath(v, depPathWithoutExt, file.path));
			if (!already) fm.depends_on = mutateLinkArray(current, [depLink], []);
		});

		await this.addToBlocks(depPathWithoutExt, taskPath, selfName);
	}

	async removeDependency(taskPath: string, depPathWithoutExt: string): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(normalizePath(taskPath));
		if (!(file instanceof TFile)) return;

		await this.app.fileManager.processFrontMatter(file, (fm) => {
			const current = this.extractLinkStrings(fm.depends_on);
			const remove = current.filter((v) => this.linkTargetsPath(v, depPathWithoutExt, file.path));
			fm.depends_on = mutateLinkArray(current, [], remove);
		});

		// Remove from blocks on the dependency target
		const depFile = this.app.vault.getAbstractFileByPath(normalizePath(depPathWithoutExt + '.md'));
		if (depFile instanceof TFile) {
			const selfClean = taskPath.replace(/\.md$/, '');
			await this.app.fileManager.processFrontMatter(depFile, (fm) => {
				const current = this.extractLinkStrings(fm.blocks);
				const remove = current.filter((v) => this.linkTargetsPath(v, selfClean, depFile.path));
				fm.blocks = mutateLinkArray(current, [], remove);
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
			const parent = this.getTaskByPath(parentPath);
			const name = parent?.name ?? parentPath.split('/').pop() ?? parentPath;
			fm.parent_task = this.buildAliasedTaskLink(parentPath, name, file.path);
		});
	}

	// ── Higher-level operations ────────────────────────────────────────────────

	/**
	 * Routes a status change through the recurrence-aware completion helper when
	 * the target status is the completion status; otherwise a plain status update.
	 * Used by kanban drag / mobile select and the Detail status dropdown so those
	 * paths recur (and stamp the completion date) like the Mark-complete button.
	 */
	async setStatus(task: Task, newStatus: string): Promise<void> {
		const completionStatus = resolveCompletionStatus(this.plugin.settings.statuses, this.plugin.settings.completionStatus);
		if (newStatus === completionStatus) {
			await this.completeAndRecur(task);
			return;
		}
		await this.update(task.path, { status: newStatus });
	}

	async completeAndRecur(task: Task): Promise<Task | null> {
		const today = localDateString();
		const completionStatus = resolveCompletionStatus(this.plugin.settings.statuses, this.plugin.settings.completionStatus);

		const decision = decideCompletion(task, {
			completionStatus,
			today,
			allTasks: get(this.tasks),
		});

		await this.update(task.path, decision.updates);

		if (decision.kind !== 'complete-and-recur') return null;

		const rule = task.recurrence;
		if (!rule) return null; // narrowing — guaranteed non-null by the decision above
		const recurType = (task.recurrence_type ?? 'fixed') as import('./recurrence').RecurrenceType;
		const nextDue   = decision.nextDue;
		const nextStart = nextStartDate(rule, recurType, task.start_date, task.due_date, today);
		const firstStatus = this.plugin.settings.statuses[0] ?? 'Active';

		const nextInput: TaskCreateInput = {
			type:            task.type,
			name:            task.name,
			area:            task.area,
			status:          firstStatus,
			priority:        task.priority,
			labels:          [...task.labels],
			parent_task:     task.parent_task,
			depends_on:      [],
			blocked_reason:  '',
			assigned_to:     task.assigned_to,
			source:          task.source,
			start_date:      nextStart,
			due_date:        nextDue,
			due_time:        task.due_time,
			estimated_days:  task.estimated_days,
			created:         today,
			completed:       null,
			notes:           resetChecklistCompletionInNotes(task.notes ?? ''),
			recurrence:      task.recurrence,
			recurrence_type: task.recurrence_type,
		};

		return this.create(nextInput);
	}

	async duplicate(path: string): Promise<Task | null> {
		const task = this.getTaskByPath(normalizePath(path));
		if (!task) return null;

		const today = localDateString();
		const firstStatus = this.plugin.settings.statuses[0] ?? 'Active';
		const input = buildDuplicateInput(task, today, firstStatus);
		return this.create(input);
	}

	async restore(path: string): Promise<void> {
		const task = this.getTaskByPath(normalizePath(path));
		if (!task) return;

		const firstStatus = this.plugin.settings.statuses[0] ?? 'Active';
		const restoreInput = buildRestoreInput(firstStatus);
		await this.update(path, restoreInput);
	}

	// ── Helpers ─────────────────────────────────────────────────────────────────

	private isFileOpenInEditor(file: TFile): boolean {
		return this.app.workspace.getLeavesOfType('markdown')
			.some(leaf => (leaf.view as any)?.file?.path === file.path);
	}

	private async syncChildrenFromParentChecklist(parentPath: string, body: string): Promise<void> {
		if (!body) return;
		const wanted = new Map<string, boolean>();
		const lines = body.split('\n');

		for (const line of lines) {
			const parsed = extractChecklistLink(line);
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

			// Checking a recurring child completes it like any other path — route
			// through completeAndRecur so the next instance is spawned (guarded).
			if (checked) {
				updates.push(this.completeAndRecur(child).then(() => undefined));
			} else {
				updates.push(this.update(child.path, {
					status: targetStatus,
					completed: targetCompleted,
				}));
			}
		}

		if (updates.length > 0) {
			await Promise.all(updates);
		}
	}

	private async syncParentChecklistFromChild(child: Task): Promise<void> {
		if (!child.parent_task) return;
		const parentPath = ensureMdExt(child.parent_task.trim());
		const parentFile = this.app.vault.getAbstractFileByPath(normalizePath(parentPath));
		if (!(parentFile instanceof TFile)) return;

		const content = await this.app.vault.cachedRead(parentFile);
		const fmEnd = content.indexOf('\n---', 3);
		if (fmEnd < 0) return;

		const body = content.substring(fmEnd + 4).trim();
		if (!body) return;

		const lines = body.split('\n');
		const childPathWithoutExt = stripMdExt(child.path);
		const shouldBeChecked = this.isCompleteStatus(child.status);
		let changed = false;

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			const match = line.match(/^(\s*)- \[( |x|X)\](\s+\[\[([^\]|]+)(?:\|[^\]]+)?\]\].*)$/);
			if (!match) continue;
			const linked = ensureMdExt((match[4] ?? '').trim());
			if (linked !== child.path && stripMdExt(linked) !== childPathWithoutExt) continue;

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
			area: parent.area,
			status: parent.status,
			priority: parent.priority,
			labels: [...parent.labels],
			due_time: null,
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
		const parent = this.getTaskByPath(parentPath);
		if (!parent) return body;

		return materializeChecklistChildren({
			body,
			parentPath,
			extractChecklistLink,
			createChecklistChild: async (content, effectiveParentPath) => {
				const child = await this.create(this.buildChildTaskInput(parent, content, effectiveParentPath));
				return { path: child.path, name: child.name };
			},
		});
	}

	private async addToBlocks(depPath: string, thisPath: string, thisName: string): Promise<void> {
		const fullPath = depPath.endsWith('.md') ? depPath : depPath + '.md';
		const depFile = this.app.vault.getAbstractFileByPath(normalizePath(fullPath));
		if (!(depFile instanceof TFile)) return;

		const cleanPath = thisPath.replace(/\.md$/, '');
		const thisLink = this.buildAliasedTaskLink(cleanPath, thisName, depFile.path);
		await this.app.fileManager.processFrontMatter(depFile, (fm) => {
			const current = this.extractLinkStrings(fm.blocks);
			const already = current.some((b) => this.linkTargetsPath(b, cleanPath, depFile.path));
			if (!already) fm.blocks = mutateLinkArray(current, [thisLink], []);
		});
	}

	private extractLinkStrings(value: unknown): string[] {
		if (!Array.isArray(value)) return [];
		return value.filter((entry): entry is string => typeof entry === 'string');
	}

	private linkTargetsPath(rawValue: unknown, targetPathWithoutExt: string, sourcePath: string): boolean {
		return linkReferencesTaskPath({
			rawValue,
			targetPathWithoutExt,
			sourcePath,
			resolveLinkpathDest: (linkpath, source) => {
				const resolved = this.app.metadataCache.getFirstLinkpathDest(linkpath, source);
				return resolved?.path ?? null;
			},
		});
	}

	private buildFrontmatter(task: Task): string {
		return buildTaskFrontmatter(task, (p) => this.resolveNameForPath(p));
	}

	private buildAliasedTaskLink(pathWithoutExt: string, alias: string, sourcePath: string): string {
		const cleanPath = stripMdExt(pathWithoutExt);
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

	private resolveNameForPath(pathWithoutExt: string): string {
		const match = this.getTaskByPath(pathWithoutExt);
		if (match) return match.name;
		return pathWithoutExt.split('/').pop()?.replace(/^[a-f0-9]+-/, '') ?? pathWithoutExt;
	}

	private completionStatus(): string {
		return resolveCompletionStatus(this.plugin.settings.statuses, this.plugin.settings.completionStatus);
	}

	private isCompleteStatus(status: string): boolean {
		return status === this.completionStatus();
	}

	public async syncParentChecklistFromChildPublic(child: Task): Promise<void> {
		await this.syncParentChecklistFromChild(child);
	}
}

// ---------------------------------------------------------------------------
// Pure helpers — exported for testing
// ---------------------------------------------------------------------------

export function buildTaskFrontmatter(task: Task, resolveName: (pathWithoutExt: string) => string): string {
	const esc = (s: string) => String(s || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
	const strOrNull = (s: string | null | undefined) => s ? `"${esc(s)}"` : 'null';
	const link = (p: string | null) => {
		if (!p) return 'null';
		const clean = p.replace(/\.md$/, '');
		return `'[[${clean}|${resolveName(clean)}]]'`;
	};
	const depsStr = task.depends_on.length
		? `\n${task.depends_on.map(d => `  - ${link(d)}`).join('\n')}`
		: ' []';

	const labelsYaml = task.labels.length
		? `\n${task.labels.map(l => `  - "${esc(l)}"`).join('\n')}`
		: ' []';

	const holidayDates = Array.isArray(task.holiday_dates)
		? task.holiday_dates.filter((value): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value))
		: [];
	const holidayDatesYaml = holidayDates.length
		? `\n${holidayDates.map((date) => `  - '${date}'`).join('\n')}`
		: ' []';

	return [
		'---',
		`type: ${task.type}`,
		`name: "${esc(task.name)}"`,
		`cssclasses: [ttask]`,
		`area: ${strOrNull(task.area)}`,
		`status: "${esc(task.status)}"`,
		`priority: "${esc(task.priority)}"`,
		`labels:${labelsYaml}`,
		`parent_task: ${link(task.parent_task)}`,
		`depends_on:${depsStr}`,
		`blocks: []`,
		`blocked_reason: "${esc(task.blocked_reason)}"`,
		`assigned_to: "${esc(task.assigned_to)}"`,
		`source: "${esc(task.source)}"`,
		`start_date: ${task.start_date ? `'${task.start_date}'` : 'null'}`,
		`due_date: ${task.due_date ? `'${task.due_date}'` : 'null'}`,
		`due_time: ${task.due_time ? `'${task.due_time}'` : 'null'}`,
		`estimated_days: ${task.estimated_days ?? 'null'}`,
		`workweek_only: ${task.workweek_only === true ? 'true' : 'false'}`,
		`holiday_dates:${holidayDatesYaml}`,
		`created: '${task.created}'`,
		`completed: null`,
		`status_changed: '${task.created}'`,
		`recurrence: ${task.recurrence ? `"${esc(task.recurrence)}"` : 'null'}`,
		`recurrence_type: ${task.recurrence_type ? `"${esc(task.recurrence_type)}"` : 'null'}`,
		'---',
	].join('\n');
}
