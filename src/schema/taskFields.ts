import type { FieldDefinition } from './types';
import type { Task } from '../types';
import { isBlockedStatus } from './fieldVisibility';

/**
 * Validation rules for fields.
 * Pure functions that return error message or null.
 */
const VALIDATORS = {
	required: (value: any): string | null => {
		if (value === null || value === undefined || value === '' || (Array.isArray(value) && value.length === 0)) {
			return 'This field is required';
		}
		return null;
	},
	dateFormat: (value: string): string | null => {
		if (!value) return null;
		if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
			return 'Invalid date format (use YYYY-MM-DD)';
		}
		const date = new Date(value);
		if (isNaN(date.getTime())) {
			return 'Invalid date';
		}
		return null;
	},
	nonNegativeNumber: (value: any): string | null => {
		if (value === null || value === undefined || value === '') return null;
		const num = parseFloat(value);
		if (isNaN(num) || num < 0) {
			return 'Must be a non-negative number';
		}
		return null;
	},
} as const;

/**
 * Comprehensive field definitions for all task properties.
 * Used by CreateTaskModal and TaskDetail to render consistent UI.
 *
 * Each definition declares:
 * - What the field is (name, label, type)
 * - How to render it (options, colors, buttons)
 * - When to show it (visibility rules)
 * - How to validate it (validators)
 */
