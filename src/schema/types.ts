import type { Task, TaskStatus } from '../types';

/**
 * Field type determines which component renders the field.
 * Each type has a corresponding FieldComponent implementation.
 */
export type FieldType =
	| 'text'           // TextField
	| 'textarea'       // TextAreaField
	| 'number'        // NumberField
	| 'date'          // DateField
	| 'select'        // SelectField (single option)
	| 'chips'         // ChipsField (multi-select or single-select visual)
	| 'wikilink'      // WikiLinkField (dependency, parent task)
	| 'date-range'    // Future: start/due together
	| 'toggle';       // Future: boolean fields

/**
 * Validation rule applied to a field value.
 * Validators are pure functions that return error message or null.
 */
export interface ValidationRule {
	name: string;
	validate: (value: any, context: Record<string, any>) => string | null;
}

/**
 * Visibility rule determines if a field should be shown.
 * Pure function based on other field values.
 * Example: "blocked_reason" only visible when status === 'Blocked'
 */
export type VisibilityRule = (values: Record<string, any>) => boolean;

/**
 * Color configuration for a select/chips field.
 * Maps option value to color (hex or CSS variable).
 */
export interface OptionColors {
	[optionValue: string]: string;
}

/**
 * Options source: either static array or computed from settings/context.
 * Computed options allow statuses, areas, labels to change without code.
 */
export type OptionsSource =
	| string[]  // Static list
	| {
			type: 'from-settings';
			settingsKey: keyof TaskSettings;  // e.g. 'statuses', 'areas'
		}
	| {
			type: 'computed';
			compute: (settings: TaskSettings, context: Record<string, any>) => string[];
		};

/**
 * A field definition describes what a field is, not how to render it.
 * Used by both CreateTaskModal and TaskDetail to render consistent UI.
 */
export interface FieldDefinition {
	// Identity
	name: keyof Task;  // Must match Task property name
	label: string;
	placeholder?: string;

	// Rendering
	type: FieldType;
	multiline?: boolean;  // For textarea
	rows?: number;        // For textarea
	width?: 'full' | 'half' | 'third';

	// Options (for select/chips/wikilink)
	options?: OptionsSource;
	optionColors?: OptionColors;  // For status, area, label colors

	// Validation
	required?: boolean;
	validators?: ValidationRule[];

	// Conditional visibility
	visible?: VisibilityRule;

	// UI hints for specific field types
	dateHasButtons?: boolean;  // Show Today/Clear buttons (date fields)
	selectAllowEmpty?: boolean;  // Empty option in select dropdowns
	chipsType?: 'single' | 'multi';  // Chips field behavior

	// Dependency-aware sorting (for wikilink fields)
	sortBy?: (a: Task, b: Task, context: Record<string, any>) => number;

	// Read-only flag (for detail view)
	readOnly?: boolean;

	// Grouping for modal (which section)
	section?: 'basics' | 'scheduling' | 'notes' | 'advanced';
}

/**
 * Minimal TaskSettings interface for use in field components.
 * Avoids circular dependency on full plugin settings.
 */
export interface TaskSettings {
	statuses?: TaskStatus[];
	statusColors?: Record<string, string>;
	areas?: string[];
	areaColors?: Record<string, string>;
	labelValues?: string[];  // Task type / label values
	labelColors?: Record<string, string>;
	tasksFolder?: string;
}

/**
 * Field context provides values of other fields for visibility/sorting.
 * Used when one field's rendering depends on another field's value.
 */
export interface FieldContext {
	values: Record<string, any>;  // Current form values
	allTasks: Task[];             // For dependency sorting, parent task options
	settings: TaskSettings;
}
