/**
 * Pure helpers for the query editor UI.
 * No Obsidian deps — fully testable in Vitest.
 */

import type {
	FilterCondition,
	FilterField,
	FilterGroup,
	FilterOperator,
	GroupField,
	GroupSpec,
	QuerySpec,
	SortField,
	SortSpec,
} from './types';

export interface QueryEditorSettingsContext {
	statuses?: string[];
	areas?: string[];
	labelValues?: string[];
}

// ── Field lists for UI ────────────────────────────────────────────────────────

export const FILTER_FIELDS: FilterField[] = [
	'area', 'status', 'priority', 'labels', 'type',
	'due_date', 'start_date', 'created',
	'is_complete', 'is_inbox',
	'parent_task', 'depends_on', 'blocks', 'assigned_to',
];

export const SORT_FIELDS: SortField[] = [
	'name', 'due_date', 'due_time', 'start_date', 'created',
	'priority', 'status', 'area', 'type',
];

export const GROUP_FIELDS: GroupField[] = [
	'status', 'area', 'priority', 'type', 'due_date', 'parent_task',
];

// ── Field category helpers ────────────────────────────────────────────────────

type FieldCategory = 'enum' | 'boolean' | 'date' | 'array' | 'relationship' | 'relationship_array' | 'text';

const FIELD_CATEGORY: Record<FilterField, FieldCategory> = {
	area: 'enum',
	status: 'enum',
	priority: 'enum',
	type: 'enum',
	labels: 'array',
	due_date: 'date',
	due_time: 'date',
	start_date: 'date',
	created: 'date',
	is_complete: 'boolean',
	is_inbox: 'boolean',
	parent_task: 'relationship',
	depends_on: 'relationship_array',
	blocks: 'relationship_array',
	assigned_to: 'text',
};

const ENUM_OPS: FilterOperator[] = ['is', 'is_not', 'is_null', 'is_not_null'];
const DATE_OPS: FilterOperator[] = ['before', 'after', 'within_days', 'is_null', 'is_not_null'];
const ARRAY_OPS: FilterOperator[] = ['contains', 'not_contains', 'contains_any', 'contains_all', 'is_null', 'is_not_null'];
const BOOLEAN_OPS: FilterOperator[] = ['is'];
const RELATIONSHIP_OPS: FilterOperator[] = ['is', 'is_not', 'is_null', 'is_not_null'];
const RELATIONSHIP_ARRAY_OPS: FilterOperator[] = ['contains', 'is_null', 'is_not_null'];
const TEXT_OPS: FilterOperator[] = ['is', 'is_not', 'contains', 'not_contains', 'is_null', 'is_not_null'];

// ── operatorsForField ─────────────────────────────────────────────────────────

export function operatorsForField(field: FilterField): FilterOperator[] {
	switch (FIELD_CATEGORY[field]) {
		case 'enum': return ENUM_OPS;
		case 'date': return DATE_OPS;
		case 'array': return ARRAY_OPS;
		case 'boolean': return BOOLEAN_OPS;
		case 'relationship': return RELATIONSHIP_OPS;
		case 'relationship_array': return RELATIONSHIP_ARRAY_OPS;
		case 'text': return TEXT_OPS;
	}
}

// ── valueInputKind ────────────────────────────────────────────────────────────

export type ValueInputKind = 'text' | 'select' | 'none' | 'number' | 'date';

export function valueInputKind(field: FilterField, operator: FilterOperator): ValueInputKind {
	if (operator === 'is_null' || operator === 'is_not_null') return 'none';
	if (operator === 'within_days') return 'number';
	if (field === 'labels' && (operator === 'contains' || operator === 'not_contains')) return 'select';

	const category = FIELD_CATEGORY[field];

	if (operator === 'before' || operator === 'after') {
		if (category === 'date') return 'date';
	}

	if (category === 'enum') return 'select';
	if (category === 'boolean') return 'select';

	return 'text';
}

// ── selectOptionsForField ─────────────────────────────────────────────────────

