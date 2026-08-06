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
	migrateLegacyStatusColors,
	normalizeEditorSuggestTrigger,
} from './settings/defaults';
// The status resolvers are deliberately *not* re-exported. They belong to
// `normalizeSettingsFromSources`, which runs them on load and on every save;
// consumers read the already-resolved pointers off a StatusPolicy instead of
// re-deriving them at the point of use. See settings/statusPolicy.
export { buildStatusPolicy, type StatusPolicy, type StatusPolicySettings } from './settings/statusPolicy';
export { TTasksSettingTab } from './settings/SettingsTab';
