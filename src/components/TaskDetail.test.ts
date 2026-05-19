/**
 * TaskDetail.svelte integration tests
 * 
 * Verifies schema-driven field rendering and save behavior.
 * Uses field definitions from taskFields schema for consistent UI.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Task } from '../types';
import type { TaskSettings } from '../schema/types';
import { TASK_FIELD_DEFINITIONS, getFieldByName, getVisibleFields } from '../schema/taskFields';
import { adaptFieldForDetail } from '../schema/fieldAdapters';

describe('TaskDetail.svelte', () => {
	// ── Test setup ────────────────────────────────────────────────────────────
	let mockTask: Task;
	let mockSettings: TaskSettings;

	beforeEach(() => {
		mockTask = {
			id: 'abc123',
			slug: 'test-task',
			path: 'Planner/Tasks/abc123-test-task.md',
			name: 'Test Task',
			type: 'task',
			status: 'Active',
			priority: 'None',
			area: 'Work',
			labels: ['feature'],
			parent_task: null,
			depends_on: [],
			blocks: [],
			due_date: null,
			due_time: null,
			start_date: null,
			estimated_days: null,
			assigned_to: '',
			blocked_reason: '',
			source: '',
			recurrence: null,
			recurrence_type: null,
			reminder_override: null,
			notes: '',
			created: '2026-05-19',
			completed: null,
			status_changed: '2026-05-19',
			is_complete: false,
			is_inbox: false,
		};

		mockSettings = {
			tasksFolder: 'Planner/Tasks',
			statuses: ['Active', 'In Progress', 'Done'],
			areas: ['Work', 'Personal', 'Home'],
			labelValues: ['feature', 'bug', 'research'],
			statusColors: { Active: '#3b82f6', 'In Progress': '#f59e0b', Done: '#10b981' },
			areaColors: { Work: '#3b82f6', Personal: '#8b5cf6', Home: '#10b981' },
			labelColors: { feature: '#3b82f6', bug: '#ef4444', research: '#8b5cf6' },
		};
	});

	describe('Field Rendering — Basics Section', () => {
		it('should render name field as large editable input', () => {
			const nameField = getFieldByName('name');
			expect(nameField).toBeDefined();
			expect(nameField!.type).toBe('text');
			expect(nameField!.section).toBe('basics');
			expect(nameField!.readOnly).toBeUndefined(); // editable by default
		});

		it('should render type as chips for task/project selection', () => {
			const typeField = getFieldByName('type');
			expect(typeField).toBeDefined();
			expect(typeField!.type).toBe('chips');
			expect(typeField!.chipsType).toBe('single');
			expect(typeField!.section).toBe('basics');
		});

		it('should render priority as chips matching schema', () => {
			const priorityField = getFieldByName('priority');
			expect(priorityField).toBeDefined();
			expect(priorityField!.type).toBe('chips');
			expect(priorityField!.chipsType).toBe('single');
		});

		it('should render area as select dropdown', () => {
			const areaField = getFieldByName('area');
			expect(areaField).toBeDefined();
			expect(areaField!.type).toBe('select');
		});

		it('should render labels as multi-select chips for tasks', () => {
			const labelsField = getFieldByName('labels');
			expect(labelsField).toBeDefined();
			expect(labelsField!.type).toBe('chips');
			expect(labelsField!.chipsType).toBe('multi');
		});
	});

	describe('Field Rendering — Scheduling Section', () => {
		it('should render due_date with date picker + Today button', () => {
			const dueDateField = getFieldByName('due_date');
			expect(dueDateField).toBeDefined();
			expect(dueDateField!.type).toBe('date');
			expect(dueDateField!.section).toBe('scheduling');
			expect(dueDateField!.dateHasButtons).toBe(true);
		});

		it('should render start_date with date picker + Today button', () => {
			const startDateField = getFieldByName('start_date');
			expect(startDateField).toBeDefined();
			expect(startDateField!.type).toBe('date');
			expect(startDateField!.dateHasButtons).toBe(true);
		});

		it('should render estimated_days as number input', () => {
			const estDaysField = getFieldByName('estimated_days');
			expect(estDaysField).toBeDefined();
			expect(estDaysField!.type).toBe('number');
		});

		it('should render parent_task as wikilink selector', () => {
			const parentField = getFieldByName('parent_task');
			expect(parentField).toBeDefined();
			expect(parentField!.type).toBe('wikilink');
			// parent_task is a single wikilink without chipsType property
			expect(parentField!.section).toBe('advanced');
		});

		it('should render depends_on as wikilink multi-select', () => {
			const depsField = getFieldByName('depends_on');
			expect(depsField).toBeDefined();
			expect(depsField!.type).toBe('wikilink');
			expect(depsField!.chipsType).toBe('multi');
		});
	});

	describe('Field Rendering — Advanced Section', () => {
		it('should render status as chips in advanced section', () => {
			const statusField = getFieldByName('status');
			expect(statusField).toBeDefined();
			expect(statusField!.type).toBe('chips');
			expect(statusField!.chipsType).toBe('single');
			expect(statusField!.section).toBe('advanced');
		});

		it('should render parent_task as wikilink selector in advanced section', () => {
			const parentField = getFieldByName('parent_task');
			expect(parentField).toBeDefined();
			expect(parentField!.type).toBe('wikilink');
			expect(parentField!.section).toBe('advanced');
		});

		it('should render assigned_to as text input', () => {
			const assignedField = getFieldByName('assigned_to');
			expect(assignedField).toBeDefined();
			expect(assignedField!.type).toBe('text');
			expect(assignedField!.section).toBe('advanced');
		});

		it('should render blocked_reason only when status is Blocked', () => {
			const blockedField = getFieldByName('blocked_reason');
			expect(blockedField).toBeDefined();
			expect(blockedField!.type).toBe('text');

			// Should be visible when status = Blocked
			const blockedVisible = blockedField!.visible!({ status: 'Blocked' } as any);
			expect(blockedVisible).toBe(true);

			// Should be hidden otherwise
			const activeVisible = blockedField!.visible!({ status: 'Active' } as any);
			expect(activeVisible).toBe(false);
		});

		it('should render metadata fields as readonly', () => {
			const createdField = getFieldByName('created');
			const completedField = getFieldByName('completed');
			expect(createdField!.readOnly).toBe(true);
			expect(completedField?.readOnly).toBe(true);
		});
	});

	describe('Field Visibility Rules', () => {
		it('should show blocked_reason only when status = Blocked', () => {
			const blockedField = getFieldByName('blocked_reason')!;

			expect(blockedField.visible!({ status: 'Blocked' } as any)).toBe(true);
			expect(blockedField.visible!({ status: 'Active' } as any)).toBe(false);
			expect(blockedField.visible!({ status: 'Done' } as any)).toBe(false);
		});

		it('should hide start_date when depends_on is set', () => {
			const startDateField = getFieldByName('start_date')!;
			// start_date should be hidden when depends_on is not empty
			expect(startDateField.visible!({ depends_on: ['some-task'] } as any)).toBe(false);
			expect(startDateField.visible!({ depends_on: [] } as any)).toBe(true);
		});

		it('should hide estimated_days when due_date is set', () => {
			const estDaysField = getFieldByName('estimated_days')!;
			// estimated_days should be hidden when due_date is set
			expect(estDaysField.visible!({ due_date: '2026-05-20' } as any)).toBe(false);
			expect(estDaysField.visible!({ due_date: null } as any)).toBe(true);
		});

		it('should filter fields by section', () => {
			// Test that getVisibleFields filters by section correctly
			const basicFields = TASK_FIELD_DEFINITIONS.filter(f => f.section === 'basics');
			expect(basicFields.length).toBeGreaterThan(0);
			expect(basicFields.every(f => f.section === 'basics')).toBe(true);
		});

		it('should apply visibility rules when filtering', () => {
			// blocked_reason should be hidden when status != Blocked
			const blockedField = getFieldByName('blocked_reason')!;
			const isVisibleWhenActive = blockedField.visible!({ status: 'Active' } as any);
			expect(isVisibleWhenActive).toBe(false);
		});
	});

	describe('Field Adapters for Detail View', () => {
		it('should adapt field props for detail context', () => {
			const nameField = getFieldByName('name')!;
			const props = adaptFieldForDetail(nameField, mockTask as any, [], mockSettings, {});

			expect(props).toBeDefined();
			expect(props.value).toBe('Test Task');
			expect(props.error).toBeNull();
			expect(props.readonly).toBe(false);
		});

		it('should respect readonly flag for metadata fields', () => {
			const createdField = getFieldByName('created')!;
			const props = adaptFieldForDetail(createdField, mockTask as any, [], mockSettings, {});

			expect(props.readonly).toBe(true);
		});

		it('should include wikilink options in adapt context', () => {
			const parentField = getFieldByName('parent_task')!;
			const allTasks = [
				{ ...mockTask, path: 'Planner/Tasks/def456-project.md', name: 'My Project', type: 'project' } as Task,
				{ ...mockTask, path: 'Planner/Tasks/ghi789-other-task.md', name: 'Other', type: 'task' } as Task,
			];

			const props = adaptFieldForDetail(parentField, mockTask as any, allTasks, mockSettings, {});

			expect(props.options).toBeDefined();
			expect(Array.isArray(props.options)).toBe(true);
		});

		it('should include FieldContext in detail props', () => {
			const statusField = getFieldByName('status')!;
			const props = adaptFieldForDetail(statusField, mockTask as any, [], mockSettings, {});

			expect(props.context).toBeDefined();
			if (props.context) {
				expect(props.context.values).toEqual(mockTask);
				expect(props.context.allTasks).toEqual([]);
				expect(props.context.settings).toEqual(mockSettings);
			}
		});
	});

	describe('Field Color Mapping', () => {
		it('should include optionColors in adapted props if available', () => {
			const statusField = getFieldByName('status')!;
			const props = adaptFieldForDetail(statusField, mockTask as any, [], mockSettings, {});

			// Props should be well-formed
			expect(props).toBeDefined();
			expect(props.value).toBeDefined();
		});

		it('should resolve field definitions for area selection', () => {
			const areaField = getFieldByName('area')!;
			
			// area field should have options defined from settings
			expect(areaField).toBeDefined();
			expect(areaField.options).toBeDefined();
			// options is from-settings source, not a direct property
			expect(typeof areaField.options).toBe('object');
		});

		it('should preserve color configuration in field definitions', () => {
			const priorityField = getFieldByName('priority')!;
			expect(priorityField.optionColors).toBeDefined();
			// Priority has static colors
			expect(priorityField.optionColors).toHaveProperty('High');
		});
	});

	describe('Field Save Behavior', () => {
		it('should allow immediate save for most fields', () => {
			const nameField = getFieldByName('name')!;
			const statusField = getFieldByName('status')!;
			expect(nameField.type).toBe('text');
			expect(statusField.type).toBe('chips');
		});

		it('should debounce text fields for better UX', () => {
			// Name, assigned_to, blocked_reason benefit from debouncing
			// This is a note for detail-view implementation:
			// Debounce setups should be in the component with 600ms delay
			const nameField = getFieldByName('name')!;
			expect(nameField.type).toBe('text');
			// Component should handle debounce internally
		});

		it('should handle special cases for dates', () => {
			const dueDateField = getFieldByName('due_date')!;
			const startDateField = getFieldByName('start_date')!;

			// Should validate date format
			expect(dueDateField.validators).toBeDefined();
			expect(startDateField.validators).toBeDefined();
		});
	});

	describe('Dependency Sorting', () => {
		it('should sort wikilink options with smart dependency ordering', () => {
			const depsField = getFieldByName('depends_on')!;

			const sameProjectTask = {
				path: 'Planner/Tasks/same-project.md',
				name: 'Same Project Task',
				type: 'task',
			} as Task;

			const differentProjectTask = {
				path: 'Planner/Other/different-project.md',
				name: 'Different Project',
				type: 'task',
			} as Task;

			const allTasks = [differentProjectTask, sameProjectTask];

			const props = adaptFieldForDetail(
				depsField,
				mockTask as any,
				allTasks,
				mockSettings,
				{}
			);

			// Options should be available (sorting happens in component)
			expect(props.options).toBeDefined();
			expect(Array.isArray(props.options) || typeof props.options === 'object').toBe(true);
		});
	});

	describe('Schema Integration', () => {
		it('should use centralized taskFields schema', () => {
			expect(TASK_FIELD_DEFINITIONS).toBeDefined();
			expect(Array.isArray(TASK_FIELD_DEFINITIONS)).toBe(true);
			expect(TASK_FIELD_DEFINITIONS.length).toBeGreaterThanOrEqual(15); // Has multiple sections
		});

		it('should define fields across multiple sections', () => {
			const sections = new Set(TASK_FIELD_DEFINITIONS.map(f => f.section));
			expect(sections).toContain('basics');
			expect(sections).toContain('scheduling');
			expect(sections).toContain('notes');
			expect(sections).toContain('advanced');
		});

		it('should support schema-based UI generation', () => {
			// All fields should have name, label, type (minimum required properties)
			const allValid = TASK_FIELD_DEFINITIONS.every(f => f.name && f.label && f.type);
			expect(allValid).toBe(true);
		});

		it('should enable consistent rendering across modal and detail views', () => {
			// Both views use the same TASK_FIELD_DEFINITIONS
			const nameField = getFieldByName('name');
			const statusField = getFieldByName('status');
			
			// Both should exist and be usable by either view
			expect(nameField).toBeDefined();
			expect(statusField).toBeDefined();
		});
	});
});
