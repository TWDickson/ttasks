import { describe, expect, it } from 'vitest';
import {
	DEFAULT_SETTINGS,
	DEFAULT_STATUSES,
	DEFAULT_REMINDERS_SETTINGS,
	THEME_SWATCHES,
	getDefaultThemeColor,
	normalizeColorMap,
	migrateLegacyStatusColors,
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
			dialStyle: DEFAULT_SETTINGS.pomodoro.dialStyle,
			autoStartNext: false,
			logEnabled: DEFAULT_SETTINGS.pomodoro.logEnabled,
			logPath: DEFAULT_SETTINGS.pomodoro.logPath,
			logPartialOnStop: DEFAULT_SETTINGS.pomodoro.logPartialOnStop,
		});
	});

	it('applies a valid persisted dialStyle and ignores an invalid one', () => {
		const ring = normalizeSettingsFromSources([{ pomodoro: { dialStyle: 'ring-plain' } }]);
		expect(ring.pomodoro.dialStyle).toBe('ring-plain');

		const invalid = normalizeSettingsFromSources([{ pomodoro: { dialStyle: 'sundial' } }]);
		expect(invalid.pomodoro.dialStyle).toBe(DEFAULT_SETTINGS.pomodoro.dialStyle);
	});

	it('applies persisted log settings', () => {
		const merged = normalizeSettingsFromSources([
			{ pomodoro: { logEnabled: false, logPath: 'logs/pomo.csv', logPartialOnStop: false } },
		]);
		expect(merged.pomodoro.logEnabled).toBe(false);
		expect(merged.pomodoro.logPath).toBe('logs/pomo.csv');
		expect(merged.pomodoro.logPartialOnStop).toBe(false);
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

	it('does not hand a fallback the same colour as an explicit entry', () => {
		// 'Second' would positionally land on index 1's swatch; 'First' has already
		// claimed it explicitly, so the fallback has to move on to another swatch.
		const claimedByFirst = getDefaultThemeColor(1);
		const result = normalizeColorMap(['First', 'Second'], { First: claimedByFirst });
		expect(result['First']).toBe(claimedByFirst);
		expect(result['Second']).not.toBe(claimedByFirst);
	});

	it('gives every value a distinct colour while swatches remain', () => {
		const values = THEME_SWATCHES.map((_, i) => `Status ${i}`);
		const colors = Object.values(normalizeColorMap(values, {}));
		expect(new Set(colors).size).toBe(THEME_SWATCHES.length);
	});

	it('allows duplicates once every swatch is claimed', () => {
		const values = [...THEME_SWATCHES.map((_, i) => `Status ${i}`), 'Overflow'];
		const result = normalizeColorMap(values, {});
		expect(typeof result['Overflow']).toBe('string');
		expect(Object.keys(result)).toHaveLength(THEME_SWATCHES.length + 1);
	});

	it('preserves key order regardless of which entries are explicit', () => {
		const result = normalizeColorMap(['A', 'B', 'C'], { B: 'var(--color-red)' });
		expect(Object.keys(result)).toEqual(['A', 'B', 'C']);
	});
});

