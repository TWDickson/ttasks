import type { TTasksSettings } from '../settings';
import type { ExternalTask } from './types';
import { scanFileForCapturableTasks } from './fileScanner';
import { resolveCaptureSourceFileEntries, type MarkdownFileLike } from './captureSourceFiles';
import { withConcurrencyLimit } from '../utils/concurrency';

const DEFAULT_IMPORT_SCAN_CONCURRENCY = 4;

export interface ImportScanErrorMeta {
	operation: 'import.scanFile';
	filePath: string;
}

export interface CollectAllCapturableTasksOptions {
	onFileError?: (error: unknown, meta: ImportScanErrorMeta) => void;
	concurrency?: number;
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
	const perEntryTasks = await withConcurrencyLimit(entries.map((entry) => async () => {
		try {
			const content = await app.vault.cachedRead(entry.file);
			return scanFileForCapturableTasks(content, entry.file.path, entry.config, settings.tasksFolder);
		} catch (error) {
			options.onFileError?.(error, { operation: 'import.scanFile', filePath: entry.file.path });
			return undefined;
		}
	}), options.concurrency ?? DEFAULT_IMPORT_SCAN_CONCURRENCY);

	return perEntryTasks.flatMap((tasks) => tasks ?? []);
}
