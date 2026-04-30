import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../settings';
import { getRegisteredTaskViews } from '../views/viewRegistry';
import { buildBoardQuery } from '../components/boardQuery';
import { canShowInlineReopen } from '../components/taskRowActions';

describe('board view behavior integration', () => {
	it('applies completed visibility immediately for active list view', () => {
		const views = getRegisteredTaskViews(DEFAULT_SETTINGS);
		const active = views.find((view) => view.id === 'list');
		expect(active).toBeDefined();
		if (!active) return;

		const hidden = buildBoardQuery(active, active.renderer, false);
		const visible = buildBoardQuery(active, active.renderer, true);

		expect(hidden.filter.conditions).toEqual([
			{ field: 'is_complete', operator: 'is', value: false },
		]);
		expect(visible.filter.conditions).toEqual([]);
	});

	it('keeps logbook completed filter regardless of showCompleted toggle', () => {
		const views = getRegisteredTaskViews(DEFAULT_SETTINGS);
		const logbook = views.find((view) => view.id === 'logbook');
		expect(logbook).toBeDefined();
		if (!logbook) return;

		const hidden = buildBoardQuery(logbook, logbook.renderer, false);
		const visible = buildBoardQuery(logbook, logbook.renderer, true);

		expect(hidden.filter.conditions).toEqual([
			{ field: 'is_complete', operator: 'is', value: true },
		]);
		expect(visible.filter.conditions).toEqual([
			{ field: 'is_complete', operator: 'is', value: true },
		]);
	});

	it('shows inline reopen only for completed tasks in logbook', () => {
		expect(canShowInlineReopen('logbook', { is_complete: true })).toBe(true);
		expect(canShowInlineReopen('list', { is_complete: true })).toBe(false);
		expect(canShowInlineReopen('logbook', { is_complete: false })).toBe(false);
	});
});
