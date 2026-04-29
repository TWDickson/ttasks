import { AbstractInputSuggest, App, Modal, Notice, PluginSettingTab, Setting, TFolder, setIcon } from 'obsidian';
import type TTasksPlugin from './main';
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
} from './query/types';
import {
	createCustomViewDefinition,
	getRegisteredTaskViews,
	resolveTaskViewIcon,
} from './views/viewRegistry';
import { QueryEditorModal } from './modals/QueryEditorModal';

export type FabPosition = 'right' | 'left' | 'hidden';
export type QuickActionId = 'none' | 'start' | 'complete' | 'block' | 'defer';
export type TaskViewRenderer = 'list' | 'kanban' | 'agenda' | 'graph';

export interface TaskViewPresentation {
	hierarchy: 'flat' | 'tree';
	graphMode: 'dependency' | 'overview';
}

export interface CustomTaskViewDefinition {
	id: string;
	name: string;
	icon: string | null;
	renderer: TaskViewRenderer;
	query: QuerySpec;
	presentation: TaskViewPresentation;
}

export const QUICK_ACTION_LABELS: Record<QuickActionId, string> = {
	none: 'None',
	start: 'Start',
	complete: 'Complete',
	block: 'Block',
	defer: 'Defer',
};

export const QUICK_ACTION_OPTIONS: Array<{ value: QuickActionId; label: string }> = [
	{ value: 'none', label: QUICK_ACTION_LABELS.none },
	{ value: 'start', label: QUICK_ACTION_LABELS.start },
	{ value: 'complete', label: QUICK_ACTION_LABELS.complete },
	{ value: 'block', label: QUICK_ACTION_LABELS.block },
	{ value: 'defer', label: QUICK_ACTION_LABELS.defer },
];

export interface QuickActionsSettings {
	startStatus: string;
	blockStatus: string;
	deferDays: number;
}

export interface RemindersSettings {
	enabled: boolean;
	// Rule toggles
	ruleDueToday: boolean;
	ruleOverdue: boolean;
	ruleStaleInProgress: boolean;
	ruleLeadTime: boolean;
	// Rule parameters
	leadTimeDays: number;
	staleThresholdDays: number;
	// Quiet hours (0–23; if quietEnd < quietStart, wraps midnight)
	quietHoursEnabled: boolean;
	quietStart: number;
	quietEnd: number;
}

export interface TTasksSettings {
	tasksFolder: string;
	editorSuggestTrigger: string;
	fabPosition: FabPosition;
	customViews: CustomTaskViewDefinition[];
	statuses: string[];
	completionStatus: string;
	statusColors: Record<string, string>;
	areas: string[];
	areaColors: Record<string, string>;
	labelValues: string[];
	labelColors: Record<string, string>;
	quickActions: QuickActionsSettings;
	reminders: RemindersSettings;
}

export const DEFAULT_STATUSES = ['Active', 'In Progress', 'Future', 'Hold', 'Blocked', 'Cancelled', 'Done'];

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

export const DEFAULT_SETTINGS: TTasksSettings = {
	tasksFolder: 'Tasks',
	editorSuggestTrigger: '@task',
	fabPosition: 'right',
	customViews: [],
	statuses: DEFAULT_STATUSES,
	completionStatus: 'Done',
	statusColors: {
		'In Progress': '#2563eb',
		Blocked: '#dc2626',
		Done: '#16a34a',
		Cancelled: '#6b7280',
	},
	areas: ['database', 'general'],
	areaColors: {},
	labelValues: ['feature', 'bug', 'research', 'docs', 'action'],
	labelColors: {},
	quickActions: {
		startStatus: 'In Progress',
		blockStatus: 'Blocked',
		deferDays: 1,
	},
	reminders: DEFAULT_REMINDERS_SETTINGS,
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
	'name', 'due_date', 'due_time', 'start_date', 'created',
	'priority', 'status', 'area', 'type',
]);

const SORT_SCOPES = new Set<SortScope>(['global', 'within_groups']);

const GROUP_FIELDS = new Set<GroupField>([
	'status', 'area', 'priority', 'type', 'due_date', 'parent_task',
]);

const TASK_VIEW_RENDERERS = new Set<TaskViewRenderer>(['list', 'kanban', 'agenda', 'graph']);

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
		fabPosition: settings.fabPosition,
		customViews: settings.customViews.map(cloneCustomTaskViewDefinition),
		statuses: [...settings.statuses],
		completionStatus: settings.completionStatus,
		statusColors: { ...settings.statusColors },
		areas: [...settings.areas],
		areaColors: { ...settings.areaColors },
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
	const field = asString(root.field);
	const operator = asString(root.operator);
	if (!field || !FILTER_FIELDS.has(field as FilterField)) return null;
	if (!operator || !FILTER_OPERATORS.has(operator as FilterOperator)) return null;

	return {
		field: field as FilterField,
		operator: operator as FilterOperator,
		value: normalizeFilterValue(root.value),
	};
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
			const field = asString(root.field);
			const direction = asString(root.direction);
			if (!field || !SORT_FIELDS.has(field as SortField)) return null;
			if (direction !== 'asc' && direction !== 'desc') return null;
			return { field: field as SortField, direction };
		})
		.filter((entry): entry is SortSpec[number] => entry !== null);
}

