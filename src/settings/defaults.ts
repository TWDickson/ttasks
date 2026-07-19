import type {
	TTasksSettings,
	CustomTaskViewDefinition,
	TaskViewPresentation,
	TaskViewRenderer,
	KanbanCardField,
	RemindersSettings,
	CaptureSourceDefaults,
	CaptureSourceConfig,
} from './types';
import type {
	FilterCondition,
	FilterField,
	FilterGroup,
	FilterOperator,
	GroupField,
	GroupSpec,
	QuerySpec,
	SortScope,
	SortField,
	SortSpec,
} from '../query/types';
import { RENDERER_KANBAN, RENDERER_LIST } from '../constants';
import { normalizeHolidayEntries } from './holidays';
export const DEFAULT_STATUSES = ['Active', 'In Progress', 'Future', 'Hold', 'Blocked', 'Cancelled', 'Completed'];

export const DEFAULT_REMINDERS_SETTINGS: RemindersSettings = {
	enabled: true,
	ruleDueToday: true,
	ruleOverdue: true,
	ruleStaleInProgress: true,
	ruleLeadTime: false,
	leadTimeDays: 1,
	staleThresholdDays: 7,
	quietHoursEnabled: false,
	quietStart: 22,
	quietEnd: 8,
};

export const DEFAULT_CAPTURE_SOURCE_DEFAULTS: CaptureSourceDefaults = {
	area: null,
	labels: [],
	status: null,
	priority: null,
	assignedTo: null,
};

export const DEFAULT_CAPTURE_SOURCE_CONFIG: Omit<CaptureSourceConfig, 'path'> = {
	includeSubdirectories: true,
	mode: 'auto-capture',
	sectionFilter: '',
	inheritDateFromFilename: true,
	defaults: DEFAULT_CAPTURE_SOURCE_DEFAULTS,
};

export const DEFAULT_SETTINGS: TTasksSettings = {
	tasksFolder: 'Tasks',
	editorSuggestTrigger: '@task',
	captureSources: [],
	captureSourceDefaultMode: 'auto-capture',
	captureSourceDefaultDefaults: DEFAULT_CAPTURE_SOURCE_DEFAULTS,
	fabPosition: 'right',
	logbookRendererMode: 'list',
	overviewGraphGrouping: 'project',
	overviewGraphShowCompleted: false,
	graphHiddenProjects: [],
	graphDiagnosticsEnabled: false,
	customViews: [],
	hiddenBuiltinViews: [],
	statuses: DEFAULT_STATUSES,
	completionStatus: 'Completed',
	statusColors: {
		'In Progress': '#2563eb',
		Blocked: '#dc2626',
		Completed: '#16a34a',
		Cancelled: '#6b7280',
	},
	areas: ['database', 'general'],
	areaColors: {},
	areaWorkweek: {},
	holidays: [],
	labelValues: ['feature', 'bug', 'research', 'docs', 'action'],
	labelColors: {},
	quickActions: {
		startStatus: 'In Progress',
		blockStatus: 'Blocked',
		deferDays: 1,
	},
	reminders: DEFAULT_REMINDERS_SETTINGS,
	archive: {
		mode: 'manual',
		daysAfterComplete: 45,
	},
	statusBar: {
		hideWhenZero: false,
		clickTarget: 'agenda',
	},
	pomodoro: {
		focusMinutes: 25,
		shortBreakMinutes: 5,
		longBreakMinutes: 15,
		longBreakInterval: 4,
		autoStartNext: true,
	},
	kanbanCardFields: ['area', 'dueDate', 'labels', 'depCount'] as KanbanCardField[],
	kanbanCollapsedColumns: [],
	showCompletedByViewId: {},
};

const FILTER_OPERATORS = new Set<FilterOperator>([
	'is', 'is_not',
	'contains', 'not_contains',
	'contains_any', 'contains_all',
	'before', 'after',
	'within_days',
	'is_null', 'is_not_null',
]);

const FILTER_FIELDS = new Set<FilterField>([
	'area', 'status', 'priority', 'labels', 'type',
	'due_date', 'due_time', 'start_date', 'created',
	'is_complete', 'is_inbox',
	'parent_task', 'depends_on', 'blocks',
	'assigned_to',
]);

const SORT_FIELDS = new Set<SortField>([
	'name', 'due_date', 'due_time', 'start_date', 'created', 'completed',
	'priority', 'status', 'area', 'type',
]);

