import { describe, expect, it } from 'vitest';
import { buildToolbarFilterConditions, hasActiveToolbarFilters, supportsDateRangeFilter } from './boardFilters';

describe('supportsDateRangeFilter', () => {
	it('is true for list, kanban, and agenda', () => {
		expect(supportsDateRangeFilter('list')).toBe(true);
		expect(supportsDateRangeFilter('kanban')).toBe(true);
		expect(supportsDateRangeFilter('agenda')).toBe(true);
	});

	it('is false for graph and archive', () => {
		expect(supportsDateRangeFilter('graph')).toBe(false);
		expect(supportsDateRangeFilter('archive')).toBe(false);
	});
});

describe('buildToolbarFilterConditions', () => {
	it('returns no conditions when nothing is set', () => {
		expect(buildToolbarFilterConditions({}, 'agenda')).toEqual([]);
	});

	it('adds a priority condition when set', () => {
		expect(buildToolbarFilterConditions({ priority: 'High' }, 'list')).toEqual([
			{ field: 'priority', operator: 'is', value: 'High' },
		]);
	});

	it('adds an area condition when set', () => {
		expect(buildToolbarFilterConditions({ area: 'Work' }, 'list')).toEqual([
			{ field: 'area', operator: 'is', value: 'Work' },
		]);
	});

	it('adds inclusive on_or_after/on_or_before conditions for a date range, on a renderer that supports it', () => {
		expect(buildToolbarFilterConditions({ dateFrom: '2026-07-01', dateTo: '2026-07-31' }, 'agenda')).toEqual([
			{ field: 'due_date', operator: 'on_or_after', value: '2026-07-01' },
			{ field: 'due_date', operator: 'on_or_before', value: '2026-07-31' },
		]);
	});

	it('supports an open-ended range (only from, or only to)', () => {
		expect(buildToolbarFilterConditions({ dateFrom: '2026-07-01' }, 'list')).toEqual([
			{ field: 'due_date', operator: 'on_or_after', value: '2026-07-01' },
		]);
		expect(buildToolbarFilterConditions({ dateTo: '2026-07-31' }, 'kanban')).toEqual([
			{ field: 'due_date', operator: 'on_or_before', value: '2026-07-31' },
		]);
	});

	it('drops the date range on a renderer that does not support it', () => {
		expect(buildToolbarFilterConditions({ dateFrom: '2026-07-01', dateTo: '2026-07-31' }, 'graph')).toEqual([]);
	});

	it('combines priority + area + date range', () => {
		expect(buildToolbarFilterConditions(
			{ priority: 'High', area: 'Work', dateFrom: '2026-07-01', dateTo: '2026-07-31' },
			'kanban',
		)).toEqual([
			{ field: 'priority', operator: 'is', value: 'High' },
			{ field: 'area', operator: 'is', value: 'Work' },
			{ field: 'due_date', operator: 'on_or_after', value: '2026-07-01' },
			{ field: 'due_date', operator: 'on_or_before', value: '2026-07-31' },
		]);
	});
});

describe('hasActiveToolbarFilters', () => {
	it('is false when nothing is set', () => {
		expect(hasActiveToolbarFilters({}, 'agenda', '')).toBe(false);
	});

	it('is true when search text is present', () => {
		expect(hasActiveToolbarFilters({}, 'agenda', 'foo')).toBe(true);
	});

	it('is true when priority or area is set', () => {
		expect(hasActiveToolbarFilters({ priority: 'High' }, 'agenda', '')).toBe(true);
		expect(hasActiveToolbarFilters({ area: 'Work' }, 'agenda', '')).toBe(true);
	});

	it('is true when a date range is set on a renderer that supports it', () => {
		expect(hasActiveToolbarFilters({ dateFrom: '2026-07-01' }, 'list', '')).toBe(true);
	});

	it('is false when a date range is set but the renderer does not support it (stale state, e.g. after switching to Graph)', () => {
		expect(hasActiveToolbarFilters({ dateFrom: '2026-07-01', dateTo: '2026-07-31' }, 'graph', '')).toBe(false);
	});
});