function normalizeGroupSpec(value: unknown): GroupSpec {
	if (value === null) return { kind: 'none' };
	if (typeof value === 'string') {
		return GROUP_FIELDS.has(value as GroupField)
			? { kind: 'field', field: value as GroupField }
			: { kind: 'none' };
	}

	const root = asRecord(value);
	if (!root) return { kind: 'none' };

	const kind = asString(root.kind);
	if (kind === 'none') return { kind: 'none' };
	if (kind === 'field') {
		const field = asString(root.field);
		if (field && GROUP_FIELDS.has(field as GroupField)) {
			return { kind: 'field', field: field as GroupField };
		}
		return { kind: 'none' };
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

	const fabPosition = asString(root.fabPosition);
	if (fabPosition === 'right' || fabPosition === 'left' || fabPosition === 'hidden') {
		target.fabPosition = fabPosition;
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
}

export function normalizeSettingsFromSources(sources: unknown[]): TTasksSettings {
	const merged = cloneSettings(DEFAULT_SETTINGS);
	for (const source of sources) {
		applySettingsPatch(merged, source);
	}

	merged.tasksFolder = merged.tasksFolder.trim() || DEFAULT_SETTINGS.tasksFolder;
	merged.editorSuggestTrigger = normalizeEditorSuggestTrigger(merged.editorSuggestTrigger);
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

	return merged;
}

type ManagedListField = 'status' | 'area' | 'label';

interface ManagedListItem {
	id: number;
	originalValue: string | null;
	value: string;
	color: string;
}

interface ManagedListConfig {
	name: string;
	description: string;
	singularLabel: string;
	placeholder: string;
	requireOne?: boolean;
	allowClearMigration?: boolean;
	clearLabel?: string;
	field: ManagedListField;
	getValues: () => string[];
	applyValues: (values: string[]) => void;
	getColors: () => Record<string, string>;
	applyColors: (colors: Record<string, string>) => void;
	getDefaultMigrationTarget: (nextValues: string[]) => string | null;
}

const THEME_SWATCHES = [
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

function getDefaultThemeColor(index: number): string {
	return THEME_SWATCHES[index % THEME_SWATCHES.length]?.value ?? 'var(--text-muted)';
}

interface ValueMigrationModalOptions {
	title: string;
	description: string;
	removedValues: string[];
	targetOptions: string[];
	defaultTarget: string | null;
	allowClear: boolean;
	clearLabel: string;
}

let nextManagedListItemId = 1;

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
	if (valid.includes('Done')) return 'Done';
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
 * not the hardcoded strings 'Done' / 'Inbox', but whatever the user has
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

function createManagedListItem(value: string, color: string, originalValue: string | null = value): ManagedListItem {
	return {
		id: nextManagedListItemId++,
		originalValue,
		value,
		color,
	};
}

function normalizeManagedListValues(items: ManagedListItem[], requireOne = false): { values: string[]; colors: Record<string, string>; error?: string } {
	const values: string[] = [];
	const colors: Record<string, string> = {};
	const seen = new Set<string>();

	for (const item of items) {
		const value = item.value.trim();
		if (!value) {
			return { values: [], colors: {}, error: 'Remove blank items or give them a value before saving.' };
		}
		if (seen.has(value)) {
			return { values: [], colors: {}, error: `Duplicate value: ${value}` };
		}
		seen.add(value);
		values.push(value);
		if (item.color) {
			colors[value] = item.color;
		}
	}

	if (requireOne && values.length === 0) {
		return { values: [], colors: {}, error: 'At least one item is required.' };
	}

	return { values, colors };
}

function getRenameMappings(items: ManagedListItem[]): Record<string, string> {
	const mappings: Record<string, string> = {};
	for (const item of items) {
		const nextValue = item.value.trim();
		if (!item.originalValue || !nextValue) continue;
		if (item.originalValue !== nextValue) {
			mappings[item.originalValue] = nextValue;
		}
	}
	return mappings;
}

class ValueMigrationModal extends Modal {
	private readonly options: ValueMigrationModalOptions;
	private readonly selections = new Map<string, string | null>();
	private resolver: ((value: Record<string, string | null> | null) => void) | null = null;
	private settled = false;

	constructor(app: App, options: ValueMigrationModalOptions) {
		super(app);
		this.options = options;
		for (const removedValue of options.removedValues) {
			this.selections.set(removedValue, options.defaultTarget);
		}
	}

	openAndWait(): Promise<Record<string, string | null> | null> {
		return new Promise((resolve) => {
			this.resolver = resolve;
			this.open();
		});
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl('h2', { text: this.options.title });
		contentEl.createEl('p', { text: this.options.description });

		for (const removedValue of this.options.removedValues) {
			new Setting(contentEl)
				.setName(removedValue)
				.setDesc('Choose where existing tasks should move this value.')
				.addDropdown((dd) => {
					if (this.options.allowClear) {
						dd.addOption('__clear__', this.options.clearLabel);
					}
					for (const target of this.options.targetOptions) {
						dd.addOption(target, target);
					}
					dd.setValue(this.selections.get(removedValue) ?? '__clear__');
					dd.onChange((value) => {
						this.selections.set(removedValue, value === '__clear__' ? null : value);
					});
				});
		}

		const actionsEl = contentEl.createDiv({ cls: 'modal-button-container' });
		actionsEl.createEl('button', { text: 'Cancel' }).addEventListener('click', () => {
			this.finish(null);
			this.close();
		});
		actionsEl.createEl('button', { text: 'Apply migration', cls: 'mod-cta' }).addEventListener('click', () => {
			const result: Record<string, string | null> = {};
			for (const removedValue of this.options.removedValues) {
				result[removedValue] = this.selections.get(removedValue) ?? null;
			}
			this.finish(result);
			this.close();
		});
	}

	onClose(): void {
		super.onClose();
		this.contentEl.empty();
		this.finish(null);
	}

	private finish(result: Record<string, string | null> | null): void {
		if (this.settled) return;
		this.settled = true;
		this.resolver?.(result);
		this.resolver = null;
	}
}

class FolderSuggest extends AbstractInputSuggest<TFolder> {
	private inputEl: HTMLInputElement;

	constructor(app: App, inputEl: HTMLInputElement) {
		super(app, inputEl);
		this.inputEl = inputEl;
	}

	getSuggestions(query: string): TFolder[] {
		const q = query.toLowerCase();
		return this.app.vault.getAllLoadedFiles()
			.filter((f): f is TFolder => f instanceof TFolder)
			.filter(f => f.path.toLowerCase().includes(q))
			.slice(0, 20);
	}

	renderSuggestion(folder: TFolder, el: HTMLElement): void {
		el.setText(folder.path);
	}

	selectSuggestion(folder: TFolder): void {
		this.setValue(folder.path);
		this.inputEl.dispatchEvent(new Event('input'));
		this.close();
	}
}

export class TTasksSettingTab extends PluginSettingTab {
	plugin: TTasksPlugin;

	constructor(app: App, plugin: TTasksPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		this.renderManagedListStyles(containerEl);
		containerEl.createEl('h2', { text: 'TTasks Settings' });

		new Setting(containerEl)
			.setName('FAB position')
			.setDesc('Position of the floating action button for creating new tasks.')
			.addDropdown(dd => dd
				.addOption('right', 'Bottom right')
				.addOption('left', 'Bottom left')
				.addOption('hidden', 'Hidden')
				.setValue(this.plugin.settings.fabPosition)
				.onChange(async (value) => {
					this.plugin.settings.fabPosition = value as FabPosition;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Tasks folder')
			.setDesc('The folder TTasks owns. All task and project files will be stored here.')
			.addText(text => {
				new FolderSuggest(this.app, text.inputEl);
				text
					.setPlaceholder('Tasks')
					.setValue(this.plugin.settings.tasksFolder)
					.onChange(async (value) => {
						this.plugin.settings.tasksFolder = value.trim();
						await this.plugin.saveSettings();
						await this.plugin.taskStore.load();
					});
			});

		new Setting(containerEl)
			.setName('Inline task link trigger')
			.setDesc('Token used by inline editor suggestions for task linking (for example @task).')
			.addText(text => text
				.setPlaceholder('@task')
				.setValue(this.plugin.settings.editorSuggestTrigger)
				.onChange(async (value) => {
					this.plugin.settings.editorSuggestTrigger = normalizeEditorSuggestTrigger(value);
					await this.plugin.saveSettings();
				})
			);

		const statuses = this.plugin.settings.statuses ?? [];

		new Setting(containerEl)
			.setName('Completion status')
			.setDesc('Tasks with this status are treated as done. Used for filtering, reminders, and dependency checks.')
			.addDropdown(dd => {
				for (const s of statuses) dd.addOption(s, s);
				dd.setValue(statuses.includes(this.plugin.settings.completionStatus) ? this.plugin.settings.completionStatus : (statuses[0] ?? ''));
				dd.onChange(async (v) => {
					this.plugin.settings.completionStatus = v;
					await this.plugin.saveSettings();
					await this.plugin.taskStore.load();
				});
			});

		this.renderManagedListSetting(containerEl, {
			name: 'Statuses',
			description: 'Manage statuses as a draggable ordered list. Renames migrate existing tasks on save. The completion status can be renamed but not removed. Removing other statuses launches a remap.',
			singularLabel: 'Status',
			placeholder: 'Status name',
			requireOne: true,
			allowClearMigration: false,
			field: 'status',
			getValues: () => this.plugin.settings.statuses ?? [],
			applyValues: (values) => {
				this.plugin.settings.statuses = values;
			},
			getColors: () => this.plugin.settings.statusColors ?? {},
			applyColors: (colors) => {
				this.plugin.settings.statusColors = colors;
			},
			getDefaultMigrationTarget: (nextValues) => nextValues[0] ?? null,
		});

		this.renderManagedListSetting(containerEl, {
			name: 'Areas',
			description: 'Lines of work (e.g. Database, General, Work, Home). Tasks without an area are treated as inbox. Renames migrate existing tasks. Removing an area opens a remap or lets you clear it.',
			singularLabel: 'Area',
			placeholder: 'Area name',
			allowClearMigration: true,
			clearLabel: 'Clear area (move to inbox)',
			field: 'area',
			getValues: () => this.plugin.settings.areas ?? [],
			applyValues: (values) => {
				this.plugin.settings.areas = values;
			},
			getColors: () => this.plugin.settings.areaColors ?? {},
			applyColors: (colors) => {
				this.plugin.settings.areaColors = colors;
			},
			getDefaultMigrationTarget: () => null,
		});

		this.renderManagedListSetting(containerEl, {
			name: 'Labels',
			description: 'Cross-cutting labels applied to tasks and projects (e.g. feature, bug, research). Multi-value — a task can have several. Pre-seeded with defaults but fully user-configurable.',
			singularLabel: 'Label',
			placeholder: 'Label name',
			allowClearMigration: true,
			clearLabel: 'Remove label',
			field: 'label',
			getValues: () => this.plugin.settings.labelValues ?? [],
			applyValues: (values) => {
				this.plugin.settings.labelValues = values;
			},
			getColors: () => this.plugin.settings.labelColors ?? {},
			applyColors: (colors) => {
				this.plugin.settings.labelColors = colors;
			},
			getDefaultMigrationTarget: () => null,
		});

		this.renderViewsSettings(containerEl);
		this.renderQuickActionsSettings(containerEl);
		this.renderRemindersSettings(containerEl);
	}

	private renderViewsSettings(containerEl: HTMLElement): void {
		containerEl.createEl('h2', { text: 'Views' });
		containerEl.createEl('p', {
			text: 'Built-in views and Smart Lists now share one registry model. Smart Lists are saved query + renderer definitions with sidebar navigation.',
			cls: 'setting-item-description',
			attr: { style: 'margin-bottom: 12px;' },
		});

		const registeredViews = getRegisteredTaskViews(this.plugin.settings);
		const builtinViews = registeredViews.filter((view) => view.source === 'builtin');
		const customViews = this.plugin.settings.customViews;

		containerEl.createEl('h3', { text: 'Built-in Views' });
		for (const view of builtinViews) {
			new Setting(containerEl)
				.setName(view.name)
				.setDesc(`${view.id} • ${view.renderer} • ${this.describeTaskView(view)}`)
				.addExtraButton((button) => {
					button.setIcon(resolveTaskViewIcon(view));
					button.setTooltip('Built-in view');
					button.setDisabled(true);
				});
		}

		containerEl.createEl('h3', { text: 'Smart Lists' });
		if (customViews.length === 0) {
			containerEl.createEl('p', {
				text: 'No Smart Lists yet. Add one to create another board tab backed by the persisted query model.',
				cls: 'setting-item-description',
			});
		}

		customViews.forEach((view, index) => {
			new Setting(containerEl)
				.setName(view.name)
				.setDesc(`${view.id} • ${view.renderer} • ${this.describeTaskView(view)}`)
				.addText((text) => text
					.setPlaceholder('View name')
					.setValue(view.name)
					.onChange(async (value) => {
						await this.updateCustomView(index, (current) => ({
							...current,
							name: value.trim() || current.name,
						}));
					})
				)
				.addButton((button) => {
					button.setButtonText('Edit query');
					button.setTooltip('Open the filter / sort / group editor for this view');
					button.onClick(() => {
						new QueryEditorModal(
							this.app,
							view.name,
							view.query,
							view.renderer,
							{
								statuses: this.plugin.settings.statuses,
								areas: this.plugin.settings.areas,
								labelValues: this.plugin.settings.labelValues,
							},
							async (updatedQuery, updatedRenderer, updatedName) => {
								await this.updateCustomView(index, (current) => ({
									...current,
									name: updatedName,
									query: updatedQuery,
									renderer: updatedRenderer,
								}));
								this.display();
							},
						).open();
					});
				})
				.addExtraButton((button) => {
					button.setIcon('trash');
					button.setTooltip('Delete custom view');
					button.onClick(async () => {
						const nextViews = this.plugin.settings.customViews.filter((_, candidateIndex) => candidateIndex !== index);
						await this.saveCustomViews(nextViews, true);
					});
				});

			new Setting(containerEl)
				.setName('Icon')
				.setDesc('Optional icon override for the board rail and mobile tabs.')
				.addText((text) => text
					.setPlaceholder(resolveTaskViewIcon(view))
					.setValue(view.icon ?? '')
					.onChange(async (value) => {
						await this.updateCustomView(index, (current) => ({
							...current,
							icon: value.trim() || null,
						}));
					})
				)
				.addExtraButton((button) => {
					button.setIcon(resolveTaskViewIcon(view));
					button.setTooltip('Resolved icon');
					button.setDisabled(true);
				});

			new Setting(containerEl)
				.setName('Renderer')
				.setDesc('Choose how this saved query is rendered in the board.')
				.addDropdown((dropdown) => {
					dropdown.addOption('list', 'List');
					dropdown.addOption('kanban', 'Kanban');
					dropdown.addOption('agenda', 'Agenda');
					dropdown.addOption('graph', 'Graph');
					dropdown.setValue(view.renderer);
					dropdown.onChange(async (value) => {
						await this.updateCustomView(index, (current) => ({
							...current,
							renderer: value as TaskViewRenderer,
						}));
						this.display();
					});
				});

			new Setting(containerEl)
				.setName('List hierarchy')
				.setDesc('Used by list-rendered views to show parent/child structure or a flat list.')
				.addDropdown((dropdown) => {
					dropdown.addOption('tree', 'Tree');
					dropdown.addOption('flat', 'Flat');
					dropdown.setValue(view.presentation.hierarchy);
					dropdown.onChange(async (value) => {
						await this.updateCustomView(index, (current) => ({
							...current,
							presentation: {
								...current.presentation,
								hierarchy: value as TaskViewPresentation['hierarchy'],
							},
						}));
					});
				});

			new Setting(containerEl)
				.setName('Graph default mode')
				.setDesc('Used by graph-rendered views to choose the default graph tab when opened.')
				.addDropdown((dropdown) => {
					dropdown.addOption('dependency', 'Dependency');
					dropdown.addOption('overview', 'Overview');
					dropdown.setValue(view.presentation.graphMode);
					dropdown.onChange(async (value) => {
						await this.updateCustomView(index, (current) => ({
							...current,
							presentation: {
								...current.presentation,
								graphMode: value as TaskViewPresentation['graphMode'],
							},
						}));
					});
				});
		});

		new Setting(containerEl)
			.setName('Add Smart List')
			.setDesc('Creates another saved board tab using the shared view registry model.')
			.addButton((button) => {
				button.setButtonText('Add Smart List');
				button.setCta();
				button.onClick(async () => {
					const nextViews = [...this.plugin.settings.customViews, createCustomViewDefinition(this.plugin.settings.customViews)];
					await this.saveCustomViews(nextViews, true);
				});
			});
	}

	private describeTaskView(view: Pick<CustomTaskViewDefinition, 'renderer' | 'query' | 'presentation'>): string {
		const filterCount = view.query.filter.conditions.length;
		const sortCount = view.query.sort.length;
		const groupLabel = view.query.group.kind === 'none'
			? 'ungrouped'
			: view.query.group.kind === 'field'
				? `group ${view.query.group.field}`
				: 'agenda buckets';
		const searchLabel = view.query.search ? `search \"${view.query.search}\"` : 'no search';
		return `${groupLabel} • ${filterCount} filter${filterCount === 1 ? '' : 's'} • ${sortCount} sort${sortCount === 1 ? '' : 's'} • ${searchLabel} • ${view.presentation.hierarchy}/${view.presentation.graphMode}`;
	}

	private async updateCustomView(
		index: number,
		updater: (view: CustomTaskViewDefinition) => CustomTaskViewDefinition,
	): Promise<void> {
		const nextViews = this.plugin.settings.customViews.map((view, candidateIndex) => (
			candidateIndex === index ? updater(view) : view
		));
		await this.saveCustomViews(nextViews, false);
	}

	private async saveCustomViews(customViews: CustomTaskViewDefinition[], rerender: boolean): Promise<void> {
		this.plugin.settings.customViews = customViews;
		await this.plugin.saveSettings();
		if (rerender) this.display();
	}

	private renderQuickActionsSettings(containerEl: HTMLElement): void {
		containerEl.createEl('h2', { text: 'Quick Actions' });
		containerEl.createEl('p', {
			text: 'Quick actions update task status and due dates. On mobile, touch-and-hold opens a thumb menu that uses these preferences.',
			cls: 'setting-item-description',
			attr: { style: 'margin-bottom: 12px;' },
		});

		const statuses = this.plugin.settings.statuses ?? [];
		const qa = this.plugin.settings.quickActions;

		new Setting(containerEl)
			.setName('Start status')
			.setDesc('Status applied by Start from the quick actions menu.')
			.addDropdown(dd => {
				for (const s of statuses) dd.addOption(s, s);
				dd.setValue(statuses.includes(qa.startStatus) ? qa.startStatus : (statuses[0] ?? ''));
				dd.onChange(async (v) => {
					this.plugin.settings.quickActions.startStatus = v;
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName('Block status')
			.setDesc('Status applied by Block from the quick actions menu.')
			.addDropdown(dd => {
				for (const s of statuses) dd.addOption(s, s);
				dd.setValue(statuses.includes(qa.blockStatus) ? qa.blockStatus : (statuses[0] ?? ''));
				dd.onChange(async (v) => {
					this.plugin.settings.quickActions.blockStatus = v;
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName('Defer days')
			.setDesc('Default days used when the defer action does not receive a specific preset date. If there is no due date, today is used as the base.')
			.addText(text => text
				.setPlaceholder('1')
				.setValue(String(qa.deferDays))
				.onChange(async (v) => {
					const n = parseInt(v, 10);
					if (!isNaN(n) && n >= 1 && n <= 365) {
						this.plugin.settings.quickActions.deferDays = n;
						await this.plugin.saveSettings();
					}
				})
			);

	}

	private renderRemindersSettings(containerEl: HTMLElement): void {
		containerEl.createEl('h2', { text: 'Reminders' });
		containerEl.createEl('p', {
			text: 'Reminders fire as Obsidian notices when tasks are due, overdue, or stale. Each reminder fires at most once per task per day.',
			cls: 'setting-item-description',
			attr: { style: 'margin-bottom: 12px;' },
		});

		const r = this.plugin.settings.reminders;

		new Setting(containerEl)
			.setName('Enable reminders')
			.setDesc('Master switch. When off, no reminders will fire.')
			.addToggle(toggle => toggle
				.setValue(r.enabled)
				.onChange(async (value) => {
					this.plugin.settings.reminders.enabled = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Due today')
			.setDesc('Notify when a task is due today.')
			.addToggle(toggle => toggle
				.setValue(r.ruleDueToday)
				.onChange(async (value) => {
					this.plugin.settings.reminders.ruleDueToday = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Overdue')
			.setDesc("Notify when a task's due date has already passed.")
			.addToggle(toggle => toggle
				.setValue(r.ruleOverdue)
				.onChange(async (value) => {
					this.plugin.settings.reminders.ruleOverdue = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Lead time')
			.setDesc('Notify N days before a task is due.')
			.addToggle(toggle => toggle
				.setValue(r.ruleLeadTime)
				.onChange(async (value) => {
					this.plugin.settings.reminders.ruleLeadTime = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Lead time (days)')
			.setDesc('How many days before the due date to start notifying. Requires Lead time to be enabled.')
			.addText(text => text
				.setPlaceholder('1')
				.setValue(String(r.leadTimeDays))
				.onChange(async (v) => {
					const n = parseInt(v, 10);
					if (!isNaN(n) && n >= 1 && n <= 14) {
						this.plugin.settings.reminders.leadTimeDays = n;
						await this.plugin.saveSettings();
					}
				}));

		new Setting(containerEl)
			.setName('Stale in-progress')
			.setDesc('Notify when a task has been in the start status for longer than the threshold.')
			.addToggle(toggle => toggle
				.setValue(r.ruleStaleInProgress)
				.onChange(async (value) => {
					this.plugin.settings.reminders.ruleStaleInProgress = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Stale threshold (days)')
			.setDesc("Number of days a task must be in-progress before being considered stale. Uses the task's start date.")
			.addText(text => text
				.setPlaceholder('7')
				.setValue(String(r.staleThresholdDays))
				.onChange(async (v) => {
					const n = parseInt(v, 10);
					if (!isNaN(n) && n >= 1 && n <= 90) {
						this.plugin.settings.reminders.staleThresholdDays = n;
						await this.plugin.saveSettings();
					}
				}));

		new Setting(containerEl)
			.setName('Enable quiet hours')
			.setDesc('Suppress reminders during a configured time window.')
			.addToggle(toggle => toggle
				.setValue(r.quietHoursEnabled)
				.onChange(async (value) => {
					this.plugin.settings.reminders.quietHoursEnabled = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Quiet hours start')
			.setDesc('Hour of day (0-23) when quiet period begins.')
			.addText(text => text
				.setPlaceholder('22')
				.setValue(String(r.quietStart))
				.onChange(async (v) => {
					const n = parseInt(v, 10);
					if (!isNaN(n) && n >= 0 && n <= 23) {
						this.plugin.settings.reminders.quietStart = n;
						await this.plugin.saveSettings();
					}
				}));

		new Setting(containerEl)
			.setName('Quiet hours end')
			.setDesc('Hour of day (0-23) when quiet period ends. If less than start, wraps midnight (e.g. 22 to 8).')
			.addText(text => text
				.setPlaceholder('8')
				.setValue(String(r.quietEnd))
				.onChange(async (v) => {
					const n = parseInt(v, 10);
					if (!isNaN(n) && n >= 0 && n <= 23) {
						this.plugin.settings.reminders.quietEnd = n;
						await this.plugin.saveSettings();
					}
				}));
	}

	private renderManagedListStyles(containerEl: HTMLElement): void {
		const styleEl = containerEl.createEl('style');
		styleEl.textContent = `
			.tt-managed-list-section {
				border: 1px solid var(--background-modifier-border);
				border-radius: 12px;
				padding: 10px;
				margin: 16px 0;
				background: var(--background-secondary);
			}
			.tt-managed-list-section-header {
				margin-bottom: 10px;
			}
			.tt-managed-list-section-header h3 {
				margin: 0 0 4px 0;
				font-size: 1rem;
			}
			.tt-managed-list-section-header p {
				margin: 0;
				color: var(--text-muted);
				font-size: 0.9rem;
			}
			.tt-managed-list-legend {
				display: flex;
				align-items: center;
				gap: 8px;
				flex-wrap: wrap;
				margin-top: 10px;
			}
			.tt-managed-list-legend-label {
				font-size: 0.8rem;
				color: var(--text-muted);
			}
			.tt-managed-list-legend-item {
				display: inline-flex;
				align-items: center;
				gap: 6px;
				font-size: 0.78rem;
				color: var(--text-muted);
			}
			.tt-managed-list-legend-dot {
				width: 12px;
				height: 12px;
				border-radius: 999px;
				background: var(--tt-swatch-color);
				border: 1px solid var(--background-modifier-border);
			}
			.tt-managed-list-rows {
				display: flex;
				flex-direction: column;
				gap: 6px;
			}
			.tt-managed-list-row {
				--tt-item-accent: var(--tt-item-color, var(--text-muted));
				--tt-item-tint-bg: color-mix(in srgb, var(--tt-item-accent) 12%, var(--background-primary));
				--tt-item-tint-border: color-mix(in srgb, var(--tt-item-accent) 42%, var(--background-modifier-border));
				display: grid;
				grid-template-columns: 22px minmax(0, 1fr) auto;
				gap: 6px;
				align-items: start;
				padding: 8px;
				border: 1px solid color-mix(in srgb, var(--tt-item-accent) 28%, var(--background-modifier-border));
				border-radius: 8px;
				background: color-mix(in srgb, var(--tt-item-accent) 6%, var(--background-primary));
				box-shadow: inset 3px 0 0 var(--tt-item-accent, transparent);
			}
			.tt-managed-list-row.is-dragging {
				opacity: 0.55;
			}
			.tt-managed-list-row.is-drop-target {
				border-color: var(--interactive-accent);
				box-shadow: 0 0 0 1px var(--interactive-accent);
			}
			.tt-managed-list-handle {
				display: flex;
				align-items: center;
				justify-content: center;
				color: var(--text-faint);
				cursor: grab;
				min-height: 30px;
			}
			.tt-managed-list-handle:active {
				cursor: grabbing;
			}
			.tt-managed-list-main {
				display: flex;
				flex-direction: column;
				gap: 3px;
				min-width: 0;
			}
			.tt-managed-list-title-row {
				display: flex;
				align-items: center;
				gap: 8px;
				min-width: 0;
			}
			.tt-managed-list-title-row .tt-managed-list-input {
				flex: 1 1 auto;
			}
			.tt-managed-list-preview {
				display: inline-flex;
				align-items: center;
				gap: 6px;
				flex: 0 0 auto;
				font-size: 0.72rem;
				line-height: 1.2;
				padding: 1px 7px;
				border-radius: 999px;
				border: 1px solid var(--tt-item-tint-border);
				background: var(--tt-item-tint-bg);
				color: var(--tt-item-accent);
			}
			.tt-managed-list-color-row {
				display: flex;
				align-items: center;
				gap: 6px;
				flex-wrap: wrap;
			}
			.tt-managed-list-color-row.is-collapsed {
				display: none;
			}
			.tt-managed-list-swatches {
				display: flex;
				gap: 4px;
				flex-wrap: wrap;
			}
			.tt-managed-list-swatch {
				appearance: none;
				-webkit-appearance: none;
				width: 16px;
				height: 16px;
				min-width: 16px;
				min-height: 16px;
				border-radius: 999px;
				border: 1px solid color-mix(in srgb, var(--tt-swatch-color, var(--background-modifier-border)) 40%, var(--background-modifier-border));
				padding: 0;
				cursor: pointer;
				background: none !important;
				background-color: var(--tt-swatch-color, var(--background-modifier-border)) !important;
				background-image: none !important;
				box-shadow: none !important;
			}
			.tt-managed-list-swatch:hover {
				transform: scale(1.06);
			}
			.tt-managed-list-swatch.is-selected {
				border-color: var(--interactive-accent);
				box-shadow: 0 0 0 1px var(--background-primary), 0 0 0 2px var(--interactive-accent) !important;
			}
			.tt-managed-list-clear-color {
				font-size: 0.76rem;
				padding: 4px 8px;
			}
			.tt-managed-list-input {
				width: 100%;
				min-width: 0;
				min-height: 30px;
				padding: 4px 8px;
			}
			.tt-managed-list-meta {
				font-size: 0.74rem;
				line-height: 1.2;
				color: var(--text-muted);
				min-height: 0;
			}
			.tt-managed-list-meta:empty {
				display: none;
			}
			.tt-managed-list-color {
				width: 28px;
				height: 24px;
				padding: 0;
				border: none;
				background: transparent;
			}
			.tt-managed-list-row-actions {
				display: flex;
				align-items: flex-start;
				gap: 6px;
				padding-top: 1px;
			}
			.tt-managed-list-row-actions button {
				padding: 6px 10px;
				font-size: 0.8rem;
			}
			.tt-managed-list-row-actions .tt-managed-list-color-toggle {
				display: inline-flex;
				align-items: center;
				gap: 6px;
				color: var(--tt-item-accent);
				border-color: var(--tt-item-tint-border);
				background: var(--tt-item-tint-bg);
			}
			.tt-managed-list-color-toggle-dot {
				width: 10px;
				height: 10px;
				border-radius: 999px;
				background: var(--tt-item-accent);
				border: 1px solid color-mix(in srgb, var(--tt-item-accent) 35%, var(--background-modifier-border));
				flex: 0 0 auto;
			}
			.tt-managed-list-row-actions .tt-managed-list-color-toggle.is-active {
				box-shadow: inset 0 0 0 1px var(--tt-item-tint-border);
			}
			.tt-managed-list-row-actions .tt-managed-list-remove {
				color: var(--text-muted);
				background: transparent;
				border-color: var(--background-modifier-border);
			}
			.tt-managed-list-row-actions .tt-managed-list-remove:hover:not(:disabled) {
				color: var(--color-red);
				border-color: color-mix(in srgb, var(--color-red) 35%, var(--background-modifier-border));
				background: color-mix(in srgb, var(--color-red) 8%, var(--background-primary));
			}
			.tt-managed-list-actions {
				display: flex;
				gap: 8px;
				justify-content: flex-end;
				margin-top: 12px;
			}
			.tt-managed-list-empty {
				padding: 10px 12px;
				border: 1px dashed var(--background-modifier-border);
				border-radius: 10px;
				color: var(--text-muted);
				background: var(--background-primary);
			}
		`;
	}

	private renderManagedListSetting(containerEl: HTMLElement, config: ManagedListConfig): void {
		const sectionEl = containerEl.createDiv({ cls: 'tt-managed-list-section' });
		const headerEl = sectionEl.createDiv({ cls: 'tt-managed-list-section-header' });
		headerEl.createEl('h3', { text: config.name });
		headerEl.createEl('p', { text: config.description });
		const legendEl = headerEl.createDiv({ cls: 'tt-managed-list-legend' });
		legendEl.createDiv({ cls: 'tt-managed-list-legend-label', text: 'Theme swatches:' });
		for (const swatch of THEME_SWATCHES) {
			const legendItem = legendEl.createDiv({ cls: 'tt-managed-list-legend-item' });
			const dot = legendItem.createDiv({ cls: 'tt-managed-list-legend-dot' });
			dot.style.setProperty('--tt-swatch-color', swatch.value);
			legendItem.createSpan({ text: swatch.label });
		}
		legendEl.createDiv({ cls: 'tt-managed-list-legend-label', text: 'Use the picker for custom colors.' });

		const listEl = sectionEl.createDiv({ cls: 'tt-managed-list-rows' });
		const actionsEl = sectionEl.createDiv({ cls: 'tt-managed-list-actions' });
		const state = {
			items: config.getValues().map((value, index) => createManagedListItem(value, config.getColors()[value] ?? getDefaultThemeColor(index))),
			draggingId: null as number | null,
			dropTargetId: null as number | null,
			expandedColorIds: new Set<number>(),
		};
		const completionStatus = this.plugin.settings.completionStatus;

		const renderRows = () => {
			listEl.empty();

			if (state.items.length === 0) {
				listEl.createDiv({ cls: 'tt-managed-list-empty', text: `No ${config.name.toLowerCase()} yet. Use Add ${config.singularLabel.toLowerCase()} to create the first item.` });
			}

			state.items.forEach((item) => {
				const rowEl = listEl.createDiv({ cls: 'tt-managed-list-row' });
				rowEl.style.setProperty('--tt-item-color', item.color || getDefaultThemeColor(0));
				const updateRowClasses = () => {
					rowEl.toggleClass('is-dragging', state.draggingId === item.id);
					rowEl.toggleClass('is-drop-target', state.dropTargetId === item.id);
				};
				if (state.draggingId === item.id) rowEl.addClass('is-dragging');
				if (state.dropTargetId === item.id) rowEl.addClass('is-drop-target');

				rowEl.addEventListener('dragover', (event) => {
					event.preventDefault();
					if (state.dropTargetId !== item.id) {
						state.dropTargetId = item.id;
						listEl.querySelectorAll('.tt-managed-list-row').forEach((el) => el.removeClass('is-drop-target'));
						rowEl.addClass('is-drop-target');
					}
					if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
				});

				rowEl.addEventListener('drop', (event) => {
					event.preventDefault();
					const draggingId = state.draggingId;
					state.draggingId = null;
					state.dropTargetId = null;
					if (draggingId === null || draggingId === item.id) {
						renderRows();
						return;
					}
					const fromIndex = state.items.findIndex(entry => entry.id === draggingId);
					const toIndex = state.items.findIndex(entry => entry.id === item.id);
					if (fromIndex < 0 || toIndex < 0) {
						renderRows();
						return;
					}
					const [moved] = state.items.splice(fromIndex, 1);
					state.items.splice(toIndex, 0, moved);
					renderRows();
				});

				const handleEl = rowEl.createDiv({ cls: 'tt-managed-list-handle' });
				handleEl.draggable = true;
				setIcon(handleEl, 'grip-vertical');
				handleEl.addEventListener('dragstart', (event) => {
					state.draggingId = item.id;
					state.dropTargetId = item.id;
					event.dataTransfer?.setData('text/plain', String(item.id));
					if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
					updateRowClasses();
				});
				handleEl.addEventListener('dragend', () => {
					state.draggingId = null;
					state.dropTargetId = null;
					listEl.querySelectorAll('.tt-managed-list-row').forEach((el) => {
						el.removeClass('is-dragging');
						el.removeClass('is-drop-target');
					});
				});

				const mainEl = rowEl.createDiv({ cls: 'tt-managed-list-main' });
				const titleRowEl = mainEl.createDiv({ cls: 'tt-managed-list-title-row' });
				const inputEl = titleRowEl.createEl('input', {
					cls: 'tt-managed-list-input',
					attr: {
						type: 'text',
						placeholder: config.placeholder,
						value: item.value,
					},
				});
				const previewEl = titleRowEl.createDiv({ cls: 'tt-managed-list-preview', text: item.value || config.singularLabel });
				inputEl.addEventListener('input', () => {
					item.value = inputEl.value;
					previewEl.setText(item.value.trim() || config.singularLabel);
					metaEl.setText(item.originalValue && item.originalValue !== item.value.trim()
						? `Will migrate ${item.originalValue} to ${item.value.trim() || '(blank)'}.`
						: '');
				});

				const metaEl = mainEl.createDiv({ cls: 'tt-managed-list-meta' });
				metaEl.setText(item.originalValue && item.originalValue !== item.value.trim()
					? `Will migrate ${item.originalValue} to ${item.value.trim() || '(blank)'}.`
					: '');

				const colorRowEl = mainEl.createDiv({ cls: 'tt-managed-list-color-row' });
				if (!state.expandedColorIds.has(item.id)) {
					colorRowEl.addClass('is-collapsed');
				}
				const swatchesEl = colorRowEl.createDiv({ cls: 'tt-managed-list-swatches' });
				for (const swatch of THEME_SWATCHES) {
					const swatchButton = swatchesEl.createEl('button', {
						cls: 'tt-managed-list-swatch',
						attr: { type: 'button', 'aria-label': `${swatch.label} swatch` },
					});
					swatchButton.style.setProperty('--tt-swatch-color', swatch.value);
					if (item.color === swatch.value) swatchButton.addClass('is-selected');
					swatchButton.addEventListener('click', () => {
						item.color = swatch.value;
						renderRows();
					});
				}

				const colorEl = colorRowEl.createEl('input', {
					cls: 'tt-managed-list-color',
					attr: { type: 'color', value: item.color.startsWith('#') ? item.color : '#808080', 'aria-label': `${config.singularLabel} custom color` },
				});
				colorEl.addEventListener('input', () => {
					item.color = colorEl.value;
					rowEl.style.setProperty('--tt-item-color', item.color);
				});

				const clearColorButton = colorRowEl.createEl('button', { text: 'Clear', cls: 'tt-managed-list-clear-color' });
				clearColorButton.addEventListener('click', () => {
					item.color = getDefaultThemeColor(state.items.findIndex(entry => entry.id === item.id));
					renderRows();
				});

				const actionsRowEl = rowEl.createDiv({ cls: 'tt-managed-list-row-actions' });
				const toggleColorButton = actionsRowEl.createEl('button', { cls: 'tt-managed-list-color-toggle' });
				toggleColorButton.createSpan({ cls: 'tt-managed-list-color-toggle-dot' });
				toggleColorButton.createSpan({ text: 'Color' });
				if (state.expandedColorIds.has(item.id)) {
					toggleColorButton.addClass('is-active');
				}
				toggleColorButton.addEventListener('click', () => {
					if (state.expandedColorIds.has(item.id)) {
						state.expandedColorIds.delete(item.id);
					} else {
						state.expandedColorIds.add(item.id);
					}
					renderRows();
				});
				const isProtectedSystem = config.field === 'status' && (
					item.originalValue === completionStatus || item.value.trim() === completionStatus
				);
				const removeButton = actionsRowEl.createEl('button', { text: 'Remove', cls: 'tt-managed-list-remove' });
				if (isProtectedSystem) {
					removeButton.disabled = true;
					removeButton.title = 'The completion status can be renamed but not removed.';
				}
				removeButton.addEventListener('click', () => {
					if (isProtectedSystem) return;
					state.items = state.items.filter(entry => entry.id !== item.id);
					renderRows();
				});
			});
		};

		const addButton = actionsEl.createEl('button', { text: `Add ${config.singularLabel.toLowerCase()}` });
		addButton.addEventListener('click', () => {
			const nextItem = createManagedListItem('', getDefaultThemeColor(state.items.length), null);
			state.items.push(nextItem);
			state.expandedColorIds.add(nextItem.id);
			renderRows();
		});

		const resetButton = actionsEl.createEl('button', { text: 'Reset' });
		resetButton.addEventListener('click', () => {
			state.items = config.getValues().map((value, index) => createManagedListItem(value, config.getColors()[value] ?? getDefaultThemeColor(index)));
			state.expandedColorIds.clear();
			renderRows();
		});

		const saveButton = actionsEl.createEl('button', { text: 'Save changes', cls: 'mod-cta' });
		saveButton.addEventListener('click', async () => {
			await this.saveManagedList(config, state.items);
		});

		renderRows();
	}

	private async saveManagedList(config: ManagedListConfig, items: ManagedListItem[]): Promise<void> {
		const validation = normalizeManagedListValues(items, config.requireOne ?? false);
		if (validation.error) {
			new Notice(`TTasks: ${validation.error}`);
			return;
		}

		const previousValues = config.getValues();
		const nextValues = validation.values;
		const renameMappings = getRenameMappings(items);
		const currentCompletionStatus = this.plugin.settings.completionStatus;
		const removedValues = previousValues.filter(
			(value) => !nextValues.includes(value) && !Object.prototype.hasOwnProperty.call(renameMappings, value)
		);

		if (config.field === 'status') {
			if (removedValues.includes(currentCompletionStatus)) {
				new Notice('TTasks: the completion status cannot be removed — rename it instead.');
				return;
			}
		}

		let removalMappings: Record<string, string | null> = {};
		if (removedValues.length > 0) {
			const modal = new ValueMigrationModal(this.app, {
				title: `${config.name}: migrate removed values`,
				description: `Map each removed ${config.singularLabel.toLowerCase()} to a remaining option.${config.allowClearMigration ? ' You can also clear the field.' : ''}`,
				removedValues,
				targetOptions: nextValues,
				defaultTarget: config.getDefaultMigrationTarget(nextValues),
				allowClear: config.allowClearMigration ?? false,
				clearLabel: config.clearLabel ?? 'Clear value',
			});
			const result = await modal.openAndWait();
			if (!result) return;
			removalMappings = result;
		}

		config.applyValues(nextValues);
		config.applyColors(validation.colors);
		if (config.field === 'status') {
			this.plugin.settings.completionStatus = renameMappings[currentCompletionStatus] ?? currentCompletionStatus;
		}
		await this.plugin.saveSettings();

		const allMappings: Record<string, string | null> = { ...renameMappings, ...removalMappings };
		let migrated = 0;
		if (Object.keys(allMappings).length > 0) {
			migrated = await this.plugin.taskStore.migrateFieldValues(config.field, allMappings);
		}

		if (config.field === 'status') {
			migrated += await this.plugin.taskStore.migrateStatuses(this.plugin.settings.statuses);
		}

		await this.plugin.taskStore.load();

		if (migrated > 0) {
			new Notice(`TTasks: saved ${config.name.toLowerCase()} and migrated ${migrated} task(s).`);
		} else {
			new Notice(`TTasks: saved ${config.name.toLowerCase()}.`);
		}

		this.display();
	}
}