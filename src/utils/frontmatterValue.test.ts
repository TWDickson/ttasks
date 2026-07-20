import { describe, expect, it } from 'vitest';
import { toFrontmatterString, toFrontmatterNumber } from './frontmatterValue';

// These guard the "frontmatter value decoded to the wrong type" class: YAML
// infers a field's runtime type, so a value the schema treats as a string or a
// number can arrive as a number, boolean, or Date after Obsidian re-serializes
// the block. The Task boundary must pin each value to its intended type.

describe('toFrontmatterString', () => {
	it('passes a string through unchanged', () => {
		expect(toFrontmatterString('Create the planner')).toBe('Create the planner');
	});

	it('stringifies a numeric-looking name (YAML decoded it as a number)', () => {
		// name: 2026  →  parsed as the number 2026; must still render/sort as text.
		expect(toFrontmatterString(2026)).toBe('2026');
	});

	it('stringifies a boolean', () => {
		expect(toFrontmatterString(true)).toBe('true');
	});

	it('reduces a Date to its calendar-date portion', () => {
		expect(toFrontmatterString(new Date('2026-07-20T00:00:00.000Z'))).toBe('2026-07-20');
	});

	it('falls back to empty string for null / undefined', () => {
		expect(toFrontmatterString(null)).toBe('');
		expect(toFrontmatterString(undefined)).toBe('');
	});

	it('honours an explicit fallback', () => {
		expect(toFrontmatterString(null, 'Untitled')).toBe('Untitled');
		expect(toFrontmatterString({}, 'Untitled')).toBe('Untitled');
	});

	it('falls back for non-scalar values', () => {
		expect(toFrontmatterString({})).toBe('');
		expect(toFrontmatterString(['a'])).toBe('');
		expect(toFrontmatterString(new Date('nonsense'))).toBe('');
	});
});

describe('toFrontmatterNumber', () => {
	it('passes a finite number through', () => {
		expect(toFrontmatterNumber(3)).toBe(3);
		expect(toFrontmatterNumber(0)).toBe(0);
		expect(toFrontmatterNumber(2.5)).toBe(2.5);
	});

	it('parses a quoted numeric string (estimated_days: "3")', () => {
		expect(toFrontmatterNumber('3')).toBe(3);
		expect(toFrontmatterNumber('2.5')).toBe(2.5);
	});

	it('returns null for a non-numeric string', () => {
		expect(toFrontmatterNumber('soon')).toBeNull();
		expect(toFrontmatterNumber('')).toBeNull();
		expect(toFrontmatterNumber('   ')).toBeNull();
	});

	it('returns null for NaN and Infinity', () => {
		expect(toFrontmatterNumber(NaN)).toBeNull();
		expect(toFrontmatterNumber(Infinity)).toBeNull();
	});

	it('returns null for null, undefined, booleans, and Dates', () => {
		expect(toFrontmatterNumber(null)).toBeNull();
		expect(toFrontmatterNumber(undefined)).toBeNull();
		expect(toFrontmatterNumber(true)).toBeNull();
		expect(toFrontmatterNumber(new Date())).toBeNull();
	});
});
