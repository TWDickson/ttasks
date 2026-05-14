import type { QuerySpec } from '../query/types';
export type FabPosition = 'right' | 'left' | 'hidden';
export type QuickActionId = 'none' | 'start' | 'complete' | 'block' | 'defer';
export type TaskViewRenderer = 'list' | 'kanban' | 'agenda' | 'graph';
export type LogbookRendererMode = 'list' | 'kanban';
export type OverviewGraphGrouping = 'project' | 'dependency' | 'none';

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

export type ArchiveMode = 'manual' | 'scheduled';

export interface ArchiveSettings {
	mode: ArchiveMode;
	daysAfterComplete: number;
}

export interface TTasksSettings {
	tasksFolder: string;
	editorSuggestTrigger: string;
	fabPosition: FabPosition;
	logbookRendererMode: LogbookRendererMode;
	overviewGraphGrouping: OverviewGraphGrouping;
	overviewGraphShowCompleted: boolean;
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
	archive: ArchiveSettings;
}
