import { describe, expect, it } from 'vitest';
import {
	needsCssClassMigration,
	applyNormalizeCssClasses,
	resolveStatusChangedFallback,
	needsStatusChangedMigration,
	needsPhase6Migration,
	applyPhase6Migration,
	isInvalidStatus,
} from './TaskMigrations';

describe('needsCssClassMigration', () => {
	it('returns true when cssclasses is undefined', () => {
		expect(needsCssClassMigration(undefined)).toBe(true);
	});

	it('returns true when cssclasses is empty array', () => {
		expect(needsCssClassMigration([])).toBe(true);
	});

	it('returns true when cssclasses is array without ttask', () => {
		expect(needsCssClassMigration(['planner-task'])).toBe(true);
	});

	it('returns false when cssclasses already contains ttask', () => {
		expect(needsCssClassMigration(['ttask'])).toBe(false);
	});

	it('returns false when cssclasses is string "ttask"', () => {
		expect(needsCssClassMigration('ttask')).toBe(false);
	});

	it('returns true when cssclasses is a non-ttask string', () => {
		expect(needsCssClassMigration('planner-task')).toBe(true);
	});
});

describe('applyNormalizeCssClasses', () => {
	it('appends ttask to existing array', () => {
		expect(applyNormalizeCssClasses(['planner-task'])).toEqual(['planner-task', 'ttask']);
	});

	it('returns [ttask] when undefined', () => {
		expect(applyNormalizeCssClasses(undefined)).toEqual(['ttask']);
	});

	it('converts string to array and appends ttask', () => {
		expect(applyNormalizeCssClasses('planner-task')).toEqual(['planner-task', 'ttask']);
	});
});

describe('needsStatusChangedMigration', () => {
	it('returns true when status_changed is missing', () => {
		expect(needsStatusChangedMigration({})).toBe(true);
	});

	it('returns true when status_changed is empty string', () => {
		expect(needsStatusChangedMigration({ status_changed: '' })).toBe(true);
	});

	it('returns false when status_changed is already set', () => {
		expect(needsStatusChangedMigration({ status_changed: '2024-01-01' })).toBe(false);
	});
});

describe('resolveStatusChangedFallback', () => {
	it('uses start_date when available', () => {
		const fm = { start_date: '2024-01-05', created: '2024-01-01' };
		expect(resolveStatusChangedFallback(fm, '2024-06-01')).toBe('2024-01-05');
	});

	it('falls back to created when start_date is missing', () => {
		const fm = { created: '2024-01-01' };
		expect(resolveStatusChangedFallback(fm, '2024-06-01')).toBe('2024-01-01');
	});

	it('falls back to today when both are missing', () => {
		expect(resolveStatusChangedFallback({}, '2024-06-01')).toBe('2024-06-01');
	});

	it('skips start_date if it is not a string', () => {
		const fm = { start_date: null, created: '2024-01-01' };
		expect(resolveStatusChangedFallback(fm, '2024-06-01')).toBe('2024-01-01');
	});
});

describe('needsPhase6Migration', () => {
	it('returns true when category is present without area', () => {
		expect(needsPhase6Migration({ category: 'Work' })).toBe(true);
	});

	it('returns true when task_type is present without labels', () => {
		expect(needsPhase6Migration({ task_type: 'bug' })).toBe(true);
	});

	it('returns false when already using area + labels', () => {
		expect(needsPhase6Migration({ area: 'Work', labels: ['bug'] })).toBe(false);
	});

	it('returns false when neither old nor new fields are present', () => {
		expect(needsPhase6Migration({})).toBe(false);
	});

	it('returns false when category AND area both exist (already partially migrated)', () => {
		expect(needsPhase6Migration({ category: 'Work', area: 'Work' })).toBe(false);
	});
});

describe('applyPhase6Migration', () => {
	it('migrates category to area', () => {
		const fm: Record<string, unknown> = { category: 'Work' };
		const changed = applyPhase6Migration(fm);
		expect(changed).toBe(true);
		expect(fm.area).toBe('Work');
		expect('category' in fm).toBe(false);
	});

	it('migrates task_type to labels array', () => {
		const fm: Record<string, unknown> = { task_type: 'bug' };
		const changed = applyPhase6Migration(fm);
		expect(changed).toBe(true);
		expect(fm.labels).toEqual(['bug']);
		expect('task_type' in fm).toBe(false);
	});

	it('converts null task_type to empty labels array', () => {
		const fm: Record<string, unknown> = { task_type: null };
		applyPhase6Migration(fm);
		expect(fm.labels).toEqual([]);
	});

	it('skips migration when area already exists', () => {
		const fm: Record<string, unknown> = { category: 'Work', area: 'Existing' };
		const changed = applyPhase6Migration(fm);
		expect(changed).toBe(false);
		expect(fm.area).toBe('Existing');
		expect('category' in fm).toBe(true);
	});

	it('returns false when nothing needs migration', () => {
		const fm: Record<string, unknown> = { area: 'Work', labels: ['bug'] };
		expect(applyPhase6Migration(fm)).toBe(false);
	});

	it('is idempotent — applying twice yields same result', () => {
		const fm: Record<string, unknown> = { category: 'Work', task_type: 'bug' };
		applyPhase6Migration(fm);
		const fmCopy = { ...fm };
		const secondChanged = applyPhase6Migration(fm);
		expect(secondChanged).toBe(false);
		expect(fm).toEqual(fmCopy);
	});
});

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
