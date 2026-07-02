import { App, Notice, setIcon } from 'obsidian';
import type TTasksPlugin from '../main';
import { THEME_SWATCHES, getDefaultThemeColor } from './defaults';
import { ValueMigrationModal } from './ValueMigrationModal';
import {
	createManagedListItem,
	getRenameMappings,
	type ManagedListItem,
	normalizeManagedListValues,
} from './managedListUtils';

export type ManagedListField = 'status' | 'area' | 'label';

export interface ManagedListConfig {
	name: string;
	description: string;
	singularLabel: string;
	placeholder: string;
	requireOne?: boolean;
	allowClearMigration?: boolean;
	clearLabel?: string;
	field: ManagedListField;
	getValues: () => string[];
	applyValues: (values: string[]) => void;
	getColors: () => Record<string, string>;
	applyColors: (colors: Record<string, string>) => void;
	getDefaultMigrationTarget: (nextValues: string[]) => string | null;
}

interface RenderManagedListSettingParams {
	containerEl: HTMLElement;
	config: ManagedListConfig;
	plugin: TTasksPlugin;
	app: App;
	rerender: () => void;
}

export function renderManagedListStyles(containerEl: HTMLElement): void {
	const styleEl = containerEl.createEl('style');
	styleEl.textContent = `
			.tt-managed-list-section {
				border: 1px solid var(--background-modifier-border);
				border-radius: 12px;
				padding: 10px;
				margin: 16px 0;
				background: var(--background-secondary);
			}
			.tt-managed-list-section-header {
				margin-bottom: 10px;
			}
			.tt-managed-list-section-header h3 {
				margin: 0 0 4px 0;
				font-size: 1rem;
			}
			.tt-managed-list-section-header p {
				margin: 0;
				color: var(--text-muted);
				font-size: 0.9rem;
			}
			.tt-managed-list-legend {
				display: flex;
				align-items: center;
				gap: 8px;
				flex-wrap: wrap;
				margin-top: 10px;
			}
			.tt-managed-list-legend-label {
				font-size: 0.8rem;
				color: var(--text-muted);
			}
			.tt-managed-list-legend-item {
				display: inline-flex;
				align-items: center;
				gap: 6px;
				font-size: 0.78rem;
				color: var(--text-muted);
			}
			.tt-managed-list-legend-dot {
				width: 12px;
				height: 12px;
				border-radius: 999px;
				background: var(--tt-swatch-color);
				border: 1px solid var(--background-modifier-border);
			}
			.tt-managed-list-rows {
				display: flex;
				flex-direction: column;
				gap: 6px;
			}
			.tt-managed-list-row {
				--tt-item-accent: var(--tt-item-color, var(--text-muted));
				--tt-item-tint-bg: color-mix(in srgb, var(--tt-item-accent) 12%, var(--background-primary));
				--tt-item-tint-border: color-mix(in srgb, var(--tt-item-accent) 42%, var(--background-modifier-border));
				display: grid;
				grid-template-columns: 22px minmax(0, 1fr) auto;
				gap: 6px;
				align-items: start;
				padding: 8px;
				border: 1px solid color-mix(in srgb, var(--tt-item-accent) 28%, var(--background-modifier-border));
				border-radius: 8px;
				background: color-mix(in srgb, var(--tt-item-accent) 6%, var(--background-primary));
				box-shadow: inset 3px 0 0 var(--tt-item-accent, transparent);
			}
			.tt-managed-list-row.is-dragging {
				opacity: 0.55;
			}
			.tt-managed-list-row.is-drop-target {
				border-color: var(--interactive-accent);
				box-shadow: 0 0 0 1px var(--interactive-accent);
			}
			.tt-managed-list-handle {
				display: flex;
				align-items: center;
				justify-content: center;
				color: var(--text-faint);
				cursor: grab;
				min-height: 30px;
			}
			.tt-managed-list-handle:active {
				cursor: grabbing;
			}
			.tt-managed-list-main {
				display: flex;
				flex-direction: column;
				gap: 3px;
				min-width: 0;
			}
			.tt-managed-list-title-row {
				display: flex;
				align-items: center;
				gap: 8px;
				min-width: 0;
			}
			.tt-managed-list-title-row .tt-managed-list-input {
				flex: 1 1 auto;
			}
			.tt-managed-list-preview {
				display: inline-flex;
				align-items: center;
				gap: 6px;
				flex: 0 0 auto;
				font-size: 0.72rem;
				line-height: 1.2;
				padding: 1px 7px;
				border-radius: 999px;
				border: 1px solid var(--tt-item-tint-border);
				background: var(--tt-item-tint-bg);
				color: var(--tt-item-accent);
			}
			.tt-managed-list-color-row {
				display: flex;
				align-items: center;
				gap: 6px;
				flex-wrap: wrap;
			}
			.tt-managed-list-color-row.is-collapsed {
				display: none;
			}
			.tt-managed-list-swatches {
				display: flex;
				gap: 4px;
				flex-wrap: wrap;
			}
			.tt-managed-list-swatch {
				appearance: none;
				-webkit-appearance: none;
				width: 16px;
				height: 16px;
				min-width: 16px;
				min-height: 16px;
				border-radius: 999px;
				border: 1px solid color-mix(in srgb, var(--tt-swatch-color, var(--background-modifier-border)) 40%, var(--background-modifier-border));
				padding: 0;
				cursor: pointer;
				background: none !important;
				background-color: var(--tt-swatch-color, var(--background-modifier-border)) !important;
				background-image: none !important;
				box-shadow: none !important;
			}
			.tt-managed-list-swatch:hover {
				transform: scale(1.06);
			}
			.tt-managed-list-swatch.is-selected {
				border-color: var(--interactive-accent);
				box-shadow: 0 0 0 1px var(--background-primary), 0 0 0 2px var(--interactive-accent) !important;
			}
			.tt-managed-list-clear-color {
				font-size: 0.76rem;
				padding: 4px 8px;
			}
			.tt-managed-list-input {
				width: 100%;
				min-width: 0;
				min-height: 30px;
				padding: 4px 8px;
			}
			.tt-managed-list-meta {
				font-size: 0.74rem;
				line-height: 1.2;
				color: var(--text-muted);
				min-height: 0;
			}
			.tt-managed-list-meta:empty {
				display: none;
			}
			.tt-managed-list-color {
				width: 28px;
				height: 24px;
				padding: 0;
				border: none;
				background: transparent;
			}
			.tt-managed-list-row-actions {
				display: flex;
				align-items: flex-start;
				gap: 6px;
				padding-top: 1px;
			}
			.tt-managed-list-row-actions button {
				padding: 6px 10px;
				font-size: 0.8rem;
			}
			.tt-managed-list-row-actions .tt-managed-list-color-toggle {
				display: inline-flex;
				align-items: center;
				gap: 6px;
				color: var(--tt-item-accent);
				border-color: var(--tt-item-tint-border);
				background: var(--tt-item-tint-bg);
			}
			.tt-managed-list-color-toggle-dot {
				width: 10px;
				height: 10px;
				border-radius: 999px;
				background: var(--tt-item-accent);
				border: 1px solid color-mix(in srgb, var(--tt-item-accent) 35%, var(--background-modifier-border));
				flex: 0 0 auto;
			}
			.tt-managed-list-row-actions .tt-managed-list-color-toggle.is-active {
				box-shadow: inset 0 0 0 1px var(--tt-item-tint-border);
			}
			.tt-managed-list-row-actions .tt-managed-list-remove {
				color: var(--text-muted);
				background: transparent;
				border-color: var(--background-modifier-border);
			}
			.tt-managed-list-row-actions .tt-managed-list-remove:hover:not(:disabled) {
				color: var(--color-red);
				border-color: color-mix(in srgb, var(--color-red) 35%, var(--background-modifier-border));
				background: color-mix(in srgb, var(--color-red) 8%, var(--background-primary));
			}
			.tt-managed-list-actions {
				display: flex;
				gap: 8px;
				justify-content: flex-end;
				margin-top: 12px;
			}
			.tt-managed-list-empty {
				padding: 10px 12px;
				border: 1px dashed var(--background-modifier-border);
				border-radius: 10px;
				color: var(--text-muted);
				background: var(--background-primary);
			}
		`;
}

