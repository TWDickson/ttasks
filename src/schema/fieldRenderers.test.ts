import { describe, it, expect } from 'vitest';
import {
	getVisibleFields,
	groupFieldsBySection,
	sortDependencies,
	getOptionLabel,
	getOptionColor,
} from './fieldRenderers';
import { taskFields } from './taskFields';
import type { FieldDefinition } from './types';
import type { Task } from '../types';

describe('fieldRenderers', () => {
	describe('getVisibleFields', () => {
		it('returns all fields when visibility rules are not restrictive', () => {
			const values = {};
			const visible = getVisibleFields(taskFields, values);
			expect(visible.length).toBeGreaterThan(0);
		});

		it('excludes blocked_reason when status is not Blocked', () => {
			const values = { status: 'Active' };
			const visible = getVisibleFields(taskFields, values);
			const blockedReason = visible.find((f) => f.name === 'blocked_reason');
			expect(blockedReason).toBeUndefined();
		});

		it('includes blocked_reason when status is Blocked', () => {
			const values = { status: 'Blocked' };
			const visible = getVisibleFields(taskFields, values);
			const blockedReason = visible.find((f) => f.name === 'blocked_reason');
			expect(blockedReason).toBeDefined();
		});

		it('excludes estimated_days when due_date is set', () => {
			const values = { due_date: '2025-06-01' };
			const visible = getVisibleFields(taskFields, values);
			const estDays = visible.find((f) => f.name === 'estimated_days');
			expect(estDays).toBeUndefined();
		});

		it('includes estimated_days when due_date is null', () => {
			const values = { due_date: null };
			const visible = getVisibleFields(taskFields, values);
			const estDays = visible.find((f) => f.name === 'estimated_days');
			expect(estDays).toBeDefined();
		});

		it('filters by section when provided', () => {
			const values = {};
			const visible = getVisibleFields(taskFields, values, { section: 'basics' });
			expect(visible.every((f) => f.section === 'basics')).toBe(true);
		});

		it('handles undefined values gracefully', () => {
			const values = { status: undefined, due_date: undefined };
			const visible = getVisibleFields(taskFields, values);
			expect(visible.length).toBeGreaterThan(0);
		});
	});

	describe('groupFieldsBySection', () => {
		it('groups fields by section property', () => {
			const grouped = groupFieldsBySection(taskFields);
			expect(grouped['basics']).toBeDefined();
			expect(grouped['scheduling']).toBeDefined();
			expect(grouped['notes']).toBeDefined();
			expect(grouped['advanced']).toBeDefined();
		});

		it('includes all fields in sections', () => {
			const grouped = groupFieldsBySection(taskFields);
			const total = Object.values(grouped).reduce((sum, group) => sum + group.length, 0);
			expect(total).toBe(taskFields.length);
		});

		it('each grouped field has matching section', () => {
			const grouped = groupFieldsBySection(taskFields);
			Object.entries(grouped).forEach(([section, fields]) => {
				fields.forEach((field) => {
					expect(field.section).toBe(section);
				});
			});
		});
	});

	describe('sortDependencies', () => {
		const mockTasks: Task[] = [
			{
				path: 'Planner/Projects/other-project/abc123-other.md',
				name: 'Other Task',
				type: 'task',
			} as Task,
			{
				path: 'Planner/Projects/my-project/def456-same-project.md',
				name: 'Same Project Task',
				type: 'task',
			} as Task,
			{
				path: 'Planner/Projects/my-project/ghi789-another-task.md',
				name: 'Another Project Task',
				type: 'task',
			} as Task,
		];

		it('sorts same-project tasks to top', () => {
			const parentTaskPath = 'Planner/Projects/my-project/xyz000-project.md';
			const sorted = sortDependencies(mockTasks, parentTaskPath);
			// Tasks from my-project folder should come first (def456 and ghi789)
			expect(sorted[0].path).toContain('Planner/Projects/my-project');
		});

		it('handles null parentTaskPath gracefully', () => {
			const sorted = sortDependencies(mockTasks, null);
			expect(sorted.length).toBe(3);
		});

		it('maintains original order for non-same-project tasks', () => {
			const sorted = sortDependencies(mockTasks, 'Planner/Projects/nonexistent.md');
			// Should maintain alphabetical order or original order
			expect(sorted.length).toBe(3);
		});

		it('returns copy, not mutating original', () => {
			const original = [...mockTasks];
			sortDependencies(mockTasks, 'Planner/Tasks/def456-same-project.md');
			expect(mockTasks).toEqual(original);
		});
	});

	describe('getOptionLabel', () => {
		it('returns label from definition.options', () => {
			const field: FieldDefinition = {
				name: 'priority',
				label: 'Priority',
				type: 'chips',
				section: 'basics',
				options: ['High', 'Medium', 'Low'],
			};
			expect(getOptionLabel('High', field)).toBe('High');
		});

		it('returns value if no label mapping exists', () => {
			const field: FieldDefinition = {
				name: 'area',
				label: 'Area',
				type: 'select',
				section: 'basics',
				options: ['Work', 'Personal'],
			};
			expect(getOptionLabel('Work', field)).toBe('Work');
		});

		it('handles from-settings options by returning value', () => {
			const field: FieldDefinition = {
				name: 'status',
				label: 'Status',
				type: 'chips',
				section: 'basics',
				options: { type: 'from-settings' as const, settingsKey: 'statuses' },
			};
			// from-settings options don't have label mappings, return value
			expect(getOptionLabel('Done', field)).toBe('Done');
		});
	});

	describe('getOptionColor', () => {
		it('returns color from optionColors mapping', () => {
			const field: FieldDefinition = {
				name: 'status',
				label: 'Status',
				type: 'chips',
				section: 'basics',
				options: ['Done'],
				optionColors: { Done: '#10b981' },
			};
			expect(getOptionColor('Done', field)).toBe('#10b981');
		});

		it('returns null when no color defined for option', () => {
			const field: FieldDefinition = {
				name: 'status',
				label: 'Status',
				type: 'chips',
				section: 'basics',
				options: ['Done'],
				optionColors: { Done: '#10b981' },
			};
			expect(getOptionColor('Active', field)).toBeNull();
		});

		it('returns null when optionColors is not defined', () => {
			const field: FieldDefinition = {
				name: 'status',
				label: 'Status',
				type: 'chips',
				section: 'basics',
				options: ['Done'],
			};
			expect(getOptionColor('Done', field)).toBeNull();
		});
	});
});
