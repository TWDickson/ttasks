/**
 * Derived upstream-impediment state (backlog item #8).
 *
 * A task whose blocker is Blocked or on Hold looks perfectly workable in a list
 * — its own status is still Active — but it isn't. This computes that fact from
 * the dependency graph instead of writing it into frontmatter.
 *
 * **Derived, never written.** A cascaded status can't be cleanly un-written when
 * the blocker clears (you'd have to remember what each task's status *was*), so
 * the impediment is recomputed from the graph every time and surfaced as a badge.
 *
 * **Semantics** (Taylor, 2026-07-25):
 *   • Blocked — an external impediment: needs escalation, or is impossible right
 *     now. It genuinely propagates: nothing downstream can proceed either.
 *   • Hold — a deliberate pause: awaiting delegated work, or bumped by another
 *     priority. It propagates too, but as the weaker signal.
 *   • **Blocked beats Hold.** Where both reach the same task, it reads Blocked.
 *
 * That precedence is what makes the result **order-independent**: a task reachable
 * from both a Blocked and a Held upstream resolves the same regardless of the
 * traversal order, so the derived state is a function of the graph alone. The
 * implementation takes a max over contributions rather than last-write-wins
 * specifically to preserve that.
 *
 * Pure: no Obsidian or plugin dependencies.
 */
import type { Task } from '../types';
import { normalizeTaskPath } from '../store/graph/taskGraph';
import { resolveTaskRef, taskRefName, type TaskRefIndex } from '../utils/taskRef';
import type { BadgePalette } from '../utils/badgePalette';

export type ImpedimentKind = 'blocked' | 'held';

/** Strength order. Higher wins when impediments meet. */
const RANK: Record<ImpedimentKind, number> = { held: 1, blocked: 2 };

export interface ImpedimentState {
	/** The strongest impediment reaching this task. */
	kind: ImpedimentKind;
	/**
	 * `self` when the task's own status is the winning kind (its status already
	 * says so — the UI needn't badge it); `upstream` when it's inherited, which
	 * is the case worth surfacing.
	 */
	source: 'self' | 'upstream';
	/**
	 * Paths of the tasks actually carrying the winning kind — the things that have
	 * to clear. Intermediate carriers are not listed. Sorted, so the tooltip text
	 * is stable across recomputes.
	 */
	causes: string[];
}

export interface ImpedimentStatuses {
	/** Configured Blocked status name (`StatusPolicy.block`). */
	blockStatus: string;
	/**
	 * Configured Hold status name, or `null`/`''` when the vault has none —
	 * absence is meaningful and must not be filled in with a fallback. A vault
	 * with no Hold that resolved this to the first status would treat every
	 * Active task as impeded and cascade a bogus Hold across the whole graph.
	 * See `StatusPolicy.hold`.
	 */
	holdStatus: string | null;
}

interface Contribution {
	kind: ImpedimentKind;
	causes: string[];
	from: 'self' | 'upstream';
}

/**
 * Map of task path → derived impediment, for every task that has one.
 *
 * Tasks with no impediment are absent from the map rather than present with
 * null, so callers can use a plain `.get()` truthiness check.
 *
 * `tasks` should be the full, unfiltered list: a blocker outside the visible or
 * filtered set still impedes.
 */
export function computeImpediments(
	tasks: Task[],
	statuses: ImpedimentStatuses,
): Map<string, ImpedimentState> {
	const byPath = new Map(tasks.map((task) => [task.path, task]));
	const memo = new Map<string, ImpedimentState | null>();
	const visiting = new Set<string>();

	/** The impediment a task carries in its own right, ignoring its dependencies. */
	function ownKind(task: Task): ImpedimentKind | null {
		// A completed task is nobody's impediment, whatever its status field says.
		if (task.is_complete) return null;
		if (statuses.blockStatus && task.status === statuses.blockStatus) return 'blocked';
		if (statuses.holdStatus && task.status === statuses.holdStatus) return 'held';
		return null;
	}

	/**
	 * Resolve one task. `truncated` reports that a dependency cycle cut the walk
	 * short, in which case the result is incomplete and must not be memoized — a
	 * partial answer cached here would poison every later lookup that reaches it.
	 */
	function resolve(task: Task): { state: ImpedimentState | null; truncated: boolean } {
		const cached = memo.get(task.path);
		if (cached !== undefined) return { state: cached, truncated: false };

		// Re-entering a node means a dependency cycle. Contribute nothing on this
		// path rather than recursing forever; the cycle's own impediments are still
		// found via whichever of its members is resolved from outside.
		if (visiting.has(task.path)) return { state: null, truncated: true };

		// A completed task is not impeded, and passes nothing downstream.
		if (task.is_complete) {
			memo.set(task.path, null);
			return { state: null, truncated: false };
		}

		visiting.add(task.path);

		const contributions: Contribution[] = [];
		const self = ownKind(task);
		if (self) contributions.push({ kind: self, causes: [task.path], from: 'self' });

		let truncated = false;
		for (const dep of task.depends_on) {
			const depPath = normalizeTaskPath(dep);
			// A dangling depends_on link doesn't impede — mirrors isTaskReady.
			const depTask = depPath ? byPath.get(depPath) : null;
			if (!depTask) continue;

			const upstream = resolve(depTask);
			if (upstream.truncated) truncated = true;
			if (upstream.state) {
				contributions.push({
					kind: upstream.state.kind,
					causes: upstream.state.causes,
					from: 'upstream',
				});
			}
		}

		visiting.delete(task.path);

		const state = reduceContributions(contributions);
		if (!truncated) memo.set(task.path, state);
		return { state, truncated };
	}

	const result = new Map<string, ImpedimentState>();
	for (const task of tasks) {
		const { state } = resolve(task);
		if (state) result.set(task.path, state);
	}
	return result;
}

