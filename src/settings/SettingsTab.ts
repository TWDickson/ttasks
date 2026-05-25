import { AbstractInputSuggest, App, PluginSettingTab, Setting, TFolder } from 'obsidian';
import type TTasksPlugin from '../main';
import type {
	FabPosition,
} from './types';
import {
	normalizeEditorSuggestTrigger,
} from './defaults';
import { renderArchiveSettingsSection } from './archiveSettingsSection';
import { renderCaptureSourcesSettingsSection } from './captureSourcesSettingsSection';
import { renderKanbanSettingsSection } from './kanbanSettingsSection';
import {
	renderManagedListSettingSection,
	renderManagedListStyles,
} from './managedListSettingsSection';
import { renderQuickActionsSettingsSection } from './quickActionsSettingsSection';
import { renderRemindersSettingsSection } from './remindersSettingsSection';
import { renderViewsSettingsSection } from './viewsSettingsSection';


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
		renderManagedListStyles(containerEl);
		containerEl.createEl('h2', { text: 'TTasks Settings' });

		new Setting(containerEl)
			.setName('FAB position')
			.setDesc('Position of the floating action button for creating new tasks.')
			.addDropdown(dd => dd
				.addOption('right', 'Bottom right')
				.addOption('left', 'Bottom left')
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
			.setName('Inline task link trigger')
			.setDesc('Token used by inline editor suggestions for task linking (for example @task).')
			.addText(text => text
				.setPlaceholder('@task')
				.setValue(this.plugin.settings.editorSuggestTrigger)
				.onChange(async (value) => {
					this.plugin.settings.editorSuggestTrigger = normalizeEditorSuggestTrigger(value);
					await this.plugin.saveSettings();
				})
			);

		new Setting(containerEl)
			.setName('Graph diagnostics logging')
			.setDesc('Developer mode: log dependency graph quality metrics (crossings, bend score, lane breakdown) to console when graph layout changes.')
			.addToggle((toggle) => toggle
				.setValue(this.plugin.settings.graphDiagnosticsEnabled)
				.onChange(async (value) => {
					this.plugin.settings.graphDiagnosticsEnabled = value;
					await this.plugin.saveSettings();
				}));

		const statuses = this.plugin.settings.statuses ?? [];

		new Setting(containerEl)
			.setName('Completion status')
			.setDesc('Tasks with this status are treated as done. Used for filtering, reminders, and dependency checks.')
			.addDropdown(dd => {
				for (const s of statuses) dd.addOption(s, s);
				dd.setValue(statuses.includes(this.plugin.settings.completionStatus) ? this.plugin.settings.completionStatus : (statuses[0] ?? ''));
				dd.onChange(async (v) => {
					this.plugin.settings.completionStatus = v;
					await this.plugin.saveSettings();
					await this.plugin.taskStore.load();
				});
			});

		renderManagedListSettingSection({
			containerEl,
			plugin: this.plugin,
			app: this.app,
			rerender: () => this.display(),
			config: {
				name: 'Statuses',
			description: 'Manage statuses as a draggable ordered list. Renames migrate existing tasks on save. The completion status can be renamed but not removed. Removing other statuses launches a remap.',
			singularLabel: 'Status',
			placeholder: 'Status name',
			requireOne: true,
			allowClearMigration: false,
			field: 'status',
			getValues: () => this.plugin.settings.statuses ?? [],
			applyValues: (values) => {
				this.plugin.settings.statuses = values;
			},
			getColors: () => this.plugin.settings.statusColors ?? {},
			applyColors: (colors) => {
				this.plugin.settings.statusColors = colors;
			},
				getDefaultMigrationTarget: (nextValues) => nextValues[0] ?? null,
			},
		});

		renderManagedListSettingSection({
			containerEl,
			plugin: this.plugin,
			app: this.app,
			rerender: () => this.display(),
			config: {
				name: 'Areas',
			description: 'Lines of work (e.g. Database, General, Work, Home). Tasks without an area are treated as inbox. Renames migrate existing tasks. Removing an area opens a remap or lets you clear it.',
			singularLabel: 'Area',
			placeholder: 'Area name',
			allowClearMigration: true,
			clearLabel: 'Clear area (move to inbox)',
			field: 'area',
			getValues: () => this.plugin.settings.areas ?? [],
			applyValues: (values) => {
				this.plugin.settings.areas = values;
			},
			getColors: () => this.plugin.settings.areaColors ?? {},
			applyColors: (colors) => {
				this.plugin.settings.areaColors = colors;
			},
				getDefaultMigrationTarget: () => null,
			},
		});

		renderManagedListSettingSection({
			containerEl,
			plugin: this.plugin,
			app: this.app,
			rerender: () => this.display(),
			config: {
				name: 'Labels',
			description: 'Cross-cutting labels applied to tasks and projects (e.g. feature, bug, research). Multi-value — a task can have several. Pre-seeded with defaults but fully user-configurable.',
			singularLabel: 'Label',
			placeholder: 'Label name',
			allowClearMigration: true,
			clearLabel: 'Remove label',
			field: 'label',
			getValues: () => this.plugin.settings.labelValues ?? [],
			applyValues: (values) => {
				this.plugin.settings.labelValues = values;
			},
			getColors: () => this.plugin.settings.labelColors ?? {},
			applyColors: (colors) => {
				this.plugin.settings.labelColors = colors;
			},
				getDefaultMigrationTarget: () => null,
			},
		});

		renderViewsSettingsSection({
			containerEl,
			plugin: this.plugin,
			app: this.app,
			rerender: () => this.display(),
		});
		renderCaptureSourcesSettingsSection({
			containerEl,
			plugin: this.plugin,
			app: this.app,
			rerender: () => this.display(),
		});
		renderQuickActionsSettingsSection({
			containerEl,
			plugin: this.plugin,
		});
		renderRemindersSettingsSection({
			containerEl,
			plugin: this.plugin,
		});
		renderKanbanSettingsSection({
			containerEl,
			plugin: this.plugin,
		});
		renderArchiveSettingsSection({
			containerEl,
			plugin: this.plugin,
			rerender: () => this.display(),
		});
	}


}
