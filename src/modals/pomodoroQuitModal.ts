import { Modal, type App } from 'obsidian';

export type PomodoroQuitChoice = 'stop' | 'discard' | 'keep';

/**
 * "A Pomodoro is still running" — asked when Obsidian is closed mid-session,
 * like closing an unsaved document. Resolves 'stop' (log and close), 'discard'
 * (close without logging) or 'keep' (cancel the close). Escape / dismiss is
 * 'keep', so nothing is lost by accident.
 */
export function pomodoroQuitModal(app: App, summary: string): Promise<PomodoroQuitChoice> {
	return new Promise<PomodoroQuitChoice>((resolve) => {
		let choice: PomodoroQuitChoice = 'keep';
		const modal = new Modal(app);
		modal.titleEl.setText('Pomodoro still running');
		modal.contentEl.createEl('p', { text: `${summary} Close Obsidian anyway?` });
		const actions = modal.contentEl.createDiv({ cls: 'modal-button-container' });
		const pick = (value: PomodoroQuitChoice) => () => {
			choice = value;
			modal.close();
		};
		actions.createEl('button', { text: 'Keep running' }).addEventListener('click', pick('keep'));
		actions.createEl('button', { text: 'Discard and close', cls: 'mod-warning' }).addEventListener('click', pick('discard'));
		actions.createEl('button', { text: 'Stop, log and close', cls: 'mod-cta' }).addEventListener('click', pick('stop'));
		modal.onClose = () => resolve(choice);
		modal.open();
	});
}
