import type { FieldDefinition } from './types';
import type { Task } from '../types';

/**
 * Filter fields to only those visible under the given form values
 * Applies visibility rules (e.g. blocked_reason only when status=Blocked)
 */
export function getVisibleFields(
	fields: FieldDefinition[],
	values: Record<string, any>,
	options?: { section?: string }
): FieldDefinition[] {
	return fields.filter((field) => {
		// Filter by section if specified
		if (options?.section && field.section !== options.section) {
			return false;
		}

		// Apply visibility rule if defined
		if (field.visible) {
			return field.visible(values);
		}

		// Default: field is visible
		return true;
	});
}

/**
 * Group fields by their section property
 * Useful for rendering modal sections in order
 */
export function groupFieldsBySection(fields: FieldDefinition[]): Record<string, FieldDefinition[]> {
	const groups: Record<string, FieldDefinition[]> = {};

	fields.forEach((field) => {
		const section = field.section ?? 'advanced'; // Default to 'advanced' if no section
		if (!groups[section]) {
			groups[section] = [];
		}
		groups[section].push(field);
	});

	return groups;
}

/**
 * Sort task options, placing same-project tasks first
 * Used by WikiLinkField to float same-project dependencies to top
 */
export function sortDependencies(options: Task[], parentTaskPath: string | null): Task[] {
	if (!parentTaskPath) {
		return [...options]; // Return copy if no parent
	}

	// Extract project folder from parent path (e.g. "Planner/Tasks/abc-slug.md" -> "Planner/Tasks")
	const parentFolder = parentTaskPath.substring(0, parentTaskPath.lastIndexOf('/'));

	return [...options].sort((a, b) => {
		const aFolder = a.path.substring(0, a.path.lastIndexOf('/'));
		const bFolder = b.path.substring(0, b.path.lastIndexOf('/'));

		const aIsSameProject = aFolder === parentFolder;
		const bIsSameProject = bFolder === parentFolder;

		if (aIsSameProject && !bIsSameProject) return -1;
		if (!aIsSameProject && bIsSameProject) return 1;

		// Fallback: alphabetical by name
		return a.name.localeCompare(b.name);
	});
}

/**
 * Get display label for an option value
 * Returns label if mapped in definition, otherwise returns value
 */
export function getOptionLabel(value: string, definition: FieldDefinition): string {
	// If options is not an array, return value (from-settings or computed)
	if (!Array.isArray(definition.options)) {
		return value;
	}

	// For string array options, return the value
	// (string arrays don't have separate labels)
	return value;
}

/**
 * Get color for an option value
 * Returns color from optionColors mapping, or null if not defined
 */
export function getOptionColor(value: string, definition: FieldDefinition): string | null {
	if (!definition.optionColors) {
		return null;
	}

	return definition.optionColors[value] ?? null;
}
