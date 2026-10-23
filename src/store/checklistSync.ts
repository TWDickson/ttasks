import type { Task, TaskCreateInput } from '../types';
import { ensureMdExt, stripMdExt } from '../utils/pathUtils';
import { extractChecklistLink } from '../utils/wikiLink';

/**
 * Pure halves of the parent-checklist ↔ child-status sync (AR-4). A parent
 * note's body lists its children as `- [ ] [[path|Name]]`; ticking a box
 * completes the child, and completing a child ticks its box. The vault I/O
 * lives in `ChecklistSyncService`.
 */

/** Matches a checklist line whose first content is a wiki-link, keeping its parts. */
const CHECKLIST_LINK_LINE = /^(\s*)- \[( |x|X)\](\s+\[\[([^\]|]+)(?:\|[^\]]+)?\]\].*)$/;

/** Every linked checklist item in `body`, as path (with `.md`) → checked. Last one wins. */
export function checklistLinksInBody(body: string): Map<string, boolean> {
	const wanted = new Map<string, boolean>();
	for (const line of body.split('\n')) {
		const parsed = extractChecklistLink(line);
		if (!parsed?.path) continue;
		wanted.set(parsed.path, parsed.checked);
	}
	return wanted;
}

export type ChildSyncAction =
	| { kind: 'complete'; task: Task }
	| { kind: 'update'; path: string; status: string; completed: string | null };

/**
 * What each linked child must do to match its box in the parent's checklist.
 * Checking completes the child (through `completeAndRecur`, so a repeating
 * child spawns its next instance); unchecking a completed child returns it to
 * `fallbackStatus`. Children already in step, unknown paths, and a self-link
 * produce nothing.
 */
export function planChildSync(options: {
	parentPath: string;
	wanted: Map<string, boolean>;
	tasksByPath: Map<string, Task>;
	completionStatus: string;
	fallbackStatus: string;
	today: string;
}): ChildSyncAction[] {
	const { parentPath, wanted, tasksByPath, completionStatus, fallbackStatus, today } = options;
	const actions: ChildSyncAction[] = [];

	for (const [childPath, checked] of wanted.entries()) {
		if (childPath === parentPath) continue;
		const child = tasksByPath.get(childPath);
		if (!child) continue;

		const targetStatus = checked ? completionStatus : (child.status === completionStatus ? fallbackStatus : child.status);
		const targetCompleted = checked ? today : null;
		const statusChanged = child.status !== targetStatus;
		const completedChanged = (child.completed ?? null) !== targetCompleted;
		if (!statusChanged && !completedChanged) continue;

		actions.push(checked
			? { kind: 'complete', task: child }
			: { kind: 'update', path: child.path, status: targetStatus, completed: targetCompleted });
	}
	return actions;
}

/**
 * The parent's body with every checklist line linking `childPath` set to
 * `checked`, or `null` when nothing needed to change.
 */
export function rewriteParentChecklist(body: string, childPath: string, checked: boolean): string | null {
	const lines = body.split('\n');
	const childPathWithoutExt = stripMdExt(childPath);
	let changed = false;

	for (let i = 0; i < lines.length; i++) {
		const match = lines[i].match(CHECKLIST_LINK_LINE);
		if (!match) continue;
		const linked = ensureMdExt((match[4] ?? '').trim());
		if (linked !== childPath && stripMdExt(linked) !== childPathWithoutExt) continue;

		const currentChecked = (match[2] ?? ' ').toLowerCase() === 'x';
		if (currentChecked === checked) continue;

		lines[i] = `${match[1]}- [${checked ? 'x' : ' '}]${match[3]}`;
		changed = true;
	}

	return changed ? lines.join('\n') : null;
}

/** A new child task materialised from a plain checklist line in `parent`'s notes. */
export function buildChecklistChildInput(parent: Task, title: string, parentPath: string, today: string): TaskCreateInput {
	return {
		type: 'task',
		name: title,
		area: parent.area,
		status: parent.status,
		priority: parent.priority,
		labels: [...parent.labels],
		due_time: null,
		parent_task: stripMdExt(parentPath),
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
