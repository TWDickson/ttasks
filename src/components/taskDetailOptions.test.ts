import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../settings/defaults';
import type { TTasksSettings } from '../settings/types';
import { deriveTaskDetailOptionState } from './taskDetailOptions';

function makeSettings(overrides: Partial<TTasksSettings> = {}): TTasksSettings {
	return {
		...DEFAULT_SETTINGS,
		...overrides,
		statuses: overrides.statuses ?? [...DEFAULT_SETTINGS.statuses],
		statusColors: overrides.statusColors ?? { ...DEFAULT_SETTINGS.statusColors },
		areas: overrides.areas ?? [...DEFAULT_SETTINGS.areas],
		areaColors: overrides.areaColors ?? { ...DEFAULT_SETTINGS.areaColors },
		labelValues: overrides.labelValues ?? [...DEFAULT_SETTINGS.labelValues],
		labelColors: overrides.labelColors ?? { ...DEFAULT_SETTINGS.labelColors },
		quickActions: overrides.quickActions ?? { ...DEFAULT_SETTINGS.quickActions },
		reminders: overrides.reminders ?? { ...DEFAULT_SETTINGS.reminders },
		archive: overrides.archive ?? { ...DEFAULT_SETTINGS.archive },
		customViews: overrides.customViews ?? [...DEFAULT_SETTINGS.customViews],
		kanbanCardFields: overrides.kanbanCardFields ?? [...DEFAULT_SETTINGS.kanbanCardFields],
		kanbanCollapsedColumns: overrides.kanbanCollapsedColumns ?? [...DEFAULT_SETTINGS.kanbanCollapsedColumns],
	};
}

describe('deriveTaskDetailOptionState', () => {
	it('adds current values not present in configured status/area/labels', () => {
		const settings = makeSettings({
			statuses: ['Active', 'Done'],
			areas: ['engineering'],
			labelValues: ['feature'],
		});

		const state = deriveTaskDetailOptionState({
			settings,
			status: 'Blocked',
			area: 'operations',
			selectedLabel: 'bug',
		});

		expect(state.statusOptions).toEqual(['Active', 'Done', 'Blocked']);
		expect(state.areaOptions).toEqual(['engineering', 'operations']);
		expect(state.labelOptions).toEqual(['feature', 'bug']);
	});

	it('resolves priority options and color maps from schema/settings', () => {
		const settings = makeSettings({
			statusColors: { Active: '#00aa00' },
		});

		const state = deriveTaskDetailOptionState({
			settings,
			status: null,
			area: null,
			selectedLabel: null,
		});

		expect(state.priorityOptions).toEqual(['None', 'Low', 'Medium', 'High']);
		expect(state.statusOptionColors).toEqual({ Active: '#00aa00' });
		expect(state.priorityOptionColors).toEqual({
			High: 'var(--color-red)',
			Medium: 'var(--color-orange)',
			Low: 'var(--color-yellow)',
			None: 'var(--color-gray)',
		});
	});
});
