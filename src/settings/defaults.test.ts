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

	it('defaults the status-bar block to a visible agenda-click item', () => {
		expect(DEFAULT_SETTINGS.statusBar.hideWhenZero).toBe(false);
		expect(DEFAULT_SETTINGS.statusBar.clickTarget).toBe('agenda');
	});
});

describe('statusBar settings normalization', () => {
	it('applies valid persisted statusBar values', () => {
		const merged = normalizeSettingsFromSources([
			{ statusBar: { hideWhenZero: true, clickTarget: 'today' } },
		]);
		expect(merged.statusBar.hideWhenZero).toBe(true);
		expect(merged.statusBar.clickTarget).toBe('today');
	});

	it('ignores an invalid clickTarget and keeps the default', () => {
		const merged = normalizeSettingsFromSources([
			{ statusBar: { clickTarget: 'nonsense' } },
		]);
		expect(merged.statusBar.clickTarget).toBe('agenda');
	});

	it('falls back to defaults when statusBar is absent', () => {
		const merged = normalizeSettingsFromSources([{}]);
		expect(merged.statusBar).toEqual(DEFAULT_SETTINGS.statusBar);
	});
});

describe('pomodoro settings normalization', () => {
	it('applies valid persisted pomodoro values', () => {
		const merged = normalizeSettingsFromSources([
			{ pomodoro: { focusMinutes: 50, shortBreakMinutes: 10, longBreakMinutes: 30, longBreakInterval: 3, autoStartNext: false } },
		]);
		expect(merged.pomodoro).toEqual({
			focusMinutes: 50,
			shortBreakMinutes: 10,
			longBreakMinutes: 30,
			longBreakInterval: 3,
			autoStartNext: false,
		});
	});

	it('ignores non-numeric fields and keeps the defaults', () => {
		const merged = normalizeSettingsFromSources([
			{ pomodoro: { focusMinutes: 'oops', autoStartNext: false } },
		]);
		expect(merged.pomodoro.focusMinutes).toBe(DEFAULT_SETTINGS.pomodoro.focusMinutes);
		expect(merged.pomodoro.autoStartNext).toBe(false);
	});

	it('falls back to defaults when pomodoro is absent', () => {
		const merged = normalizeSettingsFromSources([{}]);
		expect(merged.pomodoro).toEqual(DEFAULT_SETTINGS.pomodoro);
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

	it('defaults the working calendar to empty', () => {
		const result = normalizeSettingsFromSources([]);
		expect(result.holidays).toEqual([]);
		expect(result.areaWorkweek).toEqual({});
	});

	it('coerces legacy string holidays, drops invalid dates, and keeps boolean area toggles', () => {
		const result = normalizeSettingsFromSources([
			{
				holidays: ['2026-12-25', 'not-a-date', '2026/01/01', '2026-07-04'],
				areaWorkweek: { Work: true, Personal: false, bogus: 'yes' },
			},
		]);
		// Legacy bare-string dates become unnamed one-off entries, sorted by date.
		expect(result.holidays).toEqual([
			{ date: '2026-07-04', name: '', repeatYearly: false },
			{ date: '2026-12-25', name: '', repeatYearly: false },
		]);
		expect(result.areaWorkweek).toEqual({ Work: true, Personal: false });
	});

	it('parses named and recurring holiday objects', () => {
		const result = normalizeSettingsFromSources([
			{
				holidays: [
					{ date: '2026-12-25', name: 'Christmas', repeatYearly: true },
					{ date: 'bad', name: 'Nope', repeatYearly: true },
					{ date: '2026-07-04', name: '  Independence Day  ' },
				],
			},
		]);
		expect(result.holidays).toEqual([
			{ date: '2026-12-25', name: 'Christmas', repeatYearly: true },
			{ date: '2026-07-04', name: 'Independence Day', repeatYearly: false },
		]);
	});
});
