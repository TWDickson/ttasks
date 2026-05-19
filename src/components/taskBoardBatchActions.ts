import type { Task } from '../types';

export interface BatchCompleteDeps {
	selectedPaths: Set<string>;
	completionStatus: string;
	today: string;
	updateTask: (path: string, updates: Partial<Task>) => Promise<void>;
	clearSelection: () => Set<string>;
}

export async function runBatchComplete(deps: BatchCompleteDeps): Promise<Set<string>> {
	for (const path of deps.selectedPaths) {
		await deps.updateTask(path, { status: deps.completionStatus, completed: deps.today });
	}
	return deps.clearSelection();
}

export interface BatchArchiveDeps {
	selectedPaths: Set<string>;
	archiveTask: (path: string) => Promise<void>;
	clearSelection: () => Set<string>;
}

export async function runBatchArchive(deps: BatchArchiveDeps): Promise<Set<string>> {
	for (const path of deps.selectedPaths) {
		await deps.archiveTask(path);
	}
	return deps.clearSelection();
}

export interface BatchDeleteDeps {
	selectedPaths: Set<string>;
	confirmDelete: (count: number) => boolean | Promise<boolean>;
	deleteTask: (path: string) => Promise<void>;
	clearSelection: () => Set<string>;
}

export async function runBatchDelete(deps: BatchDeleteDeps): Promise<Set<string>> {
	const count = deps.selectedPaths.size;
	const confirmed = await deps.confirmDelete(count);
	if (!confirmed) return deps.selectedPaths;

	for (const path of deps.selectedPaths) {
		await deps.deleteTask(path);
	}
	return deps.clearSelection();
}
