import { describe, expect, it } from 'vitest';
import { CUSTOM_REPEAT, previewOccurrences, repeatMenuOptions, repeatMenuValue, ruleForBasisChoice, ruleForMenuChoice } from './taskDetailRepeat';
import { REPEAT_PRESETS } from '../repeat/presets';
import type { RepeatRule } from '../repeat/types';

const custom: RepeatRule = { every: 2, unit: 'week', weekdays: ['mon', 'wed'] };

describe('repeat menu', () => {
	it('shows the preset, custom, or nothing', () => {
		expect(repeatMenuValue(null)).toBe('');
		expect(repeatMenuValue({ every: 1, unit: 'month', monthday: 31 })).toBe('monthly');
		expect(repeatMenuValue(custom)).toBe(CUSTOM_REPEAT);
	});

	it('adds a described Custom entry only for a custom rule', () => {
		expect(repeatMenuOptions(null, REPEAT_PRESETS).options).toEqual([...REPEAT_PRESETS]);
		const { options, labels } = repeatMenuOptions(custom, REPEAT_PRESETS);
		expect(options.at(-1)).toBe(CUSTOM_REPEAT);
		expect(labels[CUSTOM_REPEAT]).toBe('Custom — Every 2 weeks on Mon, Wed');
	});

	it('picking a preset builds a pinned rule; clearing removes it; re-picking custom keeps it', () => {
		expect(ruleForMenuChoice(null, 'monthly', '2026-01-31')).toEqual({ every: 1, unit: 'month', monthday: 31 });
		expect(ruleForMenuChoice(custom, '', null)).toBeNull();
		expect(ruleForMenuChoice(custom, CUSTOM_REPEAT, null)).toBeUndefined();
	});

	it('keeps the after-completion basis when switching preset', () => {
		const rule: RepeatRule = { every: 1, unit: 'week', basis: 'completion' };
		expect(ruleForMenuChoice(rule, 'monthly', '2026-01-31')).toEqual({ every: 1, unit: 'month', basis: 'completion' });
	});

	it('switches basis on presets and custom rules alike', () => {
		expect(ruleForBasisChoice({ every: 1, unit: 'month', monthday: 31 }, 'from_completion', '2026-01-31'))
			.toEqual({ every: 1, unit: 'month', basis: 'completion' });
		expect(ruleForBasisChoice({ every: 1, unit: 'month', basis: 'completion' }, 'fixed', '2026-01-31'))
			.toEqual({ every: 1, unit: 'month', monthday: 31 });
		expect(ruleForBasisChoice(custom, 'from_completion', null)).toEqual({ ...custom, basis: 'completion' });
		expect(ruleForBasisChoice({ ...custom, basis: 'completion' }, 'fixed', null)).toEqual(custom);
	});
});

describe('previewOccurrences', () => {
	it('previews the next dates from the due date', () => {
		expect(previewOccurrences({ every: 1, unit: 'month', monthday: 31 }, '2026-01-31', '2026-01-10'))
			.toEqual(['2026-02-28', '2026-03-31', '2026-04-30']);
	});
	it('previews a completion-based rule from today', () => {
		expect(previewOccurrences({ every: 1, unit: 'week', basis: 'completion' }, '2026-01-31', '2026-03-02'))
			.toEqual(['2026-03-09', '2026-03-16', '2026-03-23']);
	});
	it('stops when the series ends', () => {
		expect(previewOccurrences({ every: 1, unit: 'day', count: 2 }, '2026-01-01', '2026-01-01')).toEqual(['2026-01-02', '2026-01-03']);
		expect(previewOccurrences(null, '2026-01-01', '2026-01-01')).toEqual([]);
	});
});
