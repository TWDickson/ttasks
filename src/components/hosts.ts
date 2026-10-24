import type { TTasksSettings } from '../settings/types';
import type { TaskRecordType } from '../types';
import type { CreateTaskOptions } from '../modals/CreateTaskModal';

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
