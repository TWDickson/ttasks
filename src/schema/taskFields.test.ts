import { describe, it, expect } from 'vitest';
import { TASK_FIELD_DEFINITIONS } from './taskFields';

describe('Task Field Schema', () => {
	describe('Schema integrity', () => {
		it('should have field definitions for all core task properties', () => {
			const coreFields = [
				'name', 'type', 'status', 'priority', 'area', 'labels',
				'start_date', 'due_date', 'estimated_days',
				'parent_task', 'depends_on', 'blocks',
				'assigned_to', 'blocked_reason',
				'recurrence', 'recurrence_type', 'reminder_override',
				'notes', 'created', 'completed', 'status_changed'
			];

			for (const field of coreFields) {
				const def = TASK_FIELD_DEFINITIONS.find(f => f.name === field);
				expect(def, `Missing field definition for ${field}`).toBeDefined();
			}
		});

		it('should not have duplicate field names', () => {
			const names = TASK_FIELD_DEFINITIONS.map(f => f.name);
			const unique = new Set(names);
			expect(names.length).toBe(unique.size);
		});

		it('each field should have a label', () => {
			for (const field of TASK_FIELD_DEFINITIONS) {
				expect(field.label).toBeTruthy();
				expect(field.label.length).toBeGreaterThan(0);
			}
		});

		it('each field should have a type', () => {
			const validTypes = [
				'text', 'textarea', 'number', 'date', 'select', 'chips',
				'wikilink', 'date-range', 'toggle'
			];
			for (const field of TASK_FIELD_DEFINITIONS) {
				expect(validTypes).toContain(field.type);
			}
		});

		it('fields with select/chips should have options', () => {
			const fieldsNeedingOptions = TASK_FIELD_DEFINITIONS.filter(
				f => ['select', 'chips', 'wikilink'].includes(f.type)
			);
			for (const field of fieldsNeedingOptions) {
				expect(field.options, `${field.name} needs options`).toBeDefined();
			}
		});
	});

	describe('Visibility rules', () => {
		it('blocked_reason should only be visible when status is Blocked', () => {
			const field = TASK_FIELD_DEFINITIONS.find(f => f.name === 'blocked_reason');
			expect(field).toBeDefined();
			expect(field?.visible).toBeDefined();

			const visibleWhenBlocked = field!.visible!({ status: 'Blocked' });
			const visibleWhenActive = field!.visible!({ status: 'Active' });

			expect(visibleWhenBlocked).toBe(true);
			expect(visibleWhenActive).toBe(false);
		});

		it('blocked_reason should be visible when configured block status is active', () => {
			const field = TASK_FIELD_DEFINITIONS.find(f => f.name === 'blocked_reason');
			expect(field).toBeDefined();
			expect(field?.visible).toBeDefined();

			const visibleWhenCustomBlocked = field!.visible!({ status: 'On Hold', blockStatus: 'On Hold' });
			const visibleWhenCustomActive = field!.visible!({ status: 'Active', blockStatus: 'On Hold' });

			expect(visibleWhenCustomBlocked).toBe(true);
			expect(visibleWhenCustomActive).toBe(false);
		});

		it('estimated_days should not be visible if due_date is set', () => {
			const field = TASK_FIELD_DEFINITIONS.find(f => f.name === 'estimated_days');
			expect(field?.visible).toBeDefined();

			const visibleWithoutDue = field!.visible!({ due_date: '' });
			const visibleWithDue = field!.visible!({ due_date: '2026-05-20' });

			expect(visibleWithoutDue).toBe(true);
			expect(visibleWithDue).toBe(false);
		});

		it('start_date should not be visible if depends_on has items', () => {
			const field = TASK_FIELD_DEFINITIONS.find(f => f.name === 'start_date');
			expect(field?.visible).toBeDefined();

			const visibleWithoutDeps = field!.visible!({ depends_on: [] });
			const visibleWithDeps = field!.visible!({ depends_on: ['some/path'] });

			expect(visibleWithoutDeps).toBe(true);
			expect(visibleWithDeps).toBe(false);
		});

		it('recurrence_type should only be visible when recurrence is set', () => {
			const field = TASK_FIELD_DEFINITIONS.find(f => f.name === 'recurrence_type');
			expect(field?.visible).toBeDefined();

			expect(field!.visible!({ recurrence: 'weekly' })).toBe(true);
			expect(field!.visible!({ recurrence: null })).toBe(false);
			expect(field!.visible!({ recurrence: '' })).toBe(false);
		});
	});

	describe('Validation rules', () => {
		it('name field should have required validator', () => {
			const field = TASK_FIELD_DEFINITIONS.find(f => f.name === 'name');
			expect(field?.required).toBe(true);
		});

		it('date fields should validate date format', () => {
			const field = TASK_FIELD_DEFINITIONS.find(f => f.name === 'due_date');
			const validators = field?.validators || [];
			const dateValidator = validators.find(v => v.name === 'date-format');
			expect(dateValidator).toBeDefined();

			// Valid date
			const validResult = dateValidator!.validate('2026-05-20', {});
			expect(validResult).toBeNull();

			// Invalid date
			const invalidResult = dateValidator!.validate('not-a-date', {});
			expect(invalidResult).toBeTruthy();
		});

		it('estimated_days should validate as non-negative number', () => {
			const field = TASK_FIELD_DEFINITIONS.find(f => f.name === 'estimated_days');
			const validators = field?.validators || [];
			const numberValidator = validators.find(v => v.name === 'non-negative-number');
			expect(numberValidator).toBeDefined();

			const validResult = numberValidator!.validate(5, {});
			expect(validResult).toBeNull();

			const invalidResult = numberValidator!.validate(-1, {});
			expect(invalidResult).toBeTruthy();
		});
	});

	describe('Options', () => {
		it('status field should have options from settings', () => {
			const field = TASK_FIELD_DEFINITIONS.find(f => f.name === 'status');
			expect(field?.options).toBeDefined();
			if (typeof field?.options === 'object' && 'type' in field.options && field.options.type === 'from-settings') {
				expect(field.options.settingsKey).toBe('statuses');
			}
		});

		it('area field should have options from settings', () => {
			const field = TASK_FIELD_DEFINITIONS.find(f => f.name === 'area');
			expect(field?.options).toBeDefined();
			if (typeof field?.options === 'object' && 'type' in field.options && field.options.type === 'from-settings') {
				expect(field.options.settingsKey).toBe('areas');
			}
		});

		it('labels field should have options from settings', () => {
			const field = TASK_FIELD_DEFINITIONS.find(f => f.name === 'labels');
			expect(field?.options).toBeDefined();
			if (typeof field?.options === 'object' && 'type' in field.options && field.options.type === 'from-settings') {
				expect(field.options.settingsKey).toBe('labelValues');
			}
		});

		it('priority field should have static options', () => {
			const field = TASK_FIELD_DEFINITIONS.find(f => f.name === 'priority');
			expect(field?.options).toBeDefined();
			expect(Array.isArray(field?.options)).toBe(true);
			expect(field?.options).toContain('None');
			expect(field?.options).toContain('High');
		});

		it('type field should have task and project options', () => {
			const field = TASK_FIELD_DEFINITIONS.find(f => f.name === 'type');
			expect(field?.options).toBeDefined();
			expect(Array.isArray(field?.options)).toBe(true);
			expect(field?.options).toContain('task');
			expect(field?.options).toContain('project');
		});

		it('recurrence fields should have static options', () => {
			const recurrenceField = TASK_FIELD_DEFINITIONS.find(f => f.name === 'recurrence');
			const recurrenceTypeField = TASK_FIELD_DEFINITIONS.find(f => f.name === 'recurrence_type');

			expect(Array.isArray(recurrenceField?.options)).toBe(true);
			expect(recurrenceField?.options).toContain('weekly');
			expect(Array.isArray(recurrenceTypeField?.options)).toBe(true);
			expect(recurrenceTypeField?.options).toContain('fixed');
		});

		it('reminder_override should have static options with empty support', () => {
			const reminderField = TASK_FIELD_DEFINITIONS.find(f => f.name === 'reminder_override');
			expect(Array.isArray(reminderField?.options)).toBe(true);
			expect(reminderField?.options).toContain('urgent');
			expect(reminderField?.options).toContain('mute');
			expect(reminderField?.selectAllowEmpty).toBe(true);
		});
	});

	describe('Sections', () => {
		it('basics section should include name, type, priority', () => {
			const basics = TASK_FIELD_DEFINITIONS.filter(f => f.section === 'basics');
			const names = basics.map(f => f.name);
			expect(names).toContain('name');
			expect(names).toContain('type');
			expect(names).toContain('priority');
		});

		it('scheduling section should include dates and dependencies', () => {
			const scheduling = TASK_FIELD_DEFINITIONS.filter(f => f.section === 'scheduling');
			const names = scheduling.map(f => f.name);
			expect(names).toContain('start_date');
			expect(names).toContain('due_date');
			expect(names).toContain('estimated_days');
			expect(names).toContain('depends_on');
		});

		it('advanced section should include status, area, recurrence', () => {
			const advanced = TASK_FIELD_DEFINITIONS.filter(f => f.section === 'advanced');
			const names = advanced.map(f => f.name);
			expect(names).toContain('status');
			expect(names).toContain('area');
			expect(names).toContain('parent_task');
		});

		it('notes section should include notes', () => {
			const notes = TASK_FIELD_DEFINITIONS.filter(f => f.section === 'notes');
			const names = notes.map(f => f.name);
			expect(names).toContain('notes');
		});
	});

	describe('Read-only fields', () => {
		it('created, completed, status_changed should be read-only', () => {
			const readOnlyFields = ['created', 'completed', 'status_changed'];
			for (const fieldName of readOnlyFields) {
				const field = TASK_FIELD_DEFINITIONS.find(f => f.name === fieldName);
				expect(field?.readOnly).toBe(true);
			}
		});
	});

	describe('Color support', () => {
		it('status field should have color mapping', () => {
			const field = TASK_FIELD_DEFINITIONS.find(f => f.name === 'status');
			expect(field?.optionColors).toBeDefined();
		});

		it('area field should have color mapping', () => {
			const field = TASK_FIELD_DEFINITIONS.find(f => f.name === 'area');
			expect(field?.optionColors).toBeDefined();
		});

		it('labels field should have color mapping', () => {
			const field = TASK_FIELD_DEFINITIONS.find(f => f.name === 'labels');
			expect(field?.optionColors).toBeDefined();
		});
	});
});
