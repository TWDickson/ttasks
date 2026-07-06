import { Setting } from 'obsidian';
import type { App } from 'obsidian';
import type TTasksPlugin from '../main';
import type { CaptureSourceConfig } from './types';
import {
	buildAutoDetectedSources,
	detectRolloverPlugin,
} from './captureSourcesSettings';
import {
	normalizeCaptureSource,
	normalizeCaptureSourceDefaults,
} from './defaults';
import { FolderSuggest } from './folderSuggest';

const MODE_HELP = 'Manual: captured checkboxes show up in TTasks but stay put until you promote them. Auto-capture: they are surfaced in TTasks automatically. Auto-promote: they are converted into TTasks notes automatically.';

interface RenderCaptureSourcesSettingsParams {
	containerEl: HTMLElement;
	plugin: TTasksPlugin;
	app: App;
	rerender: () => void;
}

type CaptureSourceMode = CaptureSourceConfig['mode'];

export function renderCaptureSourcesSettingsSection(params: RenderCaptureSourcesSettingsParams): void {
	const { containerEl, plugin, app, rerender } = params;

	new Setting(containerEl)
		.setName('Capture sources')
		.setDesc('TTasks can read plain markdown checkboxes ("- [ ] …") from other folders in your vault — like your daily notes — and pull them in as tasks. Each folder you list here is a capture source.')
		.setHeading();

	if (detectRolloverPlugin(app)) {
		containerEl.createEl('div', {
			text: 'Warning: Rollover Daily Todos detected. Promoted tasks become wiki-links that rollover copies harmlessly. Unpromoted captured tasks may appear duplicated across days.',
			cls: 'setting-item-description',
			attr: {
				style: 'margin: 8px 0 14px; padding: 8px 10px; border: 1px solid var(--background-modifier-error); border-radius: 8px; color: var(--text-warning);',
			},
		});
	}

	new Setting(containerEl)
		.setName('Default mode for new sources')
		.setDesc(`Capture mode applied to each folder you add below. ${MODE_HELP}`)
		.addDropdown((dropdown) => {
			addModeOptions(dropdown);
			dropdown.setValue(plugin.settings.captureSourceDefaultMode);
			dropdown.onChange(async (value) => {
				plugin.settings.captureSourceDefaultMode = value as CaptureSourceMode;
				await plugin.saveSettings();
			});
		});

	renderGlobalDefaultsEditor(containerEl, plugin);

	const detectedSources = buildAutoDetectedSources(app);
	const detectedPaths = new Set(detectedSources.map((source) => source.path));
	const configuredSources = plugin.settings.captureSources;

	new Setting(containerEl).setName('Auto-detected folders').setHeading();
	const autoSources = configuredSources.filter((source) => detectedPaths.has(source.path));
	if (autoSources.length === 0) {
		containerEl.createEl('p', {
			text: 'TTasks found no daily- or periodic-note folders to read from. Add one below if you keep checkboxes elsewhere.',
			cls: 'setting-item-description',
		});
	} else {
		autoSources.forEach((source, index) => {
			renderSourceEditor(containerEl, plugin, source, index, false, rerender);
		});
	}

	new Setting(containerEl).setName('Folders you added').setHeading();
	const manualSources = configuredSources.filter((source) => !detectedPaths.has(source.path));
	if (manualSources.length === 0) {
		containerEl.createEl('p', {
			text: 'None yet. Use "Add a folder" below to read checkboxes from any folder in your vault.',
			cls: 'setting-item-description',
		});
	}

	manualSources.forEach((source) => {
		const sourceIndex = configuredSources.findIndex((candidate) => candidate.path === source.path);
		renderSourceEditor(containerEl, plugin, source, sourceIndex, true, rerender);
	});

	new Setting(containerEl)
		.setName('Add a folder')
		.setDesc('Start typing a folder name to pick it from your vault, then choose Add.')
		.addText((text) => {
			text.setPlaceholder('Journal/Daily');
			new FolderSuggest(app, text.inputEl);
			text.onChange(async (value) => {
				const normalizedPath = value.replace(/\\/g, '/').trim().replace(/^\/+|\/+$/g, '');
				text.inputEl.dataset.pendingPath = normalizedPath;
			});
		})
		.addButton((button) => {
			button.setButtonText('Add');
			button.setCta();
			button.onClick(async () => {
				const inputEl = button.buttonEl.parentElement?.querySelector('input');
				const rawPath = inputEl?.dataset.pendingPath ?? inputEl?.value ?? '';
				const path = rawPath.replace(/\\/g, '/').trim().replace(/^\/+|\/+$/g, '');
				if (!path) {
					return;
				}
				if (plugin.settings.captureSources.some((source) => source.path === path)) {
					return;
				}

				plugin.settings.captureSources = [
					...plugin.settings.captureSources,
					normalizeCaptureSource({
						path,
						mode: plugin.settings.captureSourceDefaultMode,
						defaults: plugin.settings.captureSourceDefaultDefaults,
					}),
				];
				await plugin.saveSettings();
				rerender();
			});
		});
}

