import { describe, expect, it } from 'vitest';
import type { QuerySpec } from '../query/types';
import { applyBuiltinCompletedVisibility, canToggleBuiltinCompleted } from './builtinViewCompletionToggle';

const BASE_QUERY: QuerySpec = {
	filter: { logic: 'and', conditions: [] },
	sort: [],
	group: { kind: 'none' },
};

describe('canToggleBuiltinCompleted', () => {
	it('allows builtin views except logbook and kanban', () => {
		expect(canToggleBuiltinCompleted({ id: 'list', source: 'builtin' })).toBe(true);
		expect(canToggleBuiltinCompleted({ id: 'kanban', source: 'builtin' })).toBe(false);
		expect(canToggleBuiltinCompleted({ id: 'logbook', source: 'builtin' })).toBe(false);
		expect(canToggleBuiltinCompleted({ id: 'custom-focus', source: 'custom' })).toBe(false);
	});
});

describe('applyBuiltinCompletedVisibility', () => {
	it('adds incomplete-only filtering to builtin views when showCompleted is false', () => {
		const query = applyBuiltinCompletedVisibility(
			{ id: 'graph', source: 'builtin' },
			BASE_QUERY,
			false,
		);

		expect(query.filter.conditions).toEqual([
			{ field: 'is_complete', operator: 'is', value: false },
		]);
	});

	it('removes incomplete-only filtering when showCompleted is true', () => {
		const query = applyBuiltinCompletedVisibility(
			{ id: 'list', source: 'builtin' },
			{
				...BASE_QUERY,
				filter: {
					logic: 'and',
					conditions: [
						{ field: 'is_complete', operator: 'is', value: false },
						{ field: 'status', operator: 'is', value: 'Blocked' },
					],
				},
			},
			true,
		);

		expect(query.filter.conditions).toEqual([
			{ field: 'status', operator: 'is', value: 'Blocked' },
		]);
	});

	it('leaves custom, logbook, and kanban views unchanged', () => {
		const customQuery = applyBuiltinCompletedVisibility(
			{ id: 'custom-focus', source: 'custom' },
			BASE_QUERY,
			false,
		);
		const logbookQuery = applyBuiltinCompletedVisibility(
			{ id: 'logbook', source: 'builtin' },
			{
				...BASE_QUERY,
				filter: { logic: 'and', conditions: [{ field: 'is_complete', operator: 'is', value: true }] },
			},
			false,
		);
		const kanbanQuery = applyBuiltinCompletedVisibility(
			{ id: 'kanban', source: 'builtin' },
			BASE_QUERY,
			false,
		);

		expect(customQuery).toEqual(BASE_QUERY);
		expect(logbookQuery.filter.conditions).toEqual([
			{ field: 'is_complete', operator: 'is', value: true },
		]);
		expect(kanbanQuery).toEqual(BASE_QUERY);
	});
});