describe('migrateLegacyStatusColors', () => {
	const legacy = {
		'In Progress': '#2563eb',
		Blocked: '#dc2626',
		Completed: '#16a34a',
		Cancelled: '#6b7280',
	};

	it('converts every legacy shipped hex to its theme swatch', () => {
		const { colors, converted } = migrateLegacyStatusColors(legacy);
		expect(colors).toEqual({
			'In Progress': 'var(--color-blue)',
			Blocked: 'var(--color-red)',
			Completed: 'var(--color-green)',
			Cancelled: 'var(--text-muted)',
		});
		expect(converted.sort()).toEqual(['Blocked', 'Cancelled', 'Completed', 'In Progress']);
	});

	it('is idempotent — re-running converts nothing', () => {
		const once = migrateLegacyStatusColors(legacy);
		const twice = migrateLegacyStatusColors(once.colors);
		expect(twice.colors).toEqual(once.colors);
		expect(twice.converted).toEqual([]);
	});

	it('leaves custom hex colours the user actually chose alone', () => {
		const { colors, converted } = migrateLegacyStatusColors({ Custom: '#123456' });
		expect(colors['Custom']).toBe('#123456');
		expect(converted).toEqual([]);
	});

	it('matches legacy hex case-insensitively', () => {
		const { colors } = migrateLegacyStatusColors({ Blocked: '#DC2626' });
		expect(colors['Blocked']).toBe('var(--color-red)');
	});

	it('preserves statuses and key order', () => {
		const { colors } = migrateLegacyStatusColors({ A: '#123456', Blocked: '#dc2626', Z: 'var(--color-pink)' });
		expect(Object.keys(colors)).toEqual(['A', 'Blocked', 'Z']);
	});

	it('handles an empty or missing map', () => {
		expect(migrateLegacyStatusColors({})).toEqual({ colors: {}, converted: [] });
		expect(migrateLegacyStatusColors(null)).toEqual({ colors: {}, converted: [] });
	});

	it('lands on colours the settings UI recognises as swatches', () => {
		const swatchValues = new Set(THEME_SWATCHES.map((s) => s.value));
		const { colors } = migrateLegacyStatusColors(legacy);
		for (const color of Object.values(colors)) {
			expect(swatchValues.has(color)).toBe(true);
		}
	});

	// Second pass: statuses left on the old positional fallback move to the pinned default.
	const legacyPositional = {
		Active: 'var(--color-red)',
		Future: 'var(--color-yellow)',
		Hold: 'var(--color-green)',
	};

	it('moves positional-fallback leftovers onto the pinned defaults', () => {
		const { colors, converted } = migrateLegacyStatusColors(legacyPositional);
		expect(colors).toEqual({
			Active: DEFAULT_SETTINGS.statusColors['Active'],
			Future: DEFAULT_SETTINGS.statusColors['Future'],
			Hold: DEFAULT_SETTINGS.statusColors['Hold'],
		});
		expect(converted.sort()).toEqual(['Active', 'Future', 'Hold']);
	});

	it('is idempotent across the positional pass too', () => {
		const once = migrateLegacyStatusColors(legacyPositional);
		const twice = migrateLegacyStatusColors(once.colors);
		expect(twice.colors).toEqual(once.colors);
		expect(twice.converted).toEqual([]);
	});

	it('leaves a deliberate pick that differs from the legacy positional value', () => {
		// Active's legacy positional colour was red; pink is therefore a real choice.
		const { colors, converted } = migrateLegacyStatusColors({ Active: 'var(--color-pink)' });
		expect(colors['Active']).toBe('var(--color-pink)');
		expect(converted).toEqual([]);
	});

	it('does not touch statuses that never had a positional default', () => {
		const { colors, converted } = migrateLegacyStatusColors({ Waiting: 'var(--color-red)' });
		expect(colors['Waiting']).toBe('var(--color-red)');
		expect(converted).toEqual([]);
	});

	it('resolves the collisions the pinned defaults exist to remove', () => {
		// Active shared red with Blocked; Hold shared green with Completed.
		const { colors } = migrateLegacyStatusColors({
			Active: 'var(--color-red)',
			Blocked: '#dc2626',
			Hold: 'var(--color-green)',
			Completed: '#16a34a',
		});
		expect(new Set(Object.values(colors)).size).toBe(4);
	});
});

describe('DEFAULT_SETTINGS.statusColors', () => {
	it('ships theme swatch values, never raw hex', () => {
		// Hex is reserved for colours a user picked from the custom colour input; the
		// settings UI decides "custom vs swatch" by matching against THEME_SWATCHES.
		const swatchValues = new Set(THEME_SWATCHES.map((s) => s.value));
		for (const [status, color] of Object.entries(DEFAULT_SETTINGS.statusColors)) {
			expect(color, `${status} should be a theme swatch`).not.toMatch(/^#/);
			expect(swatchValues.has(color), `${status} -> ${color}`).toBe(true);
		}
	});

	it('pins every shipped status so none rely on positional fallback', () => {
		expect(Object.keys(DEFAULT_SETTINGS.statusColors).sort()).toEqual([...DEFAULT_STATUSES].sort());
	});

	it('gives the shipped statuses distinct colours', () => {
		const colors = Object.values(DEFAULT_SETTINGS.statusColors);
		expect(new Set(colors).size).toBe(colors.length);
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
