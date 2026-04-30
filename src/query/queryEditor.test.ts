import { describe, it, expect } from 'vitest';
import type { FilterField, GroupField, SortField } from './types';
import {
	FILTER_FIELDS,
	SORT_FIELDS,
	GROUP_FIELDS,
	operatorsForField,
	valueInputKind,
	selectOptionsForField,
	validateQuerySpec,
	parseQuerySpecFromJson,
	emptyFilterGroup,
	emptyFilterCondition,
	filterGroupDepth,
} from './queryEditor';

// ── minimal settings stub ────────────────────────────────────────────────────

const STUB_SETTINGS = {
	statuses: ['Active', 'In Progress', 'Done'],
	areas: ['Work', 'Personal'],
	labelValues: ['bug', 'feature'],
};

// ── FILTER_FIELDS / SORT_FIELDS / GROUP_FIELDS ────────────────────────────────

describe('FILTER_FIELDS', () => {
	it('contains all expected fields', () => {
		const expected: FilterField[] = [
			'area', 'status', 'priority', 'labels', 'type',
			'due_date', 'start_date', 'created',
			'is_complete', 'is_inbox',
			'parent_task', 'depends_on', 'blocks', 'assigned_to',
		];
		for (const field of expected) {
			expect(FILTER_FIELDS).toContain(field);
		}
	});
});

describe('SORT_FIELDS', () => {
	it('contains all expected fields', () => {
		const expected: SortField[] = ['name', 'due_date', 'priority', 'status', 'area', 'created'];
		for (const field of expected) {
			expect(SORT_FIELDS).toContain(field);
		}
	});
});

describe('GROUP_FIELDS', () => {
	it('contains all expected fields', () => {
		const expected: GroupField[] = ['status', 'area', 'priority', 'type', 'due_date', 'parent_task'];
		for (const field of expected) {
			expect(GROUP_FIELDS).toContain(field);
		}
	});
});

// ── operatorsForField ─────────────────────────────────────────────────────────

describe('operatorsForField', () => {
	it('returns is/is_not for status (enum select)', () => {
		const ops = operatorsForField('status');
		expect(ops).toContain('is');
		expect(ops).toContain('is_not');
		expect(ops).toContain('is_null');
		expect(ops).toContain('is_not_null');
		expect(ops).not.toContain('before');
		expect(ops).not.toContain('within_days');
	});

	it('returns date operators for due_date', () => {
		const ops = operatorsForField('due_date');
		expect(ops).toContain('before');
		expect(ops).toContain('after');
		expect(ops).toContain('within_days');
		expect(ops).toContain('is_null');
		expect(ops).toContain('is_not_null');
		expect(ops).not.toContain('contains');
	});

	it('returns array operators for labels', () => {
		const ops = operatorsForField('labels');
		expect(ops).toContain('contains');
		expect(ops).toContain('not_contains');
		expect(ops).toContain('contains_any');
		expect(ops).toContain('contains_all');
		expect(ops).toContain('is_null');
		expect(ops).toContain('is_not_null');
		expect(ops).not.toContain('before');
	});

	it('returns only is for boolean fields (is_complete, is_inbox)', () => {
		for (const field of ['is_complete', 'is_inbox'] as FilterField[]) {
			const ops = operatorsForField(field);
			expect(ops).toContain('is');
			expect(ops).not.toContain('is_not');
			expect(ops).not.toContain('before');
		}
	});

	it('returns relationship operators for parent_task', () => {
		const ops = operatorsForField('parent_task');
		expect(ops).toContain('is');
		expect(ops).toContain('is_not');
		expect(ops).toContain('is_null');
		expect(ops).toContain('is_not_null');
		expect(ops).not.toContain('contains');
		expect(ops).not.toContain('before');
	});

	it('returns relationship-array operators for depends_on and blocks', () => {
		for (const field of ['depends_on', 'blocks'] as FilterField[]) {
			const ops = operatorsForField(field);
			expect(ops).toContain('contains');
			expect(ops).toContain('is_null');
			expect(ops).toContain('is_not_null');
			expect(ops).not.toContain('before');
		}
	});

	it('returns text operators for assigned_to', () => {
		const ops = operatorsForField('assigned_to');
		expect(ops).toContain('is');
		expect(ops).toContain('is_not');
		expect(ops).toContain('contains');
		expect(ops).toContain('not_contains');
		expect(ops).toContain('is_null');
		expect(ops).toContain('is_not_null');
	});
});

