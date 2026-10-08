import { Notice, Platform, Setting } from 'obsidian';
import { describeNotificationResult, playChime, showSystemNotification } from '../integration/pomodoroAlert';
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
		.setName('Timer display')
		.setDesc('How the running timer is drawn in the dedicated Pomodoro pane.')
		.addDropdown(dd => dd
			.addOption('digital', 'Digital (MM:SS)')
			.addOption('ring', 'Ring + MM:SS')
			.addOption('ring-plain', 'Ring only, no numbers (ADHD-friendly)')
			.setValue(p.dialStyle)
			.onChange(async (value) => {
				plugin.settings.pomodoro.dialStyle = value as typeof p.dialStyle;
				await plugin.saveSettings();
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
		.setName('Log partial session on stop')
		.setDesc('When you Stop mid-focus, log the elapsed minutes instead of discarding them. Partial sessions add to the task\'s minutes but do not count as a completed pomodoro.')
		.addToggle(toggle => toggle
			.setValue(p.logPartialOnStop)
			.onChange(async (value) => {
				plugin.settings.pomodoro.logPartialOnStop = value;
				await plugin.saveSettings();
			}));

	new Setting(containerEl)
		.setName('Chime when a phase ends')
		.setDesc('Play a short two-note chime when a focus session or break finishes.')
		.addToggle(toggle => toggle
			.setValue(p.alertSound)
			.onChange(async (value) => {
				plugin.settings.pomodoro.alertSound = value;
				await plugin.saveSettings();
			}));

	if (Platform.isDesktop) {
		new Setting(containerEl)
			.setName('System notification when a phase ends')
			.setDesc('Also show an OS notification (it reaches you even when Obsidian is in the background). Clicking it brings you back to the Pomodoro pane.')
			.addToggle(toggle => toggle
				.setValue(p.systemNotification)
				.onChange(async (value) => {
					plugin.settings.pomodoro.systemNotification = value;
					await plugin.saveSettings();
				}))
			.addButton(button => button
				.setButtonText('Send test')
				.onClick(async () => {
					if (plugin.settings.pomodoro.alertSound) playChime();
					const result = await showSystemNotification('TTasks Pomodoro', 'Test notification — phase alerts will look like this.');
					new Notice(describeNotificationResult(result), 10_000);
				}));
	}

	new Setting(containerEl)
		.setName('Log sessions to CSV')
		.setDesc('Append every completed focus session (time, minutes, task) to a CSV file. Append-only, git- and sync-friendly. Obsidian hides .csv files unless "Detect all file extensions" is on (Settings → Files and links).')
		.addToggle(toggle => toggle
			.setValue(p.logEnabled)
			.onChange(async (value) => {
				plugin.settings.pomodoro.logEnabled = value;
				await plugin.saveSettings();
			}));

	new Setting(containerEl)
		.setName('Session log folder')
		.setDesc(`Folder for the log. Leave blank to keep it in your tasks folder (${plugin.settings.tasksFolder}).`)
		.addText(text => text
			.setPlaceholder(plugin.settings.tasksFolder)
			.setValue(p.logFolder)
			.onChange(async (value) => {
				plugin.settings.pomodoro.logFolder = value.trim().replace(/^\/+|\/+$/g, '');
				await plugin.saveSettings();
			}));

	new Setting(containerEl)
		.setName('Split the log')
		.setDesc('Start a new file each year or month to keep each file small. Only the file name changes — pomodoro-log.csv, pomodoro-log-2026.csv, or pomodoro-log-2026-10.csv.')
		.addDropdown(dd => dd
			.addOption('none', 'One file')
			.addOption('year', 'One file per year')
			.addOption('month', 'One file per month')
			.setValue(p.logSplit)
			.onChange(async (value) => {
				plugin.settings.pomodoro.logSplit = value as typeof p.logSplit;
				await plugin.saveSettings();
			}));
}
