import { describe, expect, it } from 'vitest';
import { buildDepCountBadge, isFieldEnabled, type KanbanCardField } from './kanbanCardFields';

describe('buildDepCountBadge', () => {
	it('returns null when task has no relationships', () => {
		expect(buildDepCountBadge({ depends_on: [], blocks: [] })).toBeNull();
	});

	it('returns blockedBy count when task has depends_on only', () => {
		const result = buildDepCountBadge({ depends_on: ['Tasks/a.md', 'Tasks/b.md'], blocks: [] });
		expect(result).toEqual({ blockedBy: 2, unblocks: 0 });
	});

	it('returns unblocks count when task has blocks only', () => {
		const result = buildDepCountBadge({ depends_on: [], blocks: ['Tasks/c.md'] });
		expect(result).toEqual({ blockedBy: 0, unblocks: 1 });
	});

	it('returns both counts when task has both relationships', () => {
		const result = buildDepCountBadge({
			depends_on: ['Tasks/a.md'],
			blocks: ['Tasks/b.md', 'Tasks/c.md'],
		});
		expect(result).toEqual({ blockedBy: 1, unblocks: 2 });
	});

	it('counts raw array length, not resolved tasks', () => {
		const result = buildDepCountBadge({
			depends_on: ['a', 'b', 'c'],
			blocks: [],
		});
		expect(result?.blockedBy).toBe(3);
	});
});

describe('isFieldEnabled', () => {
	it('returns true when field is in the list', () => {
		const fields: KanbanCardField[] = ['area', 'dueDate'];
		expect(isFieldEnabled(fields, 'area')).toBe(true);
		expect(isFieldEnabled(fields, 'dueDate')).toBe(true);
	});

	it('returns false when field is not in the list', () => {
		const fields: KanbanCardField[] = ['area', 'dueDate'];
		expect(isFieldEnabled(fields, 'labels')).toBe(false);
		expect(isFieldEnabled(fields, 'depCount')).toBe(false);
	});

	it('returns true for all fields when list is undefined (backward compat)', () => {
		expect(isFieldEnabled(undefined, 'area')).toBe(true);
		expect(isFieldEnabled(undefined, 'depCount')).toBe(true);
	});

	it('returns true for all fields when list is empty (backward compat)', () => {
		expect(isFieldEnabled([], 'labels')).toBe(true);
		expect(isFieldEnabled([], 'dueDate')).toBe(true);
	});

	it('returns true for a single-element list matching the field', () => {
		expect(isFieldEnabled(['depCount'], 'depCount')).toBe(true);
		expect(isFieldEnabled(['depCount'], 'area')).toBe(false);
	});
});
