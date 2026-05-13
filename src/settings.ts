// Re-export shim — preserves all existing import paths across the codebase.
// Source of truth is now split across src/settings/{types,defaults,SettingsTab}.ts.
export type {
	FabPosition,
	QuickActionId,
	TaskViewRenderer,
	LogbookRendererMode,
	OverviewGraphGrouping,
	TaskViewPresentation,
	CustomTaskViewDefinition,
	QuickActionsSettings,
	RemindersSettings,
	TTasksSettings,
} from './settings/types';
export {
	QUICK_ACTION_LABELS,
	QUICK_ACTION_OPTIONS,
} from './settings/types';
export {
	DEFAULT_STATUSES,
	DEFAULT_REMINDERS_SETTINGS,
	DEFAULT_SETTINGS,
	THEME_SWATCHES,
	getDefaultThemeColor,
	normalizeQuerySpec,
	normalizeSettingsFromSources,
	normalizeStatuses,
	normalizeColorMap,
	resolveCompletionStatus,
	resolveConfiguredStatus,
	resolveEmergencyStatus,
	isSystemStatus,
	normalizeEditorSuggestTrigger,
} from './settings/defaults';
export { TTasksSettingTab } from './settings/SettingsTab';
