import { describe, expect, it } from 'vitest';
import type { QuerySpec } from '../query/types';
import { DEFAULT_SETTINGS, type CustomTaskViewDefinition } from '../settings';
import {
	coerceQueryForRenderer,
	createCustomViewDefinition,
	getRegisteredTaskViews,
	isGroupCompatibleWithRenderer,
	resolveTaskViewDefinition,
	resolveTaskViewId,
	resolveTaskViewIcon,
} from './viewRegistry';

function makeCustomView(overrides: Partial<CustomTaskViewDefinition> = {}): CustomTaskViewDefinition {
	return {
		id: 'custom-focus',
		name: 'Focus',
		icon: null,
		renderer: 'list',
		query: {
			filter: { logic: 'and', conditions: [{ field: 'priority', operator: 'is', value: 'High' }] },
			sort: [],
			group: { kind: 'field', field: 'status' },
		},
		presentation: {
			hierarchy: 'tree',
			graphMode: 'dependency',
		},
		...overrides,
	};
}

describe('getRegisteredTaskViews', () => {
	it('returns built-in views first, then custom views using the same shape', () => {
		const views = getRegisteredTaskViews({
			...DEFAULT_SETTINGS,
			customViews: [makeCustomView()],
		});

		expect(views.map((view) => view.id)).toEqual(['list', 'inbox', 'today', 'blocked', 'kanban', 'agenda', 'graph', 'custom-focus']);
		expect(views[0]).toMatchObject({ source: 'builtin', renderer: 'list', name: 'All' });
		expect(views[7]).toMatchObject({ source: 'custom', renderer: 'list', name: 'Focus' });
		expect(views[7].query.group).toEqual({ kind: 'field', field: 'status' });
	});
});

describe('resolveTaskViewDefinition', () => {
	it('finds both built-in and custom views by id', () => {
		const settings = {
			...DEFAULT_SETTINGS,
			customViews: [makeCustomView()],
		};

		expect(resolveTaskViewDefinition(settings, 'agenda')).toMatchObject({ id: 'agenda', source: 'builtin' });
		expect(resolveTaskViewDefinition(settings, 'custom-focus')).toMatchObject({ id: 'custom-focus', source: 'custom' });
		expect(resolveTaskViewDefinition(settings, 'missing')).toBeNull();
	});
});

describe('resolveTaskViewId', () => {
	it('falls back to the default list view when the requested id does not exist', () => {
		const settings = {
			...DEFAULT_SETTINGS,
			customViews: [makeCustomView()],
		};

		expect(resolveTaskViewId(settings, 'custom-focus')).toBe('custom-focus');
		expect(resolveTaskViewId(settings, 'missing')).toBe('list');
		expect(resolveTaskViewId(settings, null)).toBe('list');
	});
});

describe('createCustomViewDefinition', () => {
	it('creates a new custom view from the built-in list model with a unique id', () => {
		const created = createCustomViewDefinition([
			makeCustomView({ id: 'custom-view-1', name: 'First' }),
			makeCustomView({ id: 'custom-view-2', name: 'Second' }),
		]);

		expect(created).toMatchObject({
			id: 'custom-view-3',
			name: 'New View 3',
			renderer: 'list',
			presentation: { hierarchy: 'tree', graphMode: 'dependency' },
		});
		expect(created.query.group).toEqual({ kind: 'field', field: 'status' });
	});
});

describe('resolveTaskViewIcon', () => {
	it('falls back to the renderer icon when a custom icon is not set', () => {
		const custom = makeCustomView({ icon: null, renderer: 'graph' });
		const customWithIcon = makeCustomView({ icon: 'flame' });

		expect(resolveTaskViewIcon(custom)).toBe('git-branch-plus');
		expect(resolveTaskViewIcon(customWithIcon)).toBe('flame');
	});
});

