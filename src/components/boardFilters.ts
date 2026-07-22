import type { FilterCondition } from '../query/types';
import { RENDERER_AGENDA, RENDERER_KANBAN, RENDERER_LIST, type RendererType } from '../constants';

/**
 * Ad-hoc toolbar filter state — Priority / Area / due-date range, the
 * filters a user picks from the filter-bar controls. Composes as extra AND
 * conditions layered on top of a view's own FilterSpec (kept separate from
 * the Group/Sort overrides in boardQuery.ts, which replace parts of the
 * query instead of adding to it).
 */
export interface ToolbarFilterState {
	priority?: string;
	area?: string;
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

/** Builds the extra FilterConditions for whichever toolbar filters are set, gated per-renderer. */
export function buildToolbarFilterConditions(state: ToolbarFilterState, renderer: RendererType): FilterCondition[] {
	const conditions: FilterCondition[] = [];
	if (state.priority) conditions.push({ field: 'priority', operator: 'is', value: state.priority });
	if (state.area) conditions.push({ field: 'area', operator: 'is', value: state.area });
	if (supportsDateRangeFilter(renderer)) {
		if (state.dateFrom) conditions.push({ field: 'due_date', operator: 'on_or_after', value: state.dateFrom });
		if (state.dateTo) conditions.push({ field: 'due_date', operator: 'on_or_before', value: state.dateTo });
	}
	return conditions;
}

/** Whether any toolbar filter (incl. search) is currently narrowing the view — drives the "Clear" button. */
export function hasActiveToolbarFilters(state: ToolbarFilterState, renderer: RendererType, search: string): boolean {
	if (search || state.priority || state.area) return true;
	return supportsDateRangeFilter(renderer) && !!(state.dateFrom || state.dateTo);
}
