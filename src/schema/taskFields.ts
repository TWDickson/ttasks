import type { FieldDefinition } from './types';
import type { Task } from '../types';
import { isBlockedStatus } from './fieldVisibility';
import { parseIsoDate } from '../utils/dateUtils';
import { PRIORITIES } from '../constants';
import { REPEAT_PRESETS } from '../repeat/presets';

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
		if (!parseIsoDate(value)) {
			return 'Invalid date';
		}
		return null;
	},
	timeFormat: (value: string): string | null => {
		if (!value) return null;
		return /^([01]\d|2[0-3]):[0-5]\d$/.test(value) ? null : 'Invalid time (use HH:MM)';
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
 * The create-modal and detail-pane definition of every task property, keyed by
 * field — `null` for a field with no form control (AR-3). Typed against
 * `Record<keyof Task, …>`, so adding a field to `Task` fails the type-check
 * until it is decided here, as `TASK_PERSISTENCE` and `TASK_JSON_CONTRACT` do
 * for frontmatter and Share/Sync.
 *
 * Each definition declares:
 * - What the field is (label, type)
 * - How to render it (options, colors, buttons)
 * - When to show it (visibility rules)
 * - How to validate it (validators)
 *
 * Entry order is render order within a section.
 */
const TASK_FIELD_UI = {
	// ── BASICS ──────────────────────────────────────────────────────────────────
	name: {
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

	type: {
		label: 'Type',
		type: 'chips',
		section: 'basics',
		options: ['task', 'project'],
		chipsType: 'single',
	},

	priority: {
		label: 'Priority',
		type: 'chips',
		section: 'basics',
		// Displayed low→high (reverse of the canonical highest-first PRIORITIES).
		options: [...PRIORITIES].reverse(),
		optionColors: {
			'High': 'var(--color-red)',
			'Medium': 'var(--color-orange)',
			'Low': 'var(--color-yellow)',
			'None': 'var(--color-gray)',
		},
		chipsType: 'single',
	},

	// ── SCHEDULING ──────────────────────────────────────────────────────────────
	start_date: {
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

	due_date: {
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

	due_time: {
		label: 'Due Time',
		type: 'time',
		section: 'scheduling',
		// A time of day only means something on a dated task.
		visible: (values) => !!values.due_date,
		validators: [
			{
				name: 'time-format',
				validate: VALIDATORS.timeFormat,
			},
		],
	},

	estimated_days: {
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

	depends_on: {
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
	notes: {
		label: 'Notes',
		type: 'textarea',
		section: 'notes',
		rows: 5,
		placeholder: 'Add notes…',
		width: 'full',
	},

	// ── ADVANCED ────────────────────────────────────────────────────────────────
	status: {
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

	area: {
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

	labels: {
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

	parent_task: {
		label: 'Parent Project',
		type: 'wikilink',
		section: 'advanced',
		options: {
			type: 'computed',
			compute: () => [], // Computed from allTasks (type='project') by component
		},
		selectAllowEmpty: true,
	},

	assigned_to: {
		label: 'Assigned To',
		type: 'text',
		section: 'advanced',
		placeholder: 'Name or user…',
	},

	blocked_reason: {
		label: 'Blocked Reason',
		type: 'text',
		section: 'advanced',
		placeholder: 'Why is this task blocked?',
		visible: (values) => isBlockedStatus(values.status, values.blockStatus),
	},

	source: {
		label: 'Source',
		type: 'text',
		section: 'advanced',
		placeholder: 'Where did this task come from?',
	},

	// ── RECURRENCE + REMINDERS (Advanced) ───────────────────────────────────────
	repeat: {
		// The preset menu over `repeat` (a RepeatRule). The schedule/after-completion
		// switch beside it is not a field of its own — it's part of the rule.
		label: 'Repeats',
		type: 'select',
		section: 'advanced',
		options: [...REPEAT_PRESETS],
		selectAllowEmpty: true,
	},

	reminder_override: {
		label: 'Reminders',
		type: 'select',
		section: 'advanced',
		options: ['urgent', 'mute'],
		selectAllowEmpty: true,
	},

	// ── METADATA (Read-only) ────────────────────────────────────────────────────
	created: {
		label: 'Created',
		type: 'text',
		section: 'advanced',
		readOnly: true,
	},

	completed: {
		label: 'Completed',
		type: 'text',
		section: 'advanced',
		readOnly: true,
	},

	status_changed: {
		label: 'Status Changed',
		type: 'text',
		section: 'advanced',
		readOnly: true,
	},

	// ── RELATIONSHIP METADATA (Read-only) ───────────────────────────────────────
	blocks: {
		label: 'Unblocks',
		type: 'wikilink',
		section: 'advanced',
		options: {
			type: 'computed',
			compute: () => [], // Computed from depends_on of other tasks
		},
		readOnly: true,
	},

	// ── NO FORM CONTROL ─────────────────────────────────────────────────────────
	// File identity and derived state.
	id: null,
	slug: null,
	path: null,
	is_complete: null,
	is_inbox: null,
	repeat_warning: null,
	// Project scheduling controls, edited in the project's own detail panel.
	workweek_only: null,
	holiday_dates: null,
	// Written by the Pomodoro and repeat engines, never typed in.
	pomodoro_count: null,
	focused_minutes: null,
	repeat_of: null,
} satisfies Record<keyof Task, Omit<FieldDefinition, 'name'> | null>;

/** The defined fields as a list, in render order. Used by CreateTaskModal and TaskDetail. */
export const TASK_FIELD_DEFINITIONS: FieldDefinition[] = (
	Object.entries(TASK_FIELD_UI) as [keyof Task, Omit<FieldDefinition, 'name'> | null][]
).flatMap(([name, def]) => (def ? [{ name, ...def }] : []));

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
