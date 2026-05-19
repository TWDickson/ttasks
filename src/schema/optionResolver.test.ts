import { describe, it, expect } from 'vitest';
import { resolveFieldOptions } from './optionResolver';
import type { TaskSettings } from './types';

describe('optionResolver', () => {
	const settings: TaskSettings = {
		statuses: ['Active', 'Done'],
		areas: ['Work', 'Home'],
		labelValues: ['feature', 'bug'],
	};

	it('resolves static options by field name', () => {
		expect(resolveFieldOptions('priority', settings)).toEqual(['None', 'Low', 'Medium', 'High']);
	});

	it('resolves from-settings options by field name', () => {
		expect(resolveFieldOptions('status', settings)).toEqual(['Active', 'Done']);
		expect(resolveFieldOptions('area', settings)).toEqual(['Work', 'Home']);
		expect(resolveFieldOptions('labels', settings)).toEqual(['feature', 'bug']);
	});

	it('returns empty array for unknown field names', () => {
		expect(resolveFieldOptions('does_not_exist' as any, settings)).toEqual([]);
	});

	it('returns empty array for fields without options', () => {
		expect(resolveFieldOptions('name', settings)).toEqual([]);
	});
});