describe('renderer query coercion', () => {
	it('forces agenda views onto agenda date buckets while preserving other query fields', () => {
		const query: QuerySpec = {
			filter: { logic: 'and' as const, conditions: [{ field: 'priority', operator: 'is', value: 'High' }] },
			sort: [{ field: 'due_date', direction: 'asc' as const }],
			group: { kind: 'field' as const, field: 'status' as const },
			search: 'focus',
		};

		const coerced = coerceQueryForRenderer('agenda', query);

		expect(coerced.group).toEqual({ kind: 'date_buckets', field: 'due_date', preset: 'agenda' });
		expect(coerced.filter).toEqual(query.filter);
		expect(coerced.sort).toEqual(query.sort);
		expect(coerced.search).toBe('focus');
	});

	it('forces kanban views onto status grouping', () => {
		const coerced = coerceQueryForRenderer('kanban', {
			filter: { logic: 'and', conditions: [] },
			sort: [],
			group: { kind: 'none' },
		});

		expect(coerced.group).toEqual({ kind: 'field', field: 'status' });
	});

	it('reports compatibility correctly for constrained renderers', () => {
		expect(isGroupCompatibleWithRenderer('agenda', { kind: 'date_buckets', field: 'due_date', preset: 'agenda' })).toBe(true);
		expect(isGroupCompatibleWithRenderer('agenda', { kind: 'field', field: 'status' })).toBe(false);
		expect(isGroupCompatibleWithRenderer('kanban', { kind: 'field', field: 'status' })).toBe(true);
		expect(isGroupCompatibleWithRenderer('kanban', { kind: 'field', field: 'area' })).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// Smart List lifecycle integration
// These tests mirror the add / edit / delete flows in TaskBoard.svelte, using
// plain settings mutations and registry helpers (no Svelte rendering needed).
// ---------------------------------------------------------------------------
describe('Smart List lifecycle', () => {
	function baseSettings() {
		return { ...DEFAULT_SETTINGS, customViews: [] as ReturnType<typeof makeCustomView>[] };
	}

	// ── Add ──────────────────────────────────────────────────────────────────
	it('add: newly created view appears in getRegisteredTaskViews and is resolvable', () => {
		const settings = baseSettings();

		const created = createCustomViewDefinition(settings.customViews);
		settings.customViews = [...settings.customViews, created];

		const views = getRegisteredTaskViews(settings);
		const ids = views.map((v) => v.id);

		expect(ids).toContain(created.id);
		expect(resolveTaskViewDefinition(settings, created.id)).toMatchObject({
			id: created.id,
			source: 'custom',
			renderer: 'list',
		});
	});

	it('add: multiple views receive unique ids', () => {
		const settings = baseSettings();

		const first  = createCustomViewDefinition(settings.customViews);
		settings.customViews = [...settings.customViews, first];

		const second = createCustomViewDefinition(settings.customViews);
		settings.customViews = [...settings.customViews, second];

		expect(first.id).not.toBe(second.id);
		expect(getRegisteredTaskViews(settings).filter((v) => v.source === 'custom')).toHaveLength(2);
	});

	// ── Edit ─────────────────────────────────────────────────────────────────
	it('edit: updating name/query/renderer is reflected in resolveTaskViewDefinition', () => {
		const settings = baseSettings();
		const created = createCustomViewDefinition(settings.customViews);
		settings.customViews = [created];

		// Simulate the onSave callback from QueryEditorModal
		const updatedQuery: typeof created.query = {
			filter: { logic: 'and', conditions: [{ field: 'priority', operator: 'is', value: 'High' }] },
			sort: [{ field: 'due_date', direction: 'asc' }],
			group: { kind: 'none' },
		};
		settings.customViews = settings.customViews.map((v) =>
			v.id === created.id
				? { ...v, name: 'High Priority', renderer: 'list' as const, query: updatedQuery }
				: v,
		);

		const resolved = resolveTaskViewDefinition(settings, created.id);
		expect(resolved).toMatchObject({ name: 'High Priority', renderer: 'list' });
		expect(resolved?.query.filter.conditions[0]).toMatchObject({ field: 'priority', value: 'High' });
	});

	it('edit: changing renderer to kanban makes coerceQueryForRenderer return status group', () => {
		const settings = baseSettings();
		const created = createCustomViewDefinition(settings.customViews);
		settings.customViews = [created];

		// Renderer switch to kanban (as QueryEditorModal.applyRenderer() would do)
		settings.customViews = settings.customViews.map((v) =>
			v.id === created.id ? { ...v, renderer: 'kanban' as const } : v,
		);

		const updated = resolveTaskViewDefinition(settings, created.id)!;
		const coerced = coerceQueryForRenderer(updated.renderer, updated.query);

		expect(coerced.group).toEqual({ kind: 'field', field: 'status' });
	});

	// ── Delete ───────────────────────────────────────────────────────────────
	it('delete: removed view is absent from getRegisteredTaskViews', () => {
		const settings = baseSettings();
		const a = createCustomViewDefinition(settings.customViews);
		settings.customViews = [a];
		const b = createCustomViewDefinition(settings.customViews);
		settings.customViews = [a, b];

		// Simulate onDelete callback for 'a'
		settings.customViews = settings.customViews.filter((v) => v.id !== a.id);

		const ids = getRegisteredTaskViews(settings).map((v) => v.id);
		expect(ids).not.toContain(a.id);
		expect(ids).toContain(b.id);
	});

	it('delete: resolveTaskViewId falls back to default when current view is deleted', () => {
		const settings = baseSettings();
		const created = createCustomViewDefinition(settings.customViews);
		settings.customViews = [created];

		// Confirm view is reachable before deletion
		expect(resolveTaskViewId(settings, created.id)).toBe(created.id);

		// Delete
		settings.customViews = settings.customViews.filter((v) => v.id !== created.id);

		// As in TaskBoard.svelte: currentViewId = resolveTaskViewId(settings, null)
		expect(resolveTaskViewId(settings, created.id)).toBe('list');
		expect(resolveTaskViewId(settings, null)).toBe('list');
	});

	// ── Round-trip ───────────────────────────────────────────────────────────
	it('round-trip add → edit → delete leaves settings clean', () => {
		const settings = baseSettings();

		// Add
		const created = createCustomViewDefinition(settings.customViews);
		settings.customViews = [...settings.customViews, created];
		expect(settings.customViews).toHaveLength(1);

		// Edit
		settings.customViews = settings.customViews.map((v) =>
			v.id === created.id ? { ...v, name: 'Edited Name' } : v,
		);
		expect(resolveTaskViewDefinition(settings, created.id)?.name).toBe('Edited Name');

		// Delete
		settings.customViews = settings.customViews.filter((v) => v.id !== created.id);
		expect(settings.customViews).toHaveLength(0);
		expect(resolveTaskViewDefinition(settings, created.id)).toBeNull();
		expect(getRegisteredTaskViews(settings).filter((v) => v.source === 'custom')).toHaveLength(0);
	});
});
