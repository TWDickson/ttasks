import { Setting } from 'obsidian';
import type TTasksPlugin from '../main';

interface RenderPomodoroSettingsParams {
	containerEl: HTMLElement;
	plugin: TTasksPlugin;
}

/** Bounded whole-minute (or count) parse: keep the current value on bad input. */
function parseBounded(value: string, min: number, max: number): number | null {
	const n = parseInt(value, 10);
	return !isNaN(n) && n >= min && n <= max ? n : null;
}

export function renderPomodoroSettingsSection(params: RenderPomodoroSettingsParams): void {
	const { containerEl, plugin } = params;

	containerEl.createEl('p', {
		text: 'Native focus timer. Start a Pomodoro from a task\'s detail pane or the command palette — including untethered sessions with no task. Completed focus sessions bump the task\'s count + minutes (when attached) and can be appended to a CSV session log.',
		cls: 'setting-item-description',
	});

	const p = plugin.settings.pomodoro;

	new Setting(containerEl)
		.setName('Focus length (minutes)')
		.setDesc('Length of a focus session.')
		.addText(text => text
			.setPlaceholder('25')
			.setValue(String(p.focusMinutes))
			.onChange(async (value) => {
				const n = parseBounded(value, 1, 180);
				if (n !== null) { plugin.settings.pomodoro.focusMinutes = n; await plugin.saveSettings(); }
			}));

	new Setting(containerEl)
		.setName('Short break (minutes)')
		.setDesc('Break taken after most focus sessions.')
		.addText(text => text
			.setPlaceholder('5')
			.setValue(String(p.shortBreakMinutes))
			.onChange(async (value) => {
				const n = parseBounded(value, 1, 60);
				if (n !== null) { plugin.settings.pomodoro.shortBreakMinutes = n; await plugin.saveSettings(); }
			}));

	new Setting(containerEl)
		.setName('Long break (minutes)')
		.setDesc('Longer break taken on the long-break interval.')
		.addText(text => text
			.setPlaceholder('15')
			.setValue(String(p.longBreakMinutes))
			.onChange(async (value) => {
				const n = parseBounded(value, 1, 120);
				if (n !== null) { plugin.settings.pomodoro.longBreakMinutes = n; await plugin.saveSettings(); }
			}));

	new Setting(containerEl)
		.setName('Long break interval')
		.setDesc('Take a long break after this many completed focus sessions.')
		.addText(text => text
			.setPlaceholder('4')
			.setValue(String(p.longBreakInterval))
			.onChange(async (value) => {
				const n = parseBounded(value, 1, 12);
				if (n !== null) { plugin.settings.pomodoro.longBreakInterval = n; await plugin.saveSettings(); }
			}));

	new Setting(containerEl)
		.setName('Auto-start next phase')
		.setDesc('When a phase ends, start the next one automatically. Off waits for you to resume.')
		.addToggle(toggle => toggle
			.setValue(p.autoStartNext)
			.onChange(async (value) => {
				plugin.settings.pomodoro.autoStartNext = value;
				await plugin.saveSettings();
			}));

	new Setting(containerEl)
		.setName('Log sessions to CSV')
		.setDesc('Append every completed focus session (time, minutes, task) to a CSV log file. Append-only, git- and sync-friendly.')
		.addToggle(toggle => toggle
			.setValue(p.logEnabled)
			.onChange(async (value) => {
				plugin.settings.pomodoro.logEnabled = value;
				await plugin.saveSettings();
			}));

	new Setting(containerEl)
		.setName('Session log path')
		.setDesc('Vault-relative path of the CSV log. Created on the first logged session.')
		.addText(text => text
			.setPlaceholder('ttasks-pomodoro-log.csv')
			.setValue(p.logPath)
			.onChange(async (value) => {
				const trimmed = value.trim();
				if (trimmed !== '') { plugin.settings.pomodoro.logPath = trimmed; await plugin.saveSettings(); }
			}));
}
