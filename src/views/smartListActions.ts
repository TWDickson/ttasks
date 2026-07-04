import { Menu, Notice } from 'obsidian';
import { get } from 'svelte/store';
import type TTasksPlugin from '../main';
import { QueryEditorModal } from '../modals/QueryEditorModal';
import { resolveAreaOptions } from '../settings/managedListUtils';
import { createCustomViewDefinition, resolveTaskViewId } from './viewRegistry';

/**
 * Smart List CRUD shared by the rail leaf and the board's "Edit View" button.
 * All mutations go through plugin.saveSettings(), which bumps settingsRevision
 * so every open leaf re-derives its view list.
 */

function queryEditorOptions(plugin: TTasksPlugin) {
	const observedAreas = [...new Set(
		get(plugin.taskStore.tasks).map((t) => t.area).filter((a): a is string => !!a),
	)];
	const areaOptions = resolveAreaOptions(plugin.settings.areas ?? [], observedAreas);
	return {
		statuses: plugin.settings.statuses,
		areas: [...areaOptions.managed, ...areaOptions.unmanaged],
		labelValues: plugin.settings.labelValues,
	};
}

export async function addSmartList(plugin: TTasksPlugin): Promise<void> {
	const created = createCustomViewDefinition(plugin.settings.customViews);
	plugin.settings.customViews = [...plugin.settings.customViews, created];
	await plugin.saveSettings();
	plugin.boardState.currentViewId.set(created.id);
	new QueryEditorModal(
		plugin.app,
		created.name,
		created.query,
		created.renderer,
		queryEditorOptions(plugin),
		async (updatedQuery, updatedRenderer, updatedName) => {
			plugin.settings.customViews = plugin.settings.customViews.map((view) => (
				view.id === created.id
					? { ...view, query: updatedQuery, renderer: updatedRenderer, name: updatedName }
					: view
			));
			await plugin.saveSettings();
			plugin.boardState.currentViewId.set(created.id);
		},
	).open();
	new Notice(`Created Smart List: ${created.name}. Use Edit View to customize query and type.`);
}

export function editSmartList(plugin: TTasksPlugin, viewId: string): void {
	const target = plugin.settings.customViews.find((view) => view.id === viewId);
	if (!target) {
		new Notice('Smart List not found.');
		return;
	}

	new QueryEditorModal(
		plugin.app,
		target.name,
		target.query,
		target.renderer,
		queryEditorOptions(plugin),
		async (updatedQuery, updatedRenderer, updatedName) => {
			plugin.settings.customViews = plugin.settings.customViews.map((view) => (
				view.id === viewId
					? { ...view, query: updatedQuery, renderer: updatedRenderer, name: updatedName }
					: view
			));
			await plugin.saveSettings();
			plugin.boardState.currentViewId.set(viewId);
		},
		async () => {
			plugin.settings.customViews = plugin.settings.customViews.filter((view) => view.id !== viewId);
			await plugin.saveSettings();
			plugin.boardState.currentViewId.set(resolveTaskViewId(plugin.settings, null));
			new Notice('Smart List deleted.');
		},
	).open();
}

export function openSmartListMenu(plugin: TTasksPlugin, viewId: string, event: MouseEvent): void {
	event.preventDefault();
	if (!plugin.settings.customViews.some((view) => view.id === viewId)) return;

	const menu = new Menu();
	menu.addItem((item) => {
		item
			.setTitle('Edit Smart List')
			.setIcon('sliders-horizontal')
			.onClick(() => editSmartList(plugin, viewId));
	});
	menu.showAtMouseEvent(event);
}
