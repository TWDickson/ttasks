import { AbstractInputSuggest, App, PluginSettingTab, Setting, TFolder } from 'obsidian';
import type TTasksPlugin from './main';

export type FabPosition = 'right' | 'left' | 'hidden';

export interface TTasksSettings {
	tasksFolder: string;
	fabPosition: FabPosition;
	categories: string[];
	taskTypes: string[];
}

export const DEFAULT_SETTINGS: TTasksSettings = {
	tasksFolder: 'Tasks',
	fabPosition: 'right',
	categories: ['database', 'general'],
	taskTypes: ['feature', 'bug', 'research', 'docs', 'action'],
};

function parseCsvList(value: string): string[] {
	return [...new Set(
		value
			.split(',')
			.map(v => v.trim())
			.filter(Boolean)
	)];
}

class FolderSuggest extends AbstractInputSuggest<TFolder> {
	private inputEl: HTMLInputElement;

	constructor(app: App, inputEl: HTMLInputElement) {
		super(app, inputEl);
		this.inputEl = inputEl;
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
		this.inputEl.dispatchEvent(new Event('input'));
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
			.setName('FAB position')
			.setDesc('Position of the floating action button for creating new tasks.')
			.addDropdown(dd => dd
				.addOption('right',  'Bottom right')
				.addOption('left',   'Bottom left')
				.addOption('hidden', 'Hidden')
				.setValue(this.plugin.settings.fabPosition)
				.onChange(async (value) => {
					this.plugin.settings.fabPosition = value as FabPosition;
					await this.plugin.saveSettings();
				}));

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

		new Setting(containerEl)
			.setName('Categories')
			.setDesc('Comma-separated category options used in create/detail views.')
			.addText(text => {
				text
					.setPlaceholder('database, general')
					.setValue((this.plugin.settings.categories ?? []).join(', '))
					.onChange(async (value) => {
						this.plugin.settings.categories = parseCsvList(value);
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName('Task types')
			.setDesc('Comma-separated task type options used in create/detail views.')
			.addText(text => {
				text
					.setPlaceholder('feature, bug, research, docs, action')
					.setValue((this.plugin.settings.taskTypes ?? []).join(', '))
					.onChange(async (value) => {
						this.plugin.settings.taskTypes = parseCsvList(value);
						await this.plugin.saveSettings();
					});
			});

	}
}
