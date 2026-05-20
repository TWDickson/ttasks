import { Setting } from 'obsidian';
import type { App } from 'obsidian';
import type TTasksPlugin from '../main';
import type { CustomTaskViewDefinition, TaskViewPresentation, TaskViewRenderer } from './types';
import { createCustomViewDefinition, getRegisteredTaskViews, resolveTaskViewIcon } from '../views/viewRegistry';
import { QueryEditorModal } from '../modals/QueryEditorModal';

interface RenderViewsSettingsParams {
	containerEl: HTMLElement;
	plugin: TTasksPlugin;
	app: App;
	rerender: () => void;
}

export function renderViewsSettingsSection(params: RenderViewsSettingsParams): void {
	const { containerEl, plugin, app, rerender } = params;

	containerEl.createEl('h2', { text: 'Views' });
	containerEl.createEl('p', {
		text: 'Built-in views and Smart Lists now share one registry model. Smart Lists are saved query + renderer definitions with sidebar navigation.',
		cls: 'setting-item-description',
		attr: { style: 'margin-bottom: 12px;' },
	});

	const registeredViews = getRegisteredTaskViews(plugin.settings);
	const builtinViews = registeredViews.filter((view) => view.source === 'builtin');
	const customViews = plugin.settings.customViews;

	containerEl.createEl('h3', { text: 'Built-in Views' });
	for (const view of builtinViews) {
		new Setting(containerEl)
			.setName(view.name)
			.setDesc(`${view.id} • ${view.renderer} • ${describeTaskView(view)}`)
			.addExtraButton((button) => {
				button.setIcon(resolveTaskViewIcon(view));
				button.setTooltip('Built-in view');
				button.setDisabled(true);
			});
	}

	containerEl.createEl('h3', { text: 'Smart Lists' });
	if (customViews.length === 0) {
		containerEl.createEl('p', {
			text: 'No Smart Lists yet. Add one to create another board tab backed by the persisted query model.',
			cls: 'setting-item-description',
		});
	}

	customViews.forEach((view, index) => {
		new Setting(containerEl)
			.setName(view.name)
			.setDesc(`${view.id} • ${view.renderer} • ${describeTaskView(view)}`)
			.addText((text) => text
				.setPlaceholder('View name')
				.setValue(view.name)
				.onChange(async (value) => {
					await updateCustomView(plugin, index, (current) => ({
						...current,
						name: value.trim() || current.name,
					}));
				})
			)
			.addButton((button) => {
				button.setButtonText('Edit query');
				button.setTooltip('Open the filter / sort / group editor for this view');
				button.onClick(() => {
					new QueryEditorModal(
						app,
						view.name,
						view.query,
						view.renderer,
						{
							statuses: plugin.settings.statuses,
							areas: plugin.settings.areas,
							labelValues: plugin.settings.labelValues,
						},
						async (updatedQuery, updatedRenderer, updatedName) => {
							await updateCustomView(plugin, index, (current) => ({
								...current,
								name: updatedName,
								query: updatedQuery,
								renderer: updatedRenderer,
							}));
							rerender();
						},
						async () => {
							const nextViews = plugin.settings.customViews.filter((_, i) => i !== index);
							await saveCustomViews(plugin, nextViews, true, rerender);
						},
					).open();
				});
			})
			.addExtraButton((button) => {
				button.setIcon('trash');
				button.setTooltip('Delete custom view');
				button.onClick(async () => {
					const nextViews = plugin.settings.customViews.filter((_, candidateIndex) => candidateIndex !== index);
					await saveCustomViews(plugin, nextViews, true, rerender);
				});
			});

		new Setting(containerEl)
			.setName('Icon')
			.setDesc('Optional icon override for the board rail and mobile tabs.')
			.addText((text) => text
				.setPlaceholder(resolveTaskViewIcon(view))
				.setValue(view.icon ?? '')
				.onChange(async (value) => {
					await updateCustomView(plugin, index, (current) => ({
						...current,
						icon: value.trim() || null,
					}));
				})
			)
			.addExtraButton((button) => {
				button.setIcon(resolveTaskViewIcon(view));
				button.setTooltip('Resolved icon');
				button.setDisabled(true);
			});

		new Setting(containerEl)
			.setName('Renderer')
			.setDesc('Choose how this saved query is rendered in the board.')
			.addDropdown((dropdown) => {
				dropdown.addOption('list', 'List');
				dropdown.addOption('kanban', 'Kanban');
				dropdown.addOption('agenda', 'Agenda');
				dropdown.addOption('graph', 'Graph');
				dropdown.setValue(view.renderer);
				dropdown.onChange(async (value) => {
					await updateCustomView(plugin, index, (current) => ({
						...current,
						renderer: value as TaskViewRenderer,
					}));
					rerender();
				});
			});

		new Setting(containerEl)
			.setName('List hierarchy')
			.setDesc('Used by list-rendered views to show parent/child structure or a flat list.')
			.addDropdown((dropdown) => {
				dropdown.addOption('tree', 'Tree');
				dropdown.addOption('flat', 'Flat');
				dropdown.setValue(view.presentation.hierarchy);
				dropdown.onChange(async (value) => {
					await updateCustomView(plugin, index, (current) => ({
						...current,
						presentation: {
							...current.presentation,
							hierarchy: value as TaskViewPresentation['hierarchy'],
						},
					}));
				});
			});

		new Setting(containerEl)
			.setName('Graph default mode')
			.setDesc('Used by graph-rendered views to choose the default graph tab when opened.')
			.addDropdown((dropdown) => {
				dropdown.addOption('dependency', 'Dependency');
				dropdown.addOption('overview', 'Overview');
				dropdown.setValue(view.presentation.graphMode);
				dropdown.onChange(async (value) => {
					await updateCustomView(plugin, index, (current) => ({
						...current,
						presentation: {
							...current.presentation,
							graphMode: value as TaskViewPresentation['graphMode'],
						},
					}));
				});
			});
	});

	new Setting(containerEl)
		.setName('Add Smart List')
		.setDesc('Creates another saved board tab using the shared view registry model.')
		.addButton((button) => {
			button.setButtonText('Add Smart List');
			button.setCta();
			button.onClick(async () => {
				const nextViews = [...plugin.settings.customViews, createCustomViewDefinition(plugin.settings.customViews)];
				await saveCustomViews(plugin, nextViews, true, rerender);
			});
		});
}