export function selectOptionsForField(
	field: FilterField,
	settings: QueryEditorSettingsContext,
): string[] {
	switch (field) {
		case 'status': return settings.statuses ?? [];
		case 'area': return settings.areas ?? [];
		case 'priority': return ['High', 'Medium', 'Low', 'None'];
		case 'type': return ['task', 'project'];
		case 'is_complete':
		case 'is_inbox': return ['true', 'false'];
		case 'labels': return settings.labelValues ?? [];
		default: return [];
	}
}

// ── validateQuerySpec ─────────────────────────────────────────────────────────

function isValidLogic(v: unknown): v is 'and' | 'or' {
	return v === 'and' || v === 'or';
}

function isValidGroupKind(v: unknown): v is GroupSpec['kind'] {
	return v === 'none' || v === 'field' || v === 'date_buckets';
}

function isValidSortDirection(v: unknown): v is 'asc' | 'desc' {
	return v === 'asc' || v === 'desc';
}

function isValidSortScope(v: unknown): v is 'global' | 'within_groups' {
	return v === 'global' || v === 'within_groups';
}

function isFilterGroup(v: unknown): v is FilterGroup {
	if (!v || typeof v !== 'object') return false;
	const o = v as Record<string, unknown>;
	if (!isValidLogic(o.logic)) return false;
	if (!Array.isArray(o.conditions)) return false;
	return true;
}

function isValidGroupSpec(v: unknown): v is GroupSpec {
	if (!v || typeof v !== 'object') return false;
	const o = v as Record<string, unknown>;
	if (!isValidGroupKind(o.kind)) return false;
	return true;
}

function isValidSortSpec(v: unknown): v is SortSpec {
	if (!Array.isArray(v)) return false;
	for (const entry of v) {
		if (!entry || typeof entry !== 'object') return false;
		const e = entry as Record<string, unknown>;
		if (typeof e.field !== 'string') return false;
		if (!isValidSortDirection(e.direction)) return false;
	}
	return true;
}

export function validateQuerySpec(spec: unknown): spec is QuerySpec {
	if (!spec || typeof spec !== 'object') return false;
	const o = spec as Record<string, unknown>;

	if (!isFilterGroup(o.filter)) return false;
	if (!isValidSortSpec(o.sort)) return false;
	if (!isValidGroupSpec(o.group)) return false;

	if ('limit' in o && o.limit !== undefined && typeof o.limit !== 'number') return false;
	if ('limitPerGroup' in o && o.limitPerGroup !== undefined && typeof o.limitPerGroup !== 'number') return false;
	if ('search' in o && o.search !== undefined && typeof o.search !== 'string') return false;
	if ('sortScope' in o && o.sortScope !== undefined && !isValidSortScope(o.sortScope)) return false;

	return true;
}

// ── parseQuerySpecFromJson ────────────────────────────────────────────────────

export type ParseResult<T> =
	| { ok: true; value: T }
	| { ok: false; error: string };

export function parseQuerySpecFromJson(text: string): ParseResult<QuerySpec> {
	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch (e) {
		return { ok: false, error: `Invalid JSON: ${(e as Error).message}` };
	}

	if (!validateQuerySpec(parsed)) {
		return { ok: false, error: 'Invalid QuerySpec: missing or malformed filter, sort, or group field.' };
	}

	return { ok: true, value: parsed };
}

// ── emptyFilterGroup / emptyFilterCondition ───────────────────────────────────

export function emptyFilterGroup(): FilterGroup {
	return { logic: 'and', conditions: [] };
}

export function emptyFilterCondition(): FilterCondition {
	return { field: 'status', operator: 'is', value: '' };
}

// ── filterGroupDepth ──────────────────────────────────────────────────────────

export function filterGroupDepth(group: FilterGroup): number {
	let maxChildDepth = 0;
	for (const item of group.conditions) {
		if ('logic' in item) {
			const d = filterGroupDepth(item as FilterGroup);
			if (d > maxChildDepth) maxChildDepth = d;
		}
	}
	return 1 + maxChildDepth;
}
