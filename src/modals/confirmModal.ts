import { Modal, type App } from 'obsidian';

export interface ConfirmModalOptions {
	title: string;
	body: string;
	/** Label for the confirming (destructive) button. Defaults to 'Confirm'. */
	ctaLabel?: string;
}

/**
 * Shows an Obsidian confirmation modal and resolves to true only when the user
 * clicks the confirm button. Cancelling, closing, or pressing Escape resolves
 * false. Used by both the single-task delete (TaskDetail) and batch delete
 * (TaskBoard) so they share one native-looking dialog instead of a foreign
 * window.confirm().
 */
export function confirmModal(app: App, options: ConfirmModalOptions): Promise<boolean> {
	const { title, body, ctaLabel = 'Confirm' } = options;
	return new Promise<boolean>((resolve) => {
		let confirmed = false;
		const modal = new Modal(app);
		modal.titleEl.setText(title);
		modal.contentEl.createEl('p', { text: body });
		const actions = modal.contentEl.createDiv({ cls: 'modal-button-container' });

		actions.createEl('button', { text: 'Cancel' }).addEventListener('click', () => {
			modal.close();
		});

		actions.createEl('button', { text: ctaLabel, cls: 'mod-warning' }).addEventListener('click', () => {
			confirmed = true;
			modal.close();
		});

		modal.onClose = () => resolve(confirmed);
		modal.open();
	});
}