const SORT_SCOPES = new Set<SortScope>(['global', 'within_groups']);

const GROUP_FIELDS = new Set<GroupField>([
	'status', 'area', 'priority', 'type', 'due_date', 'parent_task',
]);

const TASK_VIEW_RENDERERS = new Set<TaskViewRenderer>(['list', 'kanban', 'agenda', 'graph', 'archive']);

function parseFromSet<T extends string>(value: unknown, allowedSet: Set<T>): T | null {
	if (typeof value !== 'string') return null;
	return allowedSet.has(value as T) ? (value as T) : null;
}

const EMPTY_FILTER_SPEC: FilterGroup = { logic: 'and', conditions: [] };

const EMPTY_QUERY_SPEC: QuerySpec = {
	filter: EMPTY_FILTER_SPEC,
	sort: [],
	sortScope: 'global',
	group: { kind: 'none' },
};

function asRecord(value: unknown): Record<string, unknown> | null {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		return null;
	}
	return value as Record<string, unknown>;
}

function asStringArray(value: unknown): string[] | null {
	if (!Array.isArray(value)) return null;
	const result = value.filter((item): item is string => typeof item === 'string');
	return result;
}

function asBoolean(value: unknown): boolean | null {
	return typeof value === 'boolean' ? value : null;
}

function asString(value: unknown): string | null {
	return typeof value === 'string' ? value : null;
}

function asArray(value: unknown): unknown[] {
	return Array.isArray(value) ? value : [];
}

function asOneOf<T extends string>(value: unknown, options: readonly T[], fallback: T): T {
	return typeof value === 'string' && options.includes(value as T)
		? (value as T)
		: fallback;
}

function asInteger(value: unknown): number | null {
	if (typeof value !== 'number' || !Number.isFinite(value)) return null;
	return Math.round(value);
}

function clampInteger(value: number, min: number, max: number): number {
	if (value < min) return min;
	if (value > max) return max;
	return value;
}

