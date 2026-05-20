import { Setting } from 'obsidian';
import type TTasksPlugin from '../main';

interface RenderRemindersSettingsParams {
	containerEl: HTMLElement;
	plugin: TTasksPlugin;
}

export function renderRemindersSettingsSection(params: RenderRemindersSettingsParams): void {
	const { containerEl, plugin } = params;

	containerEl.createEl('h2', { text: 'Reminders' });
	containerEl.createEl('p', {
		text: 'Reminders fire as Obsidian notices when tasks are due, overdue, or stale. Each reminder fires at most once per task per day.',
		cls: 'setting-item-description',
		attr: { style: 'margin-bottom: 12px;' },
	});

	const r = plugin.settings.reminders;

	new Setting(containerEl)
		.setName('Enable reminders')
		.setDesc('Master switch. When off, no reminders will fire.')
		.addToggle(toggle => toggle
			.setValue(r.enabled)
			.onChange(async (value) => {
				plugin.settings.reminders.enabled = value;
				await plugin.saveSettings();
			}));

	new Setting(containerEl)
		.setName('Due today')
		.setDesc('Notify when a task is due today.')
		.addToggle(toggle => toggle
			.setValue(r.ruleDueToday)
			.onChange(async (value) => {
				plugin.settings.reminders.ruleDueToday = value;
				await plugin.saveSettings();
			}));

	new Setting(containerEl)
		.setName('Overdue')
		.setDesc("Notify when a task's due date has already passed.")
		.addToggle(toggle => toggle
			.setValue(r.ruleOverdue)
			.onChange(async (value) => {
				plugin.settings.reminders.ruleOverdue = value;
				await plugin.saveSettings();
			}));

	new Setting(containerEl)
		.setName('Lead time')
		.setDesc('Notify N days before a task is due.')
		.addToggle(toggle => toggle
			.setValue(r.ruleLeadTime)
			.onChange(async (value) => {
				plugin.settings.reminders.ruleLeadTime = value;
				await plugin.saveSettings();
			}));

	new Setting(containerEl)
		.setName('Lead time (days)')
		.setDesc('How many days before the due date to start notifying. Requires Lead time to be enabled.')
		.addText(text => text
			.setPlaceholder('1')
			.setValue(String(r.leadTimeDays))
			.onChange(async (v) => {
				const n = parseInt(v, 10);
				if (!isNaN(n) && n >= 1 && n <= 14) {
					plugin.settings.reminders.leadTimeDays = n;
					await plugin.saveSettings();
				}
			}));

	new Setting(containerEl)
		.setName('Stale in-progress')
		.setDesc('Notify when a task has been in the start status for longer than the threshold.')
		.addToggle(toggle => toggle
			.setValue(r.ruleStaleInProgress)
			.onChange(async (value) => {
				plugin.settings.reminders.ruleStaleInProgress = value;
				await plugin.saveSettings();
			}));

	new Setting(containerEl)
		.setName('Stale threshold (days)')
		.setDesc("Number of days a task must be in-progress before being considered stale. Uses the task's start date.")
		.addText(text => text
			.setPlaceholder('7')
			.setValue(String(r.staleThresholdDays))
			.onChange(async (v) => {
				const n = parseInt(v, 10);
				if (!isNaN(n) && n >= 1 && n <= 90) {
					plugin.settings.reminders.staleThresholdDays = n;
					await plugin.saveSettings();
				}
			}));

	new Setting(containerEl)
		.setName('Enable quiet hours')
		.setDesc('Suppress reminders during a configured time window.')
		.addToggle(toggle => toggle
			.setValue(r.quietHoursEnabled)
			.onChange(async (value) => {
				plugin.settings.reminders.quietHoursEnabled = value;
				await plugin.saveSettings();
			}));

	new Setting(containerEl)
		.setName('Quiet hours start')
		.setDesc('Hour of day (0-23) when quiet period begins.')
		.addText(text => text
			.setPlaceholder('22')
			.setValue(String(r.quietStart))
			.onChange(async (v) => {
				const n = parseInt(v, 10);
				if (!isNaN(n) && n >= 0 && n <= 23) {
					plugin.settings.reminders.quietStart = n;
					await plugin.saveSettings();
				}
			}));

	new Setting(containerEl)
		.setName('Quiet hours end')
		.setDesc('Hour of day (0-23) when quiet period ends. If less than start, wraps midnight (e.g. 22 to 8).')
		.addText(text => text
			.setPlaceholder('8')
			.setValue(String(r.quietEnd))
			.onChange(async (v) => {
				const n = parseInt(v, 10);
				if (!isNaN(n) && n >= 0 && n <= 23) {
					plugin.settings.reminders.quietEnd = n;
					await plugin.saveSettings();
				}
			}));
}
