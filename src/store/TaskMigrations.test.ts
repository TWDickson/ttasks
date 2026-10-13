import { describe, expect, it } from 'vitest';
import { isInvalidStatus, remapLabels } from './TaskMigrations';

describe('isInvalidStatus', () => {
	it('returns true when status is missing', () => {
		expect(isInvalidStatus(undefined, ['Active', 'Done'])).toBe(true);
	});

	it('returns true when status is not in the valid list', () => {
		expect(isInvalidStatus('Archived', ['Active', 'Done'])).toBe(true);
	});

	it('returns false when status is valid', () => {
		expect(isInvalidStatus('Active', ['Active', 'Done'])).toBe(false);
	});

	it('returns true for empty string status', () => {
		expect(isInvalidStatus('', ['Active', 'Done'])).toBe(true);
	});
});

describe('remapLabels', () => {
	it('renames a label in the list', () => {
		expect(remapLabels(['bug', 'feature'], { bug: 'defect' })).toEqual(['defect', 'feature']);
	});
	it('removes a label mapped to null', () => {
		expect(remapLabels(['bug', 'feature'], { bug: null })).toEqual(['feature']);
	});
	it('de-duplicates when a rename collides', () => {
		expect(remapLabels(['bug', 'defect'], { bug: 'defect' })).toEqual(['defect']);
	});
	it('reports no change when no label is mapped', () => {
		expect(remapLabels(['feature'], { bug: 'defect' })).toBeNull();
		expect(remapLabels(undefined, { bug: 'defect' })).toBeNull();
	});
	it('accepts a bare scalar (a retyped property)', () => {
		expect(remapLabels('bug', { bug: 'defect' })).toEqual(['defect']);
	});
});
