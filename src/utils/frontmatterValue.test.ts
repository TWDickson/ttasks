import { describe, expect, it } from 'vitest';
import {
	toFrontmatterBoolean,
	toFrontmatterEnum,
	toFrontmatterNumber,
	toFrontmatterOptionalEnum,
	toFrontmatterScalar,
	toFrontmatterString,
	toFrontmatterStringArray,
	toFrontmatterStringOrNull,
} from './frontmatterValue';

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

// The second drift source: Obsidian's native property types. Retyping a field
// in the Properties UI rewrites it vault-wide, so a scalar field can arrive as a
// one-element list and a list field as a bare scalar.

describe('toFrontmatterScalar', () => {
	it('passes a non-array value through', () => {
		expect(toFrontmatterScalar('Work')).toBe('Work');
		expect(toFrontmatterScalar(3)).toBe(3);
		expect(toFrontmatterScalar(null)).toBeNull();
	});

	it('unwraps a one-element array (area retyped to List)', () => {
		expect(toFrontmatterScalar(['Work'])).toBe('Work');
	});

	it('takes the first element of a longer array', () => {
		expect(toFrontmatterScalar(['Work', 'Home'])).toBe('Work');
	});

	it('returns undefined for an empty array so callers fall back', () => {
		expect(toFrontmatterScalar([])).toBeUndefined();
	});
});

describe('toFrontmatterStringArray', () => {
	it('passes a string array through', () => {
		expect(toFrontmatterStringArray(['feature', 'bug'])).toEqual(['feature', 'bug']);
	});

	it('wraps a bare scalar (labels retyped to Text)', () => {
		// labels: feature  →  the single label must survive, not vanish.
		expect(toFrontmatterStringArray('feature')).toEqual(['feature']);
	});

	it('coerces non-string entries rather than dropping them', () => {
		expect(toFrontmatterStringArray([2026, true])).toEqual(['2026', 'true']);
	});

	it('drops null, undefined, and empty entries', () => {
		expect(toFrontmatterStringArray(['feature', null, undefined, '', {}])).toEqual(['feature']);
	});

	it('returns [] for an absent or empty value', () => {
		expect(toFrontmatterStringArray(undefined)).toEqual([]);
		expect(toFrontmatterStringArray(null)).toEqual([]);
		expect(toFrontmatterStringArray([])).toEqual([]);
		expect(toFrontmatterStringArray('')).toEqual([]);
	});
});

describe('toFrontmatterBoolean', () => {
	it('passes real booleans through', () => {
		expect(toFrontmatterBoolean(true)).toBe(true);
		expect(toFrontmatterBoolean(false)).toBe(false);
	});

	it('accepts the string spellings a Text-typed checkbox produces', () => {
		expect(toFrontmatterBoolean('true')).toBe(true);
		expect(toFrontmatterBoolean(' Yes ')).toBe(true);
		expect(toFrontmatterBoolean('false')).toBe(false);
		expect(toFrontmatterBoolean('no')).toBe(false);
	});

	it('treats a Number-typed value as 0 = false, anything else true', () => {
		expect(toFrontmatterBoolean(1)).toBe(true);
		expect(toFrontmatterBoolean(0)).toBe(false);
	});

	it('unwraps a List-typed value', () => {
		expect(toFrontmatterBoolean([true])).toBe(true);
	});

	it('falls back for absent or unrecognised values', () => {
		expect(toFrontmatterBoolean(undefined)).toBe(false);
		expect(toFrontmatterBoolean('maybe')).toBe(false);
		expect(toFrontmatterBoolean(undefined, true)).toBe(true);
	});
});

describe('toFrontmatterStringOrNull', () => {
	it('returns a non-empty string', () => {
		expect(toFrontmatterStringOrNull('09:30')).toBe('09:30');
	});

	it('unwraps a List-typed value', () => {
		expect(toFrontmatterStringOrNull(['weekly'])).toBe('weekly');
	});

	it('returns null for absent or empty values', () => {
		expect(toFrontmatterStringOrNull(undefined)).toBeNull();
		expect(toFrontmatterStringOrNull('')).toBeNull();
		expect(toFrontmatterStringOrNull([])).toBeNull();
	});
});

describe('toFrontmatterEnum', () => {
	const PRIORITIES = ['High', 'Medium', 'Low', 'None'] as const;

	it('passes an exact match through', () => {
		expect(toFrontmatterEnum('High', PRIORITIES, 'None')).toBe('High');
	});

	it('matches case- and whitespace-insensitively', () => {
		expect(toFrontmatterEnum('high', PRIORITIES, 'None')).toBe('High');
		expect(toFrontmatterEnum('  MEDIUM  ', PRIORITIES, 'None')).toBe('Medium');
	});

	it('unwraps a List-typed value (type: [project])', () => {
		expect(toFrontmatterEnum(['project'], ['task', 'project'] as const, 'task')).toBe('project');
	});

	it('falls back for an unknown, absent, or wrongly typed value', () => {
		expect(toFrontmatterEnum('Urgent', PRIORITIES, 'None')).toBe('None');
		expect(toFrontmatterEnum(undefined, PRIORITIES, 'None')).toBe('None');
		expect(toFrontmatterEnum(3, PRIORITIES, 'None')).toBe('None');
	});
});

describe('toFrontmatterOptionalEnum', () => {
	const OVERRIDES = ['urgent', 'mute'] as const;

	it('resolves a known value, case-insensitively', () => {
		expect(toFrontmatterOptionalEnum('mute', OVERRIDES)).toBe('mute');
		expect(toFrontmatterOptionalEnum('URGENT', OVERRIDES)).toBe('urgent');
	});

	it('returns null for anything unrecognised', () => {
		expect(toFrontmatterOptionalEnum('loud', OVERRIDES)).toBeNull();
		expect(toFrontmatterOptionalEnum(undefined, OVERRIDES)).toBeNull();
		expect(toFrontmatterOptionalEnum(true, OVERRIDES)).toBeNull();
	});
});
