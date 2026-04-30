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

export type ValueInputKind = 'text' | 'select' | 'none' | 'number' | 'date' | 'checklist';

export function valueInputKind(field: FilterField, operator: FilterOperator): ValueInputKind {
	if (operator === 'is_null' || operator === 'is_not_null') return 'none';
	if (operator === 'within_days') return 'number';
	if (field === 'labels' && (operator === 'contains' || operator === 'not_contains')) return 'select';
	if (field === 'labels' && (operator === 'contains_any' || operator === 'contains_all')) return 'checklist';

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

function isRecord(v: unknown): v is Record<string, unknown> {
	return !!v && typeof v === 'object' && !Array.isArray(v);
}

function isKnownFilterField(v: unknown): v is FilterField {
	return typeof v === 'string' && FILTER_FIELDS.includes(v as FilterField);
}

function isKnownSortField(v: unknown): v is SortField {
	return typeof v === 'string' && SORT_FIELDS.includes(v as SortField);
}

function isKnownGroupField(v: unknown): v is GroupField {
	return typeof v === 'string' && GROUP_FIELDS.includes(v as GroupField);
}

function isValidFilterValue(v: unknown): v is FilterCondition['value'] {
	if (v === undefined) return true;
	if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return true;
	if (Array.isArray(v)) return v.every((item) => typeof item === 'string');
	return false;
}

function validateFilterCondition(v: unknown, path: string): string | null {
	if (!isRecord(v)) return `${path} must be an object`;
	if (!isKnownFilterField(v.field)) return `${path}.field must be one of: ${FILTER_FIELDS.join(', ')}`;
	if (typeof v.operator !== 'string') return `${path}.operator must be a string`;
	const validOperators = operatorsForField(v.field);
	if (!validOperators.includes(v.operator as FilterOperator)) {
		return `${path}.operator '${String(v.operator)}' is not valid for field '${v.field}'`;
	}
	if (!isValidFilterValue(v.value)) {
		return `${path}.value must be string, number, boolean, string[] or undefined`;
	}
	if ((v.operator === 'contains_any' || v.operator === 'contains_all') && !Array.isArray(v.value)) {
		return `${path}.value must be a string[] for operator '${v.operator}'`;
	}
	if (v.operator === 'within_days' && typeof v.value !== 'number') {
		return `${path}.value must be a number for operator 'within_days'`;
	}
	return null;
}

function validateFilterNode(v: unknown, path: string): string | null {
	if (!isRecord(v)) return `${path} must be an object`;
	if ('logic' in v && 'conditions' in v) {
		if (!isValidLogic(v.logic)) return `${path}.logic must be 'and' or 'or'`;
		if (!Array.isArray(v.conditions)) return `${path}.conditions must be an array`;
		for (let i = 0; i < v.conditions.length; i += 1) {
			const err = validateFilterNode(v.conditions[i], `${path}.conditions[${i}]`);
			if (err) return err;
		}
		return null;
	}
	return validateFilterCondition(v, path);
}

function validateGroupSpec(v: unknown): string | null {
	if (!isRecord(v)) return `group must be an object`;
	if (!isValidGroupKind(v.kind)) return `group.kind must be one of: none, field, date_buckets`;
	if (v.kind === 'none') return null;
	if (v.kind === 'field') {
		if (!isKnownGroupField(v.field)) {
			return `group.field must be one of: ${GROUP_FIELDS.join(', ')} when group.kind is 'field'`;
		}
		return null;
	}
	if (v.field !== 'due_date' || v.preset !== 'agenda') {
		return `group must be { kind: 'date_buckets', field: 'due_date', preset: 'agenda' }`;
	}
	return null;
}

function validateSortSpec(v: unknown): string | null {
	if (!Array.isArray(v)) return `sort must be an array`;
	for (let i = 0; i < v.length; i += 1) {
		const entry = v[i];
		if (!isRecord(entry)) return `sort[${i}] must be an object`;
		if (!isKnownSortField(entry.field)) {
			return `sort[${i}].field must be one of: ${SORT_FIELDS.join(', ')}`;
		}
		if (!isValidSortDirection(entry.direction)) {
			return `sort[${i}].direction must be 'asc' or 'desc'`;
		}
	}
	return null;
}

function validateQuerySpecError(spec: unknown): string | null {
	if (!isRecord(spec)) return `QuerySpec must be an object`;
	if (!('filter' in spec)) return `Missing required field: filter`;
	if (!('sort' in spec)) return `Missing required field: sort`;
	if (!('group' in spec)) return `Missing required field: group`;

	const filterError = validateFilterNode(spec.filter, 'filter');
	if (filterError) return filterError;

	const sortError = validateSortSpec(spec.sort);
	if (sortError) return sortError;

	const groupError = validateGroupSpec(spec.group);
	if (groupError) return groupError;

	if ('limit' in spec && spec.limit !== undefined && typeof spec.limit !== 'number') {
		return `limit must be a number when provided`;
	}
	if ('limitPerGroup' in spec && spec.limitPerGroup !== undefined && typeof spec.limitPerGroup !== 'number') {
		return `limitPerGroup must be a number when provided`;
	}
	if ('search' in spec && spec.search !== undefined && typeof spec.search !== 'string') {
		return `search must be a string when provided`;
	}
	if ('sortScope' in spec && spec.sortScope !== undefined && !isValidSortScope(spec.sortScope)) {
		return `sortScope must be 'global' or 'within_groups'`;
	}

	return null;
}

export function validateQuerySpec(spec: unknown): spec is QuerySpec {
	return validateQuerySpecError(spec) === null;
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
		const reason = validateQuerySpecError(parsed) ?? 'Unknown QuerySpec validation error';
		return { ok: false, error: `Invalid QuerySpec: ${reason}` };
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
