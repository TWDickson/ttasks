import type { Component } from 'obsidian';
import type { Readable, Writable } from 'svelte/store';
import type { TTasksSettings } from '../settings/types';
import type { StatusPolicy } from '../settings/statusPolicy';
import type { Task, TaskRecordType } from '../types';
import type { ExternalTask } from '../integration/types';
import type { CreateTaskOptions } from '../modals/CreateTaskModal';
import type { ConfirmModalOptions } from '../modals/confirmModal';
import type { GraphExpandProps } from '../modals/GraphExpandModal';
import type { TaskStore } from '../store/TaskStore';
import type { ArchiveService } from '../store/ArchiveService';
import type { PomodoroService } from '../store/PomodoroService';
import type { DeviceStore } from '../utils/deviceStore';
import type { ImportPlan } from '../integration/taskImportPlan';
import type { NotesPolicy, TaskJsonMode, TaskJsonValidValues } from '../integration/taskJsonExport';
import type { SharePayloadFormat } from '../integration/sharePreamble';
import type { DerivedStateContext } from '../integration/taskDerivedState';

/**
 * Host interfaces (AR-8): what each plugin-facing component may ask of the
 * plugin, and nothing more. `TTasksPlugin` implements every one, and so does
 * the rig's mock (`test-rig/fixtures.ts` checks it at compile time), so a
 * component can't start reading a plugin member the rig doesn't provide.
 *
 * Type-only: nothing here may import at runtime.
 */

/** The settings the graph reads; written back through `updateSettings`. */
export type GraphSettings = Pick<TTasksSettings,
	| 'holidays'
	| 'areaWorkweek'
	| 'graphDiagnosticsEnabled'
	| 'graphHiddenProjects'
	| 'overviewGraphShowCompleted'
	| 'overviewGraphGrouping'
>;

export interface GraphHost {
	readonly settings: Readonly<GraphSettings>;
	/** Merges `patch` into the settings and persists them (one write path). */
	updateSettings(patch: Partial<GraphSettings>): Promise<void>;
	triggerTaskHoverPreview(path: string, event: MouseEvent): void;
	openCreateTask(type: TaskRecordType, options?: CreateTaskOptions): void;
}

/** The settings the board reads; written back through `updateSettings`. */
export type BoardSettings = GraphSettings & Pick<TTasksSettings,
	// view registry / badge palette
	| 'customViews'
	| 'quickActions'
	| 'hiddenBuiltinViews'
	| 'areaColors'
	| 'labelColors'
	| 'statusColors'
	// filter options and calendar
	| 'areas'
	| 'labelValues'
	| 'weekStartsOn'
	// per-view board state
	| 'showCompletedByViewId'
	| 'logbookRendererMode'
	| 'listGroupOverrideByViewId'
	| 'listSortOverrideByViewId'
	| 'kanbanCollapsedColumns'
	| 'kanbanCardFields'
	| 'fabPosition'
>;

/** The main board (TaskBoard). Extends GraphHost: the board hosts the graph. */
export interface BoardHost extends GraphHost {
	readonly settings: Readonly<BoardSettings>;
	updateSettings(patch: Partial<BoardSettings>): Promise<void>;
	/** Bumped on every settings save — the board's cue to re-read `settings`. */
	readonly settingsRevision: Readable<number>;
	readonly statusPolicy: StatusPolicy;
	readonly activeTaskPath: Writable<string | null>;
	readonly focusedTaskPath: Writable<string | null>;
	/** A view id another surface asked the board to switch to; the board clears it. */
	readonly activeViewMode: Writable<string | null>;
	readonly taskStore: Pick<TaskStore, 'tasks' | 'getByPath' | 'update' | 'setStatus' | 'delete' | 'restore' | 'openDetail'>;
	readonly scanEngine: { readonly tasks: Readable<ExternalTask[]> };
	readonly archiveService: Pick<ArchiveService, 'archiveTask' | 'loadArchivedTasks' | 'restoreTask'>;
	showTaskContextMenu(task: Task, event: MouseEvent): void;
	openCapturedTask(task: ExternalTask): Promise<void>;
	/** Turns a captured checkbox into a TTasks task; rejects with a user-facing message. */
	promoteCapturedTask(task: ExternalTask): Promise<Task>;
	confirm(options: ConfirmModalOptions): Promise<boolean>;
	openGraphFullscreen(props: Omit<GraphExpandProps, 'host'>): void;
	editSmartList(viewId: string): void;
}

