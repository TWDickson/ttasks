import { describe, expect, it } from 'vitest';
import {
	DEFAULT_SETTINGS,
	DEFAULT_STATUSES,
	DEFAULT_REMINDERS_SETTINGS,
	THEME_SWATCHES,
	getDefaultThemeColor,
	normalizeColorMap,
	normalizeEditorSuggestTrigger,
	resolveEmergencyStatus,
	normalizeSettingsFromSources,
} from './defaults';

describe('defaults.ts direct imports', () => {
	it('exports DEFAULT_SETTINGS with expected shape', () => {
		expect(DEFAULT_SETTINGS.tasksFolder).toBe('Tasks');
		expect(Array.isArray(DEFAULT_SETTINGS.statuses)).toBe(true);
		expect(DEFAULT_SETTINGS.completionStatus).toBe('Completed');
	});

	it('exports DEFAULT_STATUSES as string array', () => {
		expect(Array.isArray(DEFAULT_STATUSES)).toBe(true);
		expect(DEFAULT_STATUSES).toContain('Active');
		expect(DEFAULT_STATUSES).toContain('Completed');
	});

	it('exports DEFAULT_REMINDERS_SETTINGS with expected shape', () => {
		expect(typeof DEFAULT_REMINDERS_SETTINGS.enabled).toBe('boolean');
		expect(typeof DEFAULT_REMINDERS_SETTINGS.staleThresholdDays).toBe('number');
	});
});

describe('THEME_SWATCHES and getDefaultThemeColor', () => {
	it('exports THEME_SWATCHES as non-empty array', () => {
		expect(Array.isArray(THEME_SWATCHES)).toBe(true);
		expect(THEME_SWATCHES.length).toBeGreaterThan(0);
	});

	it('each swatch has label and value properties', () => {
		for (const swatch of THEME_SWATCHES) {
			expect(typeof swatch.label).toBe('string');
			expect(typeof swatch.value).toBe('string');
		}
	});

	it('getDefaultThemeColor returns a string for any index', () => {
		expect(typeof getDefaultThemeColor(0)).toBe('string');
		expect(typeof getDefaultThemeColor(100)).toBe('string');
	});

	it('getDefaultThemeColor wraps around via modulo', () => {
		expect(getDefaultThemeColor(0)).toBe(getDefaultThemeColor(THEME_SWATCHES.length));
	});
});

describe('normalizeColorMap', () => {
	it('assigns default theme colors when no colors provided', () => {
		const result = normalizeColorMap(['Active', 'Done'], {});
		expect(typeof result['Active']).toBe('string');
		expect(typeof result['Done']).toBe('string');
	});

	it('preserves provided colors', () => {
		const result = normalizeColorMap(['Active'], { Active: '#ff0000' });
		expect(result['Active']).toBe('#ff0000');
	});

	it('returns empty object for empty values', () => {
		expect(normalizeColorMap([], {})).toEqual({});
	});
});

describe('normalizeEditorSuggestTrigger', () => {
	it('returns default for empty string', () => {
		expect(normalizeEditorSuggestTrigger('')).toBe(DEFAULT_SETTINGS.editorSuggestTrigger);
	});

	it('prepends @ when missing', () => {
		expect(normalizeEditorSuggestTrigger('task')).toBe('@task');
	});

	it('preserves existing @ prefix', () => {
		expect(normalizeEditorSuggestTrigger('@task')).toBe('@task');
	});
});

describe('resolveEmergencyStatus', () => {
	it('returns first status when available', () => {
		expect(resolveEmergencyStatus(['Active', 'Done'])).toBe('Active');
	});

	it('falls back to Active for empty/null', () => {
		expect(resolveEmergencyStatus([])).toBe('Active');
		expect(resolveEmergencyStatus(null)).toBe('Active');
	});
});

describe('normalizeSettingsFromSources', () => {
	it('returns defaults for empty sources', () => {
		const result = normalizeSettingsFromSources([]);
		expect(result.tasksFolder).toBe(DEFAULT_SETTINGS.tasksFolder);
		expect(result.statuses).toEqual(DEFAULT_SETTINGS.statuses);
	});

	it('merges partial settings over defaults', () => {
		const result = normalizeSettingsFromSources([{ tasksFolder: 'MyTasks' }]);
		expect(result.tasksFolder).toBe('MyTasks');
		expect(result.statuses).toEqual(DEFAULT_SETTINGS.statuses);
	});

	it('applies multiple sources in order', () => {
		const result = normalizeSettingsFromSources([
			{ tasksFolder: 'First' },
			{ tasksFolder: 'Second' },
		]);
		expect(result.tasksFolder).toBe('Second');
	});

	it('ignores unknown fields without crashing', () => {
		expect(() => normalizeSettingsFromSources([{ unknownField: 'x' }])).not.toThrow();
	});

	it('defaults showCompletedByViewId to an empty object', () => {
		expect(normalizeSettingsFromSources([]).showCompletedByViewId).toEqual({});
	});

	it('preserves valid per-view show-completed booleans and drops non-boolean values', () => {
		const result = normalizeSettingsFromSources([
			{ showCompletedByViewId: { list: true, logbook: false, bogus: 'yes' } },
		]);
		expect(result.showCompletedByViewId).toEqual({ list: true, logbook: false });
	});
});
