import { describe, expect, it } from 'vitest';
import { builderFromRule, ruleFromBuilder, type BuilderState } from './builder';
import type { RepeatRule } from './types';

const TODAY = '2026-10-13';
const roundTrip = (rule: RepeatRule, due: string | null = '2026-10-13') => ruleFromBuilder(builderFromRule(rule, due, TODAY)).rule;

describe('builderFromRule', () => {
	it('defaults a new rule from the due date: weekly on its weekday, day and month from it', () => {
		// 2026-10-30 is a Friday, the 5th Friday is clamped to the 4th for nth.
		const s = builderFromRule(null, '2026-10-30', TODAY);
		expect(s).toMatchObject({ every: 1, unit: 'week', weekdays: ['fri'], monthday: 30, month: 10, nthN: 4, nthTarget: 'fri', end: 'never', basis: 'schedule' });
	});

	it('falls back to today without a due date', () => {
		expect(builderFromRule(null, null, TODAY).weekdays).toEqual(['tue']);
	});
});

describe('ruleFromBuilder ∘ builderFromRule round-trips', () => {
	const rules: RepeatRule[] = [
		{ every: 1, unit: 'day' },
		{ every: 3, unit: 'day', basis: 'completion' },
		{ every: 2, unit: 'week', weekdays: ['mon', 'wed'] },
		{ every: 1, unit: 'month', monthday: 31 },
		{ every: 1, unit: 'month', monthday: 'last', roll: 'previous' },
		{ every: 1, unit: 'month', nth: { n: 1, target: 'working-day' }, count: 12 },
		{ every: 1, unit: 'month', nth: { n: -1, target: 'fri' }, until: '2027-06-30' },
		{ every: 1, unit: 'year', month: 12, monthday: 25 },
		{ every: 2, unit: 'year', month: 2, monthday: 'last' },
	];
	it.each(rules)('%j', (rule) => expect(roundTrip(rule)).toEqual(rule));
});

describe('ruleFromBuilder', () => {
	const base = (over: Partial<BuilderState> = {}): BuilderState => ({ ...builderFromRule(null, '2026-10-13', TODAY), ...over });

	it('keeps only the fields the chosen unit uses', () => {
		expect(ruleFromBuilder(base({ unit: 'day', weekdays: ['mon'], monthday: 5 })).rule).toEqual({ every: 1, unit: 'day' });
		expect(ruleFromBuilder(base({ unit: 'month', monthMode: 'day', monthday: 5, weekdays: ['mon'] })).rule).toEqual({ every: 1, unit: 'month', monthday: 5 });
	});

	it('orders weekdays Monday-first and treats none as "same weekday as the due date"', () => {
		expect(ruleFromBuilder(base({ weekdays: ['fri', 'mon'] })).rule?.weekdays).toEqual(['mon', 'fri']);
		expect(ruleFromBuilder(base({ weekdays: [] })).rule).toEqual({ every: 1, unit: 'week' });
	});

	it('rejects what the reader would reject', () => {
		expect(ruleFromBuilder(base({ every: 0 })).error).toMatch(/at least 1/);
		expect(ruleFromBuilder(base({ every: 1.5 })).error).toBeTruthy();
		expect(ruleFromBuilder(base({ end: 'until', until: '' })).error).toMatch(/date/);
		expect(ruleFromBuilder(base({ end: 'count', count: 0 })).error).toMatch(/at least 1/);
	});
});
