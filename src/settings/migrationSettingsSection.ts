import { Notice, Setting } from 'obsidian';
import type TTasksPlugin from '../main';
import { collectAllCapturableTasks } from '../integration/importScanner';
import { promoteTaskToTTasks } from '../integration/promoteTaskToTTasks';
import { ImportConfirmModal } from '../modals/ImportConfirmModal';

interface RenderMigrationSettingsSectionParams {
	containerEl: HTMLElement;
	plugin: TTasksPlugin;
}

let importInProgress = false;

export function renderMigrationSettingsSection(params: RenderMigrationSettingsSectionParams): void {
	const { containerEl, plugin } = params;

	containerEl.createEl('h2', { text: 'Advanced' });
	const detailsEl = containerEl.createEl('details');
	detailsEl.createEl('summary', { text: 'Migration' });
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

				let progressNotice: Notice | null = null;
				try {
					const candidates = await collectAllCapturableTasks(plugin.app, plugin.settings);

					if (candidates.length === 0) {
						new Notice('No capturable tasks found in configured directories.');
						return;
					}

					const confirmed = await new ImportConfirmModal(plugin.app, candidates).openAndWait();
					if (!confirmed) return;

					let created = 0;
					let errors = 0;
					if (candidates.length > 10) {
						progressNotice = new Notice(`TTasks: importing 0 / ${candidates.length}...`, 0);
					}

					for (const external of candidates) {
						try {
							await promoteTaskToTTasks(external, plugin);
							created += 1;
						} catch (error) {
							errors += 1;
							console.error(
								`TTasks import: failed to promote task "${external.name}" from ${external.location.filePath}`,
								error,
							);
						}

						if (progressNotice) {
							(progressNotice as Notice & { setMessage?: (message: string) => void }).setMessage?.(
								`TTasks: importing ${created + errors} / ${candidates.length}...`,
							);
						}
					}

					(progressNotice as Notice & { hide?: () => void } | null)?.hide?.();

					const message = errors > 0
						? `Imported ${created} tasks (${errors} errors - see console).`
						: `Imported ${created} tasks.`;
					new Notice(message);
				} finally {
					(progressNotice as Notice & { hide?: () => void } | null)?.hide?.();
					importInProgress = false;
					button.setDisabled(false);
				}
			});
		});
}
