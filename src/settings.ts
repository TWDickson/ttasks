import { App, PluginSettingTab, Setting } from 'obsidian';
import type TTasksPlugin from './main';

export interface TTasksSettings {
	tasksFolder: string;
}

export const DEFAULT_SETTINGS: TTasksSettings = {
	tasksFolder: 'Tasks',
};

export class TTasksSettingTab extends PluginSettingTab {
	plugin: TTasksPlugin;

	constructor(app: App, plugin: TTasksPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.createEl('h2', { text: 'TTasks Settings' });

		new Setting(containerEl)
			.setName('Tasks folder')
			.setDesc('The folder TTasks owns. All task and project files will be stored here.')
			.addText(text => text
				.setPlaceholder('Tasks')
				.setValue(this.plugin.settings.tasksFolder)
				.onChange(async (value) => {
					this.plugin.settings.tasksFolder = value.trim();
					await this.plugin.saveSettings();
				}));
	}
}
