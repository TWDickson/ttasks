import { App, Modal, Setting } from 'obsidian';

export interface ValueMigrationModalOptions {
	title: string;
	description: string;
	removedValues: string[];
	targetOptions: string[];
	defaultTarget: string | null;
	allowClear: boolean;
	clearLabel: string;
}

export class ValueMigrationModal extends Modal {
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