function cloneSettings(settings: TTasksSettings): TTasksSettings {
	return {
		tasksFolder: settings.tasksFolder,
		editorSuggestTrigger: settings.editorSuggestTrigger,
		captureSources: settings.captureSources.map((source) => ({
			path: source.path,
			includeSubdirectories: source.includeSubdirectories,
			mode: source.mode,
			sectionFilter: source.sectionFilter,
			inheritDateFromFilename: source.inheritDateFromFilename,
			defaults: {
				area: source.defaults.area,
				labels: [...source.defaults.labels],
				status: source.defaults.status,
				priority: source.defaults.priority,
				assignedTo: source.defaults.assignedTo,
			},
		})),
		captureSourceDefaultMode: settings.captureSourceDefaultMode,
		captureSourceDefaultDefaults: {
			area: settings.captureSourceDefaultDefaults.area,
			labels: [...settings.captureSourceDefaultDefaults.labels],
			status: settings.captureSourceDefaultDefaults.status,
			priority: settings.captureSourceDefaultDefaults.priority,
			assignedTo: settings.captureSourceDefaultDefaults.assignedTo,
		},
		fabPosition: settings.fabPosition,
		logbookRendererMode: settings.logbookRendererMode,
		overviewGraphGrouping: settings.overviewGraphGrouping,
		overviewGraphShowCompleted: settings.overviewGraphShowCompleted,
		graphHiddenProjects: [...(settings.graphHiddenProjects ?? [])],
		graphDiagnosticsEnabled: settings.graphDiagnosticsEnabled,
		customViews: settings.customViews.map(cloneCustomTaskViewDefinition),
		hiddenBuiltinViews: [...(settings.hiddenBuiltinViews ?? [])],
		statuses: [...settings.statuses],
		completionStatus: settings.completionStatus,
		statusColors: { ...settings.statusColors },
		areas: [...settings.areas],
		areaColors: { ...settings.areaColors },
		areaWorkweek: { ...(settings.areaWorkweek ?? {}) },
		holidays: (settings.holidays ?? []).map((entry) => ({ ...entry })),
		labelValues: [...settings.labelValues],
		labelColors: { ...settings.labelColors },
		quickActions: {
			startStatus: settings.quickActions.startStatus,
			blockStatus: settings.quickActions.blockStatus,
			deferDays: settings.quickActions.deferDays,
		},
		reminders: {
			enabled: settings.reminders.enabled,
			ruleDueToday: settings.reminders.ruleDueToday,
			ruleOverdue: settings.reminders.ruleOverdue,
			ruleStaleInProgress: settings.reminders.ruleStaleInProgress,
			ruleLeadTime: settings.reminders.ruleLeadTime,
			leadTimeDays: settings.reminders.leadTimeDays,
			staleThresholdDays: settings.reminders.staleThresholdDays,
			quietHoursEnabled: settings.reminders.quietHoursEnabled,
			quietStart: settings.reminders.quietStart,
			quietEnd: settings.reminders.quietEnd,
		},
		archive: {
			mode: settings.archive?.mode ?? DEFAULT_SETTINGS.archive.mode,
			daysAfterComplete: settings.archive?.daysAfterComplete ?? DEFAULT_SETTINGS.archive.daysAfterComplete,
		},
		statusBar: {
			hideWhenZero: settings.statusBar?.hideWhenZero ?? DEFAULT_SETTINGS.statusBar.hideWhenZero,
			clickTarget: settings.statusBar?.clickTarget ?? DEFAULT_SETTINGS.statusBar.clickTarget,
		},
		pomodoro: {
			focusMinutes: settings.pomodoro?.focusMinutes ?? DEFAULT_SETTINGS.pomodoro.focusMinutes,
			shortBreakMinutes: settings.pomodoro?.shortBreakMinutes ?? DEFAULT_SETTINGS.pomodoro.shortBreakMinutes,
			longBreakMinutes: settings.pomodoro?.longBreakMinutes ?? DEFAULT_SETTINGS.pomodoro.longBreakMinutes,
			longBreakInterval: settings.pomodoro?.longBreakInterval ?? DEFAULT_SETTINGS.pomodoro.longBreakInterval,
			autoStartNext: settings.pomodoro?.autoStartNext ?? DEFAULT_SETTINGS.pomodoro.autoStartNext,
		},
		kanbanCardFields: settings.kanbanCardFields ?? [...DEFAULT_SETTINGS.kanbanCardFields],
		kanbanCollapsedColumns: settings.kanbanCollapsedColumns ?? [...DEFAULT_SETTINGS.kanbanCollapsedColumns],
		showCompletedByViewId: settings.showCompletedByViewId ?? { ...DEFAULT_SETTINGS.showCompletedByViewId },
	};
}

function normalizePathValue(value: unknown): string {
	return (asString(value) ?? '').replace(/\\/g, '/').trim().replace(/^\/+|\/+$/g, '');
}

function normalizePriorityValue(value: unknown): CaptureSourceDefaults['priority'] {
	const parsed = asString(value);
	if (parsed === 'High' || parsed === 'Medium' || parsed === 'Low' || parsed === 'None') {
		return parsed;
	}
	return null;
}

export function normalizeCaptureSourceDefaults(raw: unknown): CaptureSourceDefaults {
	const root = asRecord(raw);
	if (!root) {
		return {
			...DEFAULT_CAPTURE_SOURCE_DEFAULTS,
			labels: [...DEFAULT_CAPTURE_SOURCE_DEFAULTS.labels],
		};
	}

	const labels = asStringArray(root.labels)
		?.map((label) => label.trim())
		.filter(Boolean) ?? [];

	return {
		area: asString(root.area)?.trim() || null,
		labels: [...new Set(labels)],
		status: asString(root.status)?.trim() || null,
		priority: normalizePriorityValue(root.priority),
		assignedTo: asString(root.assignedTo)?.trim() || null,
	};
}

export function normalizeCaptureSource(raw: unknown): CaptureSourceConfig {
	const root = asRecord(raw);

	return {
		path: normalizePathValue(root?.path),
		includeSubdirectories: asBoolean(root?.includeSubdirectories) ?? DEFAULT_CAPTURE_SOURCE_CONFIG.includeSubdirectories,
		mode: asOneOf(
			root?.mode,
			['auto-capture', 'manual', 'auto-promote'],
			DEFAULT_CAPTURE_SOURCE_CONFIG.mode,
		),
		sectionFilter: (asString(root?.sectionFilter) ?? DEFAULT_CAPTURE_SOURCE_CONFIG.sectionFilter).trim(),
		inheritDateFromFilename: asBoolean(root?.inheritDateFromFilename) ?? DEFAULT_CAPTURE_SOURCE_CONFIG.inheritDateFromFilename,
		defaults: normalizeCaptureSourceDefaults(root?.defaults),
	};
}

