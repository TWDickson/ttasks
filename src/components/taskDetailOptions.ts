import { resolveFieldOptionColors, resolveFieldOptions } from '../schema/optionResolver';
import type { TTasksSettings } from '../settings/types';
import type { TaskPriority } from '../types';

const DEFAULT_PRIORITY_OPTIONS: TaskPriority[] = ['High', 'Medium', 'Low', 'None'];

export interface TaskDetailOptionInput {
	settings: TTasksSettings;
	status: string | null;
	area: string | null;
	selectedLabel: string | null;
}

export interface TaskDetailOptionState {
	priorityOptions: TaskPriority[];
	statusOptions: string[];
	areaOptions: string[];
	labelOptions: string[];
	recurrenceOptions: string[];
	recurrenceTypeOptions: string[];
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
		recurrenceOptions: resolveFieldOptions('recurrence', settings),
		recurrenceTypeOptions: resolveFieldOptions('recurrence_type', settings),
		reminderOverrideOptions: resolveFieldOptions('reminder_override', settings),
		statusOptionColors: resolveFieldOptionColors('status', settings),
		priorityOptionColors: resolveFieldOptionColors('priority', settings),
	};
}
