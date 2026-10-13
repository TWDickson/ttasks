import { describe, expect, it } from 'vitest';
import { repeatFromContract, repeatToContract } from './repeatContract';
import type { RepeatRule } from '../repeat/types';

const custom: RepeatRule = { every: 2, unit: 'week', weekdays: ['mon', 'wed'] };

describe('repeatToContract', () => {
	it('exports presets exactly as the old fields did', () => {
		expect(repeatToContract({ every: 1, unit: 'month', monthday: 31 })).toEqual({ recurrence: 'monthly', recurrence_type: 'fixed' });
		expect(repeatToContract({ every: 2, unit: 'week', basis: 'completion' })).toEqual({ recurrence: 'biweekly', recurrence_type: 'from_completion' });
		expect(repeatToContract(null)).toEqual({ recurrence: null, recurrence_type: null });
	});
	it('exports a custom rule as its description', () => {
		expect(repeatToContract(custom)).toEqual({ recurrence: 'Every 2 weeks on Mon, Wed', recurrence_type: 'fixed' });
	});
});

describe('repeatFromContract', () => {
	it('sets a rule from a preset, pinned to the due date', () => {
		expect(repeatFromContract('monthly', 'fixed', '2026-01-31', null)).toEqual({ every: 1, unit: 'month', monthday: 31 });
		expect(repeatFromContract('every week', null, null, null)).toEqual({ every: 1, unit: 'week' });
	});
	it('treats an exported record coming back unchanged as no change', () => {
		const monthly: RepeatRule = { every: 1, unit: 'month', monthday: 31 };
		const view = repeatToContract(monthly);
		expect(repeatFromContract(view.recurrence, view.recurrence_type, '2026-01-31', monthly)).toBeUndefined();
		const customView = repeatToContract(custom);
		expect(repeatFromContract(customView.recurrence, customView.recurrence_type, null, custom)).toBeUndefined();
	});
	it('changes only the basis of a custom rule', () => {
		expect(repeatFromContract('Every 2 weeks on Mon, Wed', 'from_completion', null, custom)).toEqual({ ...custom, basis: 'completion' });
	});
	it('applies a basis-only change to a preset', () => {
		expect(repeatFromContract(null, 'from_completion', '2026-01-31', { every: 1, unit: 'month', monthday: 31 }))
			.toEqual({ every: 1, unit: 'month', basis: 'completion' });
	});
	it('never clears or guesses', () => {
		expect(repeatFromContract('', null, null, custom)).toBeUndefined();
		expect(repeatFromContract(null, null, null, null)).toBeUndefined();
		expect(repeatFromContract('whenever', 'fixed', null, null)).toBeUndefined();
	});
});
