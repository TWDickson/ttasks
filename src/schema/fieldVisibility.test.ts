import { describe, it, expect } from 'vitest';
import { isBlockedStatus } from './fieldVisibility';

describe('fieldVisibility', () => {
	describe('isBlockedStatus', () => {
		it('returns true for default blocked status', () => {
			expect(isBlockedStatus('Blocked')).toBe(true);
			expect(isBlockedStatus('blocked')).toBe(true);
		});

		it('returns true for configured block status', () => {
			expect(isBlockedStatus('On Hold', 'On Hold')).toBe(true);
			expect(isBlockedStatus('on hold', 'On Hold')).toBe(true);
		});

		it('keeps backward compatibility with canonical Blocked values', () => {
			expect(isBlockedStatus('Blocked', 'On Hold')).toBe(true);
		});

		it('returns false for non-blocked statuses', () => {
			expect(isBlockedStatus('Active')).toBe(false);
			expect(isBlockedStatus('', 'On Hold')).toBe(false);
			expect(isBlockedStatus(null, 'On Hold')).toBe(false);
		});
	});
});
