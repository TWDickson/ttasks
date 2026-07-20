import type { GroupSpec, QuerySpec } from '../query/types';
import type {
	CustomTaskViewDefinition,
	TaskViewPresentation,
	TaskViewRenderer,
	TTasksSettings,
} from '../settings';
import {
	RENDERER_AGENDA,
	RENDERER_ARCHIVE,
	RENDERER_GRAPH,
	RENDERER_KANBAN,
	RENDERER_LIST,
} from '../constants';

export interface RegisteredTaskViewDefinition extends CustomTaskViewDefinition {
	source: 'builtin' | 'custom';
}

const KANBAN_REQUIRED_GROUP: GroupSpec = { kind: 'field', field: 'status' };
const AGENDA_REQUIRED_GROUP: GroupSpec = { kind: 'date_buckets', field: 'due_date', preset: 'agenda' };

const BUILTIN_TASK_VIEWS: RegisteredTaskViewDefinition[] = [
	{
		id: 'list',
		name: 'Active',
		icon: 'list',
		renderer: RENDERER_LIST,
		query: {
			filter: {
				logic: 'and',
				conditions: [
					{ field: 'is_complete', operator: 'is', value: false },
				],
			},
			sort: [],
			group: { kind: 'field', field: 'status' },
		},
		presentation: { hierarchy: 'tree', graphMode: 'dependency' },
		source: 'builtin',
	},
	{
		id: 'inbox',
		name: 'Inbox',
		icon: 'inbox',
		renderer: RENDERER_LIST,
		query: {
			filter: {
				logic: 'and',
				conditions: [
					{ field: 'is_inbox', operator: 'is', value: true },
					{ field: 'is_complete', operator: 'is', value: false },
				],
			},
			sort: [
				{ field: 'priority', direction: 'asc' },
				{ field: 'created', direction: 'asc' },
			],
			group: { kind: 'none' },
		},
		presentation: { hierarchy: 'tree', graphMode: 'dependency' },
		source: 'builtin',
	},
	{
		id: 'today',
		name: 'Today',
		icon: 'calendar-check',
		renderer: RENDERER_LIST,
		query: {
			filter: {
				logic: 'and',
				conditions: [
					{
						logic: 'or',
						conditions: [
							{ field: 'due_date', operator: 'is', value: 'today' },
							// Value substituted to the configured start status by applyStartStatus.
							{ field: 'status', operator: 'is', value: 'In Progress' },
						],
					},
					{ field: 'is_complete', operator: 'is', value: false },
				],
			},
			sort: [
				{ field: 'priority', direction: 'asc' },
				{ field: 'due_time', direction: 'asc' },
			],
			group: { kind: 'none' },
			readyFirst: true,
		},
		presentation: { hierarchy: 'flat', graphMode: 'dependency' },
		source: 'builtin',
	},
	{
		id: 'blocked',
		name: 'Blocked',
		icon: 'octagon-x',
		renderer: RENDERER_LIST,
		query: {
			filter: {
				logic: 'and',
				conditions: [
					{ field: 'status', operator: 'is', value: 'Blocked' },
					{ field: 'is_complete', operator: 'is', value: false },
				],
			},
			sort: [
				{ field: 'priority', direction: 'asc' },
				{ field: 'created', direction: 'asc' },
			],
			group: { kind: 'field', field: 'area' },
		},
		presentation: { hierarchy: 'flat', graphMode: 'dependency' },
		source: 'builtin',
	},
	{
		id: 'kanban',
		name: 'Kanban',
		icon: 'columns-2',
		renderer: RENDERER_KANBAN,
		query: {
			filter: { logic: 'and', conditions: [] },
			sort: [],
			group: { kind: 'field', field: 'status' },
		},
		presentation: { hierarchy: 'flat', graphMode: 'dependency' },
		source: 'builtin',
	},
	{
		id: 'agenda',
		name: 'Agenda',
		icon: 'calendar',
		renderer: RENDERER_AGENDA,
		query: {
			filter: {
				logic: 'and',
				conditions: [
					{ field: 'type', operator: 'is', value: 'task' },
					{ field: 'is_complete', operator: 'is', value: false },
				],
			},
			sort: [
				{ field: 'due_date', direction: 'asc' },
				{ field: 'priority', direction: 'asc' },
			],
			group: { kind: 'date_buckets', field: 'due_date', preset: 'agenda' },
		},
		presentation: { hierarchy: 'flat', graphMode: 'dependency' },
		source: 'builtin',
	},
	{
		id: 'graph',
		name: 'Dependencies',
		icon: 'git-branch-plus',
		renderer: RENDERER_GRAPH,
		query: {
			filter: { logic: 'and', conditions: [] },
			sort: [],
			group: { kind: 'none' },
		},
		presentation: { hierarchy: 'flat', graphMode: 'dependency' },
		source: 'builtin',
	},
	{
		id: 'timeline',
		name: 'Timeline',
		icon: 'gantt-chart',
		renderer: RENDERER_GRAPH,
		query: {
			filter: { logic: 'and', conditions: [] },
			sort: [],
			group: { kind: 'none' },
		},
		presentation: { hierarchy: 'flat', graphMode: 'overview' },
		source: 'builtin',
	},
	{
		id: 'logbook',
		name: 'Logbook',
		icon: 'book-open',
		renderer: RENDERER_LIST,
		query: {
			filter: {
				logic: 'and',
				conditions: [
					{ field: 'is_complete', operator: 'is', value: true },
				],
			},
			sort: [
				{ field: 'completed', direction: 'desc' },
			],
			group: { kind: 'date_buckets', field: 'completed', preset: 'logbook' },
		},
		presentation: { hierarchy: 'flat', graphMode: 'dependency' },
		source: 'builtin',
	},
	{
		id: 'archive',
		name: 'Archive',
		icon: 'archive',
		renderer: RENDERER_ARCHIVE,
		query: {
			filter: { logic: 'and', conditions: [] },
			sort: [],
			group: { kind: 'none' },
		},
		presentation: { hierarchy: 'flat', graphMode: 'dependency' },
		source: 'builtin',
	},
];

