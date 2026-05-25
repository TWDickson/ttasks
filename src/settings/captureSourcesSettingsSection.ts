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

interface RenderCaptureSourcesSettingsParams {
	containerEl: HTMLElement;
	plugin: TTasksPlugin;
	app: App;
	rerender: () => void;
}

type CaptureSourceMode = CaptureSourceConfig['mode'];

export function renderCaptureSourcesSettingsSection(params: RenderCaptureSourcesSettingsParams): void {
	const { containerEl, plugin, app, rerender } = params;

	containerEl.createEl('h2', { text: 'Capture Sources' });
	containerEl.createEl('p', {
		text: 'Configure directories that feed markdown checkboxes into TTasks. Each source controls mode, section filtering, filename date inheritance, and default task values.',
		cls: 'setting-item-description',
		attr: { style: 'margin-bottom: 12px;' },
	});

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
		.setDesc('Applied when adding a directory source from settings.')
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

	containerEl.createEl('h3', { text: 'Auto-detected sources' });
	const autoSources = configuredSources.filter((source) => detectedPaths.has(source.path));
	if (autoSources.length === 0) {
		containerEl.createEl('p', {
			text: 'No daily or periodic note folders detected.',
			cls: 'setting-item-description',
		});
	} else {
		autoSources.forEach((source, index) => {
			renderSourceEditor(containerEl, plugin, source, index, false, rerender);
		});
	}

	containerEl.createEl('h3', { text: 'Additional directories' });
	const manualSources = configuredSources.filter((source) => !detectedPaths.has(source.path));
	if (manualSources.length === 0) {
		containerEl.createEl('p', {
			text: 'No extra directories configured.',
			cls: 'setting-item-description',
		});
	}

	manualSources.forEach((source) => {
		const sourceIndex = configuredSources.findIndex((candidate) => candidate.path === source.path);
		renderSourceEditor(containerEl, plugin, source, sourceIndex, true, rerender);
	});

	new Setting(containerEl)
		.setName('Add directory source')
		.setDesc('Enter a vault-relative directory path (for example Journal/Daily).')
		.addText((text) => {
			text.setPlaceholder('Folder/path');
			text.onChange(async (value) => {
				const normalizedPath = value.replace(/\\/g, '/').trim().replace(/^\/+|\/+$/g, '');
				text.inputEl.dataset.pendingPath = normalizedPath;
			});
		})
		.addButton((button) => {
			button.setButtonText('Add directory');
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
	new Setting(containerEl)
		.setName(source.path)
		.setDesc('Source directory')
		.addDropdown((dropdown) => {
			addModeOptions(dropdown);
			dropdown.setValue(source.mode);
			dropdown.onChange(async (value) => {
				await updateSource(plugin, sourceIndex, { mode: value as CaptureSourceMode });
			});
		})
		.addToggle((toggle) => {
			toggle.setValue(source.inheritDateFromFilename);
			toggle.onChange(async (value) => {
				await updateSource(plugin, sourceIndex, { inheritDateFromFilename: value });
			});
		})
		.addExtraButton((button) => {
			button.setIcon('gear');
			button.setTooltip('Refresh settings view');
			button.onClick(() => rerender());
		});

	new Setting(containerEl)
		.setName('Section filter')
		.setDesc(`For ${source.path}: leave empty to scan whole note or set a heading name.`)
		.addText((text) => text
			.setPlaceholder('Tasks')
			.setValue(source.sectionFilter)
			.onChange(async (value) => {
				await updateSource(plugin, sourceIndex, { sectionFilter: value.trim() });
			}));

	new Setting(containerEl)
		.setName('Include subdirectories')
		.setDesc(`For ${source.path}: include notes in nested folders.`)
		.addToggle((toggle) => {
			toggle.setValue(source.includeSubdirectories);
			toggle.onChange(async (value) => {
				await updateSource(plugin, sourceIndex, { includeSubdirectories: value });
			});
		});

	new Setting(containerEl)
		.setName('Defaults')
		.setDesc(`For ${source.path}: defaults applied when capture creates or promotes tasks.`)
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
			.setPlaceholder('labels (csv)')
			.setValue(source.defaults.labels.join(', '))
			.onChange(async (value) => {
				await updateSource(plugin, sourceIndex, {
					defaults: normalizeCaptureSourceDefaults({
						...source.defaults,
						labels: value.split(',').map((label) => label.trim()).filter(Boolean),
					}),
				});
			}));

	if (allowRemove) {
		new Setting(containerEl)
			.setName('Remove source')
			.setDesc(`Delete ${source.path} from capture sources.`)
			.addButton((button) => {
				button.setButtonText('Remove');
				button.setWarning();
				button.onClick(async () => {
					plugin.settings.captureSources = plugin.settings.captureSources.filter((_, index) => index !== sourceIndex);
					await plugin.saveSettings();
					rerender();
				});
			});
	}
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