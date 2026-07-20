// Pure import diffing. NO Obsidian imports (boundary-tested). Takes parsed import
// records (from taskJsonImport.ts) + the current vault tasks and works out what a
// paste-back would do: which tasks are new (create), which match an existing task
// and carry changed fields (update) or a delete, plus the dependency links to add
// or remove — feeding the bulk-edit summary the modal shows before anything writes.
//
// Design choices:
//  - Match by `ref` (the task id) when present — exact and unique. Otherwise fall
//    back to (type, case-insensitive name); a name matching >1 existing task is
//    ambiguous and skipped (never guess which to overwrite).
//  - Only SET/CHANGE is supported for fields, never CLEAR: a null/empty parsed
//    value means "not specified" so an AI reply that omits fields can't wipe them.
//  - Dependency links (depends_on) ARE round-tripped, but additively: listed links
//    are added, nothing is removed unless explicitly listed in remove_depends_on.
//    A link target resolves by ref or name against existing tasks + tasks being
//    created in the same import (so a brand-new A→B→C chain works). Unresolvable or
//    ambiguous targets are surfaced, never guessed. Parent (project membership)
//    round-trips the same way — set via `parent`, detach via `remove_parent`. Only
//    the note body is still NOT imported.

import type { Task } from '../types';
import type { ParsedImportTask } from './taskJsonImport';

/** Fields an import may set on an existing task (mirrors TaskWriter.update, minus name/links/notes). */
export const IMPORT_UPDATABLE_FIELDS = [
	'status', 'priority', 'area', 'labels',
	'blocked_reason', 'assigned_to', 'source',
	'start_date', 'due_date', 'due_time', 'estimated_days', 'completed',
	'recurrence', 'recurrence_type', 'pomodoro_count', 'focused_minutes',
] as const;

export type ImportUpdatableField = (typeof IMPORT_UPDATABLE_FIELDS)[number];

export interface FieldChange {
	field: ImportUpdatableField;
	from: unknown;
	to: unknown;
}

export interface ImportUpdate {
	/** Vault path of the existing task to update. */
	path: string;
	name: string;
	changes: FieldChange[];
}

export interface ImportCreate {
	parsed: ParsedImportTask;
}

export interface ImportDelete {
	/** Vault path of the existing task to delete. */
	path: string;
	name: string;
}

/**
 * One end of a dependency link. `existing` tasks carry their vault path; `new`
 * tasks don't have one yet (they're created in the same import) so they're keyed
 * by (type, name) and resolved to a path by the apply step after creation.
 */
export type LinkEndpoint =
	| { kind: 'existing'; path: string; name: string }
	| { kind: 'new'; type: string; name: string };

export interface LinkOp {
	/** The task gaining/losing the dependency. */
	from: LinkEndpoint;
	/** The dependency target (must finish before `from`). */
	to: LinkEndpoint;
}

export interface ParentOp {
	/** The task whose project membership changes. */
	from: LinkEndpoint;
	/** The new project, or null to detach the task from its project. */
	to: LinkEndpoint | null;
}

export interface ImportPlan {
	creates: ImportCreate[];
	updates: ImportUpdate[];
	/** Tasks an `action: "delete"` entry matched exactly one of. */
	deletes: ImportDelete[];
	/** depends_on edges to add (additive round-trip). */
	linkAdds: LinkOp[];
	/** depends_on edges to remove (from remove_depends_on). */
	linkRemovals: LinkOp[];
	/** Project-membership changes (set or detach). */
	parentChanges: ParentOp[];
	/** Matched an existing task but nothing changed. */
	unchangedCount: number;
	/** Names that matched more than one existing task and were skipped. */
	ambiguousNames: string[];
	/** Names an explicit update/delete referenced but that matched nothing. */
	missingNames: string[];
	/** Link targets that couldn't be resolved (missing or ambiguous), as "from → token". */
	unresolvedLinks: string[];
	/** field → number of tasks whose value changed (drives the summary). */
	fieldChangeCounts: Record<string, number>;
}

const normName = (name: string): string => name.trim().toLowerCase();
const matchKey = (type: string, name: string): string => `${type} ${normName(name)}`;
const stripMd = (path: string): string => path.replace(/\.md$/, '');
const endpointKey = (ep: LinkEndpoint): string =>
	ep.kind === 'existing' ? `p:${stripMd(ep.path)}` : `n:${ep.type} ${normName(ep.name)}`;

function labelsEqual(a: string[], b: string[]): boolean {
	if (a.length !== b.length) return false;
	const set = new Set(a);
	return b.every((label) => set.has(label));
}

/** A meaningful change for one field, or null when the parsed value is absent/equal. */
function diffField(field: ImportUpdatableField, parsed: ParsedImportTask, existing: Task): FieldChange | null {
	if (field === 'labels') {
		if (parsed.labels.length === 0) return null; // can't clear via omission
		return labelsEqual(parsed.labels, existing.labels) ? null : { field, from: [...existing.labels], to: [...parsed.labels] };
	}
	if (field === 'estimated_days' || field === 'pomodoro_count' || field === 'focused_minutes') {
		const to = parsed[field];
		if (to === null) return null;
		const from = existing[field] ?? null;
		return to !== from ? { field, from, to } : null;
	}
	// string-ish fields: null or '' means "not specified" → no change
	const to = parsed[field];
	if (to === null || to === '') return null;
	const from = existing[field] ?? null;
	return to !== from ? { field, from, to } : null;
}

