import type { CaptureSourceConfig } from '../settings/types';
import { isInCaptureScope } from './fileScanner';

export interface MarkdownFileLike {
	path: string;
}

function normalizePath(path: string): string {
	return path.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
}

function isInsideTasksFolder(filePath: string, tasksFolder: string): boolean {
	const normalizedFile = normalizePath(filePath);
	const normalizedTasksFolder = normalizePath(tasksFolder);
	if (!normalizedTasksFolder) return false;
	if (normalizedFile === normalizedTasksFolder) return true;
	return normalizedFile.startsWith(`${normalizedTasksFolder}/`);
}

export function resolveCaptureSourceFileEntries<TFile extends MarkdownFileLike>(
	files: TFile[],
	captureSources: CaptureSourceConfig[],
	tasksFolder: string,
): Array<{ file: TFile; config: CaptureSourceConfig }> {
	const entries: Array<{ file: TFile; config: CaptureSourceConfig }> = [];

	for (const file of files) {
		if (isInsideTasksFolder(file.path, tasksFolder)) {
			continue;
		}

		const config = captureSources.find((candidate) => isInCaptureScope(file.path, candidate));
		if (!config) {
			continue;
		}

		entries.push({ file, config });
	}

	return entries;
}
