import { Modal, type App } from 'obsidian';

export interface ConfirmModalOptions {
	title: string;
	body: string;
	/** Optional bullet list rendered under the body (e.g. a preview of what's affected). */
	list?: string[];
	/** Label for the confirming button. Defaults to 'Confirm'. */
	ctaLabel?: string;
	/** `mod-warning` (default) for destructive actions, `mod-cta` for a constructive one. */
	ctaClass?: 'mod-warning' | 'mod-cta';
}

/**
 * Shows an Obsidian confirmation modal and resolves to true only when the user
 * clicks the confirm button. Cancelling, closing, or pressing Escape resolves
 * false. Used by the single-task delete (TaskDetail), batch delete (TaskBoard)
 * and the checkbox import (`importConfirm.ts`) so they share one native-looking
 * dialog instead of a foreign window.confirm().
 */
export function confirmModal(app: App, options: ConfirmModalOptions): Promise<boolean> {
	const { title, body, list, ctaLabel = 'Confirm', ctaClass = 'mod-warning' } = options;
	return new Promise<boolean>((resolve) => {
		let confirmed = false;
		const modal = new Modal(app);
		modal.titleEl.setText(title);
		modal.contentEl.createEl('p', { text: body });
		if (list?.length) {
			const ul = modal.contentEl.createEl('ul');
			for (const item of list) ul.createEl('li', { text: item });
		}
		const actions = modal.contentEl.createDiv({ cls: 'modal-button-container' });

		actions.createEl('button', { text: 'Cancel' }).addEventListener('click', () => {
			modal.close();
		});

		actions.createEl('button', { text: ctaLabel, cls: ctaClass }).addEventListener('click', () => {
			confirmed = true;
			modal.close();
		});

		modal.onClose = () => resolve(confirmed);
		modal.open();
	});
}
