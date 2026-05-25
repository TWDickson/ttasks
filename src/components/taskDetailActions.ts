import type { Task, TaskStatus } from '../types';
import { runArchiveAndClear } from '../integration/taskActionPorts';

export interface MarkCompleteFlowDeps {
	task: Task;
	completionStatus: TaskStatus;
	today: string;
	saveImmediate: (updates: Partial<Task>) => Promise<void>;
	completeAndRecur: (task: Task) => Promise<Task | null>;
	notice: (message: string) => void;
}

export async function runMarkCompleteFlow(deps: MarkCompleteFlowDeps): Promise<void> {
	const { task, completionStatus, today, saveImmediate, completeAndRecur, notice } = deps;

	if (task.recurrence) {
		const next = await completeAndRecur(task);
		if (next) {
			notice(`Completed. Next due ${next.due_date ?? 'TBD'} (${next.name})`);
		}
		return;
	}

	await saveImmediate({ status: completionStatus, completed: today });
}

export interface DeleteFlowDeps {
	task: Task;
	confirmDelete: (taskName: string) => Promise<boolean>;
	setActiveTaskPath: (path: string | null) => void;
	deleteTask: (taskPath: string) => Promise<void>;
}

export async function runDeleteFlow(deps: DeleteFlowDeps): Promise<void> {
	const { task, confirmDelete, setActiveTaskPath, deleteTask } = deps;
	const confirmed = await confirmDelete(task.name);
	if (!confirmed) return;
	setActiveTaskPath(null);
	await deleteTask(task.path);
}

export interface ArchiveFlowDeps {
	task: Task;
	archiveTask: (taskPath: string) => Promise<boolean>;
	setActiveTaskPath: (path: string | null) => void;
}

export async function runArchiveFlow(deps: ArchiveFlowDeps): Promise<void> {
	const { task, archiveTask, setActiveTaskPath } = deps;
	if (!task.is_complete) return;
	await runArchiveAndClear(task.path, {
		archiveTask,
		setActiveTaskPath,
	});
}
