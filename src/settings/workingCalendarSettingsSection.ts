import { Notice, Setting } from 'obsidian';
import type TTasksPlugin from '../main';

interface RenderWorkingCalendarSettingsParams {
	containerEl: HTMLElement;
	plugin: TTasksPlugin;
	rerender: () => void;
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * "Working calendar" settings: a per-area "skip weekends & holidays" toggle and
 * a single universal holiday list. Together these drive the working-day date
 * math used for dependency-chain projections (see taskGraphDates.CalendarConfig).
 */
export function renderWorkingCalendarSettingsSection(params: RenderWorkingCalendarSettingsParams): void {
	const { containerEl, plugin, rerender } = params;

	new Setting(containerEl)
		.setName('Working calendar')
		.setDesc('Choose which areas skip weekends and holidays when projecting dependency-chain dates. Personal areas can keep weekend scheduling; work areas skip non-working days. Holidays are a single shared list applied to any area that skips them.')
		.setHeading();

	const areas = plugin.settings.areas ?? [];
	if (areas.length === 0) {
		containerEl.createEl('p', {
			text: 'No areas configured yet. Add areas in the Areas section above to set their working calendars.',
			cls: 'setting-item-description',
		});
	}
	for (const area of areas) {
		new Setting(containerEl)
			.setName(area)
			.setDesc('Skip weekends & holidays for tasks in this area.')
			.addToggle((toggle) => toggle
				.setValue(plugin.settings.areaWorkweek[area] === true)
				.onChange(async (value) => {
					plugin.settings.areaWorkweek = { ...plugin.settings.areaWorkweek, [area]: value };
					await plugin.saveSettings();
					await plugin.taskStore.load();
				}));
	}

	new Setting(containerEl)
		.setName('Holidays')
		.setDesc('Dates (YYYY-MM-DD) skipped by any area that skips non-working days.')
		.setHeading();

	const holidays = [...plugin.settings.holidays].sort();
	if (holidays.length === 0) {
		containerEl.createEl('p', {
			text: 'No holidays yet.',
			cls: 'setting-item-description',
		});
	}
	for (const date of holidays) {
		new Setting(containerEl)
			.setName(date)
			.addButton((btn) => btn
				.setButtonText('Remove')
				.setWarning()
				.onClick(async () => {
					plugin.settings.holidays = plugin.settings.holidays.filter((d) => d !== date);
					await plugin.saveSettings();
					await plugin.taskStore.load();
					rerender();
				}));
	}

	let pendingDate = '';
	new Setting(containerEl)
		.setName('Add holiday')
		.setDesc('Pick a date to add to the shared holiday list.')
		.addText((text) => {
			text.inputEl.type = 'date';
			text.onChange((value) => { pendingDate = value; });
		})
		.addButton((btn) => btn
			.setButtonText('Add')
			.setCta()
			.onClick(async () => {
				const value = pendingDate.trim();
				if (!ISO_DATE_RE.test(value)) {
					new Notice('TTasks: enter a valid date (YYYY-MM-DD).');
					return;
				}
				if (plugin.settings.holidays.includes(value)) {
					new Notice('TTasks: that holiday is already in the list.');
					return;
				}
				plugin.settings.holidays = [...plugin.settings.holidays, value].sort();
				await plugin.saveSettings();
				await plugin.taskStore.load();
				rerender();
			}));
}
