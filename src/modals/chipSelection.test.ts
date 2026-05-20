import { describe, expect, it } from 'vitest';
import { withCurrentOption } from './chipSelection';

describe('withCurrentOption', () => {
	it('returns base options unchanged when current is already present', () => {
		expect(withCurrentOption(['Active', 'Done'], 'Active')).toEqual(['Active', 'Done']);
	});

	it('appends current option when missing so selected chip can still render', () => {
		expect(withCurrentOption(['Low', 'Medium'], 'None')).toEqual(['Low', 'Medium', 'None']);
	});

	it('returns base options when current is empty', () => {
		expect(withCurrentOption(['High', 'Low'], '')).toEqual(['High', 'Low']);
		expect(withCurrentOption(['High', 'Low'], null)).toEqual(['High', 'Low']);
	});
});
