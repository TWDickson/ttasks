import type { QuerySpec } from '../query/types';
import { applyBuiltinCompletedVisibility } from './builtinViewCompletionToggle';
import { coerceQueryForRenderer, type RegisteredTaskViewDefinition } from '../views/viewRegistry';

export function buildBoardQuery(
	view: RegisteredTaskViewDefinition,
	renderer: RegisteredTaskViewDefinition['renderer'],
	showCompleted: boolean,
): QuerySpec {
	const coerced = coerceQueryForRenderer(renderer, view.query);
	return applyBuiltinCompletedVisibility(view, coerced, showCompleted);
}
