import { getFieldByName } from './taskFields';
import type { FieldContext, FieldDefinition, TaskSettings } from './types';
import type { Task } from '../types';

function resolveFromDefinition(
	field: FieldDefinition,
	settings: TaskSettings,
	context?: Partial<FieldContext>
): string[] {
	if (!field.options) return [];

	if (Array.isArray(field.options)) {
		return field.options;
	}

	if (field.options.type === 'from-settings') {
		const options = settings[field.options.settingsKey];
		return Array.isArray(options) ? options : [];
	}

	if (field.options.type === 'computed') {
		return field.options.compute(settings, {
			values: context?.values ?? {},
			allTasks: (context?.allTasks ?? []) as Task[],
			settings,
		});
	}

	return [];
}

/**
 * Resolve configured options for a schema field by name.
 */
export function resolveFieldOptions(
	fieldName: keyof Task,
	settings: TaskSettings,
	context?: Partial<FieldContext>
): string[] {
	const field = getFieldByName(fieldName);
	if (!field) return [];
	return resolveFromDefinition(field, settings, context);
}

/**
 * Resolve configured options for an already-resolved field definition.
 */
export function resolveOptionsForDefinition(
	field: FieldDefinition,
	settings: TaskSettings,
	context?: Partial<FieldContext>
): string[] {
	return resolveFromDefinition(field, settings, context);
}
