import { AbstractInputSuggest, App, Modal, Notice, PluginSettingTab, Setting, TFolder, setIcon } from 'obsidian';
import type TTasksPlugin from './main';

export type FabPosition = 'right' | 'left' | 'hidden';
export type QuickActionId = 'none' | 'start' | 'complete' | 'block' | 'defer';
export type QuickActionHandedness = 'right' | 'left';

export const QUICK_ACTION_LABELS: Record<QuickActionId, string> = {
	none: 'None',
	start: 'Start',
	complete: 'Complete',
	block: 'Block',
	defer: 'Defer',
};

export const QUICK_ACTION_OPTIONS: Array<{ value: QuickActionId; label: string }> = [
	{ value: 'none', label: QUICK_ACTION_LABELS.none },
	{ value: 'start', label: QUICK_ACTION_LABELS.start },
	{ value: 'complete', label: QUICK_ACTION_LABELS.complete },
	{ value: 'block', label: QUICK_ACTION_LABELS.block },
	{ value: 'defer', label: QUICK_ACTION_LABELS.defer },
];

export interface QuickActionsSettings {
	startStatus: string;
	blockStatus: string;
	deferDays: number;
	mobileHoldEnabled: boolean;
	mobileHandedness: QuickActionHandedness;
	mobileHoldTimeoutMs: number;
}

export interface TTasksSettings {
	tasksFolder: string;
	fabPosition: FabPosition;
	statuses: string[];
	completionStatus: string;
	statusColors: Record<string, string>;
	categories: string[];
	categoryColors: Record<string, string>;
	taskTypes: string[];
	taskTypeColors: Record<string, string>;
	quickActions: QuickActionsSettings;
}

export const DEFAULT_STATUSES = ['Inbox', 'Active', 'In Progress', 'Future', 'Hold', 'Blocked', 'Cancelled', 'Done'];

export const DEFAULT_SETTINGS: TTasksSettings = {
	tasksFolder: 'Tasks',
	fabPosition: 'right',
	statuses: DEFAULT_STATUSES,
	completionStatus: 'Done',
	statusColors: {
		Inbox: '#64748b',
		'In Progress': '#2563eb',
		Blocked: '#dc2626',
		Done: '#16a34a',
		Cancelled: '#6b7280',
	},
	categories: ['database', 'general'],
	categoryColors: {},
	taskTypes: ['feature', 'bug', 'research', 'docs', 'action'],
	taskTypeColors: {},
	quickActions: {
		startStatus: 'In Progress',
		blockStatus: 'Blocked',
		deferDays: 1,
		mobileHoldEnabled: true,
		mobileHandedness: 'right',
		mobileHoldTimeoutMs: 2400,
	},
};

type ManagedListField = 'status' | 'category' | 'task_type';

interface ManagedListItem {
	id: number;
	originalValue: string | null;
	value: string;
	color: string;
}

