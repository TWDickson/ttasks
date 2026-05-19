import { describe, it, expect } from 'vitest';
import { resolveFieldOptions, resolveFieldOptionColors } from './optionResolver';
import type { TaskSettings } from './types';

describe('optionResolver', () => {
	const settings: TaskSettings = {
		statuses: ['Active', 'Done'],
		areas: ['Work', 'Home'],
		labelValues: ['feature', 'bug'],
		statusColors: { Active: '#1f6feb', Done: '#2ea043' },
		areaColors: { Work: '#d29922', Home: '#a371f7' },
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

	it('resolves static option colors by field name', () => {
		expect(resolveFieldOptionColors('priority', settings)).toEqual({
			High: 'var(--color-red)',
			Medium: 'var(--color-orange)',
			Low: 'var(--color-yellow)',
			None: 'var(--color-gray)',
		});
	});

	it('resolves from-settings option colors by field name', () => {
		expect(resolveFieldOptionColors('status', settings)).toEqual(settings.statusColors);
		expect(resolveFieldOptionColors('area', settings)).toEqual(settings.areaColors);
	});

	it('returns empty option colors when a field has no color mapping', () => {
		expect(resolveFieldOptionColors('name', settings)).toEqual({});
	});
});