function cloneQuerySpec(query: QuerySpec): QuerySpec {
	return {
		filter: {
			logic: query.filter.logic,
			conditions: query.filter.conditions.map((condition) => {
				if ('logic' in condition) {
					return cloneQuerySpec({ filter: condition, sort: [], group: { kind: 'none' } }).filter;
				}
				return {
					field: condition.field,
					operator: condition.operator,
					value: Array.isArray(condition.value) ? [...condition.value] : condition.value,
				};
			}),
		},
		sort: query.sort.map((entry) => ({ ...entry })),
		sortScope: query.sortScope,
		group: { ...query.group },
		limit: query.limit,
		limitPerGroup: query.limitPerGroup,
		search: query.search,
		activeStatusBucket: query.activeStatusBucket,
		readyFirst: query.readyFirst,
	};
}

function clonePresentation(presentation: TaskViewPresentation): TaskViewPresentation {
	return {
		hierarchy: presentation.hierarchy,
		graphMode: presentation.graphMode,
	};
}

function cloneRegisteredView(view: RegisteredTaskViewDefinition): RegisteredTaskViewDefinition {
	return {
		id: view.id,
		name: view.name,
		icon: view.icon,
		renderer: view.renderer,
		query: cloneQuerySpec(view.query),
		presentation: clonePresentation(view.presentation),
		source: view.source,
	};
}

function cloneCustomView(view: CustomTaskViewDefinition): CustomTaskViewDefinition {
	return {
		id: view.id,
		name: view.name,
		icon: view.icon,
		renderer: view.renderer,
		query: cloneQuerySpec(view.query),
		presentation: clonePresentation(view.presentation),
	};
}

export function resolveTaskViewIcon(view: Pick<CustomTaskViewDefinition, 'icon' | 'renderer'>): string {
	if (view.icon?.trim()) return view.icon.trim();
	return iconForRenderer(view.renderer);
}

export function isGroupCompatibleWithRenderer(renderer: TaskViewRenderer, group: GroupSpec): boolean {
	switch (renderer) {
		case 'kanban':
			return group.kind === 'field' && group.field === 'status';
		case 'agenda':
			return group.kind === 'date_buckets' && group.field === 'due_date' && group.preset === 'agenda';
		case 'list':
		case 'graph':
		default:
			return true;
	}
}

export function coerceQueryForRenderer(renderer: TaskViewRenderer, query: QuerySpec): QuerySpec {
	const next = cloneQuerySpec(query);
	if (isGroupCompatibleWithRenderer(renderer, next.group)) {
		return next;
	}

	switch (renderer) {
		case 'kanban':
			return { ...next, group: { ...KANBAN_REQUIRED_GROUP } };
		case 'agenda':
			return { ...next, group: { ...AGENDA_REQUIRED_GROUP } };
		case 'list':
		case 'graph':
		default:
			return next;
	}
}

