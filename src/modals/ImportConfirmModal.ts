import { App, Modal } from 'obsidian';
import type { ExternalTask } from '../integration/types';

export class ImportConfirmModal extends Modal {
	private readonly candidates: ExternalTask[];
	private resolver: ((value: boolean) => void) | null = null;
	private settled = false;

	constructor(app: App, candidates: ExternalTask[]) {
		super(app);
		this.candidates = candidates;
	}

	openAndWait(): Promise<boolean> {
		return new Promise((resolve) => {
			this.resolver = resolve;
			this.open();
		});
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();

		const fileCount = new Set(this.candidates.map((task) => task.location.filePath)).size;
		contentEl.createEl('h2', { text: `Found ${this.candidates.length} tasks across ${fileCount} files.` });
		contentEl.createEl('p', {
			text: 'Each will become a TTasks note. The original checkboxes will be replaced with wiki-links. This cannot be undone.',
		});

		const previewList = contentEl.createEl('ul');
		for (const task of this.candidates.slice(0, 5)) {
			const source = task.location.filePath.split('/').pop() ?? task.location.filePath;
			previewList.createEl('li', { text: `${task.name} (${source})` });
		}

		const actionsEl = contentEl.createDiv({ cls: 'modal-button-container' });
		actionsEl.createEl('button', { text: 'Cancel' }).addEventListener('click', () => {
			this.finish(false);
			this.close();
		});
		actionsEl
			.createEl('button', { text: `Import ${this.candidates.length} tasks`, cls: 'mod-cta' })
			.addEventListener('click', () => {
				this.finish(true);
				this.close();
			});
	}

	onClose(): void {
		super.onClose();
		this.contentEl.empty();
		this.finish(false);
	}

	private finish(value: boolean): void {
		if (this.settled) return;
		this.settled = true;
		this.resolver?.(value);
		this.resolver = null;
	}
}
