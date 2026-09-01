import type { FilterCondition, FilterGroup } from '../query/types';
import { RENDERER_AGENDA, RENDERER_KANBAN, RENDERER_LIST, type RendererType } from '../constants';

/**
 * Ad-hoc toolbar filter state — Status / Priority / Area / Labels and the
 * due-date range, the filters a user picks from the filter-bar controls.
 * Composes as extra AND conditions layered on top of a view's own FilterSpec
 * (kept separate from the Group/Sort overrides in boardQuery.ts, which replace
 * parts of the query instead of adding to it).
 *
 * Each field holds a **set** of accepted values, because the toolbar controls
 * are multi-select: "Blocked or Hold" is one question, and asking it as two
 * ANDed conditions would match nothing.
 */
export interface ToolbarFilterState {
	status?: string[];
	priority?: string[];
	area?: string[];
	labels?: string[];
	dateFrom?: string;
	dateTo?: string;
}

/**
 * Renderers whose toolbar shows the due-date range control. Graph and
 * Archive/Logbook are excluded — Graph is relationship-first (dates aren't
 * the primary axis), and Logbook cares about `completed`, not `due_date`.
 */
const DATE_RANGE_RENDERERS: ReadonlySet<RendererType> = new Set([RENDERER_LIST, RENDERER_KANBAN, RENDERER_AGENDA]);

export function supportsDateRangeFilter(renderer: RendererType): boolean {
	return DATE_RANGE_RENDERERS.has(renderer);
}

/**
 * One condition per selected value, ORed together.
 *
 * A single selection stays a plain `is` condition rather than a one-armed OR
 * group: the spec is user-visible in the Smart List JSON editor, and a nested
 * group around one condition reads like a mistake. Multiple selections nest,
 * which the engine already supports — `FilterGroup` is allowed anywhere a
 * `FilterCondition` is.
 */
function anyOf(field: 'status' | 'priority' | 'area', values: string[]): FilterCondition | FilterGroup | null {
	if (values.length === 0) return null;
	if (values.length === 1) return { field, operator: 'is', value: values[0] };
	return {
		logic: 'or',
		conditions: values.map((value) => ({ field, operator: 'is' as const, value })),
	};
}

/**
 * Builds the extra filter conditions for whichever toolbar filters are set,
 * gated per-renderer.
 *
 * `labels` is a list field, so it needs `contains`/`contains_any` rather than
 * `is` — matching one of a task's labels, not equalling the whole list.
 */
export function buildToolbarFilterConditions(
	state: ToolbarFilterState,
	renderer: RendererType,
): Array<FilterCondition | FilterGroup> {
	const conditions: Array<FilterCondition | FilterGroup> = [];

	for (const [field, values] of [
		['status', state.status],
		['priority', state.priority],
		['area', state.area],
	] as const) {
		const condition = anyOf(field, values ?? []);
		if (condition) conditions.push(condition);
	}

	const labels = state.labels ?? [];
	if (labels.length === 1) {
		conditions.push({ field: 'labels', operator: 'contains', value: labels[0] });
	} else if (labels.length > 1) {
		conditions.push({ field: 'labels', operator: 'contains_any', value: labels });
	}

	if (supportsDateRangeFilter(renderer)) {
		if (state.dateFrom) conditions.push({ field: 'due_date', operator: 'on_or_after', value: state.dateFrom });
		if (state.dateTo) conditions.push({ field: 'due_date', operator: 'on_or_before', value: state.dateTo });
	}
	return conditions;
}

/** Whether any toolbar filter (incl. search) is currently narrowing the view — drives the "Clear" button. */
export function hasActiveToolbarFilters(state: ToolbarFilterState, renderer: RendererType, search: string): boolean {
	if (search) return true;
	if ((state.status?.length ?? 0) > 0) return true;
	if ((state.priority?.length ?? 0) > 0) return true;
	if ((state.area?.length ?? 0) > 0) return true;
	if ((state.labels?.length ?? 0) > 0) return true;
	return supportsDateRangeFilter(renderer) && !!(state.dateFrom || state.dateTo);
}
