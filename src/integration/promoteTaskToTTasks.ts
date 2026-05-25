import { Notice, TFile } from 'obsidian';
import type TTasksPlugin from '../main';
import type { Task } from '../types';
import type { ExternalTask } from './types';
import { isInCaptureScope } from './fileScanner';
import { buildPromotedLine, buildPromoteInput } from './promoteTask';
import { handleScanError } from './scanErrorPolicy';

export async function promoteTaskToTTasks(
	external: ExternalTask,
	plugin: TTasksPlugin,
): Promise<Task> {
	const sourcePath = external.location.filePath;
	const sourceFile = plugin.app.vault.getAbstractFileByPath(sourcePath);
	if (!(sourceFile instanceof TFile)) {
		throw new Error(`Source file not found: ${sourcePath}`);
	}

	const basename = sourcePath.split('/').pop()?.replace(/\.md$/i, '') ?? 'source-note';
	const inboxStatus = plugin.settings.statuses?.[0] ?? 'Active';
	const input = buildPromoteInput(external, inboxStatus, basename);
	const created = await plugin.taskStore.create(input);

	await plugin.app.vault.process(sourceFile, (content) => {
		const lines = content.split('\n');
		const index = Math.max(0, external.location.line - 1);
		if (index >= lines.length) return content;
		lines[index] = buildPromotedLine(lines[index], created.path, created.name);
		return lines.join('\n');
	});

	plugin.scanEngine.removeTasksForFile(sourcePath);
	const sourceConfig = plugin.settings.captureSources.find((config) => isInCaptureScope(sourcePath, config));
	if (sourceConfig) {
		try {
			await plugin.scanEngine.rescanFile(
				plugin.app,
				sourceFile,
				sourceConfig,
				plugin.settings.tasksFolder,
				'user_triggered_single',
			);
		} catch (error) {
			handleScanError(
				'user_triggered_single',
				error,
				{
					operation: 'promote.rescanFile',
					filePath: sourcePath,
					userMessage: 'TTasks: task promoted, but capture refresh failed.',
				},
				{
					log: (message, loggedError) => {
						plugin.log?.(`${message}: ${loggedError instanceof Error ? loggedError.message : String(loggedError)}`);
						console.error(message, loggedError);
					},
					notice: (message) => {
						new Notice(message);
					},
				},
			);
		}
	}

	return created;
}
