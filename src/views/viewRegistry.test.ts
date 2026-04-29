import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, type CustomTaskViewDefinition } from '../settings';
import {
	createCustomViewDefinition,
	getRegisteredTaskViews,
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