function cloneFilterSpec(spec: FilterGroup): FilterGroup {
	return {
		logic: spec.logic,
		conditions: spec.conditions.map((condition) => {
			if ('logic' in condition) {
				return cloneFilterSpec(condition);
			}
			return {
				field: condition.field,
				operator: condition.operator,
				value: Array.isArray(condition.value) ? [...condition.value] : condition.value,
			};
		}),
	};
}

function cloneQuerySpec(query: QuerySpec): QuerySpec {
	return {
		filter: cloneFilterSpec(query.filter),
		sort: query.sort.map((entry) => ({ ...entry })),
		sortScope: query.sortScope,
		group: { ...query.group },
		limit: query.limit,
		limitPerGroup: query.limitPerGroup,
		search: query.search,
	};
}

function cloneTaskViewPresentation(presentation: TaskViewPresentation): TaskViewPresentation {
	return {
		hierarchy: presentation.hierarchy,
		graphMode: presentation.graphMode,
	};
}

function cloneCustomTaskViewDefinition(view: CustomTaskViewDefinition): CustomTaskViewDefinition {
	return {
		id: view.id,
		name: view.name,
		icon: view.icon,
		renderer: view.renderer,
		query: cloneQuerySpec(view.query),
		presentation: cloneTaskViewPresentation(view.presentation),
	};
}

function defaultTaskViewPresentation(): TaskViewPresentation {
	return {
		hierarchy: 'flat',
		graphMode: 'dependency',
	};
}

function normalizeFilterValue(value: unknown): FilterCondition['value'] | undefined {
	if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
		return value;
	}
	if (Array.isArray(value)) {
		const strings = value.filter((item): item is string => typeof item === 'string');
		if (strings.length === value.length) return strings;
	}
	return undefined;
}

function normalizeFilterCondition(value: unknown): FilterCondition | null {
	const root = asRecord(value);
	if (!root) return null;
	const field    = parseFromSet(root.field,    FILTER_FIELDS);
	const operator = parseFromSet(root.operator, FILTER_OPERATORS);
	if (!field || !operator) return null;
	return { field, operator, value: normalizeFilterValue(root.value) };
}

function normalizeFilterGroup(value: unknown): FilterGroup | null {
	const root = asRecord(value);
	if (!root) return null;
	const logic = asString(root.logic);
	const conditionsRaw = Array.isArray(root.conditions) ? root.conditions : null;
	if ((logic !== 'and' && logic !== 'or') || conditionsRaw === null) return null;

	const conditions = conditionsRaw
		.map((condition) => {
			const maybeGroup = normalizeFilterGroup(condition);
			if (maybeGroup) return maybeGroup;
			return normalizeFilterCondition(condition);
		})
		.filter((condition): condition is FilterCondition | FilterGroup => condition !== null);

	return { logic, conditions };
}

function normalizeSortSpec(value: unknown): SortSpec {
	if (!Array.isArray(value)) return [];
	return value
		.map((entry) => {
			const root = asRecord(entry);
			if (!root) return null;
			const field     = parseFromSet(root.field, SORT_FIELDS);
			const direction = asString(root.direction);
			if (!field) return null;
			if (direction !== 'asc' && direction !== 'desc') return null;
			return { field, direction };
		})
		.filter((entry): entry is SortSpec[number] => entry !== null);
}

function normalizeGroupSpec(value: unknown): GroupSpec {
	if (value === null) return { kind: 'none' };
	if (typeof value === 'string') {
		const field = parseFromSet(value, GROUP_FIELDS);
		return field ? { kind: 'field', field } : { kind: 'none' };
	}

	const root = asRecord(value);
	if (!root) return { kind: 'none' };

	const kind = asString(root.kind);
	if (kind === 'none') return { kind: 'none' };
	if (kind === 'field') {
		const field = parseFromSet(root.field, GROUP_FIELDS);
		return field ? { kind: 'field', field } : { kind: 'none' };
	}
	if (kind === 'date_buckets') {
		const field = asString(root.field);
		const preset = asString(root.preset);
		if (field === 'due_date' && preset === 'agenda') {
			return { kind: 'date_buckets', field: 'due_date', preset: 'agenda' };
		}
	}

	return { kind: 'none' };
}