function describeTaskView(view: Pick<CustomTaskViewDefinition, 'renderer' | 'query' | 'presentation'>): string {
	const filterCount = view.query.filter.conditions.length;
	const sortCount = view.query.sort.length;
	const groupLabel = view.query.group.kind === 'none'
		? 'ungrouped'
		: view.query.group.kind === 'field'
			? `group ${view.query.group.field}`
			: 'agenda buckets';
	const searchLabel = view.query.search ? `search "${view.query.search}"` : 'no search';
	return `${groupLabel} • ${filterCount} filter${filterCount === 1 ? '' : 's'} • ${sortCount} sort${sortCount === 1 ? '' : 's'} • ${searchLabel} • ${view.presentation.hierarchy}/${view.presentation.graphMode}`;
}

async function updateCustomView(
	plugin: TTasksPlugin,
	index: number,
	updater: (view: CustomTaskViewDefinition) => CustomTaskViewDefinition,
): Promise<void> {
	const nextViews = plugin.settings.customViews.map((view, candidateIndex) => (
		candidateIndex === index ? updater(view) : view
	));
	await saveCustomViews(plugin, nextViews, false);
}

async function saveCustomViews(
	plugin: TTasksPlugin,
	customViews: CustomTaskViewDefinition[],
	rerender: boolean,
	onRerender?: () => void,
): Promise<void> {
	plugin.settings.customViews = customViews;
	await plugin.saveSettings();
	if (rerender) onRerender?.();
}