function addModeOptions(dropdown: { addOption: (value: string, label: string) => unknown }): void {
	dropdown.addOption('auto-capture', 'Auto-capture');
	dropdown.addOption('manual', 'Manual');
	dropdown.addOption('auto-promote', 'Auto-promote');
}

function renderGlobalDefaultsEditor(containerEl: HTMLElement, plugin: TTasksPlugin): void {
	new Setting(containerEl)
		.setName('Default area for new sources')
		.setDesc('Applied when adding a source. Leave blank for inbox.')
		.addText((text) => text
			.setPlaceholder('optional')
			.setValue(plugin.settings.captureSourceDefaultDefaults.area ?? '')
			.onChange(async (value) => {
				plugin.settings.captureSourceDefaultDefaults = normalizeCaptureSourceDefaults({
					...plugin.settings.captureSourceDefaultDefaults,
					area: value || null,
				});
				await plugin.saveSettings();
			}));

	new Setting(containerEl)
		.setName('Default labels for new sources')
		.setDesc('Comma-separated labels used when adding a source.')
		.addText((text) => text
			.setPlaceholder('feature, research')
			.setValue(plugin.settings.captureSourceDefaultDefaults.labels.join(', '))
			.onChange(async (value) => {
				plugin.settings.captureSourceDefaultDefaults = normalizeCaptureSourceDefaults({
					...plugin.settings.captureSourceDefaultDefaults,
					labels: value.split(',').map((label) => label.trim()).filter(Boolean),
				});
				await plugin.saveSettings();
			}));
}

function renderSourceEditor(
	containerEl: HTMLElement,
	plugin: TTasksPlugin,
	source: CaptureSourceConfig,
	sourceIndex: number,
	allowRemove: boolean,
	rerender: () => void,
): void {
	const header = new Setting(containerEl)
		.setName(source.path)
		.setDesc('Capture mode for this folder.')
		.addDropdown((dropdown) => {
			addModeOptions(dropdown);
			dropdown.setValue(source.mode);
			dropdown.onChange(async (value) => {
				await updateSource(plugin, sourceIndex, { mode: value as CaptureSourceMode });
			});
		});
	if (allowRemove) {
		header.addExtraButton((button) => {
			button.setIcon('trash');
			button.setTooltip(`Remove ${source.path}`);
			button.onClick(async () => {
				plugin.settings.captureSources = plugin.settings.captureSources.filter((_, index) => index !== sourceIndex);
				await plugin.saveSettings();
				rerender();
			});
		});
	}

	new Setting(containerEl)
		.setName('Use the note’s date as the task date')
		.setDesc('When the note’s filename is a date (e.g. 2026-07-06), use it as the captured task’s date.')
		.addToggle((toggle) => {
			toggle.setValue(source.inheritDateFromFilename);
			toggle.onChange(async (value) => {
				await updateSource(plugin, sourceIndex, { inheritDateFromFilename: value });
			});
		});

	new Setting(containerEl)
		.setName('Only under a heading')
		.setDesc('Leave empty to scan the whole note, or name a heading to only capture checkboxes beneath it (e.g. Tasks).')
		.addText((text) => text
			.setPlaceholder('Whole note')
			.setValue(source.sectionFilter)
			.onChange(async (value) => {
				await updateSource(plugin, sourceIndex, { sectionFilter: value.trim() });
			}));

	new Setting(containerEl)
		.setName('Include subfolders')
		.setDesc('Also read checkboxes from notes in nested folders.')
		.addToggle((toggle) => {
			toggle.setValue(source.includeSubdirectories);
			toggle.onChange(async (value) => {
				await updateSource(plugin, sourceIndex, { includeSubdirectories: value });
			});
		});

	new Setting(containerEl)
		.setName('Default area and labels')
		.setDesc('Applied to tasks captured or promoted from this folder. Leave the area blank for inbox.')
		.addText((text) => text
			.setPlaceholder('Area')
			.setValue(source.defaults.area ?? '')
			.onChange(async (value) => {
				await updateSource(plugin, sourceIndex, {
					defaults: normalizeCaptureSourceDefaults({
						...source.defaults,
						area: value || null,
					}),
				});
			}))
		.addText((text) => text
			.setPlaceholder('labels (comma-separated)')
			.setValue(source.defaults.labels.join(', '))
			.onChange(async (value) => {
				await updateSource(plugin, sourceIndex, {
					defaults: normalizeCaptureSourceDefaults({
						...source.defaults,
						labels: value.split(',').map((label) => label.trim()).filter(Boolean),
					}),
				});
			}));
}

async function updateSource(
	plugin: TTasksPlugin,
	sourceIndex: number,
	patch: Partial<CaptureSourceConfig>,
): Promise<void> {
	if (sourceIndex < 0) {
		return;
	}

	plugin.settings.captureSources = plugin.settings.captureSources.map((source, index) => {
		if (index !== sourceIndex) {
			return source;
		}

		return normalizeCaptureSource({
			...source,
			...patch,
			defaults: patch.defaults ? normalizeCaptureSourceDefaults(patch.defaults) : source.defaults,
		});
	});

	await plugin.saveSettings();
}