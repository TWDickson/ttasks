import { Setting } from 'obsidian';
import type { KanbanCardField } from './types';
import type TTasksPlugin from '../main';

interface RenderKanbanSettingsParams {
	containerEl: HTMLElement;
	plugin: TTasksPlugin;
}

export function renderKanbanSettingsSection(params: RenderKanbanSettingsParams): void {
	const { containerEl, plugin } = params;

	new Setting(containerEl)
		.setName('Kanban cards')
		.setHeading();

	new Setting(containerEl)
		.setName('Visible card fields')
		.setDesc('Choose which fields appear as badges on Kanban cards. All fields are shown by default.');

	const fields: KanbanCardField[] = ['area', 'dueDate', 'labels', 'depCount'];
	const labels: Record<string, string> = {
		area: 'Area',
		dueDate: 'Due date',
		labels: 'Labels',
		depCount: 'Dependency count',
	};

	for (const field of fields) {
		new Setting(containerEl)
			.setName(labels[field])
			.addToggle(t => t
				.setValue(plugin.settings.kanbanCardFields.includes(field))
				.onChange(async (on) => {
					const current = plugin.settings.kanbanCardFields;
					plugin.settings.kanbanCardFields = on
						? [...current, field]
						: current.filter(f => f !== field);
					await plugin.saveSettings();
				}));
	}
}