export function renderManagedListSettingSection(params: RenderManagedListSettingParams): void {
	const { containerEl, config, plugin, app, rerender } = params;
	const sectionEl = containerEl.createDiv({ cls: 'tt-managed-list-section' });
	const headerEl = sectionEl.createDiv({ cls: 'tt-managed-list-section-header' });
	headerEl.createEl('h3', { text: config.name });
	headerEl.createEl('p', { text: config.description });
	const legendEl = headerEl.createDiv({ cls: 'tt-managed-list-legend' });
	legendEl.createDiv({ cls: 'tt-managed-list-legend-label', text: 'Theme swatches:' });
	for (const swatch of THEME_SWATCHES) {
		const legendItem = legendEl.createDiv({ cls: 'tt-managed-list-legend-item' });
		const dot = legendItem.createDiv({ cls: 'tt-managed-list-legend-dot' });
		dot.style.setProperty('--tt-swatch-color', swatch.value);
		legendItem.createSpan({ text: swatch.label });
	}
	legendEl.createDiv({ cls: 'tt-managed-list-legend-label', text: 'Use the picker for custom colors.' });

	const listEl = sectionEl.createDiv({ cls: 'tt-managed-list-rows' });
	const actionsEl = sectionEl.createDiv({ cls: 'tt-managed-list-actions' });
	const state = {
		items: config.getValues().map((value, index) => createManagedListItem(value, config.getColors()[value] ?? getDefaultThemeColor(index))),
		draggingId: null as number | null,
		dropTargetId: null as number | null,
		expandedColorIds: new Set<number>(),
	};
	const completionStatus = plugin.settings.completionStatus;

	const renderRows = () => {
		listEl.empty();

		if (state.items.length === 0) {
			listEl.createDiv({ cls: 'tt-managed-list-empty', text: `No ${config.name.toLowerCase()} yet. Use Add ${config.singularLabel.toLowerCase()} to create the first item.` });
		}

		state.items.forEach((item) => {
			const rowEl = listEl.createDiv({ cls: 'tt-managed-list-row' });
			rowEl.style.setProperty('--tt-item-color', item.color || getDefaultThemeColor(0));
			const updateRowClasses = () => {
				rowEl.toggleClass('is-dragging', state.draggingId === item.id);
				rowEl.toggleClass('is-drop-target', state.dropTargetId === item.id);
			};
			if (state.draggingId === item.id) rowEl.addClass('is-dragging');
			if (state.dropTargetId === item.id) rowEl.addClass('is-drop-target');

			rowEl.addEventListener('dragover', (event) => {
				event.preventDefault();
				if (state.dropTargetId !== item.id) {
					state.dropTargetId = item.id;
					listEl.querySelectorAll('.tt-managed-list-row').forEach((el) => el.removeClass('is-drop-target'));
					rowEl.addClass('is-drop-target');
				}
				if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
			});

			rowEl.addEventListener('drop', (event) => {
				event.preventDefault();
				const draggingId = state.draggingId;
				state.draggingId = null;
				state.dropTargetId = null;
				if (draggingId === null || draggingId === item.id) {
					renderRows();
					return;
				}
				const fromIndex = state.items.findIndex(entry => entry.id === draggingId);
				const toIndex = state.items.findIndex(entry => entry.id === item.id);
				if (fromIndex < 0 || toIndex < 0) {
					renderRows();
					return;
				}
				const [moved] = state.items.splice(fromIndex, 1);
				state.items.splice(toIndex, 0, moved);
				renderRows();
			});

			const handleEl = rowEl.createDiv({ cls: 'tt-managed-list-handle' });
			handleEl.draggable = true;
			setIcon(handleEl, 'grip-vertical');
			handleEl.addEventListener('dragstart', (event) => {
				state.draggingId = item.id;
				state.dropTargetId = item.id;
				event.dataTransfer?.setData('text/plain', String(item.id));
				if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
				updateRowClasses();
			});
			handleEl.addEventListener('dragend', () => {
				state.draggingId = null;
				state.dropTargetId = null;
				listEl.querySelectorAll('.tt-managed-list-row').forEach((el) => {
					el.removeClass('is-dragging');
					el.removeClass('is-drop-target');
				});
			});

			const mainEl = rowEl.createDiv({ cls: 'tt-managed-list-main' });
			const titleRowEl = mainEl.createDiv({ cls: 'tt-managed-list-title-row' });
			const inputEl = titleRowEl.createEl('input', {
				cls: 'tt-managed-list-input',
				attr: {
					type: 'text',
					placeholder: config.placeholder,
					value: item.value,
				},
			});
			const previewEl = titleRowEl.createDiv({ cls: 'tt-managed-list-preview', text: item.value || config.singularLabel });
			inputEl.addEventListener('input', () => {
				item.value = inputEl.value;
				previewEl.setText(item.value.trim() || config.singularLabel);
				metaEl.setText(item.originalValue && item.originalValue !== item.value.trim()
					? `Will migrate ${item.originalValue} to ${item.value.trim() || '(blank)'}.`
					: '');
			});

			const metaEl = mainEl.createDiv({ cls: 'tt-managed-list-meta' });
			metaEl.setText(item.originalValue && item.originalValue !== item.value.trim()
				? `Will migrate ${item.originalValue} to ${item.value.trim() || '(blank)'}.`
				: '');

			const colorRowEl = mainEl.createDiv({ cls: 'tt-managed-list-color-row' });
			if (!state.expandedColorIds.has(item.id)) {
				colorRowEl.addClass('is-collapsed');
			}
			const swatchesEl = colorRowEl.createDiv({ cls: 'tt-managed-list-swatches' });
			for (const swatch of THEME_SWATCHES) {
				const swatchButton = swatchesEl.createEl('button', {
					cls: 'tt-managed-list-swatch',
					attr: { type: 'button', 'aria-label': `${swatch.label} swatch` },
				});
				swatchButton.style.setProperty('--tt-swatch-color', swatch.value);
				if (item.color === swatch.value) swatchButton.addClass('is-selected');
				swatchButton.addEventListener('click', () => {
					item.color = swatch.value;
					renderRows();
				});
			}

			const colorEl = colorRowEl.createEl('input', {
				cls: 'tt-managed-list-color',
				attr: { type: 'color', value: item.color.startsWith('#') ? item.color : '#808080', 'aria-label': `${config.singularLabel} custom color` },
			});
			colorEl.addEventListener('input', () => {
				item.color = colorEl.value;
				rowEl.style.setProperty('--tt-item-color', item.color);
			});

			const clearColorButton = colorRowEl.createEl('button', { text: 'Clear', cls: 'tt-managed-list-clear-color' });
			clearColorButton.addEventListener('click', () => {
				item.color = getDefaultThemeColor(state.items.findIndex(entry => entry.id === item.id));
				renderRows();
			});

			const actionsRowEl = rowEl.createDiv({ cls: 'tt-managed-list-row-actions' });
			const toggleColorButton = actionsRowEl.createEl('button', { cls: 'tt-managed-list-color-toggle' });
			toggleColorButton.createSpan({ cls: 'tt-managed-list-color-toggle-dot' });
			toggleColorButton.createSpan({ text: 'Color' });
			if (state.expandedColorIds.has(item.id)) {
				toggleColorButton.addClass('is-active');
			}
			toggleColorButton.addEventListener('click', () => {
				if (state.expandedColorIds.has(item.id)) {
					state.expandedColorIds.delete(item.id);
				} else {
					state.expandedColorIds.add(item.id);
				}
				renderRows();
			});
			const isProtectedSystem = config.field === 'status' && (
				item.originalValue === completionStatus || item.value.trim() === completionStatus
			);
			const removeButton = actionsRowEl.createEl('button', { text: 'Remove', cls: 'tt-managed-list-remove' });
			if (isProtectedSystem) {
				removeButton.disabled = true;
				removeButton.title = 'The completion status can be renamed but not removed.';
			}
			removeButton.addEventListener('click', () => {
				if (isProtectedSystem) return;
				state.items = state.items.filter(entry => entry.id !== item.id);
				renderRows();
			});
		});
	};

	const addButton = actionsEl.createEl('button', { text: `Add ${config.singularLabel.toLowerCase()}` });
	addButton.addEventListener('click', () => {
		const nextItem = createManagedListItem('', getDefaultThemeColor(state.items.length), null);
		state.items.push(nextItem);
		state.expandedColorIds.add(nextItem.id);
		renderRows();
	});

	const resetButton = actionsEl.createEl('button', { text: 'Reset' });
	resetButton.addEventListener('click', () => {
		state.items = config.getValues().map((value, index) => createManagedListItem(value, config.getColors()[value] ?? getDefaultThemeColor(index)));
		state.expandedColorIds.clear();
		renderRows();
	});

	const saveButton = actionsEl.createEl('button', { text: 'Save changes', cls: 'mod-cta' });
	saveButton.addEventListener('click', async () => {
		await saveManagedList({
			config,
			items: state.items,
			plugin,
			app,
			rerender,
		});
	});

	renderRows();
}

