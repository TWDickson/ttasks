import { Setting } from 'obsidian';
import type TTasksPlugin from '../main';
import {
	buildInteropRules,
	builtinPreset,
	isBuiltinPresetId,
	isPresetModified,
	newCustomPresetId,
	type SharePreamblePreset,
} from '../integration/sharePreamble';

interface RenderSharePreambleSettingsParams {
	containerEl: HTMLElement;
	plugin: TTasksPlugin;
	rerender: () => void;
}

/**
 * The Share/Sync preamble library.
 *
 * Only the **ask** is editable here — the sentence that tells the AI what to do
 * with the export. The interop contract (how to read the data, how to shape the
 * reply) is derived from the export's own options and is shown read-only at the
 * bottom: a user editing it could only desync the reply from what the importer
 * accepts, so it is deliberately not a setting.
 */
export function renderSharePreambleSettingsSection(params: RenderSharePreambleSettingsParams): void {
	const { containerEl, plugin, rerender } = params;

	new Setting(containerEl)
		.setName('AI export prompts')
		.setDesc('The message sent ahead of an AI-bound export, describing what you want the AI to do with it. Pick one of these in the Share/Sync window; edit the wording here.')
		.setHeading();

	const presets = plugin.settings.shareSync.preamblePresets;

	const save = async (): Promise<void> => {
		await plugin.saveSettings();
	};

	for (const preset of presets) {
		// 'none' is the "send the data with no message" escape hatch. It has no
		// wording to tune, and letting it be renamed or deleted would strand the
		// only way to export without a preamble.
		if (preset.id === 'none') continue;
		renderPresetEditor(containerEl, plugin, preset, save, rerender);
	}

	new Setting(containerEl)
		.setName('Add a prompt')
		.setDesc('Create your own, for a task you ask for often.')
		.addButton((button) => {
			button.setButtonText('Add');
			button.setCta();
			button.onClick(async () => {
				const id = newCustomPresetId(plugin.settings.shareSync.preamblePresets);
				plugin.settings.shareSync.preamblePresets = [
					...plugin.settings.shareSync.preamblePresets,
					{ id, label: 'New prompt', text: '' },
				];
				await save();
				rerender();
			});
		});

	renderInteropPreview(containerEl, plugin);
}

function renderPresetEditor(
	containerEl: HTMLElement,
	plugin: TTasksPlugin,
	preset: SharePreamblePreset,
	save: () => Promise<void>,
	rerender: () => void,
): void {
	const isBuiltin = isBuiltinPresetId(preset.id);

	const setting = new Setting(containerEl)
		.setName(preset.label || preset.id)
		.setDesc(isBuiltin
			? (isPresetModified(preset) ? 'Bundled prompt — edited.' : 'Bundled prompt.')
			: 'Your prompt.');

	setting.addText((text) => {
		text.setPlaceholder('Name');
		text.setValue(preset.label);
		text.onChange(async (value) => {
			preset.label = value;
			await save();
		});
	});

	// Restore is only meaningful for a bundled preset that differs from what we
	// ship; a custom one has no default to go back to.
	if (isBuiltin) {
		setting.addButton((button) => {
			button.setButtonText('Restore default');
			button.setDisabled(!isPresetModified(preset));
			button.onClick(async () => {
				const bundled = builtinPreset(preset.id);
				if (!bundled) return;
				preset.label = bundled.label;
				preset.text = bundled.text;
				await save();
				rerender();
			});
		});
	} else {
		setting.addExtraButton((button) => {
			button.setIcon('trash-2');
			button.setTooltip('Delete this prompt');
			button.onClick(async () => {
				plugin.settings.shareSync.preamblePresets =
					plugin.settings.shareSync.preamblePresets.filter((candidate) => candidate.id !== preset.id);
				// Selecting a prompt that no longer exists would leave the modal on a
				// dangling id, so fall back to the first one.
				if (plugin.settings.shareSync.preamblePreset === preset.id) {
					plugin.settings.shareSync.preamblePreset =
						plugin.settings.shareSync.preamblePresets[0]?.id ?? 'review';
				}
				await save();
				rerender();
			});
		});
	}

	const area = containerEl.createEl('textarea', { cls: 'tt-preamble-editor' });
	area.rows = 4;
	area.value = preset.text;
	area.placeholder = 'What should the AI do with this export?';
	area.addEventListener('change', () => {
		preset.text = area.value;
		void save();
	});
}

/**
 * The interop rules, read-only. Shown because "what actually gets sent" is
 * otherwise invisible — but not editable, per the note on
 * `buildInteropRules`. Rendered for the current export options so it matches
 * what the next export will really say.
 */
function renderInteropPreview(containerEl: HTMLElement, plugin: TTasksPlugin): void {
	new Setting(containerEl)
		.setName('Interop instructions')
		.setDesc('Sent after your prompt on every AI export, so the reply comes back in a shape TTasks can apply. Built from the export\'s own options — not editable.')
		.setHeading();

	const { payloadFormat, notesPolicy } = plugin.settings.shareSync;
	const rules = buildInteropRules(
		{
			statuses: plugin.settings.statuses ?? [],
			priorities: [],
			areas: [],
			labels: [],
		},
		{ payloadFormat, notesPolicy },
	);

	const list = containerEl.createEl('ul', { cls: 'tt-preamble-interop' });
	for (const rule of rules) list.createEl('li', { text: rule });
}
