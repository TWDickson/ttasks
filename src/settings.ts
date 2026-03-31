import { AbstractInputSuggest, App, PluginSettingTab, Setting, TFolder } from 'obsidian';
import type TTasksPlugin from './main';

export interface TTasksSettings {
	tasksFolder: string;
}

export const DEFAULT_SETTINGS: TTasksSettings = {
	tasksFolder: 'Tasks',
};

class FolderSuggest extends AbstractInputSuggest<TFolder> {
	constructor(app: App, inputEl: HTMLInputElement) {
		super(app, inputEl);
	}

	getSuggestions(query: string): TFolder[] {
		const q = query.toLowerCase();
		return this.app.vault.getAllLoadedFiles()
			.filter((f): f is TFolder => f instanceof TFolder)
			.filter(f => f.path.toLowerCase().includes(q))
			.slice(0, 20);
	}

	renderSuggestion(folder: TFolder, el: HTMLElement): void {
		el.setText(folder.path);
	}

	selectSuggestion(folder: TFolder): void {
		this.setValue(folder.path);
		this.close();
	}
}

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
			.addText(text => {
				new FolderSuggest(this.app, text.inputEl);
				text
					.setPlaceholder('Tasks')
					.setValue(this.plugin.settings.tasksFolder)
					.onChange(async (value) => {
						this.plugin.settings.tasksFolder = value.trim();
						await this.plugin.saveSettings();
						await this.plugin.taskStore.load();
					});
			});
	}
}
