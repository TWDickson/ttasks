import type { TTasksSettings } from '../settings';
import type { ExternalTask } from './types';
import { scanFileForCapturableTasks } from './fileScanner';
import { resolveCaptureSourceFileEntries, type MarkdownFileLike } from './captureSourceFiles';

interface AppLike {
	vault: {
		getMarkdownFiles(): MarkdownFileLike[];
		cachedRead(file: MarkdownFileLike): Promise<string>;
	};
}

export async function collectAllCapturableTasks(
	app: AppLike,
	settings: TTasksSettings,
): Promise<ExternalTask[]> {
	const entries = resolveCaptureSourceFileEntries(
		app.vault.getMarkdownFiles(),
		settings.captureSources,
		settings.tasksFolder,
	);

	const tasks: ExternalTask[] = [];
	for (const entry of entries) {
		const content = await app.vault.cachedRead(entry.file);
		tasks.push(
			...scanFileForCapturableTasks(content, entry.file.path, entry.config, settings.tasksFolder),
		);
	}

	return tasks;
}
