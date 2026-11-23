import { describe, it, expect } from 'vitest';
import { isBlockedStatus, takesReason } from './fieldVisibility';

describe('fieldVisibility', () => {
	describe('takesReason', () => {
		it('is true for the blocked and the hold status', () => {
			expect(takesReason('Blocked', 'Blocked', 'Hold')).toBe(true);
			expect(takesReason('Hold', 'Blocked', 'Hold')).toBe(true);
			expect(takesReason('hold', 'Blocked', 'Hold')).toBe(true);
		});

		it('is false for other statuses, and for Hold in a vault with no hold status', () => {
			expect(takesReason('Active', 'Blocked', 'Hold')).toBe(false);
			expect(takesReason('Future', 'Blocked', 'Hold')).toBe(false);
			expect(takesReason('Hold', 'Blocked', null)).toBe(false);
			expect(takesReason('', 'Blocked', '')).toBe(false);
		});
	});

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
