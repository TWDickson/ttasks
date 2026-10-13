import { Notice, TFile, normalizePath, type App } from 'obsidian';
import { get, type Writable } from 'svelte/store';
import type TTasksPlugin from '../main';
import type { Task, TaskCreateInput } from '../types';
import { getUniqueTaskPath, sanitizeDependsOnPaths } from './taskCreateGuards';
import { materializeChecklistChildren } from './checklistMaterializer';
import { repinToDueDate } from '../repeat/presets';
import { repeatCalendarFromHolidays } from '../repeat/types';
import { splitHolidayCalendar } from '../settings/holidays';
import { addDaysLocal, daysBetweenLocal, localDateString } from '../utils/dateUtils';
import { computeStatusChanged, computeCompletedOnStatusChange } from './statusChanged';
import { decideCompletion } from './completeTask';
import { buildDuplicateInput } from './taskDuplicate';
import { resetChecklistCompletionInNotes } from './recurrenceNotes';
import { deleteFileSafely, buildDeleteDeps } from '../integration/safeDelete';
import { buildAliasedLink } from '../integration/relationshipLink';
import { ensureMdExt, stripMdExt } from '../utils/pathUtils';
import { extractChecklistLink } from '../utils/wikiLink';
import { buildRestoreInput } from './taskRestore';
import { linkReferencesTaskPath } from './relationshipLinkMatch';
import { syncCompletionToSource } from '../integration/completionSync';
import { mutateLinkArray } from '../utils/arrayUtils';
import { isPathOpenInMarkdownEditor } from '../views/openFileLeaves';
import { UPDATABLE_TASK_FIELDS, fmKey } from '../schema/taskPersistence';
import { writeStoredField } from '../schema/taskCodec';
import { serializeNewTaskFrontmatter } from '../schema/taskCodec';

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

		const completionStatus = this.plugin.statusPolicy.completion;
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
			this.plugin.logError(`create failed for ${filePath}: ${String(error)}`);
			new Notice('TTasks: failed to create task file. Check vault permissions or disk space.');
			throw error;
		}

		return full;
	}

	async update(path: string, incoming: Partial<Task>): Promise<void> {
		const normalizedPath = normalizePath(path);
		const file = this.app.vault.getAbstractFileByPath(normalizedPath);
		if (!(file instanceof TFile)) return;
		const currentTask = get(this.tasks).find((task) => task.path === normalizedPath) ?? null;

		// Persisted fields that mirror straight into the in-memory Task on success.
		const writtenFields = UPDATABLE_TASK_FIELDS;

		// Rescheduling the due date of a pinned monthly/yearly rule moves the pin with
		// it, so the schedule follows the new day (RP-1). A caller that sets `repeat`
		// explicitly wins.
		const repinned = 'due_date' in incoming && !('repeat' in incoming) && currentTask?.repeat
			? repinToDueDate(currentTask.repeat, incoming.due_date)
			: null;
		const updates: Partial<Task> =
			repinned && repinned !== currentTask?.repeat ? { ...incoming, repeat: repinned } : incoming;
		// Captured inside processFrontMatter so the optimistic store patch below
		// can reproduce exactly what was persisted without re-reading the file.
		let derivedStatusChanged: string | undefined;
		let derivedCompleted: string | null | undefined;

		try {
			await this.app.fileManager.processFrontMatter(file, (fm) => {
				const previousStatus = typeof fm[fmKey('status')] === 'string' ? fm[fmKey('status')] : undefined;
				for (const key of writtenFields) {
					if (key in updates) writeStoredField(fm, key, (updates as Record<string, unknown>)[key]);
				}

				// Write status_changed whenever status actually transitions
				const today = localDateString();
				const changed = computeStatusChanged(
					previousStatus,
					updates.status,
					today,
				);
				if (changed !== undefined) {
					writeStoredField(fm, 'status_changed', changed);
					derivedStatusChanged = changed;
				}

				// Derive the completion date from status transitions unless the
				// caller supplied an explicit `completed` value (which wins).
				if (!('completed' in updates)) {
					const completionStatus = this.plugin.statusPolicy.completion;
					const nextCompleted = computeCompletedOnStatusChange(
						previousStatus,
						updates.status,
						completionStatus,
						today,
					);
					if (nextCompleted !== undefined) {
						writeStoredField(fm, 'completed', nextCompleted);
						derivedCompleted = nextCompleted;
					}
				}
			});
		} catch (error) {
			this.plugin.logError(`update failed for ${normalizedPath}: ${String(error)}`);
			new Notice('TTasks: failed to update task file. Check vault permissions or disk space.');
			return;
		}

		// Optimistically merge the write into the in-memory store so every view
		// reflects it immediately, instead of waiting for the metadataCache
		// 'changed' event (which can be delayed, debounced, or skipped when
		// processFrontMatter produces no textual change). The event-driven
		// rescan later reconciles from the file as the source of truth.
		this.applyOptimisticUpdate(normalizedPath, updates, writtenFields, derivedStatusChanged, derivedCompleted);

		if (currentTask && typeof updates.status === 'string') {
			const completionStatus = this.plugin.statusPolicy.completion;
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
				this.plugin.logError(`syncCompletionToSource failed for ${normalizedPath}: ${String(error)}`);
			}
		}
	}

	/**
	 * Merge a just-persisted update into the in-memory `tasks` writable and
	 * recompute the derived fields (`is_complete`, `is_inbox`) the same way
	 * `TaskStore.fileToTask` does, so views update without a metadata rescan.
	 */
	private applyOptimisticUpdate(
		normalizedPath: string,
		updates: Partial<Task>,
		writtenFields: readonly (keyof Task)[],
		derivedStatusChanged: string | undefined,
		derivedCompleted: string | null | undefined,
	): void {
		this.tasks.update((tasks) => {
			const idx = tasks.findIndex((task) => task.path === normalizedPath);
			if (idx === -1) return tasks;

			const previous = tasks[idx];
			const next: Task = { ...previous };
			// Alias as an index-signature record so we can copy the written fields
			// by key; mutating the alias mutates `next` (same object reference).
			// Same double-cast idiom used by getFieldValue in query/engine.ts.
			const nextRecord = next as unknown as Record<string, unknown>;
			const updateRecord = updates as Record<string, unknown>;
			for (const key of writtenFields) {
				if (key in updates) {
					nextRecord[key] = updateRecord[key] ?? null;
				}
			}
			if (derivedStatusChanged !== undefined) next.status_changed = derivedStatusChanged;
			if (derivedCompleted !== undefined) next.completed = derivedCompleted;

			const completionStatus = this.plugin.statusPolicy.completion;
			next.is_complete = next.status === completionStatus;
			next.is_inbox = next.area === null;

			const copy = tasks.slice();
			copy[idx] = next;
			return copy;
		});
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

		const depName = this.getTaskByPath(depPathWithoutExt)?.name ?? null;
		const depLink = this.buildAliasedTaskLink(depPathWithoutExt, depName, file.path);

		await this.app.fileManager.processFrontMatter(file, (fm) => {
			const current = this.extractLinkStrings(fm[fmKey('depends_on')]);
			const already = current.some((v) => this.linkTargetsPath(v, depPathWithoutExt, file.path));
			if (!already) writeStoredField(fm, 'depends_on', mutateLinkArray(current, [depLink], []));
		});

	}

	async removeDependency(taskPath: string, depPathWithoutExt: string): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(normalizePath(taskPath));
		if (!(file instanceof TFile)) return;

		await this.app.fileManager.processFrontMatter(file, (fm) => {
			const current = this.extractLinkStrings(fm[fmKey('depends_on')]);
			const remove = current.filter((v) => this.linkTargetsPath(v, depPathWithoutExt, file.path));
			writeStoredField(fm, 'depends_on', mutateLinkArray(current, [], remove));
		});
	}

	async updateParentTask(taskPath: string, parentPath: string | null): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(normalizePath(taskPath));
		if (!(file instanceof TFile)) return;

		await this.app.fileManager.processFrontMatter(file, (fm) => {
			if (!parentPath) {
				writeStoredField(fm, 'parent_task', null);
				return;
			}
			const name = this.getTaskByPath(parentPath)?.name ?? null;
			writeStoredField(fm, 'parent_task', this.buildAliasedTaskLink(parentPath, name, file.path));
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
		const completionStatus = this.plugin.statusPolicy.completion;
		if (newStatus === completionStatus) {
			await this.completeAndRecur(task);
			return;
		}
		await this.update(task.path, { status: newStatus });
	}

	async completeAndRecur(task: Task): Promise<Task | null> {
		const today = localDateString();
		const completionStatus = this.plugin.statusPolicy.completion;

		const { holidays, recurringHolidays } = splitHolidayCalendar(this.plugin.settings.holidays);
		const decision = decideCompletion(task, {
			completionStatus,
			today,
			allTasks: get(this.tasks),
			calendar: repeatCalendarFromHolidays(holidays, recurringHolidays),
		});

		await this.update(task.path, decision.updates);

		if (decision.kind !== 'complete-and-recur') return null;

		const nextDue   = decision.nextDue;
		const nextStart = nextStartFor(task, nextDue, today);
		const firstStatus = this.plugin.statusPolicy.initial;

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
			// The rule is inherited as-is (its pinned day included, so a clamped Feb 28
			// doesn't become the new pin — RP-1), with `count` already decremented.
			repeat:          decision.nextRule,
		};

		return this.create(nextInput);
	}

	async duplicate(path: string): Promise<Task | null> {
		const task = this.getTaskByPath(normalizePath(path));
		if (!task) return null;

		const today = localDateString();
		const firstStatus = this.plugin.statusPolicy.initial;
		const input = buildDuplicateInput(task, today, firstStatus);
		return this.create(input);
	}

	async restore(path: string): Promise<void> {
		const task = this.getTaskByPath(normalizePath(path));
		if (!task) return;

		const firstStatus = this.plugin.statusPolicy.initial;
		const restoreInput = buildRestoreInput(firstStatus);
		await this.update(path, restoreInput);
	}

	// ── Helpers ─────────────────────────────────────────────────────────────────

	private isFileOpenInEditor(file: TFile): boolean {
		return isPathOpenInMarkdownEditor(this.app.workspace, file.path);
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
		const fallback = this.plugin.statusPolicy.initial;
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
			repeat: null,
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

	private buildAliasedTaskLink(pathWithoutExt: string, alias: string | null, sourcePath: string): string {
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

	/**
	 * The task's name, or `null` when the store doesn't know the path. Callers
	 * pass the result straight to `buildAliasedTaskLink`, which writes an
	 * un-aliased `[[path]]` for `null` rather than deriving a title from the
	 * filename.
	 */
	private resolveNameForPath(pathWithoutExt: string): string | null {
		return this.getTaskByPath(pathWithoutExt)?.name ?? null;
	}

	private completionStatus(): string {
		return this.plugin.statusPolicy.completion;
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

/**
 * The next instance's start date: the same lead time before its due date as this
 * instance had. A start with no due date moves by the same amount the due date
 * would have (today → next). Null when there's no start date.
 */
export function nextStartFor(task: Pick<Task, 'start_date' | 'due_date'>, nextDue: string, today: string): string | null {
	if (!task.start_date) return null;
	if (task.due_date) return addDaysLocal(nextDue, -daysBetweenLocal(task.start_date, task.due_date));
	return addDaysLocal(task.start_date, daysBetweenLocal(today, nextDue));
}

export function buildTaskFrontmatter(task: Task, resolveName: (pathWithoutExt: string) => string | null): string {
	return serializeNewTaskFrontmatter(task, resolveName);
}
