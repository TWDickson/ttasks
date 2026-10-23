import { TFile, normalizePath, type App } from 'obsidian';
import type { Task, TaskCreateInput } from '../types';
import { materializeChecklistChildren } from './checklistMaterializer';
import {
	buildChecklistChildInput,
	checklistLinksInBody,
	planChildSync,
	rewriteParentChecklist,
} from './checklistSync';
import { localDateString } from '../utils/dateUtils';
import { ensureMdExt } from '../utils/pathUtils';
import { extractChecklistLink } from '../utils/wikiLink';
import { isPathOpenInMarkdownEditor } from '../views/openFileLeaves';

/** What the sync needs from the writer that owns it — no plugin reference. */
export interface ChecklistSyncDeps {
	app: App;
	tasks: () => Task[];
	getTaskByPath: (path: string) => Task | undefined;
	statusPolicy: () => { completion: string; initial: string };
	create: (input: TaskCreateInput) => Promise<Task>;
	update: (path: string, updates: Partial<Task>) => Promise<void>;
	completeAndRecur: (task: Task) => Promise<Task | null>;
}

/**
 * Keeps a parent note's checklist and its children's statuses in step (AR-4,
 * extracted from `TaskWriter`). Decisions are the pure functions in
 * `checklistSync.ts`; this class only reads and writes the vault.
 */
export class ChecklistSyncService {
	constructor(private deps: ChecklistSyncDeps) {}

	/** Turn plain checklist lines in `body` into linked child tasks; returns the rewritten body. */
	async materializeChildren(parentPath: string, body: string): Promise<string> {
		if (!body) return body;
		const parent = this.deps.getTaskByPath(parentPath);
		if (!parent) return body;

		return materializeChecklistChildren({
			body,
			parentPath,
			extractChecklistLink,
			createChecklistChild: async (content, effectiveParentPath) => {
				const child = await this.deps.create(buildChecklistChildInput(parent, content, effectiveParentPath, localDateString()));
				return { path: child.path, name: child.name };
			},
		});
	}

	/** Parent checklist → children: complete or reopen each child to match its box. */
	async syncChildrenFromParent(parentPath: string, body: string): Promise<void> {
		if (!body) return;
		const wanted = checklistLinksInBody(body);
		if (wanted.size === 0) return;

		const policy = this.deps.statusPolicy();
		const actions = planChildSync({
			parentPath,
			wanted,
			tasksByPath: new Map(this.deps.tasks().map((t) => [t.path, t])),
			completionStatus: policy.completion,
			fallbackStatus: policy.initial,
			today: localDateString(),
		});

		await Promise.all(actions.map((action) => action.kind === 'complete'
			? this.deps.completeAndRecur(action.task).then(() => undefined)
			: this.deps.update(action.path, { status: action.status, completed: action.completed })));
	}

	/** Child → parent checklist: tick or untick the child's line in its parent's notes. */
	async syncParentFromChild(child: Task): Promise<void> {
		if (!child.parent_task) return;
		const { app } = this.deps;
		const parentPath = ensureMdExt(child.parent_task.trim());
		const parentFile = app.vault.getAbstractFileByPath(normalizePath(parentPath));
		if (!(parentFile instanceof TFile)) return;

		const content = await app.vault.cachedRead(parentFile);
		const fmEnd = content.indexOf('\n---', 3);
		if (fmEnd < 0) return;

		const body = content.substring(fmEnd + 4).trim();
		if (!body) return;

		const checked = child.status === this.deps.statusPolicy().completion;
		const rewritten = rewriteParentChecklist(body, child.path, checked)?.trim();
		if (rewritten === undefined) return;

		if (isPathOpenInMarkdownEditor(app.workspace, parentFile.path)) {
			await new Promise(resolve => setTimeout(resolve, 100));
		}

		await app.vault.process(parentFile, (current) => {
			const currentFmEnd = current.indexOf('\n---', 3);
			if (currentFmEnd < 0) return current;
			const frontmatter = current.substring(0, currentFmEnd + 4);
			return frontmatter + (rewritten ? '\n\n' + rewritten : '') + '\n';
		});
	}
}
