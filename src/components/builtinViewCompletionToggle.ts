import type { FilterCondition, QuerySpec } from '../query/types';
import type { RegisteredTaskViewDefinition } from '../views/viewRegistry';

const INCOMPLETE_ONLY_CONDITION: FilterCondition = {
	field: 'is_complete',
	operator: 'is',
	value: false,
};

export function canToggleBuiltinCompleted(view: Pick<RegisteredTaskViewDefinition, 'id' | 'source'>): boolean {
	return view.source === 'builtin' && view.id !== 'logbook';
}

export function applyBuiltinCompletedVisibility(
	view: Pick<RegisteredTaskViewDefinition, 'id' | 'source'>,
	query: QuerySpec,
	showCompleted: boolean,
): QuerySpec {
	if (!canToggleBuiltinCompleted(view)) return query;

	const conditions = query.filter.conditions.filter((condition) => (
		'logic' in condition || !isIncompleteOnlyCondition(condition)
	));

	return {
		...query,
		filter: {
			logic: query.filter.logic,
			conditions: showCompleted ? conditions : [INCOMPLETE_ONLY_CONDITION, ...conditions],
		},
	};
}

function isIncompleteOnlyCondition(condition: FilterCondition): boolean {
	return condition.field === 'is_complete'
		&& condition.operator === 'is'
		&& condition.value === false;
}
