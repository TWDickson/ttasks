import { resolveFieldOptionColors, resolveFieldOptions } from '../schema/optionResolver';
import type { TaskSettings } from '../schema/types';
import type { TaskPriority } from '../types';
import { PRIORITIES } from '../constants';

const DEFAULT_PRIORITY_OPTIONS: TaskPriority[] = [...PRIORITIES];

export interface TaskDetailOptionInput {
	settings: TaskSettings;
	status: string | null;
	area: string | null;
	selectedLabel: string | null;
}

export interface TaskDetailOptionState {
	priorityOptions: TaskPriority[];
	statusOptions: string[];
	areaOptions: string[];
	labelOptions: string[];
	repeatPresetOptions: string[];
	reminderOverrideOptions: string[];
	statusOptionColors: Record<string, string>;
	priorityOptionColors: Record<string, string>;
}

function withCurrentOption(base: string[], current: string | null): string[] {
	if (!current) return base;
	if (base.includes(current)) return base;
	return [...base, current];
}

export function deriveTaskDetailOptionState(input: TaskDetailOptionInput): TaskDetailOptionState {
	const { settings, status, area, selectedLabel } = input;
	const resolvedPriorityOptions = resolveFieldOptions('priority', settings) as TaskPriority[];

	return {
		priorityOptions: resolvedPriorityOptions.length > 0 ? resolvedPriorityOptions : DEFAULT_PRIORITY_OPTIONS,
		statusOptions: withCurrentOption(resolveFieldOptions('status', settings), status),
		areaOptions: withCurrentOption(resolveFieldOptions('area', settings), area),
		labelOptions: withCurrentOption(resolveFieldOptions('labels', settings), selectedLabel),
		repeatPresetOptions: resolveFieldOptions('repeat', settings),
		reminderOverrideOptions: resolveFieldOptions('reminder_override', settings),
		statusOptionColors: resolveFieldOptionColors('status', settings),
		priorityOptionColors: resolveFieldOptionColors('priority', settings),
	};
}