export function normalizeQuerySpec(value: unknown): QuerySpec {
	const root = asRecord(value);
	if (!root) return cloneQuerySpec(EMPTY_QUERY_SPEC);

	const filter = normalizeFilterGroup(root.filter) ?? cloneFilterSpec(EMPTY_FILTER_SPEC);
	const sort = normalizeSortSpec(root.sort);
	const group = root.group !== undefined ? normalizeGroupSpec(root.group) : normalizeGroupSpec(root.groupBy);
	const sortScopeRaw = asString(root.sortScope);
	const sortScope = (sortScopeRaw && SORT_SCOPES.has(sortScopeRaw as SortScope))
		? (sortScopeRaw as SortScope)
		: (group.kind === 'none' ? 'global' : 'within_groups');
	const limitRaw = asInteger(root.limit);
	const limitPerGroupRaw = asInteger(root.limitPerGroup);
	const searchRaw = asString(root.search)?.trim();

	return {
		filter,
		sort,
		sortScope,
		group,
		limit: limitRaw !== null && limitRaw > 0 ? limitRaw : undefined,
		limitPerGroup: limitPerGroupRaw !== null && limitPerGroupRaw > 0 ? limitPerGroupRaw : undefined,
		search: searchRaw ? searchRaw : undefined,
	};
}

function normalizeTaskViewPresentation(value: unknown): TaskViewPresentation {
	const defaults = defaultTaskViewPresentation();
	const root = asRecord(value);
	if (!root) return defaults;

	const hierarchy = asString(root.hierarchy);
	const graphMode = asString(root.graphMode);

	return {
		hierarchy: hierarchy === 'tree' ? 'tree' : defaults.hierarchy,
		graphMode: graphMode === 'overview' ? 'overview' : defaults.graphMode,
	};
}

function normalizeCustomTaskViews(value: unknown): CustomTaskViewDefinition[] {
	if (!Array.isArray(value)) return [];
	const views: CustomTaskViewDefinition[] = [];
	const seenIds = new Set<string>();

	for (const entry of value) {
		const root = asRecord(entry);
		if (!root) continue;
		const id = asString(root.id)?.trim();
		const name = asString(root.name)?.trim();
		const renderer = asString(root.renderer);
		if (!id || !name || !renderer || !TASK_VIEW_RENDERERS.has(renderer as TaskViewRenderer)) continue;
		if (seenIds.has(id)) continue;
		seenIds.add(id);
		const icon = asString(root.icon)?.trim() || null;
		views.push({
			id,
			name,
			icon,
			renderer: renderer as TaskViewRenderer,
			query: normalizeQuerySpec(root.query),
			presentation: normalizeTaskViewPresentation(root.presentation),
		});
	}

	return views;
}

