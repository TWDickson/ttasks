import type { GroupField, QuerySpec, SortField } from '../query/types';
import { applyBuiltinCompletedVisibility } from './builtinViewCompletionToggle';
import { coerceQueryForRenderer, type RegisteredTaskViewDefinition } from '../views/viewRegistry';

export type ListGroupOverride = GroupField | 'none';
export interface ListSortOverride {
	field: SortField;
	direction: 'asc' | 'desc';
}

/**
 * A user-chosen group/sort override for a list-rendered view (from the Group/
 * Sort toolbar controls). Only 'list' honors these — kanban/agenda have a
 * renderer-required grouping (see isGroupCompatibleWithRenderer) that an
 * override must not fight.
 */
function applyListOverrides(
	renderer: RegisteredTaskViewDefinition['renderer'],
	query: QuerySpec,
	groupOverride: ListGroupOverride | null | undefined,
	sortOverride: ListSortOverride | null | undefined,
): QuerySpec {
	if (renderer !== 'list') return query;
	return {
		...query,
		group: groupOverride
			? (groupOverride === 'none' ? { kind: 'none' } : { kind: 'field', field: groupOverride })
			: query.group,
		sort: sortOverride ? [sortOverride] : query.sort,
	};
}

export function buildBoardQuery(
	view: RegisteredTaskViewDefinition,
	renderer: RegisteredTaskViewDefinition['renderer'],
	showCompleted: boolean,
	groupOverride?: ListGroupOverride | null,
	sortOverride?: ListSortOverride | null,
): QuerySpec {
	const coerced = coerceQueryForRenderer(renderer, view.query);
	const withCompleted = applyBuiltinCompletedVisibility(view, coerced, showCompleted);
	return applyListOverrides(renderer, withCompleted, groupOverride, sortOverride);
}
