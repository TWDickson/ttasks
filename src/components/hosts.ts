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
