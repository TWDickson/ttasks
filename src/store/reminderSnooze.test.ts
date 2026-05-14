import { describe, expect, it } from 'vitest';
import { isSnoozed, purgeSnoozed, snoozeTask, unsnoozeTask } from './reminderSnooze';

const NOW = new Date('2026-05-14T10:00:00Z');
const PATH = 'Tasks/abc-task.md';

describe('snoozeTask', () => {
	it('adds a snooze entry with correct until timestamp', () => {
		const result = snoozeTask({}, PATH, 4, NOW);
		const expected = new Date(NOW.getTime() + 4 * 3_600_000).toISOString();
		expect(result[PATH]).toBe(expected);
	});

	it('does not mutate the original state', () => {
		const original = { 'other.md': '2099-01-01T00:00:00.000Z' };
		snoozeTask(original, PATH, 4, NOW);
		expect('Tasks/abc-task.md' in original).toBe(false);
	});

	it('preserves other snoozed tasks', () => {
		const original = { 'other.md': '2099-01-01T00:00:00.000Z' };
		const result = snoozeTask(original, PATH, 4, NOW);
		expect(result['other.md']).toBe('2099-01-01T00:00:00.000Z');
	});

	it('overwrites an existing snooze for the same path', () => {
		const original = { [PATH]: '2026-05-14T12:00:00.000Z' };
		const result = snoozeTask(original, PATH, 8, NOW);
		const expected = new Date(NOW.getTime() + 8 * 3_600_000).toISOString();
		expect(result[PATH]).toBe(expected);
		expect(result[PATH]).not.toBe('2026-05-14T12:00:00.000Z');
	});
});

describe('unsnoozeTask', () => {
	it('removes the snooze entry for the given path', () => {
		const state = { [PATH]: '2099-01-01T00:00:00.000Z', 'other.md': '2099-01-01T00:00:00.000Z' };
		const result = unsnoozeTask(state, PATH);
		expect(PATH in result).toBe(false);
		expect('other.md' in result).toBe(true);
	});

	it('is safe when path is not in state', () => {
		const state = { 'other.md': '2099-01-01T00:00:00.000Z' };
		const result = unsnoozeTask(state, PATH);
		expect(Object.keys(result)).toEqual(['other.md']);
	});

	it('does not mutate the original state', () => {
		const original = { [PATH]: '2099-01-01T00:00:00.000Z' };
		unsnoozeTask(original, PATH);
		expect(PATH in original).toBe(true);
	});
});

describe('isSnoozed', () => {
	it('returns true when until is in the future', () => {
		const future = new Date(NOW.getTime() + 3_600_000).toISOString();
		expect(isSnoozed({ [PATH]: future }, PATH, NOW)).toBe(true);
	});

	it('returns false when until is in the past', () => {
		const past = new Date(NOW.getTime() - 3_600_000).toISOString();
		expect(isSnoozed({ [PATH]: past }, PATH, NOW)).toBe(false);
	});

	it('returns false when until equals now exactly', () => {
		expect(isSnoozed({ [PATH]: NOW.toISOString() }, PATH, NOW)).toBe(false);
	});

	it('returns false when path is not in state', () => {
		expect(isSnoozed({}, PATH, NOW)).toBe(false);
	});
});

describe('purgeSnoozed', () => {
	it('removes expired entries', () => {
		const past = new Date(NOW.getTime() - 3_600_000).toISOString();
		const state = { [PATH]: past };
		const result = purgeSnoozed(state, NOW);
		expect(PATH in result).toBe(false);
	});

	it('keeps active entries', () => {
		const future = new Date(NOW.getTime() + 3_600_000).toISOString();
		const state = { [PATH]: future };
		const result = purgeSnoozed(state, NOW);
		expect(result[PATH]).toBe(future);
	});

	it('handles mixed active and expired', () => {
		const past = new Date(NOW.getTime() - 1000).toISOString();
		const future = new Date(NOW.getTime() + 1000).toISOString();
		const state = { 'expired.md': past, 'active.md': future };
		const result = purgeSnoozed(state, NOW);
		expect('expired.md' in result).toBe(false);
		expect('active.md' in result).toBe(true);
	});

	it('returns empty object for empty input', () => {
		expect(purgeSnoozed({}, NOW)).toEqual({});
	});

	it('does not mutate the original state', () => {
		const future = new Date(NOW.getTime() + 3_600_000).toISOString();
		const original = { [PATH]: future };
		purgeSnoozed(original, NOW);
		expect(Object.keys(original)).toHaveLength(1);
	});
});