function applySettingsPatch(target: TTasksSettings, source: unknown): void {
	const root = asRecord(source);
	if (!root) return;

	const tasksFolder = asString(root.tasksFolder);
	if (tasksFolder !== null) target.tasksFolder = tasksFolder;

	const editorSuggestTrigger = asString(root.editorSuggestTrigger);
	if (editorSuggestTrigger !== null) target.editorSuggestTrigger = editorSuggestTrigger;

	const captureSources = asArray(root.captureSources)
		.map((entry) => normalizeCaptureSource(entry))
		.filter((entry) => !!entry.path);
	if (root.captureSources !== undefined) {
		target.captureSources = captureSources;
	}

	if (root.captureSourceDefaultMode !== undefined) {
		target.captureSourceDefaultMode = asOneOf(
			root.captureSourceDefaultMode,
			['auto-capture', 'manual', 'auto-promote'],
			DEFAULT_CAPTURE_SOURCE_CONFIG.mode,
		);
	}

	if (root.captureSourceDefaultDefaults !== undefined) {
		target.captureSourceDefaultDefaults = normalizeCaptureSourceDefaults(root.captureSourceDefaultDefaults);
	}

	const fabPosition = asString(root.fabPosition);
	if (fabPosition === 'right' || fabPosition === 'left' || fabPosition === 'hidden') {
		target.fabPosition = fabPosition;
	}

	const logbookRendererMode = asString(root.logbookRendererMode);
	if (logbookRendererMode === RENDERER_LIST || logbookRendererMode === RENDERER_KANBAN) {
		target.logbookRendererMode = logbookRendererMode;
	}

	const overviewGraphGrouping = asString(root.overviewGraphGrouping);
	if (overviewGraphGrouping === 'project' || overviewGraphGrouping === 'dependency' || overviewGraphGrouping === 'none') {
		target.overviewGraphGrouping = overviewGraphGrouping;
	}

	const overviewGraphShowCompleted = asBoolean(root.overviewGraphShowCompleted);
	if (overviewGraphShowCompleted !== null) {
		target.overviewGraphShowCompleted = overviewGraphShowCompleted;
	}

	const graphDiagnosticsEnabled = asBoolean(root.graphDiagnosticsEnabled);
	if (graphDiagnosticsEnabled !== null) {
		target.graphDiagnosticsEnabled = graphDiagnosticsEnabled;
	}

	if (root.customViews !== undefined) {
		target.customViews = normalizeCustomTaskViews(root.customViews);
	}

	const statuses = asStringArray(root.statuses);
	if (statuses !== null) target.statuses = statuses;

	const completionStatus = asString(root.completionStatus);
	if (completionStatus !== null) target.completionStatus = completionStatus;

	const statusColors = asRecord(root.statusColors);
	if (statusColors !== null) {
		target.statusColors = Object.fromEntries(
			Object.entries(statusColors).filter((entry): entry is [string, string] => typeof entry[1] === 'string')
		);
	}

	const areas = asStringArray(root.areas);
	if (areas !== null) target.areas = areas;

	const areaColors = asRecord(root.areaColors);
	if (areaColors !== null) {
		target.areaColors = Object.fromEntries(
			Object.entries(areaColors).filter((entry): entry is [string, string] => typeof entry[1] === 'string')
		);
	}

	const areaWorkweek = asRecord(root.areaWorkweek);
	if (areaWorkweek !== null) {
		target.areaWorkweek = Object.fromEntries(
			Object.entries(areaWorkweek).filter((entry): entry is [string, boolean] => typeof entry[1] === 'boolean')
		);
	}

	if (Array.isArray(root.holidays)) {
		target.holidays = normalizeHolidayEntries(root.holidays);
	}

	const labelValues = asStringArray(root.labelValues);
	if (labelValues !== null) target.labelValues = labelValues;

	const labelColors = asRecord(root.labelColors);
	if (labelColors !== null) {
		target.labelColors = Object.fromEntries(
			Object.entries(labelColors).filter((entry): entry is [string, string] => typeof entry[1] === 'string')
		);
	}

	const quickActions = asRecord(root.quickActions);
	if (quickActions !== null) {
		const startStatus = asString(quickActions.startStatus);
		if (startStatus !== null) target.quickActions.startStatus = startStatus;

		const blockStatus = asString(quickActions.blockStatus);
		if (blockStatus !== null) target.quickActions.blockStatus = blockStatus;

		const deferDays = asInteger(quickActions.deferDays);
		if (deferDays !== null) target.quickActions.deferDays = deferDays;

	}

	const reminders = asRecord(root.reminders);
	if (reminders !== null) {
		const enabled = asBoolean(reminders.enabled);
		if (enabled !== null) target.reminders.enabled = enabled;

		const ruleDueToday = asBoolean(reminders.ruleDueToday);
		if (ruleDueToday !== null) target.reminders.ruleDueToday = ruleDueToday;

		const ruleOverdue = asBoolean(reminders.ruleOverdue);
		if (ruleOverdue !== null) target.reminders.ruleOverdue = ruleOverdue;

		const ruleStaleInProgress = asBoolean(reminders.ruleStaleInProgress);
		if (ruleStaleInProgress !== null) target.reminders.ruleStaleInProgress = ruleStaleInProgress;

		const ruleLeadTime = asBoolean(reminders.ruleLeadTime);
		if (ruleLeadTime !== null) target.reminders.ruleLeadTime = ruleLeadTime;

		const leadTimeDays = asInteger(reminders.leadTimeDays);
		if (leadTimeDays !== null) target.reminders.leadTimeDays = leadTimeDays;

		const staleThresholdDays = asInteger(reminders.staleThresholdDays);
		if (staleThresholdDays !== null) target.reminders.staleThresholdDays = staleThresholdDays;

		const quietHoursEnabled = asBoolean(reminders.quietHoursEnabled);
		if (quietHoursEnabled !== null) target.reminders.quietHoursEnabled = quietHoursEnabled;

		const quietStart = asInteger(reminders.quietStart);
		if (quietStart !== null) target.reminders.quietStart = quietStart;

		const quietEnd = asInteger(reminders.quietEnd);
		if (quietEnd !== null) target.reminders.quietEnd = quietEnd;
	}

	const kanbanCardFields = asStringArray(root.kanbanCardFields);
	if (kanbanCardFields !== null) target.kanbanCardFields = kanbanCardFields as KanbanCardField[];

	const kanbanCollapsedColumns = asStringArray(root.kanbanCollapsedColumns);
	if (kanbanCollapsedColumns !== null) target.kanbanCollapsedColumns = kanbanCollapsedColumns;

	const showCompletedByViewId = asRecord(root.showCompletedByViewId);
	if (showCompletedByViewId !== null) {
		const cleaned: Record<string, boolean> = {};
		for (const [key, value] of Object.entries(showCompletedByViewId)) {
			if (typeof value === 'boolean') cleaned[key] = value;
		}
		target.showCompletedByViewId = cleaned;
	}

	const hiddenBuiltinViews = asStringArray(root.hiddenBuiltinViews);
	if (hiddenBuiltinViews !== null) target.hiddenBuiltinViews = hiddenBuiltinViews;

	const graphHiddenProjects = asStringArray(root.graphHiddenProjects);
	if (graphHiddenProjects !== null) target.graphHiddenProjects = graphHiddenProjects;

	const archive = asRecord(root.archive);
	if (archive !== null) {
		const mode = asString(archive.mode);
		if (mode === 'manual' || mode === 'scheduled') target.archive.mode = mode;

		const days = asInteger(archive.daysAfterComplete);
		if (days !== null) target.archive.daysAfterComplete = days;
	}

	const statusBar = asRecord(root.statusBar);
	if (statusBar !== null) {
		const hideWhenZero = asBoolean(statusBar.hideWhenZero);
		if (hideWhenZero !== null) target.statusBar.hideWhenZero = hideWhenZero;

		const clickTarget = asString(statusBar.clickTarget);
		if (clickTarget === 'agenda' || clickTarget === 'board' || clickTarget === 'today') {
			target.statusBar.clickTarget = clickTarget;
		}
	}

	const pomodoro = asRecord(root.pomodoro);
	if (pomodoro !== null) {
		const focusMinutes = asInteger(pomodoro.focusMinutes);
		if (focusMinutes !== null) target.pomodoro.focusMinutes = focusMinutes;

		const shortBreakMinutes = asInteger(pomodoro.shortBreakMinutes);
		if (shortBreakMinutes !== null) target.pomodoro.shortBreakMinutes = shortBreakMinutes;

		const longBreakMinutes = asInteger(pomodoro.longBreakMinutes);
		if (longBreakMinutes !== null) target.pomodoro.longBreakMinutes = longBreakMinutes;

		const longBreakInterval = asInteger(pomodoro.longBreakInterval);
		if (longBreakInterval !== null) target.pomodoro.longBreakInterval = longBreakInterval;

		const autoStartNext = asBoolean(pomodoro.autoStartNext);
		if (autoStartNext !== null) target.pomodoro.autoStartNext = autoStartNext;
	}
}

