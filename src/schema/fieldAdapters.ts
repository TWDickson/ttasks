import type { FieldDefinition, FieldContext, TaskSettings } from './types';
import type { Task } from '../types';
import { getVisibleFields, sortDependencies } from './fieldRenderers';
import { parseWikiLink } from '../utils/wikiLink';

/**
 * Props object for field component rendering
 * Provides all necessary data for a field to render correctly
 */
export interface FieldComponentProps {
	definition: FieldDefinition;
	value: any;
	error: string | null;
	options?: string[] | Task[];
	context?: FieldContext;
	readonly: boolean;
	onChange: (value: any) => void;
	onBlur?: () => void;
}

/**
 * Create base field props for any context
 * Handles value normalization, error mapping, readonly determination
 */
export function adaptFieldProps(
	field: FieldDefinition,
	value: any,
	error: string | null
): Omit<FieldComponentProps, 'options' | 'context'> {
	return {
		definition: field,
		value,
		error,
		readonly: field.readOnly ?? false,
		onChange: (newValue: any) => {
			// Handled by parent component (modal/detail)
		},
	};
}

/**
 * Adapt field for modal rendering context
 * Includes: all visible fields, sorted dependencies, task options for pickers
 * Returns: complete FieldComponentProps ready to pass to component
 */
export function adaptFieldForModal(
	field: FieldDefinition,
	values: Record<string, any>,
	allTasks: Task[],
	settings: TaskSettings,
	errors: Record<string, string>
): FieldComponentProps {
	let value = values[field.name];

	// Normalize wikilink values (strip markdown extensions for internal use)
	if (field.type === 'wikilink' && value) {
		if (Array.isArray(value)) {
			value = value.map((v) => {
				const path = parseWikiLink(v);
				return path?.replace(/\.md$/, '') ?? v;
			});
		} else {
			const path = parseWikiLink(value);
			value = path?.replace(/\.md$/, '') ?? value;
		}
	}

	const baseProps = adaptFieldProps(field, value, errors[field.name] ?? null);

	// Add options for select/chips/wikilink fields
	let options: string[] | Task[] | undefined;

	if (field.type === 'wikilink') {
		// Sort dependency options by parent_task if applicable
		const parentTaskPath = values.parent_task?.replace(/\.md$/, '');
		options = sortDependencies(allTasks, parentTaskPath);
	} else if (field.type === 'select' || field.type === 'chips') {
		if (Array.isArray(field.options)) {
			options = field.options;
		}
		// from-settings and computed options resolved by component
	}

	return {
		...baseProps,
		options,
		context: {
			values,
			allTasks,
			settings,
		},
	};
}

/**
 * Adapt field for detail view rendering context
 * Same as modal but with potential readonly overrides and grid layout handling
 * Detail views may mark more fields as read-only (e.g., after task is completed)
 */
export function adaptFieldForDetail(
	field: FieldDefinition,
	values: Record<string, any>,
	allTasks: Task[],
	settings: TaskSettings,
	errors: Record<string, string>
): FieldComponentProps {
	let value = values[field.name];

	// Normalize wikilink values same as modal
	if (field.type === 'wikilink' && value) {
		if (Array.isArray(value)) {
			value = value.map((v) => {
				const path = parseWikiLink(v);
				return path?.replace(/\.md$/, '') ?? v;
			});
		} else {
			const path = parseWikiLink(value);
			value = path?.replace(/\.md$/, '') ?? value;
		}
	}

	const baseProps = adaptFieldProps(field, value, errors[field.name] ?? null);

	// Detail view respects readonly flag from field definition
	// (already set by adaptFieldProps)

	// Add options for select/chips/wikilink fields
	let options: string[] | Task[] | undefined;

	if (field.type === 'wikilink') {
		// Sort by parent_task
		const parentTaskPath = values.parent_task?.replace(/\.md$/, '');
		options = sortDependencies(allTasks, parentTaskPath);
	} else if (field.type === 'select' || field.type === 'chips') {
		if (Array.isArray(field.options)) {
			options = field.options;
		}
	}

	return {
		...baseProps,
		options,
		readonly: baseProps.readonly, // Explicit for detail view
		context: {
			values,
			allTasks,
			settings,
		},
	};
}

/**
 * Get visible fields for a specific context (modal section, detail view, etc.)
 * Filters fields by visibility rules and optional section grouping
 */
export function getContextVisibleFields(
	fields: FieldDefinition[],
	values: Record<string, any>,
	options?: { section?: string }
): FieldDefinition[] {
	return getVisibleFields(fields, values, options);
}
