import { App, PluginSettingTab, Setting } from 'obsidian';
import type TTasksPlugin from '../main';
import type {
	FabPosition,
} from './types';
import {
	normalizeEditorSuggestTrigger,
} from './defaults';
import { FolderSuggest } from './folderSuggest';
import { renderArchiveSettingsSection } from './archiveSettingsSection';
import { renderCaptureSourcesSettingsSection } from './captureSourcesSettingsSection';
import { renderKanbanSettingsSection } from './kanbanSettingsSection';
import { renderManagedListSettingSection } from './managedListSettingsSection';
import { renderMigrationSettingsSection } from './migrationSettingsSection';
import { renderQuickActionsSettingsSection } from './quickActionsSettingsSection';
import { renderRemindersSettingsSection } from './remindersSettingsSection';
import { renderViewsSettingsSection } from './viewsSettingsSection';
import { renderWorkingCalendarSettingsSection } from './workingCalendarSettingsSection';


export class TTasksSettingTab extends PluginSettingTab {
	plugin: TTasksPlugin;

	constructor(app: App, plugin: TTasksPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	/** Group ids the user has collapsed this session (survives rerenders, not reloads). */
	private collapsedGroups = new Set<string>();

	/**
	 * Create a collapsible settings group and register a "jump to" button for it
	 * in the sticky nav. Returns the body element sections render into.
	 */
	private group(nav: HTMLElement, id: string, title: string): HTMLElement {
		const details = this.containerEl.createEl('details', { cls: 'tt-settings-group' });
		if (!this.collapsedGroups.has(id)) details.setAttribute('open', '');
		details.addEventListener('toggle', () => {
			if (details.open) this.collapsedGroups.delete(id);
			else this.collapsedGroups.add(id);
		});
		details.createEl('summary', { cls: 'tt-settings-group-summary', text: title });
		const body = details.createDiv({ cls: 'tt-settings-group-body' });

		const jump = nav.createEl('button', { cls: 'tt-settings-jump-btn', text: title });
		jump.addEventListener('click', () => {
			this.collapsedGroups.delete(id);
			details.open = true;
			details.scrollIntoView({ behavior: 'smooth', block: 'start' });
		});

		return body;
	}

	display(): void {
		const { containerEl } = this;
		// Preserve scroll position across the full-pane rebuilds that section
		// `rerender: () => this.display()` callbacks trigger.
		const scrollTop = containerEl.scrollTop;
		containerEl.empty();
		containerEl.addClass('tt-settings');

		const nav = containerEl.createDiv({ cls: 'tt-settings-nav' });

		// --- General ---------------------------------------------------------
		const generalEl = this.group(nav, 'general', 'General');

		new Setting(generalEl)
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

		new Setting(generalEl)
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

		new Setting(generalEl)
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

		// --- Statuses, areas & labels ---------------------------------------
		const classificationEl = this.group(nav, 'classification', 'Statuses, areas & labels');
		const statuses = this.plugin.settings.statuses ?? [];

		new Setting(classificationEl)
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
			containerEl: classificationEl,
			plugin: this.plugin,
			app: this.app,
			rerender: () => this.display(),
			config: {
				name: 'Statuses',
			description: 'Manage statuses as a draggable ordered list. Renames migrate existing tasks on save. The completion status can be renamed but not removed. Removing other statuses launches a remap. Status colours drive the status pill and Kanban column headers.',
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
			containerEl: classificationEl,
			plugin: this.plugin,
			app: this.app,
			rerender: () => this.display(),
			config: {
				name: 'Areas',
			description: 'Lines of work (e.g. Database, General, Work, Home). Tasks without an area are treated as inbox. Renames migrate existing tasks. Removing an area opens a remap or lets you clear it. Area colours tint the area chip on cards and rows.',
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
				renderRowExtra: (container, area) => {
					const label = container.createEl('label', { cls: 'tt-managed-list-row-toggle' });
					const checkbox = label.createEl('input', { attr: { type: 'checkbox' } });
					checkbox.checked = this.plugin.settings.areaWorkweek[area] === true;
					label.createSpan({ text: 'Skip weekends & holidays when scheduling' });
					checkbox.addEventListener('change', async () => {
						this.plugin.settings.areaWorkweek = { ...this.plugin.settings.areaWorkweek, [area]: checkbox.checked };
						await this.plugin.saveSettings();
						await this.plugin.taskStore.load();
					});
				},
			},
		});

		renderManagedListSettingSection({
			containerEl: classificationEl,
			plugin: this.plugin,
			app: this.app,
			rerender: () => this.display(),
			config: {
				name: 'Labels',
			description: 'Cross-cutting labels applied to tasks and projects (e.g. feature, bug, research). Multi-value — a task can have several. Pre-seeded with defaults but fully user-configurable. Label colours tint the label dot on cards and rows.',
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

		// --- Views & board ---------------------------------------------------
		const viewsEl = this.group(nav, 'views', 'Views & board');
		renderViewsSettingsSection({
			containerEl: viewsEl,
			plugin: this.plugin,
			app: this.app,
			rerender: () => this.display(),
		});
		renderKanbanSettingsSection({
			containerEl: viewsEl,
			plugin: this.plugin,
		});

		// --- Reminders & quick actions --------------------------------------
		const remindersEl = this.group(nav, 'reminders', 'Reminders & quick actions');
		renderRemindersSettingsSection({
			containerEl: remindersEl,
			plugin: this.plugin,
		});
		renderQuickActionsSettingsSection({
			containerEl: remindersEl,
			plugin: this.plugin,
		});

		// --- Working calendar ------------------------------------------------
		const calendarEl = this.group(nav, 'calendar', 'Working calendar');
		renderWorkingCalendarSettingsSection({
			containerEl: calendarEl,
			plugin: this.plugin,
			rerender: () => this.display(),
		});

		// --- Capture & import ------------------------------------------------
		const captureEl = this.group(nav, 'capture', 'Capture & import');
		renderCaptureSourcesSettingsSection({
			containerEl: captureEl,
			plugin: this.plugin,
			app: this.app,
			rerender: () => this.display(),
		});
		renderMigrationSettingsSection({
			containerEl: captureEl,
			plugin: this.plugin,
		});

		// --- Archive ---------------------------------------------------------
		const archiveEl = this.group(nav, 'archive', 'Archive');
		renderArchiveSettingsSection({
			containerEl: archiveEl,
			plugin: this.plugin,
			rerender: () => this.display(),
		});

		// --- Advanced --------------------------------------------------------
		const advancedEl = this.group(nav, 'advanced', 'Advanced');
		new Setting(advancedEl)
			.setName('Graph diagnostics logging')
			.setDesc('Developer mode: log dependency graph quality metrics (crossings, bend score, lane breakdown) to console when graph layout changes.')
			.addToggle((toggle) => toggle
				.setValue(this.plugin.settings.graphDiagnosticsEnabled)
				.onChange(async (value) => {
					this.plugin.settings.graphDiagnosticsEnabled = value;
					await this.plugin.saveSettings();
				}));

		// Restore scroll after the pane has been rebuilt.
		containerEl.scrollTop = scrollTop;
	}


}
