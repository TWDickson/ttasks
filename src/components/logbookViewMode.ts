import type { TaskViewRenderer } from '../settings';
import { RENDERER_KANBAN, RENDERER_LIST, type RendererType } from '../constants';

const LOGBOOK_VIEW_ID = 'logbook';

export type LogbookRendererMode = typeof RENDERER_LIST | typeof RENDERER_KANBAN;
export type LogbookRendererModeMap = Record<string, LogbookRendererMode | undefined>;

export function canToggleLogbookRenderer(viewId: string): boolean {
	return viewId === LOGBOOK_VIEW_ID;
}

export function resolveViewRenderer(
	viewId: string,
	baseRenderer: TaskViewRenderer,
	overrides: LogbookRendererModeMap,
): RendererType {
	if (!canToggleLogbookRenderer(viewId)) {
		return baseRenderer;
	}

	return overrides[viewId] === RENDERER_KANBAN ? RENDERER_KANBAN : RENDERER_LIST;
}

export function toggleLogbookRendererMode(
	viewId: string,
	overrides: LogbookRendererModeMap,
): LogbookRendererModeMap {
	if (!canToggleLogbookRenderer(viewId)) {
		return overrides;
	}

	const nextMode = resolveViewRenderer(viewId, RENDERER_LIST, overrides) === RENDERER_KANBAN ? RENDERER_LIST : RENDERER_KANBAN;
	return {
		...overrides,
		[viewId]: nextMode,
	};
}
