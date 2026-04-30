import type { TaskViewRenderer } from '../settings';

const LOGBOOK_VIEW_ID = 'logbook';

export type LogbookRendererMode = 'list' | 'kanban';
export type LogbookRendererModeMap = Record<string, LogbookRendererMode | undefined>;

export function canToggleLogbookRenderer(viewId: string): boolean {
	return viewId === LOGBOOK_VIEW_ID;
}

export function resolveViewRenderer(
	viewId: string,
	baseRenderer: TaskViewRenderer,
	overrides: LogbookRendererModeMap,
): TaskViewRenderer {
	if (!canToggleLogbookRenderer(viewId)) {
		return baseRenderer;
	}

	return overrides[viewId] === 'kanban' ? 'kanban' : 'list';
}

export function toggleLogbookRendererMode(
	viewId: string,
	overrides: LogbookRendererModeMap,
): LogbookRendererModeMap {
	if (!canToggleLogbookRenderer(viewId)) {
		return overrides;
	}

	const nextMode = resolveViewRenderer(viewId, 'list', overrides) === 'kanban' ? 'list' : 'kanban';
	return {
		...overrides,
		[viewId]: nextMode,
	};
}
