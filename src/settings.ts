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
	CaptureSourceDefaults,
	CaptureSourceConfig,
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
	DEFAULT_CAPTURE_SOURCE_DEFAULTS,
	DEFAULT_CAPTURE_SOURCE_CONFIG,
	DEFAULT_SETTINGS,
	THEME_SWATCHES,
	getDefaultThemeColor,
	normalizeQuerySpec,
	normalizeSettingsFromSources,
	normalizeCaptureSource,
	normalizeCaptureSourceDefaults,
	normalizeStatuses,
	normalizeColorMap,
	resolveCompletionStatus,
	resolveConfiguredStatus,
	resolveEmergencyStatus,
	isSystemStatus,
	normalizeEditorSuggestTrigger,
} from './settings/defaults';
export { TTasksSettingTab } from './settings/SettingsTab';
