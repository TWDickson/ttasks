import { ensureMdExt } from '../utils/pathUtils';
import type { Task } from '../types';

export function normalizeTaskPath(pathLike: string | null | undefined): string | null {
	if (!pathLike) return null;
	const clean = pathLike.trim();
	if (!clean) return null;
	return ensureMdExt(clean);
}

export function findLinkedTask(pathLike: string | null | undefined, allTasks: Task[]): Task | null {
	const normalized = normalizeTaskPath(pathLike);
	if (!normalized) return null;

	const exact = allTasks.find((item) => item.path === normalized);
	if (exact) return exact;

	return allTasks.find((item) => item.path.endsWith('/' + normalized)) ?? null;
}

export function resolveLinkedTaskPath(pathLike: string | null | undefined, allTasks: Task[]): string | null {
	const normalized = normalizeTaskPath(pathLike);
	if (!normalized) return null;
	const found = findLinkedTask(normalized, allTasks);
	return found ? found.path : normalized;
}