/** Where a record's dependency links originate, kept for the second (link) pass. */
interface LinkSource {
	record: ParsedImportTask;
	from: LinkEndpoint;
	/** The matched task when `from` is existing — used to skip already-present edges. */
	existingTask: Task | null;
}

/** Diff parsed import records against the current vault tasks into an ImportPlan. */
export function planImport(parsed: ParsedImportTask[], existing: Task[]): ImportPlan {
	const byName = new Map<string, Task[]>();
	const byId = new Map<string, Task>();
	for (const task of existing) {
		const key = matchKey(task.type, task.name);
		const bucket = byName.get(key);
		if (bucket) bucket.push(task);
		else byName.set(key, [task]);
		byId.set(task.id, task);
	}

	/** Resolve a record to an existing task: ref first (exact), then name. */
	const matchExisting = (record: ParsedImportTask): { match: Task | null; ambiguous: boolean } => {
		if (record.ref) {
			const byRef = byId.get(record.ref);
			if (byRef) return { match: byRef, ambiguous: false };
		}
		const matches = byName.get(matchKey(record.type, record.name)) ?? [];
		if (matches.length === 1) return { match: matches[0], ambiguous: false };
		if (matches.length > 1) return { match: null, ambiguous: true };
		return { match: null, ambiguous: false };
	};

	const plan: ImportPlan = {
		creates: [],
		updates: [],
		deletes: [],
		linkAdds: [],
		linkRemovals: [],
		parentChanges: [],
		unchangedCount: 0,
		ambiguousNames: [],
		missingNames: [],
		unresolvedLinks: [],
		fieldChangeCounts: {},
	};

	// ── Pass 1: classify each record, collecting the link sources for pass 2. ──
	const linkSources: LinkSource[] = [];

	for (const record of parsed) {
		// A create needs a name regardless of what triggered it (explicit or the
		// auto-fallback below) — a bare ref with no name has nothing to create.
		const recordLabel = record.name || record.ref || '(unnamed)';

		// Explicit create — always a new task, even if a same-name one exists.
		if (record.action === 'create') {
			if (!record.name) {
				plan.missingNames.push(recordLabel);
				continue;
			}
			plan.creates.push({ parsed: record });
			linkSources.push({ record, from: { kind: 'new', type: record.type, name: record.name }, existingTask: null });
			continue;
		}
		const { match, ambiguous } = matchExisting(record);
		// Explicit delete — only when it resolves to exactly one existing task.
		if (record.action === 'delete') {
			if (match) plan.deletes.push({ path: match.path, name: match.name });
			else if (ambiguous) plan.ambiguousNames.push(recordLabel);
			else plan.missingNames.push(recordLabel);
			continue;
		}
		// 'auto' / 'update' below.
		if (!match) {
			if (ambiguous) plan.ambiguousNames.push(recordLabel);
			else if (record.action === 'update') plan.missingNames.push(recordLabel);
			else if (!record.name) plan.missingNames.push(recordLabel);
			else {
				plan.creates.push({ parsed: record });
				linkSources.push({ record, from: { kind: 'new', type: record.type, name: record.name }, existingTask: null });
			}
			continue;
		}
		const changes: FieldChange[] = [];
		for (const field of IMPORT_UPDATABLE_FIELDS) {
			const change = diffField(field, record, match);
			if (change) {
				changes.push(change);
				plan.fieldChangeCounts[field] = (plan.fieldChangeCounts[field] ?? 0) + 1;
			}
		}
		if (changes.length === 0) plan.unchangedCount++;
		else plan.updates.push({ path: match.path, name: match.name, changes });
		linkSources.push({ record, from: { kind: 'existing', path: match.path, name: match.name }, existingTask: match });
	}

	// ── Pass 2: resolve dependency links against existing tasks + new creates. ──
	const idIndex = new Map<string, LinkEndpoint>();
	const nameIndex = new Map<string, LinkEndpoint[]>();
	const pushName = (name: string, ep: LinkEndpoint): void => {
		const key = normName(name);
		const bucket = nameIndex.get(key);
		if (bucket) bucket.push(ep);
		else nameIndex.set(key, [ep]);
	};
	for (const task of existing) {
		const ep: LinkEndpoint = { kind: 'existing', path: task.path, name: task.name };
		idIndex.set(task.id, ep);
		pushName(task.name, ep);
	}
	for (const create of plan.creates) {
		pushName(create.parsed.name, { kind: 'new', type: create.parsed.type, name: create.parsed.name });
	}

	/** Resolve a depends_on token (ref or name) to a single endpoint. */
	const resolveToken = (token: string): { endpoint: LinkEndpoint | null; ambiguous: boolean } => {
		const byRef = idIndex.get(token);
		if (byRef) return { endpoint: byRef, ambiguous: false };
		const bucket = nameIndex.get(normName(token)) ?? [];
		if (bucket.length === 1) return { endpoint: bucket[0], ambiguous: false };
		if (bucket.length > 1) return { endpoint: null, ambiguous: true };
		return { endpoint: null, ambiguous: false };
	};

	const seenAdd = new Set<string>();
	const seenRemove = new Set<string>();

	for (const { record, from, existingTask } of linkSources) {
		const fromKey = endpointKey(from);
		const existingDeps = new Set((existingTask?.depends_on ?? []).map(stripMd));

		for (const token of record.depends_on) {
			const { endpoint: to, ambiguous } = resolveToken(token);
			if (!to) {
				if (ambiguous || token.trim() !== '') plan.unresolvedLinks.push(`${record.name} → ${token}`);
				continue;
			}
			if (endpointKey(to) === fromKey) continue; // no self-dependency
			if (to.kind === 'existing' && existingDeps.has(stripMd(to.path))) continue; // already linked
			const dedupe = `${fromKey}=>${endpointKey(to)}`;
			if (seenAdd.has(dedupe)) continue;
			seenAdd.add(dedupe);
			plan.linkAdds.push({ from, to });
		}

		// ── Parent (project membership) — single-valued. ──
		const currentParent = existingTask?.parent_task ? stripMd(existingTask.parent_task) : null;
		if (record.remove_parent) {
			if (from.kind === 'existing' && currentParent) plan.parentChanges.push({ from, to: null });
		} else if (record.parent && record.parent.trim() !== '') {
			const { endpoint: to } = resolveToken(record.parent);
			if (!to) {
				// Missing or ambiguous — surface it, never guess a project.
				plan.unresolvedLinks.push(`${record.name} ⤴ ${record.parent}`);
			} else if (endpointKey(to) !== fromKey) {
				// No-op when it already points at the same existing project.
				const same = to.kind === 'existing' && currentParent === stripMd(to.path);
				if (!same) plan.parentChanges.push({ from, to });
			}
		}

		// Removals only make sense for an existing task with existing edges.
		if (from.kind !== 'existing') continue;
		for (const token of record.remove_depends_on) {
			const { endpoint: to, ambiguous } = resolveToken(token);
			if (!to) {
				if (ambiguous || token.trim() !== '') plan.unresolvedLinks.push(`${record.name} ✕ ${token}`);
				continue;
			}
			if (to.kind !== 'existing' || !existingDeps.has(stripMd(to.path))) continue; // nothing to remove
			const dedupe = `${fromKey}=>${endpointKey(to)}`;
			if (seenRemove.has(dedupe)) continue;
			seenRemove.add(dedupe);
			plan.linkRemovals.push({ from, to });
		}
	}

	return plan;
}