function iconForRenderer(renderer: TaskViewRenderer): string {
	switch (renderer) {
		case 'kanban':
			return 'columns-2';
		case 'agenda':
			return 'calendar';
		case 'graph':
			return 'git-branch-plus';
		case 'list':
		default:
			return 'list';
	}
}

type ViewRegistrySettings = Pick<TTasksSettings, 'customViews' | 'quickActions'>;
type VisibleViewSettings = ViewRegistrySettings & Pick<TTasksSettings, 'hiddenBuiltinViews'>;

/**
 * Substitutes the user-configured block status into the built-in Blocked view,
 * whose condition is authored against the default `'Blocked'` name. Without this
 * a user who renames the status gets a permanently empty Blocked view.
 */
function applyBlockStatus(view: RegisteredTaskViewDefinition, blockStatus: string): RegisteredTaskViewDefinition {
	if (view.id !== 'blocked') return view;
	for (const condition of view.query.filter.conditions) {
		if ('field' in condition && condition.field === 'status' && condition.operator === 'is') {
			condition.value = blockStatus;
		}
	}
	return view;
}

/**
 * Substitutes the user-configured start ("in progress") status into the
 * built-in Today/Agenda views, so work underway surfaces there regardless of
 * due date — not just tasks due exactly today. Today's condition is authored
 * against the default `'In Progress'` name inside a nested OR group; Agenda
 * uses the same status to promote a task into the "Today" date bucket.
 */
function applyStartStatus(view: RegisteredTaskViewDefinition, startStatus: string): RegisteredTaskViewDefinition {
	if (view.id === 'today') {
		for (const condition of view.query.filter.conditions) {
			if (!('logic' in condition)) continue;
			for (const inner of condition.conditions) {
				if ('field' in inner && inner.field === 'status' && inner.operator === 'is') {
					inner.value = startStatus;
				}
			}
		}
	}
	if (view.id === 'agenda') {
		view.query.activeStatusBucket = startStatus;
	}
	return view;
}

export function getRegisteredTaskViews(settings: ViewRegistrySettings): RegisteredTaskViewDefinition[] {
	const builtinIds = new Set(BUILTIN_TASK_VIEWS.map((view) => view.id));
	const blockStatus = settings.quickActions.blockStatus;
	const startStatus = settings.quickActions.startStatus;
	return [
		...BUILTIN_TASK_VIEWS.map(cloneRegisteredView)
			.map((view) => applyBlockStatus(view, blockStatus))
			.map((view) => applyStartStatus(view, startStatus)),
		...settings.customViews
			.filter((view) => !builtinIds.has(view.id))
			.map((view) => ({
				...cloneCustomView(view),
				source: 'custom' as const,
			})),
	];
}

/**
 * Rail-facing view list: all registered views minus any built-ins the user has
 * hidden. Custom views are always shown. Hidden built-ins remain resolvable via
 * {@link getRegisteredTaskViews} so protocol/jump to a hidden view still works.
 */
export function getVisibleTaskViews(settings: VisibleViewSettings): RegisteredTaskViewDefinition[] {
	const hidden = new Set(settings.hiddenBuiltinViews ?? []);
	return getRegisteredTaskViews(settings).filter(
		(view) => view.source !== 'builtin' || !hidden.has(view.id),
	);
}

export function resolveTaskViewDefinition(
	settings: ViewRegistrySettings,
	viewId: string | null | undefined,
): RegisteredTaskViewDefinition | null {
	if (!viewId) return null;
	return getRegisteredTaskViews(settings).find((view) => view.id === viewId) ?? null;
}

export function resolveTaskViewId(
	settings: ViewRegistrySettings,
	viewId: string | null | undefined,
): string {
	return resolveTaskViewDefinition(settings, viewId)?.id ?? BUILTIN_TASK_VIEWS[0].id;
}

export function createCustomViewDefinition(existingViews: CustomTaskViewDefinition[]): CustomTaskViewDefinition {
	const nextNumber = resolveNextCustomViewNumber(existingViews);
	const seed = cloneRegisteredView(BUILTIN_TASK_VIEWS[0]);
	return {
		id: `custom-view-${nextNumber}`,
		name: `New View ${nextNumber}`,
		icon: null,
		renderer: seed.renderer,
		query: seed.query,
		presentation: seed.presentation,
	};
}

function resolveNextCustomViewNumber(existingViews: CustomTaskViewDefinition[]): number {
	const taken = new Set(existingViews.map((view) => view.id));
	let next = 1;
	while (taken.has(`custom-view-${next}`)) {
		next += 1;
	}
	return next;
}
