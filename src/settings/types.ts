import type { QuerySpec } from '../query/types';
import type { Task } from '../types';
export type FabPosition = 'right' | 'left' | 'hidden';
export type QuickActionId = 'none' | 'start' | 'complete' | 'block' | 'defer';
export type TaskViewRenderer = 'list' | 'kanban' | 'agenda' | 'graph' | 'archive';
export type LogbookRendererMode = 'list' | 'kanban';
export type OverviewGraphGrouping = 'project' | 'dependency' | 'none';

export interface CaptureSourceDefaults {
	area: string | null;
	labels: string[];
	status: string | null;
	priority: Task['priority'] | null;
	assignedTo: string | null;
}

export interface HolidayEntry {
	/** Anchor date, YYYY-MM-DD. When repeatYearly is true only the MM-DD matters. */
	date: string;
	/** Human-readable label (e.g. "Christmas Day"). May be empty. */
	name: string;
	/** When true, the holiday applies to this MM-DD in every year. */
	repeatYearly: boolean;
}

export interface CaptureSourceConfig {
	path: string;
	includeSubdirectories: boolean;
	mode: 'auto-capture' | 'manual' | 'auto-promote';
	sectionFilter: string;
	inheritDateFromFilename: boolean;
	defaults: CaptureSourceDefaults;
}

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

export type KanbanCardField = 'area' | 'dueDate' | 'labels' | 'depCount';

export type ArchiveMode = 'manual' | 'scheduled';

export interface ArchiveSettings {
	mode: ArchiveMode;
	daysAfterComplete: number;
}

export type StatusBarClickTarget = 'agenda' | 'board' | 'today';

export interface StatusBarSettings {
	/** Hide the desktop status-bar item entirely when nothing is overdue/blocked. */
	hideWhenZero: boolean;
	/** Which view the status-bar click opens. */
	clickTarget: StatusBarClickTarget;
}

export interface PomodoroSettings {
	focusMinutes: number;
	shortBreakMinutes: number;
	longBreakMinutes: number;
	/** Take a long break after this many completed focus phases. */
	longBreakInterval: number;
	/** Auto-start the next phase when one completes, vs. waiting for the user. */
	autoStartNext: boolean;
	/** Append each completed focus session to a CSV log file. */
	logEnabled: boolean;
	/** Vault-relative path of the CSV session log. */
	logPath: string;
}

export interface TTasksSettings {
	tasksFolder: string;
	editorSuggestTrigger: string;
	captureSources: CaptureSourceConfig[];
	captureSourceDefaultMode: CaptureSourceConfig['mode'];
	captureSourceDefaultDefaults: CaptureSourceDefaults;
	fabPosition: FabPosition;
	logbookRendererMode: LogbookRendererMode;
	overviewGraphGrouping: OverviewGraphGrouping;
	overviewGraphShowCompleted: boolean;
	/** Project note paths the user has hidden from the dependency graph via the
	 *  project filter (GP3). Stale entries (deleted projects) are ignored. */
	graphHiddenProjects: string[];
	graphDiagnosticsEnabled: boolean;
	customViews: CustomTaskViewDefinition[];
	/** Built-in view ids the user has hidden from the board rail. Hidden views
	 *  stay resolvable by id (protocol / jump), they just don't show in the rail. */
	hiddenBuiltinViews: string[];
	statuses: string[];
	completionStatus: string;
	statusColors: Record<string, string>;
	areas: string[];
	areaColors: Record<string, string>;
	/** Per-area "skip weekends & holidays" toggle. Areas present here drive their
	 *  tasks' working calendar; areas absent fall back to legacy per-task
	 *  workweek_only. Personal areas leave this off (weekend scheduling allowed);
	 *  work areas turn it on. */
	areaWorkweek: Record<string, boolean>;
	/** Universal holidays skipped by any area whose workweek toggle is on.
	 *  Replaces per-task holiday_dates as the source of truth. Each entry has a
	 *  date, an optional name, and a yearly-repeat flag. */
	holidays: HolidayEntry[];
	labelValues: string[];
	labelColors: Record<string, string>;
	quickActions: QuickActionsSettings;
	reminders: RemindersSettings;
	archive: ArchiveSettings;
	statusBar: StatusBarSettings;
	pomodoro: PomodoroSettings;
	kanbanCardFields: KanbanCardField[];
	kanbanCollapsedColumns: string[];
	/** Per-view "Show completed" choice, keyed by view id. Unset views fall back
	 *  to defaultCompletedVisibility. */
	showCompletedByViewId: Record<string, boolean>;
}