export const TASK_FIELD_DEFINITIONS: FieldDefinition[] = [
	// ── BASICS ──────────────────────────────────────────────────────────────────
	{
		name: 'name',
		label: 'Task Name',
		placeholder: 'Enter task name…',
		type: 'text',
		section: 'basics',
		required: true,
		validators: [
			{
				name: 'required',
				validate: VALIDATORS.required,
			},
		],
		width: 'full',
	},

	{
		name: 'type',
		label: 'Type',
		type: 'chips',
		section: 'basics',
		options: ['task', 'project'],
		chipsType: 'single',
	},

	{
		name: 'priority',
		label: 'Priority',
		type: 'chips',
		section: 'basics',
		options: ['None', 'Low', 'Medium', 'High'],
		optionColors: {
			'High': 'var(--color-red)',
			'Medium': 'var(--color-orange)',
			'Low': 'var(--color-yellow)',
			'None': 'var(--color-gray)',
		},
		chipsType: 'single',
	},

	// ── SCHEDULING ──────────────────────────────────────────────────────────────
	{
		name: 'start_date',
		label: 'Start Date',
		type: 'date',
		section: 'scheduling',
		dateHasButtons: true,
		visible: (values) => !values.depends_on || values.depends_on.length === 0,
		validators: [
			{
				name: 'date-format',
				validate: VALIDATORS.dateFormat,
			},
		],
	},

	{
		name: 'due_date',
		label: 'Due Date',
		type: 'date',
		section: 'scheduling',
		dateHasButtons: true,
		validators: [
			{
				name: 'date-format',
				validate: VALIDATORS.dateFormat,
			},
		],
	},

	{
		name: 'estimated_days',
		label: 'Est. Days',
		type: 'number',
		section: 'scheduling',
		placeholder: '—',
		visible: (values) => !values.due_date,
		validators: [
			{
				name: 'non-negative-number',
				validate: VALIDATORS.nonNegativeNumber,
			},
		],
	},

	{
		name: 'depends_on',
		label: 'After Task(s)',
		type: 'wikilink',
		section: 'scheduling',
		options: {
			type: 'computed',
			compute: () => [], // Computed from allTasks by component
		},
		selectAllowEmpty: true,
		chipsType: 'multi',
		// Sorting handled by component (uses sortDependencyFirst)
	},

	// ── NOTES ───────────────────────────────────────────────────────────────────
	{
		name: 'notes',
		label: 'Notes',
		type: 'textarea',
		section: 'notes',
		rows: 5,
		placeholder: 'Add notes…',
		width: 'full',
	},

	// ── ADVANCED ────────────────────────────────────────────────────────────────
	{
		name: 'status',
		label: 'Status',
		type: 'chips',
		section: 'advanced',
		options: {
			type: 'from-settings',
			settingsKey: 'statuses',
		},
		optionColors: {
			type: 'from-settings',
			settingsKey: 'statusColors',
		},
		chipsType: 'single',
	},

	{
		name: 'area',
		label: 'Area',
		type: 'select',
		section: 'advanced',
		options: {
			type: 'from-settings',
			settingsKey: 'areas',
		},
		optionColors: {
			type: 'from-settings',
			settingsKey: 'areaColors',
		},
		selectAllowEmpty: true,
	},

	{
		name: 'labels',
		label: 'Labels',
		type: 'chips',
		section: 'advanced',
		options: {
			type: 'from-settings',
			settingsKey: 'labelValues',
		},
		optionColors: {
			type: 'from-settings',
			settingsKey: 'labelColors',
		},
		chipsType: 'multi',
	},

	{
		name: 'parent_task',
		label: 'Parent Project',
		type: 'wikilink',
		section: 'advanced',
		options: {
			type: 'computed',
			compute: () => [], // Computed from allTasks (type='project') by component
		},
		selectAllowEmpty: true,
	},

	{
		name: 'assigned_to',
		label: 'Assigned To',
		type: 'text',
		section: 'advanced',
		placeholder: 'Name or user…',
	},

	{
		name: 'blocked_reason',
		label: 'Blocked Reason',
		type: 'text',
		section: 'advanced',
		placeholder: 'Why is this task blocked?',
		visible: (values) => isBlockedStatus(values.status, values.blockStatus),
	},

	{
		name: 'source',
		label: 'Source',
		type: 'text',
		section: 'advanced',
		placeholder: 'Where did this task come from?',
	},

	// ── RECURRENCE + REMINDERS (Advanced) ───────────────────────────────────────
	{
		name: 'recurrence',
		label: 'Repeats',
		type: 'select',
		section: 'advanced',
		options: ['daily', 'weekly', 'biweekly', 'monthly', 'yearly'],
		selectAllowEmpty: true,
	},

	{
		name: 'recurrence_type',
		label: 'Repeat Type',
		type: 'select',
		section: 'advanced',
		options: ['fixed', 'from_completion'],
		visible: (values) => !!values.recurrence,
	},

	{
		name: 'reminder_override',
		label: 'Reminders',
		type: 'select',
		section: 'advanced',
		options: ['urgent', 'mute'],
		selectAllowEmpty: true,
	},

	// ── METADATA (Read-only) ────────────────────────────────────────────────────
	{
		name: 'created',
		label: 'Created',
		type: 'text',
		section: 'advanced',
		readOnly: true,
	},

	{
		name: 'completed',
		label: 'Completed',
		type: 'text',
		section: 'advanced',
		readOnly: true,
	},

	{
		name: 'status_changed',
		label: 'Status Changed',
		type: 'text',
		section: 'advanced',
		readOnly: true,
	},

	// ── RELATIONSHIP METADATA (Read-only) ───────────────────────────────────────
	{
		name: 'blocks',
		label: 'Unblocks',
		type: 'wikilink',
		section: 'advanced',
		options: {
			type: 'computed',
			compute: () => [], // Computed from depends_on of other tasks
		},
		readOnly: true,
	},
];

/**
 * Get field definitions for a specific section (for modal layout).
 */
export function getFieldsBySection(section: 'basics' | 'scheduling' | 'notes' | 'advanced'): FieldDefinition[] {
	return TASK_FIELD_DEFINITIONS.filter(f => f.section === section);
}

/**
 * Get a single field definition by name.
 */
export function getFieldByName(name: keyof Task): FieldDefinition | undefined {
	return TASK_FIELD_DEFINITIONS.find(f => f.name === name);
}

/**
 * Filter field definitions by visibility rules.
 */
export function getVisibleFields(
	section: 'basics' | 'scheduling' | 'notes' | 'advanced',
	values: Record<string, any>
): FieldDefinition[] {
	return getFieldsBySection(section).filter(f => {
		if (f.visible) {
			return f.visible(values);
		}
		return true;
	});
}

/**
 * Export field definitions array for use in schema module.
 */
export { TASK_FIELD_DEFINITIONS as taskFields };
