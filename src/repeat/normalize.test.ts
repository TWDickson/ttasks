import { describe, expect, it } from 'vitest';
import { REPEAT_KEYS, normalizeRepeat, repeatToFrontmatter } from './normalize';
import type { RepeatRule } from './types';

const k = REPEAT_KEYS;
const ok = (fm: Record<string, unknown>) => {
	const r = normalizeRepeat(fm);
	expect(r.warning).toBeNull();
	return r.rule;
};
const warn = (fm: Record<string, unknown>) => {
	const r = normalizeRepeat(fm);
	expect(r.rule).toBeNull();
	expect(r.warning).toBeTruthy();
	return r.warning!;
};

describe('normalizeRepeat', () => {
	it('a note with no repeat keys is simply not repeating, with no warning', () => {
		expect(normalizeRepeat({})).toEqual({ rule: null, warning: null });
		expect(normalizeRepeat({ [k.every]: '', [k.weekdays]: [] })).toEqual({ rule: null, warning: null });
	});

	it('reads the spec examples', () => {
		expect(ok({ [k.every]: 2, [k.unit]: 'week', [k.weekdays]: ['mon', 'wed'] }))
			.toEqual({ every: 2, unit: 'week', weekdays: ['mon', 'wed'] });
		expect(ok({ [k.every]: 1, [k.unit]: 'month', [k.nth]: 1, [k.nthTarget]: 'working-day', [k.count]: 12 }))
			.toEqual({ every: 1, unit: 'month', nth: { n: 1, target: 'working-day' }, count: 12 });
	});

	it('coerces numbers that Obsidian retyped as text', () => {
		expect(ok({ [k.every]: '3', [k.unit]: 'day', [k.count]: '4' })).toEqual({ every: 3, unit: 'day', count: 4 });
	});

	it('accepts monthday "last", completion basis, roll and until', () => {
		expect(ok({ [k.every]: 1, [k.unit]: 'month', [k.monthday]: 'last', [k.basis]: 'completion', [k.roll]: 'previous', [k.until]: '2027-01-01' }))
			.toEqual({ every: 1, unit: 'month', monthday: 'last', basis: 'completion', roll: 'previous', until: '2027-01-01' });
	});

	it('reads an until that arrived as a full timestamp', () => {
		expect(ok({ [k.every]: 1, [k.unit]: 'day', [k.until]: '2027-01-01T00:00:00.000Z' })?.until).toBe('2027-01-01');
	});

	it('explicit schedule basis is the default and is dropped', () => {
		expect(ok({ [k.every]: 1, [k.unit]: 'day', [k.basis]: 'schedule' })).toEqual({ every: 1, unit: 'day' });
	});

	it('de-duplicates and lower-cases weekdays', () => {
		expect(ok({ [k.every]: 1, [k.unit]: 'week', [k.weekdays]: ['MON', 'mon', 'Fri'] })?.weekdays).toEqual(['mon', 'fri']);
	});

	describe('inconsistent hand-edits become a warning, never a guess', () => {
		it('other keys without an interval', () => { expect(warn({ [k.unit]: 'week' })).toContain(k.every); });
		it('a non-positive or fractional interval', () => {
			warn({ [k.every]: 0, [k.unit]: 'day' });
			warn({ [k.every]: 1.5, [k.unit]: 'day' });
		});
		it('an unknown unit', () => { warn({ [k.every]: 1, [k.unit]: 'fortnight' }); });
		it('weekdays on a non-weekly rule', () => { warn({ [k.every]: 1, [k.unit]: 'month', [k.weekdays]: ['mon'] }); });
		it('an unknown weekday', () => { warn({ [k.every]: 1, [k.unit]: 'week', [k.weekdays]: ['someday'] }); });
		it('monthday on a daily rule, or out of range', () => {
			warn({ [k.every]: 1, [k.unit]: 'day', [k.monthday]: 5 });
			warn({ [k.every]: 1, [k.unit]: 'month', [k.monthday]: 32 });
		});
		it('month on a non-yearly rule, or out of range', () => {
			warn({ [k.every]: 1, [k.unit]: 'month', [k.month]: 3 });
			warn({ [k.every]: 1, [k.unit]: 'year', [k.month]: 13 });
		});
		it('nth and monthday together', () => {
			warn({ [k.every]: 1, [k.unit]: 'month', [k.monthday]: 5, [k.nth]: 1, [k.nthTarget]: 'mon' });
		});
		it('nth without its target, and vice versa', () => {
			warn({ [k.every]: 1, [k.unit]: 'month', [k.nth]: 1 });
			warn({ [k.every]: 1, [k.unit]: 'month', [k.nthTarget]: 'mon' });
		});
		it('nth out of range or on a non-monthly rule', () => {
			warn({ [k.every]: 1, [k.unit]: 'month', [k.nth]: 6, [k.nthTarget]: 'mon' });
			warn({ [k.every]: 1, [k.unit]: 'week', [k.nth]: 1, [k.nthTarget]: 'mon' });
		});
		it('bad basis, roll, until and count', () => {
			warn({ [k.every]: 1, [k.unit]: 'day', [k.basis]: 'whenever' });
			warn({ [k.every]: 1, [k.unit]: 'day', [k.roll]: 'sideways' });
			warn({ [k.every]: 1, [k.unit]: 'day', [k.until]: 'next year' });
			warn({ [k.every]: 1, [k.unit]: 'day', [k.count]: -1 });
		});
	});
});

describe('repeatToFrontmatter', () => {
	const rules: RepeatRule[] = [
		{ every: 1, unit: 'day' },
		{ every: 2, unit: 'week', weekdays: ['mon', 'wed'] },
		{ every: 1, unit: 'month', monthday: 'last', roll: 'previous', until: '2027-01-01' },
		{ every: 1, unit: 'month', nth: { n: -1, target: 'fri' }, basis: 'completion', count: 6 },
		{ every: 2, unit: 'year', month: 12, monthday: 25 },
	];

	it('round-trips through normalize', () => {
		for (const rule of rules) expect(normalizeRepeat(repeatToFrontmatter(rule))).toEqual({ rule, warning: null });
	});

	it('is sparse: a simple rule writes two keys', () => {
		expect(Object.keys(repeatToFrontmatter({ every: 1, unit: 'day' }))).toEqual([k.every, k.unit]);
	});
});
