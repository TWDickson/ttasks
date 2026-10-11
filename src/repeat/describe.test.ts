import { describe, expect, it } from 'vitest';
import { describeRepeat } from './describe';
import type { RepeatRule } from './types';

const cases: [RepeatRule, string][] = [
	[{ every: 1, unit: 'day' }, 'Every day'],
	[{ every: 3, unit: 'day' }, 'Every 3 days'],
	[{ every: 1, unit: 'week' }, 'Every week'],
	[{ every: 2, unit: 'week', weekdays: ['mon', 'wed'] }, 'Every 2 weeks on Mon, Wed'],
	[{ every: 1, unit: 'month', monthday: 15 }, 'Every month on the 15th'],
	[{ every: 1, unit: 'month', monthday: 22 }, 'Every month on the 22nd'],
	[{ every: 1, unit: 'month', monthday: 11 }, 'Every month on the 11th'],
	[{ every: 1, unit: 'month', monthday: 'last' }, 'Every month on the last day'],
	[{ every: 1, unit: 'month', nth: { n: 1, target: 'working-day' }, count: 12 }, 'Every month on the 1st working day, 12 more times'],
	[{ every: 1, unit: 'month', nth: { n: -1, target: 'fri' } }, 'Every month on the last Friday'],
	[{ every: 1, unit: 'month', nth: { n: -1, target: 'weekend-day' } }, 'Every month on the last weekend day'],
	[{ every: 1, unit: 'year' }, 'Every year'],
	[{ every: 1, unit: 'year', month: 12, monthday: 25 }, 'Every year on December 25th'],
	[{ every: 2, unit: 'week', basis: 'completion' }, 'Every 2 weeks, after completion'],
	[{ every: 1, unit: 'month', monthday: 15, roll: 'next', until: '2027-06-01' }, 'Every month on the 15th, next working day if off, until 2027-06-01'],
	[{ every: 1, unit: 'day', count: 1 }, 'Every day, 1 more time'],
];

describe('describeRepeat', () => {
	it.each(cases)('%j', (rule, label) => {
		expect(describeRepeat(rule)).toBe(label);
	});
});