// ── valueInputKind ────────────────────────────────────────────────────────────

describe('valueInputKind', () => {
	it('returns none for is_null / is_not_null regardless of field', () => {
		expect(valueInputKind('status', 'is_null')).toBe('none');
		expect(valueInputKind('due_date', 'is_null')).toBe('none');
		expect(valueInputKind('labels', 'is_not_null')).toBe('none');
	});

	it('returns select for enum fields with is/is_not', () => {
		expect(valueInputKind('status', 'is')).toBe('select');
		expect(valueInputKind('status', 'is_not')).toBe('select');
		expect(valueInputKind('priority', 'is')).toBe('select');
		expect(valueInputKind('priority', 'is_not')).toBe('select');
		expect(valueInputKind('type', 'is')).toBe('select');
		expect(valueInputKind('area', 'is')).toBe('select');
		expect(valueInputKind('area', 'is_not')).toBe('select');
	});

	it('returns select for boolean fields with is', () => {
		expect(valueInputKind('is_complete', 'is')).toBe('select');
		expect(valueInputKind('is_inbox', 'is')).toBe('select');
	});

	it('returns number for within_days', () => {
		expect(valueInputKind('due_date', 'within_days')).toBe('number');
		expect(valueInputKind('start_date', 'within_days')).toBe('number');
	});

	it('returns date for before/after on date fields', () => {
		expect(valueInputKind('due_date', 'before')).toBe('date');
		expect(valueInputKind('due_date', 'after')).toBe('date');
		expect(valueInputKind('start_date', 'before')).toBe('date');
	});

	it('returns select for single-label operators and checklist for multi-label operators', () => {
		expect(valueInputKind('labels', 'contains')).toBe('select');
		expect(valueInputKind('labels', 'not_contains')).toBe('select');
		expect(valueInputKind('labels', 'contains_any')).toBe('checklist');
		expect(valueInputKind('labels', 'contains_all')).toBe('checklist');
	});

	it('returns text for assigned_to is/contains', () => {
		expect(valueInputKind('assigned_to', 'is')).toBe('text');
		expect(valueInputKind('assigned_to', 'contains')).toBe('text');
	});
});

// ── selectOptionsForField ─────────────────────────────────────────────────────

describe('selectOptionsForField', () => {
	it('returns statuses for status field', () => {
		const opts = selectOptionsForField('status', STUB_SETTINGS);
		expect(opts).toEqual(['Active', 'In Progress', 'Done']);
	});

	it('returns areas for area field', () => {
		const opts = selectOptionsForField('area', STUB_SETTINGS);
		expect(opts).toEqual(['Work', 'Personal']);
	});

	it('returns priority values for priority field', () => {
		const opts = selectOptionsForField('priority', STUB_SETTINGS);
		expect(opts).toContain('High');
		expect(opts).toContain('Medium');
		expect(opts).toContain('Low');
		expect(opts).toContain('None');
	});

	it('returns task/project for type field', () => {
		const opts = selectOptionsForField('type', STUB_SETTINGS);
		expect(opts).toEqual(['task', 'project']);
	});

	it('returns true/false strings for boolean fields', () => {
		for (const field of ['is_complete', 'is_inbox'] as FilterField[]) {
			const opts = selectOptionsForField(field, STUB_SETTINGS);
			expect(opts).toEqual(['true', 'false']);
		}
	});

	it('returns labelValues for labels field', () => {
		const opts = selectOptionsForField('labels', STUB_SETTINGS);
		expect(opts).toEqual(['bug', 'feature']);
	});

	it('returns empty array for fields with no select options', () => {
		expect(selectOptionsForField('assigned_to', STUB_SETTINGS)).toEqual([]);
		expect(selectOptionsForField('due_date', STUB_SETTINGS)).toEqual([]);
	});
});

