import type { FieldDefinition } from '../schema/types';
import type { TaskSettings } from '../schema/types';
import { taskFields } from '../schema/taskFields';
import { adaptFieldForModal } from '../schema/fieldAdapters';
import { resolveOptionsForDefinition } from '../schema/optionResolver';
import type { Task } from '../types';

/**
 * HTML field renderer for modal context.
 * Renders schema-defined fields as plain HTML elements (matching modal's DOM-based approach).
 */

/**
 * Render a field label with optional required indicator
 */
export function renderFieldLabel(definition: FieldDefinition): HTMLElement {
	const label = document.createElement('label');
	label.className = 'tt-modal-field-label';
	label.textContent = definition.label;
	if (definition.required) {
		const required = document.createElement('span');
		required.className = 'tt-field-required';
		required.textContent = ' *';
		label.appendChild(required);
	}
	return label;
}

/**
 * Render an error message below a field
 */
export function renderError(error: string | null): HTMLElement | null {
	if (!error) return null;
	const el = document.createElement('div');
	el.className = 'tt-field-error';
	el.textContent = error;
	return el;
}

/**
 * Render field container with consistent structure
 */
export function renderFieldContainer(definition: FieldDefinition, content: HTMLElement): HTMLElement {
	const container = document.createElement('div');
	container.className = 'tt-modal-field-container';
	container.setAttribute('data-field', definition.name);

	const label = renderFieldLabel(definition);
	container.appendChild(label);
	container.appendChild(content);

	return container;
}

/**
 * Get all visible fields for a specific section
 */
export function getVisibleFieldsForSection(
	section: 'basics' | 'scheduling' | 'notes' | 'advanced',
	values: Record<string, any>
): FieldDefinition[] {
	return taskFields.filter((field) => {
		// Match section
		if (field.section !== section) return false;

		// Apply visibility rule
		if (field.visible) {
			return field.visible(values);
		}

		return true;
	});
}

/**
 * Get all field definitions grouped by section
 */
export function getFieldsGroupedBySection(): Record<string, FieldDefinition[]> {
	const grouped: Record<string, FieldDefinition[]> = {
		basics: [],
		scheduling: [],
		notes: [],
		advanced: [],
	};

	taskFields.forEach((field) => {
		const section = field.section || 'advanced';
		if (section in grouped) {
			grouped[section as keyof typeof grouped].push(field);
		}
	});

	return grouped;
}

/**
 * Get field props adapted for modal context
 * Used by field rendering functions to get typed values, options, errors
 */
export function getFieldPropsForModal(
	field: FieldDefinition,
	values: Record<string, any>,
	allTasks: Task[],
	settings: TaskSettings,
	errors: Record<string, string>
): any {
	return adaptFieldForModal(field, values, allTasks, settings, errors);
}

/**
 * Helper to check if field is visible given current values
 */
export function isFieldVisible(field: FieldDefinition, values: Record<string, any>): boolean {
	if (!field.visible) {
		return true;
	}
	return field.visible(values);
}

/**
 * Get options for a field (string array)
 * Resolves from-settings options, computed options, static arrays
 */
export function getFieldOptions(
	field: FieldDefinition,
	settings: TaskSettings
): string[] {
	return resolveOptionsForDefinition(field, settings);
}

/**
 * Get color for an option value
 */
export function getOptionColor(value: string, field: FieldDefinition): string | null {
	if (!field.optionColors) {
		return null;
	}
	return field.optionColors[value] ?? null;
}
