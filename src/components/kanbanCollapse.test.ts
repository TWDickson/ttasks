import { describe, expect, it } from 'vitest';
import {
	deserializeCollapsed,
	isColumnCollapsed,
	serializeCollapsed,
	toggleColumnCollapse,
} from './kanbanCollapse';

describe('toggleColumnCollapse', () => {
	it('adds a column to an empty set', () => {
		const result = toggleColumnCollapse(new Set(), 'Active');
		expect(result.has('Active')).toBe(true);
		expect(result.size).toBe(1);
	});

	it('removes a column that was already collapsed', () => {
		const result = toggleColumnCollapse(new Set(['Active', 'Done']), 'Active');
		expect(result.has('Active')).toBe(false);
		expect(result.has('Done')).toBe(true);
	});

	it('does not mutate the original set', () => {
		const original = new Set(['Active']);
		const result = toggleColumnCollapse(original, 'Done');
		expect(original.size).toBe(1);
		expect(result.size).toBe(2);
	});

	it('can add multiple columns in sequence', () => {
		let collapsed = new Set<string>();
		collapsed = toggleColumnCollapse(collapsed, 'Active');
		collapsed = toggleColumnCollapse(collapsed, 'Done');
		expect(collapsed.size).toBe(2);
	});

	it('toggling same column twice returns to original state', () => {
		const original = new Set(['Active']);
		const step1 = toggleColumnCollapse(original, 'Done');
		const step2 = toggleColumnCollapse(step1, 'Done');
		expect(step2.has('Done')).toBe(false);
		expect(step2.has('Active')).toBe(true);
	});
});

describe('isColumnCollapsed', () => {
	it('returns true when column is in collapsed set', () => {
		expect(isColumnCollapsed(new Set(['Active', 'Done']), 'Active')).toBe(true);
	});

	it('returns false when column is not in collapsed set', () => {
		expect(isColumnCollapsed(new Set(['Done']), 'Active')).toBe(false);
	});

	it('returns false for empty set', () => {
		expect(isColumnCollapsed(new Set(), 'Active')).toBe(false);
	});
});

describe('serializeCollapsed', () => {
	it('returns sorted array', () => {
		const result = serializeCollapsed(new Set(['Done', 'Active', 'Blocked']));
		expect(result).toEqual(['Active', 'Blocked', 'Done']);
	});

	it('returns empty array for empty set', () => {
		expect(serializeCollapsed(new Set())).toEqual([]);
	});
});

describe('deserializeCollapsed', () => {
	it('returns a Set from a string array', () => {
		const result = deserializeCollapsed(['Active', 'Done']);
		expect(result.has('Active')).toBe(true);
		expect(result.has('Done')).toBe(true);
		expect(result.size).toBe(2);
	});

	it('returns empty Set for undefined', () => {
		expect(deserializeCollapsed(undefined).size).toBe(0);
	});

	it('returns empty Set for null', () => {
		expect(deserializeCollapsed(null).size).toBe(0);
	});

	it('roundtrips: serialize then deserialize produces equal set', () => {
		const original = new Set(['Active', 'Blocked', 'Done']);
		const serialized = serializeCollapsed(original);
		const restored = deserializeCollapsed(serialized);
		expect([...restored].sort()).toEqual([...original].sort());
	});
});