// ── validateQuerySpec ─────────────────────────────────────────────────────────

describe('validateQuerySpec', () => {
	const validSpec = {
		filter: { logic: 'and', conditions: [] },
		sort: [],
		group: { kind: 'none' },
	};

	it('accepts a minimal valid QuerySpec', () => {
		expect(validateQuerySpec(validSpec)).toBe(true);
	});

	it('accepts a QuerySpec with conditions', () => {
		const spec = {
			filter: {
				logic: 'and',
				conditions: [
					{ field: 'status', operator: 'is', value: 'Active' },
				],
			},
			sort: [{ field: 'due_date', direction: 'asc' }],
			group: { kind: 'field', field: 'status' },
		};
		expect(validateQuerySpec(spec)).toBe(true);
	});

	it('accepts optional limit and search', () => {
		const spec = { ...validSpec, limit: 10, search: 'hello' };
		expect(validateQuerySpec(spec)).toBe(true);
	});

	it('accepts optional sortScope', () => {
		const spec = { ...validSpec, sortScope: 'within_groups' };
		expect(validateQuerySpec(spec)).toBe(true);
	});

	it('rejects null', () => {
		expect(validateQuerySpec(null)).toBe(false);
	});

	it('rejects missing filter', () => {
		expect(validateQuerySpec({ sort: [], group: { kind: 'none' } })).toBe(false);
	});

	it('rejects invalid filter logic', () => {
		const spec = { filter: { logic: 'xor', conditions: [] }, sort: [], group: { kind: 'none' } };
		expect(validateQuerySpec(spec)).toBe(false);
	});

	it('rejects sort with unknown direction', () => {
		const spec = { ...validSpec, sort: [{ field: 'name', direction: 'sideways' }] };
		expect(validateQuerySpec(spec)).toBe(false);
	});

	it('rejects sort with unknown field', () => {
		const spec = { ...validSpec, sort: [{ field: 'random', direction: 'asc' }] };
		expect(validateQuerySpec(spec)).toBe(false);
	});

	it('rejects unknown group kind', () => {
		const spec = { ...validSpec, group: { kind: 'random' } };
		expect(validateQuerySpec(spec)).toBe(false);
	});

	it('rejects malformed field group payload', () => {
		const spec = { ...validSpec, group: { kind: 'field' } };
		expect(validateQuerySpec(spec)).toBe(false);
	});

	it('rejects malformed date bucket payload', () => {
		const spec = { ...validSpec, group: { kind: 'date_buckets', field: 'start_date', preset: 'agenda' } };
		expect(validateQuerySpec(spec)).toBe(false);
	});

	it('rejects invalid sortScope', () => {
		const spec = { ...validSpec, sortScope: 'weird' };
		expect(validateQuerySpec(spec)).toBe(false);
	});

	it('rejects unknown filter condition field', () => {
		const spec = {
			...validSpec,
			filter: {
				logic: 'and',
				conditions: [{ field: 'random', operator: 'is', value: 'x' }],
			},
		};
		expect(validateQuerySpec(spec)).toBe(false);
	});

	it('rejects operator not valid for field', () => {
		const spec = {
			...validSpec,
			filter: {
				logic: 'and',
				conditions: [{ field: 'is_complete', operator: 'contains', value: 'true' }],
			},
		};
		expect(validateQuerySpec(spec)).toBe(false);
	});

	it('rejects contains_any with non-array value', () => {
		const spec = {
			...validSpec,
			filter: {
				logic: 'and',
				conditions: [{ field: 'labels', operator: 'contains_any', value: 'bug' }],
			},
		};
		expect(validateQuerySpec(spec)).toBe(false);
	});

	it('rejects malformed nested filter groups', () => {
		const spec = {
			...validSpec,
			filter: {
				logic: 'and',
				conditions: [{ logic: 'and', conditions: [{ foo: 'bar' }] }],
			},
		};
		expect(validateQuerySpec(spec)).toBe(false);
	});
});

