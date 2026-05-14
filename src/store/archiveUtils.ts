/**
 * Pure utilities for archive path resolution and eligibility.
 * No Obsidian API dependencies — fully unit-testable.
 */

/**
 * Derives the archive folder path as a sibling of the tasks folder.
 * e.g. 'Planner/Tasks' → 'Planner/Archive', 'Tasks' → 'Archive'
 */
export function deriveArchiveFolder(tasksFolder: string): string {
	const parts = tasksFolder.replace(/\/$/, '').split('/');
	parts[parts.length - 1] = 'Archive';
	return parts.join('/');
}

/**
 * Returns the full archive path for a given filename and date.
 * Format: {archiveFolder}/{YYYY}/{MM}/{filename}
 */
export function getArchivePath(archiveFolder: string, filename: string, date: Date = new Date()): string {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, '0');
	return `${archiveFolder}/${year}/${month}/${filename}`;
}

/**
 * Returns true when the given path lives inside the archive folder.
 */
export function isArchivedPath(path: string, archiveFolder: string): boolean {
	const prefix = archiveFolder.replace(/\/$/, '') + '/';
	return path.startsWith(prefix);
}

/**
 * Returns the number of calendar days between two YYYY-MM-DD date strings.
 * Positive when `to` is after `from`.
 */
export function daysBetween(from: string, to: string): number {
	const a = Date.UTC(
		parseInt(from.slice(0, 4), 10),
		parseInt(from.slice(5, 7), 10) - 1,
		parseInt(from.slice(8, 10), 10),
	);
	const b = Date.UTC(
		parseInt(to.slice(0, 4), 10),
		parseInt(to.slice(5, 7), 10) - 1,
		parseInt(to.slice(8, 10), 10),
	);
	return Math.round((b - a) / 86_400_000);
}

/**
 * Returns true when a completed task has been done for at least `thresholdDays`.
 * Uses status_changed as the anchor, falling back to completed date.
 */
export function archiveEligible(
	task: { is_complete: boolean; status_changed?: string | null; completed?: string | null },
	thresholdDays: number,
	today: string,
): boolean {
	if (!task.is_complete) return false;
	const anchor = task.status_changed ?? task.completed;
	if (!anchor) return false;
	return daysBetween(anchor, today) >= thresholdDays;
}
