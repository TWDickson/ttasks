import { Notice, Setting } from 'obsidian';
import type TTasksPlugin from '../main';
import { collectAllCapturableTasks } from '../integration/importScanner';
import { promoteTaskToTTasks } from '../integration/promoteTaskToTTasks';
import { ImportConfirmModal } from '../modals/ImportConfirmModal';
import type { ExternalTask } from '../integration/types';
import { handleScanError, type ScanErrorMeta } from '../integration/scanErrorPolicy';

interface RenderMigrationSettingsSectionParams {
	containerEl: HTMLElement;
	plugin: TTasksPlugin;
}

interface NoticeLike {
	setMessage?: (message: string) => void;
	hide?: () => void;
}

interface RunMigrationImportFlowParams {
	plugin: TTasksPlugin;
	collectTasks?: (args: { onFileError: (error: unknown, meta: ScanErrorMeta) => void }) => Promise<ExternalTask[]>;
	confirmImport?: (candidates: ExternalTask[]) => Promise<boolean>;
	promoteTask?: (task: ExternalTask, plugin: TTasksPlugin) => Promise<unknown>;
	notice?: (message: string, duration?: number) => NoticeLike;
	log?: (message: string, error?: unknown) => void;
}

function defaultLog(plugin: TTasksPlugin): (message: string, error?: unknown) => void {
	return (message, error) => {
		if (typeof plugin.log === 'function') {
			plugin.log(`${message}${error ? `: ${error instanceof Error ? error.message : String(error)}` : ''}`);
		}
		if (error != null) {
			console.error(message, error);
		}
	};
}

function buildBulkErrorHandler(
	log: (message: string, error?: unknown) => void,
): (error: unknown, meta: ScanErrorMeta) => void {
	return (error, meta) => {
		handleScanError('user_triggered_bulk', error, meta, { log });
	};
}

export async function runMigrationImportFlow(params: RunMigrationImportFlowParams): Promise<void> {
	const {
		plugin,
		collectTasks = ({ onFileError }) => collectAllCapturableTasks(plugin.app, plugin.settings, { onFileError }),
		confirmImport = async (candidates) => new ImportConfirmModal(plugin.app, candidates).openAndWait(),
		promoteTask = promoteTaskToTTasks,
		notice = (message, duration) => new Notice(message, duration),
		log = defaultLog(plugin),
	} = params;

	const handleBulkError = buildBulkErrorHandler(log);
	let progressNotice: NoticeLike | null = null;
	let created = 0;
	let scanErrors = 0;
	let promoteErrors = 0;

	try {
		const candidates = await collectTasks({
			onFileError: (error, meta) => {
				scanErrors += 1;
				handleBulkError(error, meta);
			},
		});

		if (candidates.length === 0) {
			if (scanErrors > 0) {
				notice(`Imported 0 tasks (${scanErrors} errors - see console).`);
				return;
			}
			notice('No capturable tasks found in configured directories.');
			return;
		}

		const confirmed = await confirmImport(candidates);
		if (!confirmed) return;

		if (candidates.length > 10) {
			progressNotice = notice(`TTasks: importing 0 / ${candidates.length}...`, 0);
		}

		for (const external of candidates) {
			try {
				await promoteTask(external, plugin);
				created += 1;
			} catch (error) {
				promoteErrors += 1;
				handleBulkError(error, {
					operation: 'import.promoteTask',
					filePath: external.location.filePath,
				});
			}

			progressNotice?.setMessage?.(`TTasks: importing ${created + promoteErrors} / ${candidates.length}...`);
		}

		progressNotice?.hide?.();
		const totalErrors = scanErrors + promoteErrors;
		const message = totalErrors > 0
			? `Imported ${created} tasks (${totalErrors} errors - see console).`
			: `Imported ${created} tasks.`;
		notice(message);
	} finally {
		progressNotice?.hide?.();
	}
}

let importInProgress = false;

export function renderMigrationSettingsSection(params: RenderMigrationSettingsSectionParams): void {
	const { containerEl, plugin } = params;

	new Setting(containerEl)
		.setName('Migration')
		.setDesc('One-shot bulk import of markdown checkboxes from your configured capture sources into TTasks notes.')
		.setHeading();
	const detailsEl = containerEl.createEl('details');
	detailsEl.createEl('summary', { text: 'Bulk import from capture sources' });
	const contentEl = detailsEl.createDiv();

	new Setting(contentEl)
		.setName('Import all captured tasks')
		.setDesc('Scan configured capture sources and promote all found tasks to TTasks notes at once.')
		.addButton((button) => {
			button.setButtonText('Import captured tasks');
			button.onClick(async () => {
				if (importInProgress) {
					new Notice('Import already in progress.');
					return;
				}

				importInProgress = true;
				button.setDisabled(true);
				try {
					await runMigrationImportFlow({ plugin });
				} finally {
					importInProgress = false;
					button.setDisabled(false);
				}
			});
		});
}
