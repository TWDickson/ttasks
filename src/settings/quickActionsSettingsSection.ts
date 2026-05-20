import { Setting } from 'obsidian';
import type TTasksPlugin from '../main';

interface RenderQuickActionsSettingsParams {
	containerEl: HTMLElement;
	plugin: TTasksPlugin;
}

export function renderQuickActionsSettingsSection(params: RenderQuickActionsSettingsParams): void {
	const { containerEl, plugin } = params;

	containerEl.createEl('h2', { text: 'Quick Actions' });
	containerEl.createEl('p', {
		text: 'Quick actions update task status and due dates. On mobile, touch-and-hold opens a thumb menu that uses these preferences.',
		cls: 'setting-item-description',
		attr: { style: 'margin-bottom: 12px;' },
	});

	const statuses = plugin.settings.statuses ?? [];
	const qa = plugin.settings.quickActions;

	new Setting(containerEl)
		.setName('Start status')
		.setDesc('Status applied by Start from the quick actions menu.')
		.addDropdown(dd => {
			for (const s of statuses) dd.addOption(s, s);
			dd.setValue(statuses.includes(qa.startStatus) ? qa.startStatus : (statuses[0] ?? ''));
			dd.onChange(async (v) => {
				plugin.settings.quickActions.startStatus = v;
				await plugin.saveSettings();
			});
		});

	new Setting(containerEl)
		.setName('Block status')
		.setDesc('Status applied by Block from the quick actions menu.')
		.addDropdown(dd => {
			for (const s of statuses) dd.addOption(s, s);
			dd.setValue(statuses.includes(qa.blockStatus) ? qa.blockStatus : (statuses[0] ?? ''));
			dd.onChange(async (v) => {
				plugin.settings.quickActions.blockStatus = v;
				await plugin.saveSettings();
			});
		});

	new Setting(containerEl)
		.setName('Defer days')
		.setDesc('Default days used when the defer action does not receive a specific preset date. If there is no due date, today is used as the base.')
		.addText(text => text
			.setPlaceholder('1')
			.setValue(String(qa.deferDays))
			.onChange(async (v) => {
				const n = parseInt(v, 10);
				if (!isNaN(n) && n >= 1 && n <= 365) {
					plugin.settings.quickActions.deferDays = n;
					await plugin.saveSettings();
				}
			})
		);
}
