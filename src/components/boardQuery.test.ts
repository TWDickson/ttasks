import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../settings';
import { getRegisteredTaskViews } from '../views/viewRegistry';
import { buildBoardQuery } from './boardQuery';

describe('buildBoardQuery', () => {
	it('reacts to showCompleted state for builtin list views', () => {
		const views = getRegisteredTaskViews(DEFAULT_SETTINGS);
		const active = views.find((view) => view.id === 'list');
		expect(active).toBeDefined();
		if (!active) return;

		const hiddenCompleted = buildBoardQuery(active, active.renderer, false);
		const visibleCompleted = buildBoardQuery(active, active.renderer, true);

		expect(hiddenCompleted.filter.conditions).toEqual([
			{ field: 'is_complete', operator: 'is', value: false },
		]);
		expect(visibleCompleted.filter.conditions).toEqual([]);
	});
});
