import { Setting } from 'obsidian';
import type TTasksPlugin from '../main';

interface RenderArchiveSettingsParams {
	containerEl: HTMLElement;
	plugin: TTasksPlugin;
	rerender: () => void;
}

export function renderArchiveSettingsSection(params: RenderArchiveSettingsParams): void {
	const { containerEl, plugin, rerender } = params;

	containerEl.createEl('p', {
		text: 'Completed tasks can be archived to a sibling "Archive" folder. Archived tasks are removed from active views but remain searchable.',
		cls: 'setting-item-description',
	});

	const a = plugin.settings.archive;

	new Setting(containerEl)
		.setName('Archive mode')
		.setDesc('Manual: you archive tasks explicitly. Scheduled: tasks auto-archive N days after completion.')
		.addDropdown(dd => dd
			.addOption('manual', 'Manual')
			.addOption('scheduled', 'Scheduled')
			.setValue(a.mode)
			.onChange(async (value) => {
				plugin.settings.archive.mode = value as 'manual' | 'scheduled';
				await plugin.saveSettings();
				rerender();
			}));

	if (a.mode === 'scheduled') {
		new Setting(containerEl)
			.setName('Days after completion')
			.setDesc('Archive completed tasks automatically this many days after they are marked done.')
			.addText(text => text
				.setPlaceholder('45')
				.setValue(String(a.daysAfterComplete))
				.onChange(async (value) => {
					const n = parseInt(value, 10);
					if (!isNaN(n) && n >= 1 && n <= 365) {
						plugin.settings.archive.daysAfterComplete = n;
						await plugin.saveSettings();
					}
				}));
	}
}