/** The settings the detail pane reads (field options, colours, calendar). */
export type DetailSettings = Pick<TTasksSettings,
	| 'statuses'
	| 'statusColors'
	| 'areas'
	| 'areaColors'
	| 'labelValues'
	| 'labelColors'
	| 'holidays'
	| 'areaWorkweek'
>;

/** The detail pane (TaskDetail). */
export interface DetailHost {
	readonly settings: Readonly<DetailSettings>;
	readonly statusPolicy: StatusPolicy;
	readonly taskStore: Pick<TaskStore,
		| 'getByPath' | 'update' | 'setStatus' | 'completeAndRecur' | 'delete'
		| 'updateParentTask' | 'addDependency' | 'removeDependency' | 'updateNotes' | 'openFile'>;
	readonly archiveService: Pick<ArchiveService, 'archiveTask'>;
	readonly pomodoroService: Pick<PomodoroService, 'session' | 'start' | 'toggle' | 'skip' | 'stop'>;
	confirm(options: ConfirmModalOptions): Promise<boolean>;
	triggerTaskHoverPreview(path: string, event: MouseEvent): void;
	/** Obsidian's MarkdownRenderer, bound to the app. */
	renderMarkdown(markdown: string, el: HTMLElement, sourcePath: string, component: Component): Promise<void>;
	/** Opens the "focus until…" picker for a task. */
	openFocusUntil(taskPath: string, taskName: string): void;
}

/*
 * Modal hosts (AR-9): the same narrowing for the three modals that used to take
 * the whole plugin. Not components, but the rig opens them, so the same
 * compile-time check against its mock applies.
 */

/** The settings the create modal reads (field options and colours). */
export type CreateTaskSettings = Pick<TTasksSettings,
	| 'statuses'
	| 'statusColors'
	| 'areas'
	| 'areaColors'
	| 'labelValues'
	| 'labelColors'
>;

/** The create-task modal (CreateTaskModal). */
export interface CreateTaskHost {
	readonly settings: Readonly<CreateTaskSettings>;
	readonly statusPolicy: StatusPolicy;
	/** Source path for the notes preview's MarkdownRenderer. */
	readonly manifest: { readonly id: string };
	readonly deviceStore: Pick<DeviceStore, 'get' | 'set'>;
	readonly taskStore: Pick<TaskStore, 'tasks' | 'create' | 'addDependency' | 'openDetail' | 'resolveRef'>;
}

/** The "focus until…" picker (FocusUntilModal). */
export interface FocusUntilHost {
	readonly settings: Readonly<Pick<TTasksSettings, 'pomodoro'>>;
	readonly pomodoroService: Pick<PomodoroService, 'startUntil'>;
}

/** Which parts of an import plan to apply; each defaults to on. */
export interface ImportSelection {
	creates?: boolean;
	updates?: boolean;
	deletes?: boolean;
	links?: boolean;
	linkRemovals?: boolean;
	parents?: boolean;
	notes?: boolean;
}

/** What `applyImportPlan` actually changed. */
export interface ImportResult {
	created: number;
	updated: number;
	deleted: number;
	linked: number;
	unlinked: number;
	reparented: number;
	renoted: number;
}

/** The settings Share/Sync reads; it remembers its state in `shareSync`. */
export type ShareSyncSettings = Pick<TTasksSettings, 'shareSync' | 'areas' | 'statuses' | 'labelValues'>;

/** The Share/Sync modal (ShareSyncModal). */
export interface ShareSyncHost {
	readonly settings: Readonly<ShareSyncSettings>;
	updateSettings(patch: Partial<ShareSyncSettings>): Promise<void>;
	readonly taskStore: Pick<TaskStore, 'tasks'>;
	taskJsonValidValues(): TaskJsonValidValues;
	taskDerivedStateContext(): DerivedStateContext;
	exportTasksToJsonFrom(
		tasks: Task[],
		mode: TaskJsonMode,
		options?: { payloadFormat?: SharePayloadFormat; notesPolicy?: NotesPolicy },
	): Promise<void>;
	applyImportPlan(plan: ImportPlan, selection?: ImportSelection): Promise<ImportResult>;
}
