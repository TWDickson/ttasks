import { describe, expect, it } from 'vitest';
import type { TaskSettings } from '../schema/types';
import { taskFields } from '../schema/taskFields';
import { getFieldOptions, getOptionColor } from './modalFieldHelpers';

const settings: TaskSettings = {
	tasksFolder: 'Planner/Tasks',
	statuses: ['Active', 'Blocked', 'Done'],
	areas: ['Work', 'Home'],
	labelValues: ['feature', 'bug'],
	statusColors: {
		Active: '#3b82f6',
		Blocked: '#ef4444',
		Done: '#10b981',
	},
	areaColors: {
		Work: '#3b82f6',
		Home: '#10b981',
	},
	labelColors: {
		feature: '#3b82f6',
		bug: '#ef4444',
	},
};

describe('modalFieldHelpers', () => {
	it('resolves from-settings options for status field', () => {
		const statusField = taskFields.find((field) => field.name === 'status');
		expect(statusField).toBeDefined();
		if (!statusField) return;

		expect(getFieldOptions(statusField, settings)).toEqual(['Active', 'Blocked', 'Done']);
	});

	it('resolves static options for priority field', () => {
		const priorityField = taskFields.find((field) => field.name === 'priority');
		expect(priorityField).toBeDefined();
		if (!priorityField) return;

		expect(getFieldOptions(priorityField, settings)).toEqual(['None', 'Low', 'Medium', 'High']);
	});

	it('resolves option colors from settings-driven color maps', () => {
		const statusField = taskFields.find((field) => field.name === 'status');
		expect(statusField).toBeDefined();
		if (!statusField) return;

		expect(getOptionColor('Done', statusField, settings)).toBe('#10b981');
		expect(getOptionColor('Blocked', statusField, settings)).toBe('#ef4444');
		expect(getOptionColor('Unknown', statusField, settings)).toBeNull();
	});
});