/**
 * Max over contributions, not last-write-wins — this is where order-independence
 * comes from. Every contributor at the winning rank supplies causes, so a task
 * blocked by two different things names both.
 */
function reduceContributions(contributions: Contribution[]): ImpedimentState | null {
	if (contributions.length === 0) return null;

	let maxRank = 0;
	for (const contribution of contributions) {
		maxRank = Math.max(maxRank, RANK[contribution.kind]);
	}
	const winners = contributions.filter((contribution) => RANK[contribution.kind] === maxRank);

	const causes = new Set<string>();
	for (const winner of winners) {
		for (const cause of winner.causes) causes.add(cause);
	}

	return {
		kind: winners[0].kind,
		// If the task's own status is the winning kind, that's the honest source —
		// its status already communicates it, inherited or not.
		source: winners.some((winner) => winner.from === 'self') ? 'self' : 'upstream',
		causes: [...causes].sort(),
	};
}

/**
 * The subset worth badging: tasks impeded by something *upstream*, whose own
 * status gives no hint. A task that is itself Blocked already says so.
 */
export function isUpstreamImpediment(state: ImpedimentState | undefined): boolean {
	return state?.source === 'upstream';
}

/** Human-readable badge text for an inherited impediment. */
export interface ImpedimentLabel {
	/** Compact badge text — rows are crowded, so detail goes in the tooltip. */
	label: string;
	/** Full explanation, naming what actually has to clear. */
	tooltip: string;
}

/**
 * Render an impediment for display. The status *name* comes from settings rather
 * than being hardcoded, so a vault that renamed Blocked to "Escalated" reads
 * "Escalated upstream".
 *
 * Causes resolve through `index`; an unknown path degrades to `Missing task (id)`
 * rather than being dropped, so the tooltip never silently under-reports what's
 * holding the task up — and never passes a filename off as a name.
 */
/**
 * The blocking status' name for an impediment kind. A `held` state only exists
 * when a Hold status is configured — `ownKind` checks before assigning it — so
 * the `?? ''` is unreachable. It's here because the compiler can't see that
 * invariant, not because a blank name is a case worth rendering.
 */
export function impedingStatusName(kind: ImpedimentKind, statuses: ImpedimentStatuses): string {
	return (kind === 'blocked' ? statuses.blockStatus : statuses.holdStatus) ?? '';
}

export function describeImpediment(
	state: ImpedimentState,
	statuses: ImpedimentStatuses,
	index: TaskRefIndex,
): ImpedimentLabel {
	const statusName = impedingStatusName(state.kind, statuses);
	const label = `${statusName} upstream`;
	const names = state.causes.flatMap((path) => {
		const ref = resolveTaskRef(path, index);
		return ref ? [taskRefName(ref)] : [];
	});
	const tooltip = names.length > 0
		? `${label} — waiting on: ${names.join(', ')}`
		: label;
	return { label, tooltip };
}

/** A render-ready badge for one task. */
export interface ImpedimentBadge extends ImpedimentLabel {
	kind: ImpedimentKind;
	/**
	 * Inline style carrying the blocking status' configured colour, or `''` when
	 * that status has none — in which case `.tt-badge-impediment` falls back to a
	 * readable neutral via its own `--tt-impediment-color` default. Resolved here
	 * rather than in the views so both renderers can't drift apart.
	 */
	style: string;
}

/**
 * Build the display map the views consume: path → badge, for **upstream**
 * impediments only. A task that is itself Blocked is excluded — its own status
 * field already says so, and badging it would be noise.
 *
 * Kept here rather than in the components so the view layer stays a renderer,
 * mirroring `boardFilters.ts` / `boardQuery.ts`.
 */
export function buildImpedimentBadges(
	impediments: Map<string, ImpedimentState>,
	statuses: ImpedimentStatuses,
	index: TaskRefIndex,
	palette: BadgePalette,
): Map<string, ImpedimentBadge> {
	const badges = new Map<string, ImpedimentBadge>();
	for (const [path, state] of impediments) {
		if (!isUpstreamImpediment(state)) continue;
		const statusName = impedingStatusName(state.kind, statuses);
		badges.set(path, {
			...describeImpediment(state, statuses, index),
			kind: state.kind,
			style: palette.status(statusName).style,
		});
	}
	return badges;
}