interface ManagedListConfig {
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

const THEME_SWATCHES = [
	{ label: 'Red', value: 'var(--color-red)' },
	{ label: 'Orange', value: 'var(--color-orange)' },
	{ label: 'Yellow', value: 'var(--color-yellow)' },
	{ label: 'Green', value: 'var(--color-green)' },
	{ label: 'Cyan', value: 'var(--color-cyan)' },
	{ label: 'Blue', value: 'var(--color-blue)' },
	{ label: 'Purple', value: 'var(--color-purple)' },
	{ label: 'Pink', value: 'var(--color-pink)' },
	{ label: 'Muted', value: 'var(--text-muted)' },
];

function getDefaultThemeColor(index: number): string {
	return THEME_SWATCHES[index % THEME_SWATCHES.length]?.value ?? 'var(--text-muted)';
}

interface ValueMigrationModalOptions {
	title: string;
	description: string;
	removedValues: string[];
	targetOptions: string[];
	defaultTarget: string | null;
	allowClear: boolean;
	clearLabel: string;
}

let nextManagedListItemId = 1;

function parseCsvList(value: string): string[] {
	return [...new Set(
		value
			.split(',')
			.map(v => v.trim())
			.filter(Boolean)
	)];
}

export function normalizeStatuses(input: string[] | null | undefined): string[] {
	const parsed = parseCsvList((input ?? []).join(', '));
	return parsed.length > 0 ? parsed : [...DEFAULT_STATUSES];
}

export function normalizeColorMap(values: string[], colors: Record<string, string> | null | undefined): Record<string, string> {
	const result: Record<string, string> = {};
	for (const [index, value] of values.entries()) {
		const color = colors?.[value];
		if (typeof color === 'string' && color.trim()) {
			result[value] = color;
		} else {
			result[value] = getDefaultThemeColor(index);
		}
	}
	return result;
}

export function resolveCompletionStatus(statuses: string[] | null | undefined, completionStatus?: string | null): string {
	const valid = statuses ?? [];
	if (completionStatus && valid.includes(completionStatus)) return completionStatus;
	if (valid.includes('Done')) return 'Done';
	return valid[0] ?? 'Active';
}

export function resolveConfiguredStatus(statuses: string[] | null | undefined, configured: string | null | undefined, preferred: string): string {
	const valid = statuses ?? [];
	if (configured && valid.includes(configured)) return configured;
	if (valid.includes(preferred)) return preferred;
	return valid[0] ?? preferred;
}

export function resolveEmergencyStatus(statuses: string[] | null | undefined): string {
	return statuses?.[0] ?? 'Active';
}

function createManagedListItem(value: string, color: string, originalValue: string | null = value): ManagedListItem {
	return {
		id: nextManagedListItemId++,
		originalValue,
		value,
		color,
	};
}

function normalizeManagedListValues(items: ManagedListItem[], requireOne = false): { values: string[]; colors: Record<string, string>; error?: string } {
	const values: string[] = [];
	const colors: Record<string, string> = {};
	const seen = new Set<string>();

	for (const item of items) {
		const value = item.value.trim();
		if (!value) {
			return { values: [], colors: {}, error: 'Remove blank items or give them a value before saving.' };
		}
		if (seen.has(value)) {
			return { values: [], colors: {}, error: `Duplicate value: ${value}` };
		}
		seen.add(value);
		values.push(value);
		if (item.color) {
			colors[value] = item.color;
		}
	}

	if (requireOne && values.length === 0) {
		return { values: [], colors: {}, error: 'At least one item is required.' };
	}

	return { values, colors };
}

function getRenameMappings(items: ManagedListItem[]): Record<string, string> {
	const mappings: Record<string, string> = {};
	for (const item of items) {
		const nextValue = item.value.trim();
		if (!item.originalValue || !nextValue) continue;
		if (item.originalValue !== nextValue) {
			mappings[item.originalValue] = nextValue;
		}
	}
	return mappings;
}

class ValueMigrationModal extends Modal {
	private readonly options: ValueMigrationModalOptions;
	private readonly selections = new Map<string, string | null>();
	private resolver: ((value: Record<string, string | null> | null) => void) | null = null;
	private settled = false;

	constructor(app: App, options: ValueMigrationModalOptions) {
		super(app);
		this.options = options;
		for (const removedValue of options.removedValues) {
			this.selections.set(removedValue, options.defaultTarget);
		}
	}

	openAndWait(): Promise<Record<string, string | null> | null> {
		return new Promise((resolve) => {
			this.resolver = resolve;
			this.open();
		});
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl('h2', { text: this.options.title });
		contentEl.createEl('p', { text: this.options.description });

		for (const removedValue of this.options.removedValues) {
			new Setting(contentEl)
				.setName(removedValue)
				.setDesc('Choose where existing tasks should move this value.')
				.addDropdown((dd) => {
					if (this.options.allowClear) {
						dd.addOption('__clear__', this.options.clearLabel);
					}
					for (const target of this.options.targetOptions) {
						dd.addOption(target, target);
					}
					dd.setValue(this.selections.get(removedValue) ?? '__clear__');
					dd.onChange((value) => {
						this.selections.set(removedValue, value === '__clear__' ? null : value);
					});
				});
		}

		const actionsEl = contentEl.createDiv({ cls: 'modal-button-container' });
		actionsEl.createEl('button', { text: 'Cancel' }).addEventListener('click', () => {
			this.finish(null);
			this.close();
		});
		actionsEl.createEl('button', { text: 'Apply migration', cls: 'mod-cta' }).addEventListener('click', () => {
			const result: Record<string, string | null> = {};
			for (const removedValue of this.options.removedValues) {
				result[removedValue] = this.selections.get(removedValue) ?? null;
			}
			this.finish(result);
			this.close();
		});
	}

	onClose(): void {
		super.onClose();
		this.contentEl.empty();
		this.finish(null);
	}

	private finish(result: Record<string, string | null> | null): void {
		if (this.settled) return;
		this.settled = true;
		this.resolver?.(result);
		this.resolver = null;
	}
}

class FolderSuggest extends AbstractInputSuggest<TFolder> {
	private inputEl: HTMLInputElement;

	constructor(app: App, inputEl: HTMLInputElement) {
		super(app, inputEl);
		this.inputEl = inputEl;
	}

