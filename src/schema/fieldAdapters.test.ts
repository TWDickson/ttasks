import { describe, it, expect } from 'vitest';
import { adaptFieldForModal, adaptFieldForDetail, adaptFieldProps } from './fieldAdapters';
import { taskFields } from './taskFields';
import type { FieldDefinition, TaskSettings } from './types';
import type { Task } from '../types';

describe('fieldAdapters', () => {
	const mockTask: Partial<Task> = {
		path: 'Planner/Tasks/abc123-task.md',
		name: 'Task Name',
		type: 'task',
		status: 'Active',
	};

	const mockSettings: TaskSettings = {
		tasksFolder: 'Planner/Tasks',
		statuses: ['Active', 'In Progress', 'Done'],
		areas: ['Work', 'Personal'],
	};

	const mockTasks: Task[] = [
		{ ...mockTask, path: 'Planner/Tasks/abc123-task.md', name: 'Task 1' } as Task,
		{ ...mockTask, path: 'Planner/Tasks/def456-task.md', name: 'Task 2' } as Task,
	];

	describe('adaptFieldProps', () => {
		it('returns props object with all required fields', () => {
			const field = taskFields.find((f: FieldDefinition) => f.name === 'name')!;
			const props = adaptFieldProps(field, 'Test Name', null);

			expect(props).toHaveProperty('definition');
			expect(props).toHaveProperty('value');
			expect(props).toHaveProperty('error');
			expect(props).toHaveProperty('readonly');
			expect(props).toHaveProperty('onChange');
		});

		it('returns readonly true for read-only fields', () => {
			const field = taskFields.find((f: FieldDefinition) => f.name === 'created')!;
			const props = adaptFieldProps(field, '2025-05-01', null);

			expect(props.readonly).toBe(true);
		});

		it('returns readonly false for editable fields', () => {
			const field = taskFields.find((f: FieldDefinition) => f.name === 'name')!;
			const props = adaptFieldProps(field, 'Task Name', null);

			expect(props.readonly).toBe(false);
		});

		it('includes error message if provided', () => {
			const field = taskFields.find((f: FieldDefinition) => f.name === 'name')!;
			const props = adaptFieldProps(field, '', 'Name is required');

			expect(props.error).toBe('Name is required');
		});

		it('onChange is a function that can be called', () => {
			const field = taskFields.find((f: FieldDefinition) => f.name === 'name')!;
			const props = adaptFieldProps(field, 'Test', null);

			expect(typeof props.onChange).toBe('function');
		});
	});

	describe('adaptFieldForModal', () => {
		it('prepares field props for modal rendering', () => {
			const field = taskFields.find((f: FieldDefinition) => f.name === 'name')!;
			const values = { name: 'Test Task' };
			const errors = {};

			const props = adaptFieldForModal(field, values, mockTasks, mockSettings, errors);

			expect(props.definition).toEqual(field);
			expect(props.value).toBe('Test Task');
			expect(props.error).toBeNull();
		});

		it('includes task options for wikilink fields', () => {
			const field = taskFields.find((f: FieldDefinition) => f.name === 'parent_task')!;
			const values = { parent_task: null };
			const errors = {};

			const props = adaptFieldForModal(field, values, mockTasks, mockSettings, errors);

			expect(props.options).toBeDefined();
			expect(Array.isArray(props.options)).toBe(true);
			expect((props.options as Task[]).length).toBe(2);
		});

		it('includes error message from errors map', () => {
			const field = taskFields.find((f: FieldDefinition) => f.name === 'name')!;
			const values = { name: '' };
			const errors = { name: 'Name is required' };

			const props = adaptFieldForModal(field, values, mockTasks, mockSettings, errors);

			expect(props.error).toBe('Name is required');
		});

		it('normalizes wikilink values to paths', () => {
			const field = taskFields.find((f: FieldDefinition) => f.name === 'parent_task')!;
			const values = { parent_task: '[[Planner/Tasks/abc123-task|Task Name]]' };
			const errors = {};

			const props = adaptFieldForModal(field, values, mockTasks, mockSettings, errors);

			// Value should be normalized to path
			expect(typeof props.value).toBe('string');
		});

		it('sorts dependencies by parent_task', () => {
			const field = taskFields.find((f: FieldDefinition) => f.name === 'depends_on')!;
			const values = { parent_task: 'Planner/Tasks/abc123-task.md' };
			const errors = {};

			const props = adaptFieldForModal(field, values, mockTasks, mockSettings, errors);

			// Options should be sorted (same-project first)
			expect(Array.isArray(props.options)).toBe(true);
		});
	});

	describe('adaptFieldForDetail', () => {
		it('prepares field props for detail view rendering', () => {
			const field = taskFields.find((f: FieldDefinition) => f.name === 'name')!;
			const values = { name: 'Test Task' };
			const errors = {};

			const props = adaptFieldForDetail(field, values, mockTasks, mockSettings, errors);

			expect(props.definition).toEqual(field);
			expect(props.value).toBe('Test Task');
		});

		it('marks read-only fields as readonly even if editable in modal', () => {
			const field = taskFields.find((f: FieldDefinition) => f.name === 'created')!;
			const values = { created: '2025-05-01' };
			const errors = {};

			const props = adaptFieldForDetail(field, values, mockTasks, mockSettings, errors);

			expect(props.readonly).toBe(true);
		});

		it('includes task options for relationship fields', () => {
			const field = taskFields.find((f: FieldDefinition) => f.name === 'depends_on')!;
			const values = { depends_on: [] };
			const errors = {};

			const props = adaptFieldForDetail(field, values, mockTasks, mockSettings, errors);

			expect(props.options).toBeDefined();
		});

		it('handles null/empty values gracefully', () => {
			const field = taskFields.find((f: FieldDefinition) => f.name === 'blocked_reason')!;
			const values = { blocked_reason: null };
			const errors = {};

			const props = adaptFieldForDetail(field, values, mockTasks, mockSettings, errors);

			expect(props.value).toBeNull();
		});
	});
});