/** Turn an update's field changes into a Partial<Task> patch for TaskStore.update. */
export function changesToPatch(changes: FieldChange[]): Partial<Task> {
	const patch: Record<string, unknown> = {};
	for (const change of changes) patch[change.field] = change.to;
	return patch as Partial<Task>;
}

/** Human-readable summary lines for the modal (the "bulk-edit summary"). */
export function summarizeImportPlan(plan: ImportPlan): string[] {
	const lines: string[] = [];
	lines.push(`${plan.creates.length} new task${plan.creates.length === 1 ? '' : 's'}`);
	lines.push(`${plan.updates.length} task${plan.updates.length === 1 ? '' : 's'} updated`);
	if (plan.deletes.length > 0) lines.push(`${plan.deletes.length} task${plan.deletes.length === 1 ? '' : 's'} deleted`);
	if (plan.linkAdds.length > 0) lines.push(`${plan.linkAdds.length} dependency link${plan.linkAdds.length === 1 ? '' : 's'} added`);
	if (plan.linkRemovals.length > 0) lines.push(`${plan.linkRemovals.length} dependency link${plan.linkRemovals.length === 1 ? '' : 's'} removed`);
	if (plan.parentChanges.length > 0) lines.push(`${plan.parentChanges.length} task${plan.parentChanges.length === 1 ? '' : 's'} reparented`);
	if (plan.unchangedCount > 0) lines.push(`${plan.unchangedCount} unchanged`);

	const fields = Object.keys(plan.fieldChangeCounts).sort();
	if (fields.length > 0) {
		const parts = fields.map((f) => `${f.replace(/_/g, ' ')}: ${plan.fieldChangeCounts[f]}`);
		lines.push(`Field changes — ${parts.join(', ')}`);
	}
	if (plan.ambiguousNames.length > 0) {
		lines.push(`Skipped ${plan.ambiguousNames.length} ambiguous name(s): ${plan.ambiguousNames.join(', ')}`);
	}
	if (plan.missingNames.length > 0) {
		lines.push(`Skipped ${plan.missingNames.length} not-found name(s): ${plan.missingNames.join(', ')}`);
	}
	if (plan.unresolvedLinks.length > 0) {
		lines.push(`Skipped ${plan.unresolvedLinks.length} unresolved link(s): ${plan.unresolvedLinks.join(', ')}`);
	}
	return lines;
}
