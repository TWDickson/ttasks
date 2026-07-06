import { Notice, Setting } from 'obsidian';
import type TTasksPlugin from '../main';
import type { HolidayEntry } from './types';
import { normalizeHolidayEntries, sortHolidayEntries } from './holidays';

interface RenderWorkingCalendarSettingsParams {
	containerEl: HTMLElement;
	plugin: TTasksPlugin;
	rerender: () => void;
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * "Working calendar" settings: the shared holiday list. The per-area "skip
 * weekends & holidays" toggle now lives on each area in the Areas section.
 * Together these drive the working-day date math used for dependency-chain
 * projections (see taskGraphDates.CalendarConfig).
 */
export function renderWorkingCalendarSettingsSection(params: RenderWorkingCalendarSettingsParams): void {
	const { containerEl, plugin, rerender } = params;

	new Setting(containerEl)
		.setName('Holidays')
		.setDesc('A shared list of holidays skipped when scheduling. It applies to any area with "Skip weekends & holidays" turned on (set per area in the Statuses, areas & labels section). Mark a holiday as repeating to skip that day every year.')
		.setHeading();

	const holidays = sortHolidayEntries(plugin.settings.holidays);
	if (holidays.length === 0) {
		containerEl.createEl('p', {
			text: 'No holidays yet.',
			cls: 'setting-item-description',
		});
	}

	async function commit(next: HolidayEntry[]): Promise<void> {
		plugin.settings.holidays = normalizeHolidayEntries(next);
		await plugin.saveSettings();
		await plugin.taskStore.load();
		rerender();
	}

	for (const holiday of holidays) {
		const label = holiday.repeatYearly ? `${holiday.date.slice(5)} (yearly)` : holiday.date;
		new Setting(containerEl)
			.setName(holiday.name || label)
			.setDesc(holiday.name ? label : 'Unnamed holiday')
			.addToggle((toggle) => toggle
				.setTooltip('Repeat every year')
				.setValue(holiday.repeatYearly)
				.onChange(async (value) => {
					await commit(plugin.settings.holidays.map((entry) => (
						entry.date === holiday.date && entry.name === holiday.name
							? { ...entry, repeatYearly: value }
							: entry
					)));
				}))
			.addButton((btn) => btn
				.setButtonText('Remove')
				.setWarning()
				.onClick(async () => {
					await commit(plugin.settings.holidays.filter((entry) => !(entry.date === holiday.date && entry.name === holiday.name)));
				}));
	}

	let pendingDate = '';
	let pendingName = '';
	let pendingRepeat = false;
	new Setting(containerEl)
		.setName('Add holiday')
		.setDesc('Pick a date, optionally name it, and choose whether it repeats every year.')
		.addText((text) => {
			text.inputEl.type = 'date';
			text.onChange((value) => { pendingDate = value; });
		})
		.addText((text) => {
			text.setPlaceholder('Name (optional)');
			text.onChange((value) => { pendingName = value; });
		})
		.addToggle((toggle) => {
			toggle.setTooltip('Repeat every year');
			toggle.setValue(false);
			toggle.onChange((value) => { pendingRepeat = value; });
		})
		.addButton((btn) => btn
			.setButtonText('Add')
			.setCta()
			.onClick(async () => {
				const date = pendingDate.trim();
				if (!ISO_DATE_RE.test(date)) {
					new Notice('TTasks: enter a valid date (YYYY-MM-DD).');
					return;
				}
				const name = pendingName.trim();
				const duplicate = plugin.settings.holidays.some((entry) => entry.date === date && entry.name === name);
				if (duplicate) {
					new Notice('TTasks: that holiday is already in the list.');
					return;
				}
				await commit([...plugin.settings.holidays, { date, name, repeatYearly: pendingRepeat }]);
			}));
}
