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

function resolveColorsFromDefinition(
	field: FieldDefinition,
	settings: TaskSettings
): Record<string, string> {
	if (!field.optionColors) return {};

	const colorSource = field.optionColors as unknown as {
		type?: string;
		settingsKey?: keyof TaskSettings;
		[key: string]: unknown;
	};

	if (typeof colorSource === 'object' && colorSource?.type === 'from-settings' && colorSource.settingsKey) {
		const configuredColors = settings[colorSource.settingsKey];
		return configuredColors && typeof configuredColors === 'object'
			? (configuredColors as Record<string, string>)
			: {};
	}

	return field.optionColors as Record<string, string>;
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

/**
 * Resolve configured option colors for a schema field by name.
 */
export function resolveFieldOptionColors(
	fieldName: keyof Task,
	settings: TaskSettings
): Record<string, string> {
	const field = getFieldByName(fieldName);
	if (!field) return {};
	return resolveColorsFromDefinition(field, settings);
}

/**
 * Resolve configured option colors for an already-resolved field definition.
 */
export function resolveOptionColorsForDefinition(
	field: FieldDefinition,
	settings: TaskSettings
): Record<string, string> {
	return resolveColorsFromDefinition(field, settings);
}