// ── parseQuerySpecFromJson ────────────────────────────────────────────────────

describe('parseQuerySpecFromJson', () => {
	const validJson = JSON.stringify({
		filter: { logic: 'and', conditions: [] },
		sort: [],
		group: { kind: 'none' },
	});

	it('returns ok: true for valid JSON QuerySpec', () => {
		const result = parseQuerySpecFromJson(validJson);
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.value.filter.logic).toBe('and');
		}
	});

	it('returns ok: false for invalid JSON', () => {
		const result = parseQuerySpecFromJson('{ not valid json }');
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toMatch(/json/i);
		}
	});

	it('returns ok: false when valid JSON but invalid QuerySpec shape', () => {
		const result = parseQuerySpecFromJson(JSON.stringify({ filter: null }));
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toMatch(/invalid/i);
		}
	});

	it('returns a specific error for malformed group payload', () => {
		const result = parseQuerySpecFromJson(JSON.stringify({
			filter: { logic: 'and', conditions: [] },
			sort: [],
			group: { kind: 'field' },
		}));
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toContain('group.field');
		}
	});

	it('returns a specific error for invalid operator/field combination', () => {
		const result = parseQuerySpecFromJson(JSON.stringify({
			filter: {
				logic: 'and',
				conditions: [{ field: 'is_complete', operator: 'contains', value: 'true' }],
			},
			sort: [],
			group: { kind: 'none' },
		}));
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toContain(`filter.conditions[0].operator`);
		}
	});

	it('returns a specific error for invalid sort field', () => {
		const result = parseQuerySpecFromJson(JSON.stringify({
			filter: { logic: 'and', conditions: [] },
			sort: [{ field: 'wat', direction: 'asc' }],
			group: { kind: 'none' },
		}));
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toContain('sort[0].field');
		}
	});
});

// ── emptyFilterGroup / emptyFilterCondition ───────────────────────────────────

describe('emptyFilterGroup', () => {
	it('returns an and group with no conditions', () => {
		const g = emptyFilterGroup();
		expect(g.logic).toBe('and');
		expect(g.conditions).toHaveLength(0);
	});
});

describe('emptyFilterCondition', () => {
	it('returns a condition with sensible defaults', () => {
		const c = emptyFilterCondition();
		expect(c.field).toBeDefined();
		expect(c.operator).toBeDefined();
	});
});

// ── filterGroupDepth ──────────────────────────────────────────────────────────

describe('filterGroupDepth', () => {
	it('returns 1 for a flat group with conditions only', () => {
		const g = {
			logic: 'and' as const,
			conditions: [{ field: 'status' as const, operator: 'is' as const, value: 'Active' }],
		};
		expect(filterGroupDepth(g)).toBe(1);
	});

	it('returns 2 for one level of nesting', () => {
		const g = {
			logic: 'and' as const,
			conditions: [
				{ logic: 'or' as const, conditions: [] },
			],
		};
		expect(filterGroupDepth(g)).toBe(2);
	});

	it('returns 3 for two levels of nesting', () => {
		const g = {
			logic: 'and' as const,
			conditions: [
				{
					logic: 'or' as const,
					conditions: [
						{ logic: 'and' as const, conditions: [] },
					],
				},
			],
		};
		expect(filterGroupDepth(g)).toBe(3);
	});
});