export function normalizeSettingsFromSources(sources: unknown[]): TTasksSettings {
	const merged = cloneSettings(DEFAULT_SETTINGS);
	for (const source of sources) {
		applySettingsPatch(merged, source);
	}

	merged.tasksFolder = merged.tasksFolder.trim() || DEFAULT_SETTINGS.tasksFolder;
	merged.editorSuggestTrigger = normalizeEditorSuggestTrigger(merged.editorSuggestTrigger);
	merged.captureSources = merged.captureSources
		.map((source) => normalizeCaptureSource(source))
		.filter((source) => !!source.path);
	merged.captureSourceDefaultMode = asOneOf(
		merged.captureSourceDefaultMode,
		['auto-capture', 'manual', 'auto-promote'],
		DEFAULT_CAPTURE_SOURCE_CONFIG.mode,
	);
	merged.captureSourceDefaultDefaults = normalizeCaptureSourceDefaults(merged.captureSourceDefaultDefaults);
	merged.statuses = normalizeStatuses(merged.statuses);
	merged.completionStatus = resolveCompletionStatus(merged.statuses, merged.completionStatus);
	merged.quickActions.startStatus = resolveConfiguredStatus(merged.statuses, merged.quickActions.startStatus, DEFAULT_SETTINGS.quickActions.startStatus);
	merged.quickActions.blockStatus = resolveConfiguredStatus(merged.statuses, merged.quickActions.blockStatus, DEFAULT_SETTINGS.quickActions.blockStatus);
	merged.quickActions.deferDays = clampInteger(merged.quickActions.deferDays, 1, 365);
	merged.statusColors = normalizeColorMap(merged.statuses, merged.statusColors);
	merged.areaColors = normalizeColorMap(merged.areas ?? [], merged.areaColors);
	merged.labelColors = normalizeColorMap(merged.labelValues ?? [], merged.labelColors);

	merged.reminders.leadTimeDays = clampInteger(merged.reminders.leadTimeDays, 1, 30);
	merged.reminders.staleThresholdDays = clampInteger(merged.reminders.staleThresholdDays, 1, 180);
	merged.reminders.quietStart = clampInteger(merged.reminders.quietStart, 0, 23);
	merged.reminders.quietEnd = clampInteger(merged.reminders.quietEnd, 0, 23);

	merged.archive.daysAfterComplete = clampInteger(merged.archive.daysAfterComplete, 1, 365);

	return merged;
}

