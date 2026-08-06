/**
 * Resolved task references.
 *
 * Relationships are stored as vault paths (`depends_on`, `blocks`,
 * `parent_task` are all strings — see `types.ts`), so the UI used to hold paths
 * and look them up at every render. That made "this link doesn't resolve" an
 * invisible, easily-forgotten case: each call site had to remember to handle a
 * null, and the ones that forgot fell through to rendering the filename.
 *
 * A `TaskRef` makes the failure a state the compiler forces you to handle. Once
 * you have a `kind: 'task'` ref, `ref.task.name` is the name — no fallback, no
 * resolver, no per-site policy. `TaskStore` guarantees this: `fileToTask`
 * refuses to build a `Task` at all when `name` is blank, so a `Task` in hand
 * always has a real title.
 *
 * The missing variant is deliberately kept rather than filtered away: a link can
 * legitimately point outside the current task set (a filtered board, a note
 * moved out of the tasks folder), and silently dropping those would under-report
 * what's blocking a task.
 */

import type { Task } from '../types';
import { ensureMdExt, taskIdFromPath } from './pathUtils';
import { missingTaskLabel } from './taskLabel';

export type TaskRef =
	/** The link resolved. `task.name` is authoritative — never derive a label. */
	| { kind: 'task'; path: string; task: Task }
	/** Known path, no task in the set. `id` is the `{hex}` half, if it has one. */
	| { kind: 'missing'; path: string; id: string };

/**
 * Lookup structures for `resolveTaskRef`. `byLeaf` backs the short-wikilink
 * fallback: `[[abc123-slug]]` written from a sibling note has no folder, so it
 * must still find `Planner/Tasks/abc123-slug.md`. Values are arrays because two
 * folders can hold the same filename; first-inserted wins, matching the
 * `Array.find` scan this index replaced.
 */
export interface TaskRefIndex {
	byPath: Map<string, Task>;
	byLeaf: Map<string, Task[]>;
}

function leafOf(path: string): string {
	return path.split('/').pop() ?? path;
}

/** Build the index once per task-list change; resolution is then O(1). */
export function buildTaskRefIndex(tasks: Task[]): TaskRefIndex {
	const byPath = new Map<string, Task>();
	const byLeaf = new Map<string, Task[]>();
	for (const task of tasks) {
		if (!byPath.has(task.path)) byPath.set(task.path, task);
		const leaf = leafOf(task.path);
		const bucket = byLeaf.get(leaf);
		if (bucket) bucket.push(task);
		else byLeaf.set(leaf, [task]);
	}
	return { byPath, byLeaf };
}

/** Normalise a stored link to a comparable `.md` path. */
export function normalizeRefPath(pathLike: string | null | undefined): string | null {
	if (!pathLike) return null;
	const clean = pathLike.trim();
	if (!clean) return null;
	return ensureMdExt(clean);
}

/**
 * Resolve one stored link. Returns `null` only for an absent link (an empty
 * `parent_task`, say) — a present-but-unresolvable link yields a `missing` ref,
 * which is a different thing and must stay visible.
 */
export function resolveTaskRef(
	pathLike: string | null | undefined,
	index: TaskRefIndex,
): TaskRef | null {
	const normalized = normalizeRefPath(pathLike);
	if (!normalized) return null;

	const exact = index.byPath.get(normalized);
	if (exact) return { kind: 'task', path: exact.path, task: exact };

	// Short or partial link: match on the filename, then confirm the whole
	// remainder lines up so `Tasks/a.md` can't claim `Other/Tasks/a.md`'s twin.
	const suffix = '/' + normalized;
	for (const candidate of index.byLeaf.get(leafOf(normalized)) ?? []) {
		if (candidate.path.endsWith(suffix)) {
			return { kind: 'task', path: candidate.path, task: candidate };
		}
	}

	return { kind: 'missing', path: normalized, id: taskIdFromPath(normalized) };
}

/** Resolve a relationship array, dropping absent links and de-duplicating. */
export function resolveTaskRefs(paths: string[], index: TaskRefIndex): TaskRef[] {
	const seen = new Set<string>();
	const refs: TaskRef[] = [];
	for (const path of paths) {
		const ref = resolveTaskRef(path, index);
		if (!ref || seen.has(ref.path)) continue;
		seen.add(ref.path);
		refs.push(ref);
	}
	return refs;
}

/** The display name. The single place the missing variant gets formatted. */
export function taskRefName(ref: TaskRef): string {
	return ref.kind === 'task' ? ref.task.name : missingTaskLabel(ref.path);
}

/** The underlying task, or null when the link doesn't resolve. */
export function taskRefTask(ref: TaskRef): Task | null {
	return ref.kind === 'task' ? ref.task : null;
}

export function isMissingRef(ref: TaskRef): boolean {
	return ref.kind === 'missing';
}
