import { describe, expect, it } from 'vitest';
import { buildDepCountBadge, isFieldEnabled, type KanbanCardField } from './kanbanCardFields';

describe('buildDepCountBadge', () => {
	// Default resolver: every dependency resolves to an open (incomplete) task.
	const allOpen = () => ({ is_complete: false });

	it('returns null when task has no relationships', () => {
		expect(buildDepCountBadge({ depends_on: [], blocks: [] }, allOpen)).toBeNull();
	});

	it('reports open and total blocked-by counts when task has depends_on only', () => {
		const result = buildDepCountBadge({ depends_on: ['Tasks/a.md', 'Tasks/b.md'], blocks: [] }, allOpen);
		expect(result).toEqual({ blockedByOpen: 2, blockedByTotal: 2, unblocks: 0 });
	});

	it('returns unblocks count when task has blocks only', () => {
		const result = buildDepCountBadge({ depends_on: [], blocks: ['Tasks/c.md'] }, allOpen);
		expect(result).toEqual({ blockedByOpen: 0, blockedByTotal: 0, unblocks: 1 });
	});

	it('excludes completed and dangling dependencies from the open count but keeps them in the total', () => {
		const completed = new Set(['Tasks/done.md']);
		const known = new Set(['Tasks/open.md', 'Tasks/done.md']);
		const resolve = (link: string) => (known.has(link) ? { is_complete: completed.has(link) } : null);
		const result = buildDepCountBadge(
			// open, done, and a dangling link
			{ depends_on: ['Tasks/open.md', 'Tasks/done.md', 'Tasks/missing.md'], blocks: [] },
			resolve,
		);
		expect(result).toEqual({ blockedByOpen: 1, blockedByTotal: 3, unblocks: 0 });
	});

	it('returns both counts when task has both relationships', () => {
		const result = buildDepCountBadge({ depends_on: ['Tasks/a.md'], blocks: ['Tasks/b.md', 'Tasks/c.md'] }, allOpen);
		expect(result).toEqual({ blockedByOpen: 1, blockedByTotal: 1, unblocks: 2 });
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
