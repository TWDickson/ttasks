import type { TTasksSettings } from '../settings';
import type { ExternalTask } from './types';
import { scanFileForCapturableTasks } from './fileScanner';
import { resolveCaptureSourceFileEntries, type MarkdownFileLike } from './captureSourceFiles';

export interface ImportScanErrorMeta {
	operation: 'import.scanFile';
	filePath: string;
}

export interface CollectAllCapturableTasksOptions {
	onFileError?: (error: unknown, meta: ImportScanErrorMeta) => void;
}

interface AppLike {
	vault: {
		getMarkdownFiles(): MarkdownFileLike[];
		cachedRead(file: MarkdownFileLike): Promise<string>;
	};
}

export async function collectAllCapturableTasks(
	app: AppLike,
	settings: TTasksSettings,
	options: CollectAllCapturableTasksOptions = {},
): Promise<ExternalTask[]> {
	const entries = resolveCaptureSourceFileEntries(
		app.vault.getMarkdownFiles(),
		settings.captureSources,
		settings.tasksFolder,
	);

	const tasks: ExternalTask[] = [];
	for (const entry of entries) {
		try {
			const content = await app.vault.cachedRead(entry.file);
			tasks.push(
				...scanFileForCapturableTasks(content, entry.file.path, entry.config, settings.tasksFolder),
			);
		} catch (error) {
			options.onFileError?.(error, { operation: 'import.scanFile', filePath: entry.file.path });
		}
	}

	return tasks;
}