export const THEME_SWATCHES = [
	{ label: 'Red', value: 'var(--color-red)' },
	{ label: 'Orange', value: 'var(--color-orange)' },
	{ label: 'Yellow', value: 'var(--color-yellow)' },
	{ label: 'Green', value: 'var(--color-green)' },
	{ label: 'Cyan', value: 'var(--color-cyan)' },
	{ label: 'Blue', value: 'var(--color-blue)' },
	{ label: 'Purple', value: 'var(--color-purple)' },
	{ label: 'Pink', value: 'var(--color-pink)' },
	{ label: 'Muted', value: 'var(--text-muted)' },
];

export function getDefaultThemeColor(index: number): string {
	return THEME_SWATCHES[index % THEME_SWATCHES.length]?.value ?? 'var(--text-muted)';
}

function parseCsvList(value: string): string[] {
	return [...new Set(
		value
			.split(',')
			.map(v => v.trim())
			.filter(Boolean)
	)];
}


export function normalizeStatuses(input: string[] | null | undefined): string[] {
	const parsed = parseCsvList((input ?? []).join(', '));
	return parsed.length > 0 ? parsed : [...DEFAULT_STATUSES];
}

export function normalizeColorMap(values: string[], colors: Record<string, string> | null | undefined): Record<string, string> {
	const result: Record<string, string> = {};
	for (const [index, value] of values.entries()) {
		const color = colors?.[value];
		if (typeof color === 'string' && color.trim()) {
			result[value] = color;
		} else {
			result[value] = getDefaultThemeColor(index);
		}
	}
	return result;
}

export function resolveCompletionStatus(statuses: string[] | null | undefined, completionStatus?: string | null): string {
	const valid = statuses ?? [];
	if (completionStatus && valid.includes(completionStatus)) return completionStatus;
	if (valid.includes('Completed')) return 'Completed';
	return valid[0] ?? 'Active';
}

export function resolveConfiguredStatus(statuses: string[] | null | undefined, configured: string | null | undefined, preferred: string): string {
	const valid = statuses ?? [];
	if (configured && valid.includes(configured)) return configured;
	if (valid.includes(preferred)) return preferred;
	return valid[0] ?? preferred;
}

export function resolveEmergencyStatus(statuses: string[] | null | undefined): string {
	return statuses?.[0] ?? 'Active';
}

/**
 * Returns true when `status` is a system-protected status that must not be
 * deleted. System statuses are the current completion status and inbox status —
 * not the hardcoded strings 'Completed' / 'Inbox', but whatever the user has
 * configured those pointers to be right now.
 */
export function isSystemStatus(status: string, completionStatus: string): boolean {
	return status === completionStatus;
}

export function normalizeEditorSuggestTrigger(value: string | null | undefined): string {
	const trimmed = (value ?? '').trim();
	if (!trimmed) return DEFAULT_SETTINGS.editorSuggestTrigger;
	if (!trimmed.startsWith('@')) return `@${trimmed}`;
	return trimmed;
}
