/**
 * Graph-derived state, materialized for export. NO Obsidian imports
 * (boundary-tested).
 *
 * TTasks derives two things from the dependency graph that never touch a file:
 * downstream impediment (`computeImpediments`) and the projected schedule
 * (`buildTaskSchedule`). In the app they surface as badges. In an export they
 * surfaced as *prose* — `meta.impediments` and `meta.dates` described the two
 * algorithms and left the receiving AI to run them in its head.
 *
 * Weak models don't. They read `status: Active, due_date: null` and conclude
 * "workable, missing a date" — both wrong, and wrong in the direction that
 * produces confident bad advice. So the export now ships the answers.
 *
 * **This does not contradict "derived, never written."** That rule is about
 * frontmatter: a cascaded status can't be cleanly un-written once the blocker
 * clears, because you'd have to remember what each task's status *was*. An
 * export is a point-in-time projection, regenerated on every copy and discarded
 * after — there is nothing to un-write. The file stays clean; the wire carries
 * the resolved view, and the import whitelist (`IMPORT_UPDATABLE_FIELDS`) drops
 * these fields if a reply echoes them back.
 */
import type { Task } from '../types';
import {
	computeImpediments,
	impedingStatusName,
	isUpstreamImpediment,
	type ImpedimentStatuses,
} from '../query/taskImpediment';
import { buildTaskSchedule, resolveProjectedSchedule } from '../store/taskSchedule';
import { detectDependencyCyclePaths, type CalendarConfig } from '../store/graph/taskGraphDates';

/**
 * The derived fields for one task. Every key is optional and absent when it adds
 * nothing — absence is the signal ("not impeded", "schedule matches the dates
 * already shown"), which is both the cheapest encoding and the one a skimming
 * model reads correctly.
 */
export interface DerivedTaskState {
	/** The configured status name impeding this task from upstream ("Blocked"/"Hold"). */
	impeded?: string;
	/** Names of the tasks that actually have to clear. */
	impeded_by?: string[];
	/** In a dependency cycle, or downstream of one — so it has no computable schedule. */
	in_cycle?: boolean;
	/** Projected start from the dependency chain. */
	scheduled_start?: string;
	/** Projected finish from the chain plus `estimated_days`. */
	scheduled_end?: string;
}

export interface DerivedStateContext {
	/**
	 * The **full, unfiltered** vault task list — not the export selection.
	 *
	 * Exports are filtered (`taskExportFilter.ts`), and both impediment and date
	 * propagation are properties of the whole graph: a blocker outside the
	 * selection still blocks, and a dependency outside it still sets the start
	 * date. Deriving over the selection alone would report a stuck task as
	 * workable — silently, and only for filtered exports.
	 */
	allTasks: Task[];
	/** Configured Blocked/Hold names, from `plugin.statusPolicy`. */
	statuses: ImpedimentStatuses;
	/** Holidays + per-area workweek, so projected dates match what the app shows. */
	calendarConfig?: CalendarConfig;
}

/**
 * Derived state by task path, for every task that has any. Tasks with none are
 * absent rather than present-and-empty, so a caller can use a plain `.get()`.
 */
export function computeDerivedTaskState(context: DerivedStateContext): Map<string, DerivedTaskState> {
	const { allTasks, statuses, calendarConfig } = context;

	const impediments = computeImpediments(allTasks, statuses);
	const schedule = buildTaskSchedule(allTasks, calendarConfig ? { calendarConfig } : undefined);
	const cyclePaths = detectDependencyCyclePaths(allTasks);
	const nameByPath = new Map(allTasks.map((task) => [task.path, task.name]));

	const derived = new Map<string, DerivedTaskState>();
	for (const task of allTasks) {
		const state: DerivedTaskState = {};

		// Upstream only. A task that is itself Blocked already says so in `status`,
		// and badging it again is the noise `buildImpedimentBadges` also skips.
		const impediment = impediments.get(task.path);
		if (impediment && isUpstreamImpediment(impediment)) {
			state.impeded = impedingStatusName(impediment.kind, statuses);
			// Causes are paths of tasks drawn from `allTasks`, so every one resolves.
			// A miss is dropped rather than falling back to the basename — a path is
			// not a title (see CLAUDE.md), and `{6hex}-{slug}` reads as noise to an AI.
			const names = impediment.causes.flatMap((path) => {
				const name = nameByPath.get(path);
				return name ? [name] : [];
			});
			if (names.length > 0) state.impeded_by = names.sort();
		}

		if (cyclePaths.has(task.path)) state.in_cycle = true;

		// Completed work is history, not a plan — a done task resolves to its own
		// completion date, which restates `completed` in two more fields.
		if (!task.is_complete) {
			// Same predicate the Detail panel uses, so the export and the app agree on
			// when a projection is worth showing at all.
			const projected = resolveProjectedSchedule(task, schedule.get(task.path));
			if (projected) {
				state.scheduled_start = projected.start;
				state.scheduled_end = projected.end;
			}
		}

		if (Object.keys(state).length > 0) derived.set(task.path, state);
	}
	return derived;
}
