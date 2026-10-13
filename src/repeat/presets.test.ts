import { describe, expect, it } from 'vitest';
import { basisName, presetFromText, presetOf, repinToDueDate, ruleFromPreset, REPEAT_PRESETS } from './presets';

describe('ruleFromPreset / presetOf', () => {
	it('round-trips every preset under both bases', () => {
		for (const preset of REPEAT_PRESETS) {
			for (const basis of ['fixed', 'from_completion'] as const) {
				const rule = ruleFromPreset(preset, basis, '2026-01-31');
				expect(presetOf(rule)).toBe(preset);
				expect(basisName(rule)).toBe(basis);
			}
		}
	});

	it('pins a fixed monthly/yearly rule to the due date\'s day', () => {
		expect(ruleFromPreset('monthly', 'fixed', '2026-01-31')).toEqual({ every: 1, unit: 'month', monthday: 31 });
		expect(ruleFromPreset('yearly', null, '2024-02-29')).toEqual({ every: 1, unit: 'year', monthday: 29 });
		expect(ruleFromPreset('monthly', 'fixed', null)).toEqual({ every: 1, unit: 'month' });
		expect(ruleFromPreset('weekly', 'fixed', '2026-01-31')).toEqual({ every: 1, unit: 'week' });
	});

	it('does not pin a completion-based rule', () => {
		expect(ruleFromPreset('monthly', 'from_completion', '2026-01-31')).toEqual({ every: 1, unit: 'month', basis: 'completion' });
	});

	it('reports custom rules as having no preset', () => {
		expect(presetOf({ every: 3, unit: 'day' })).toBeNull();
		expect(presetOf({ every: 1, unit: 'week', weekdays: ['mon'] })).toBeNull();
		expect(presetOf({ every: 1, unit: 'month', nth: { n: 1, target: 'mon' } })).toBeNull();
		expect(presetOf({ every: 1, unit: 'month', monthday: 'last' })).toBeNull();
		expect(presetOf({ every: 1, unit: 'day', count: 3 })).toBeNull();
		expect(presetOf(null)).toBeNull();
	});
});

describe('repinToDueDate', () => {
	it('follows a rescheduled due date for a pinned monthly rule', () => {
		expect(repinToDueDate({ every: 1, unit: 'month', monthday: 31 }, '2026-03-15')).toEqual({ every: 1, unit: 'month', monthday: 15 });
	});
	it('leaves rules whose day is not tied to the due date', () => {
		const rules = [
			{ every: 1, unit: 'month', monthday: 'last' },
			{ every: 1, unit: 'month', nth: { n: 1, target: 'mon' } },
			{ every: 1, unit: 'month', basis: 'completion' },
			{ every: 1, unit: 'week' },
		] as const;
		for (const rule of rules) expect(repinToDueDate(rule as never, '2026-03-15')).toBe(rule);
	});
});

describe('presetFromText', () => {
	it.each([
		['every day', 'daily'], ['every week', 'weekly'], ['Every 2 weeks', 'biweekly'],
		['every month', 'monthly'], ['every year', 'yearly'], ['monthly', 'monthly'],
	])('%s → %s', (text, preset) => expect(presetFromText(text)).toBe(preset));
	it('never guesses', () => {
		expect(presetFromText('every week on Monday')).toBeNull();
		expect(presetFromText('when I feel like it')).toBeNull();
		expect(presetFromText(null)).toBeNull();
	});
});