interface SaveManagedListParams {
	config: ManagedListConfig;
	items: ManagedListItem[];
	plugin: TTasksPlugin;
	app: App;
	rerender: () => void;
}

async function saveManagedList(params: SaveManagedListParams): Promise<void> {
	const { config, items, plugin, app, rerender } = params;
	const validation = normalizeManagedListValues(items, config.requireOne ?? false);
	if (validation.error) {
		new Notice(`TTasks: ${validation.error}`);
		return;
	}

	const previousValues = config.getValues();
	const nextValues = validation.values;
	const renameMappings = getRenameMappings(items);
	const currentCompletionStatus = plugin.settings.completionStatus;
	const removedValues = previousValues.filter(
		(value) => !nextValues.includes(value) && !Object.prototype.hasOwnProperty.call(renameMappings, value)
	);

	if (config.field === 'status') {
		if (removedValues.includes(currentCompletionStatus)) {
			new Notice('TTasks: the completion status cannot be removed — rename it instead.');
			return;
		}
	}

	let removalMappings: Record<string, string | null> = {};
	if (removedValues.length > 0) {
		const modal = new ValueMigrationModal(app, {
			title: `${config.name}: migrate removed values`,
			description: `Map each removed ${config.singularLabel.toLowerCase()} to a remaining option.${config.allowClearMigration ? ' You can also clear the field.' : ''}`,
			removedValues,
			targetOptions: nextValues,
			defaultTarget: config.getDefaultMigrationTarget(nextValues),
			allowClear: config.allowClearMigration ?? false,
			clearLabel: config.clearLabel ?? 'Clear value',
		});
		const result = await modal.openAndWait();
		if (!result) return;
		removalMappings = result;
	}

	config.applyValues(nextValues);
	config.applyColors(validation.colors);
	if (config.field === 'status') {
		plugin.settings.completionStatus = renameMappings[currentCompletionStatus] ?? currentCompletionStatus;
	}
	await plugin.saveSettings();

	const allMappings: Record<string, string | null> = { ...renameMappings, ...removalMappings };
	let migrated = 0;
	if (Object.keys(allMappings).length > 0) {
		migrated = await plugin.taskStore.migrateFieldValues(config.field, allMappings);
	}

	if (config.field === 'status') {
		migrated += await plugin.taskStore.migrateStatuses(plugin.settings.statuses);
	}

	await plugin.taskStore.load();

	if (migrated > 0) {
		new Notice(`TTasks: saved ${config.name.toLowerCase()} and migrated ${migrated} task(s).`);
	} else {
		new Notice(`TTasks: saved ${config.name.toLowerCase()}.`);
	}

	rerender();
}