	getSuggestions(query: string): TFolder[] {
		const q = query.toLowerCase();
		return this.app.vault.getAllLoadedFiles()
			.filter((f): f is TFolder => f instanceof TFolder)
			.filter(f => f.path.toLowerCase().includes(q))
			.slice(0, 20);
	}

	renderSuggestion(folder: TFolder, el: HTMLElement): void {
		el.setText(folder.path);
	}

	selectSuggestion(folder: TFolder): void {
		this.setValue(folder.path);
		this.inputEl.dispatchEvent(new Event('input'));
		this.close();
	}
}

export class TTasksSettingTab extends PluginSettingTab {
	plugin: TTasksPlugin;

	constructor(app: App, plugin: TTasksPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		this.renderManagedListStyles(containerEl);
		containerEl.createEl('h2', { text: 'TTasks Settings' });

		new Setting(containerEl)
			.setName('FAB position')
			.setDesc('Position of the floating action button for creating new tasks.')
			.addDropdown(dd => dd
				.addOption('right', 'Bottom right')
				.addOption('left', 'Bottom left')
				.addOption('hidden', 'Hidden')
				.setValue(this.plugin.settings.fabPosition)
				.onChange(async (value) => {
					this.plugin.settings.fabPosition = value as FabPosition;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Tasks folder')
			.setDesc('The folder TTasks owns. All task and project files will be stored here.')
			.addText(text => {
				new FolderSuggest(this.app, text.inputEl);
				text
					.setPlaceholder('Tasks')
					.setValue(this.plugin.settings.tasksFolder)
					.onChange(async (value) => {
						this.plugin.settings.tasksFolder = value.trim();
						await this.plugin.saveSettings();
						await this.plugin.taskStore.load();
					});
			});

		this.renderManagedListSetting(containerEl, {
			name: 'Statuses',
			description: 'Manage statuses as a draggable ordered list. Renames migrate existing tasks on save. The completion status can be renamed but not removed. Removing other statuses launches a remap.',
			singularLabel: 'Status',
			placeholder: 'Status name',
			requireOne: true,
			allowClearMigration: false,
			field: 'status',
			getValues: () => this.plugin.settings.statuses ?? [],
			applyValues: (values) => {
				this.plugin.settings.statuses = values;
			},
			getColors: () => this.plugin.settings.statusColors ?? {},
			applyColors: (colors) => {
				this.plugin.settings.statusColors = colors;
			},
			getDefaultMigrationTarget: (nextValues) => nextValues[0] ?? null,
		});

		this.renderManagedListSetting(containerEl, {
			name: 'Categories',
			description: 'Manage category options as a draggable ordered list. Renames migrate existing tasks. Removing a category opens a remap or lets you clear it.',
			singularLabel: 'Category',
			placeholder: 'Category name',
			allowClearMigration: true,
			clearLabel: 'Clear category',
			field: 'category',
			getValues: () => this.plugin.settings.categories ?? [],
			applyValues: (values) => {
				this.plugin.settings.categories = values;
			},
			getColors: () => this.plugin.settings.categoryColors ?? {},
			applyColors: (colors) => {
				this.plugin.settings.categoryColors = colors;
			},
			getDefaultMigrationTarget: () => null,
		});

		this.renderManagedListSetting(containerEl, {
			name: 'Task types',
			description: 'Manage task types as a draggable ordered list. Renames migrate existing tasks. Removing a task type opens a remap or lets you clear it.',
			singularLabel: 'Task type',
			placeholder: 'Task type name',
			allowClearMigration: true,
			clearLabel: 'Clear task type',
			field: 'task_type',
			getValues: () => this.plugin.settings.taskTypes ?? [],
			applyValues: (values) => {
				this.plugin.settings.taskTypes = values;
			},
			getColors: () => this.plugin.settings.taskTypeColors ?? {},
			applyColors: (colors) => {
				this.plugin.settings.taskTypeColors = colors;
			},
			getDefaultMigrationTarget: () => null,
		});

		this.renderQuickActionsSettings(containerEl);
	}

	private renderQuickActionsSettings(containerEl: HTMLElement): void {
		containerEl.createEl('h2', { text: 'Quick Actions' });
		containerEl.createEl('p', {
			text: 'Quick actions update task status and due dates. On mobile, touch-and-hold opens a thumb menu that uses these preferences.',
			cls: 'setting-item-description',
			attr: { style: 'margin-bottom: 12px;' },
		});

		const statuses = this.plugin.settings.statuses ?? [];
		const qa = this.plugin.settings.quickActions;

		new Setting(containerEl)
			.setName('Start status')
			.setDesc('Status applied by Start from the quick actions menu.')
			.addDropdown(dd => {
				for (const s of statuses) dd.addOption(s, s);
				dd.setValue(statuses.includes(qa.startStatus) ? qa.startStatus : (statuses[0] ?? ''));
				dd.onChange(async (v) => {
					this.plugin.settings.quickActions.startStatus = v;
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName('Block status')
			.setDesc('Status applied by Block from the quick actions menu.')
			.addDropdown(dd => {
				for (const s of statuses) dd.addOption(s, s);
				dd.setValue(statuses.includes(qa.blockStatus) ? qa.blockStatus : (statuses[0] ?? ''));
				dd.onChange(async (v) => {
					this.plugin.settings.quickActions.blockStatus = v;
					await this.plugin.saveSettings();
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
						this.plugin.settings.quickActions.deferDays = n;
						await this.plugin.saveSettings();
					}
				})
			);

		new Setting(containerEl)
			.setName('Enable mobile hold menu')
			.setDesc('Touch-and-hold a task row in mobile list and agenda views to open quick actions.')
			.addToggle(toggle => toggle
				.setValue(qa.mobileHoldEnabled)
				.onChange(async (value) => {
					this.plugin.settings.quickActions.mobileHoldEnabled = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Mobile handedness bias')
			.setDesc('Bias the hold menu toward right or left thumb reach by changing tile placement and ordering.')
			.addDropdown(dd => dd
				.addOption('right', 'Right-handed')
				.addOption('left', 'Left-handed')
				.setValue(qa.mobileHandedness ?? 'right')
				.onChange(async (value) => {
					this.plugin.settings.quickActions.mobileHandedness = value as QuickActionHandedness;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Mobile hold menu timeout (ms)')
			.setDesc('Auto-dismiss delay for the hold menu when idle.')
			.addText(text => text
				.setPlaceholder('2400')
				.setValue(String(qa.mobileHoldTimeoutMs ?? 2400))
				.onChange(async (v) => {
					const n = parseInt(v, 10);
					if (!isNaN(n) && n >= 800 && n <= 8000) {
						this.plugin.settings.quickActions.mobileHoldTimeoutMs = n;
						await this.plugin.saveSettings();
					}
				}));
	}

	private renderManagedListStyles(containerEl: HTMLElement): void {
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

	private renderManagedListSetting(containerEl: HTMLElement, config: ManagedListConfig): void {
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
		const completionStatus = this.plugin.settings.completionStatus;

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
				const isProtectedCompletion = config.field === 'status' && (item.originalValue === completionStatus || item.value.trim() === completionStatus);
				const removeButton = actionsRowEl.createEl('button', { text: 'Remove', cls: 'tt-managed-list-remove' });
				if (isProtectedCompletion) {
					removeButton.disabled = true;
					removeButton.title = 'Rename the completion status instead of removing it.';
				}
				removeButton.addEventListener('click', () => {
					if (isProtectedCompletion) return;
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
			await this.saveManagedList(config, state.items);
		});

		renderRows();
	}

	private async saveManagedList(config: ManagedListConfig, items: ManagedListItem[]): Promise<void> {
		const validation = normalizeManagedListValues(items, config.requireOne ?? false);
		if (validation.error) {
			new Notice(`TTasks: ${validation.error}`);
			return;
		}

		const previousValues = config.getValues();
		const nextValues = validation.values;
		const renameMappings = getRenameMappings(items);
		const currentCompletionStatus = this.plugin.settings.completionStatus;
		const removedValues = previousValues.filter(
			(value) => !nextValues.includes(value) && !Object.prototype.hasOwnProperty.call(renameMappings, value)
		);

		if (config.field === 'status' && removedValues.includes(currentCompletionStatus)) {
			new Notice('TTasks: rename the completion status instead of removing it. Explicit status metadata is planned later.');
			return;
		}

		let removalMappings: Record<string, string | null> = {};
		if (removedValues.length > 0) {
			const modal = new ValueMigrationModal(this.app, {
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
			this.plugin.settings.completionStatus = renameMappings[currentCompletionStatus] ?? currentCompletionStatus;
		}
		await this.plugin.saveSettings();

		const allMappings: Record<string, string | null> = { ...renameMappings, ...removalMappings };
		let migrated = 0;
		if (Object.keys(allMappings).length > 0) {
			migrated = await this.plugin.taskStore.migrateFieldValues(config.field, allMappings);
		}

		if (config.field === 'status') {
			migrated += await this.plugin.taskStore.migrateStatuses(this.plugin.settings.statuses);
		}

		await this.plugin.taskStore.load();

		if (migrated > 0) {
			new Notice(`TTasks: saved ${config.name.toLowerCase()} and migrated ${migrated} task(s).`);
		} else {
			new Notice(`TTasks: saved ${config.name.toLowerCase()}.`);
		}

		this.display();
	}
}