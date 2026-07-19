import { Modal, Setting, type App } from 'obsidian';
import type TTasksPlugin from '../main';
import { parseUntilInput, planFocusUntil } from '../integration/pomodoroPlan';

/**
 * Prompts for a target time ("10:30") or a duration ("90"), previews the Pomodoro
 * plan that fits before it, and starts a "focus until X" session. Optionally tied
 * to a task (path/name), or untethered when both are null.
 */
export class FocusUntilModal extends Modal {
	private value = '';

	constructor(
		app: App,
		private readonly plugin: TTasksPlugin,
		private readonly taskPath: string | null,
		private readonly taskName: string | null,
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl, titleEl } = this;
		titleEl.setText('Focus until…');

		contentEl.createEl('p', {
			cls: 'setting-item-description',
			text: this.taskName
				? `Fill the time before a target with Pomodoro sessions on "${this.taskName}", ending cleanly before it.`
				: 'Fill the time before a target with Pomodoro sessions, ending cleanly before it.',
		});

		const preview = contentEl.createEl('p', { cls: 'tt-focus-until-preview' });

		const startBtn = contentEl.createDiv({ cls: 'modal-button-container' })
			.createEl('button', { text: 'Start', cls: 'mod-cta' });
		startBtn.disabled = true;
		startBtn.addEventListener('click', () => this.submit());

		const refresh = () => {
			const minutes = parseUntilInput(this.value, new Date());
			if (minutes === null) {
				preview.setText('Enter a time like 10:30, or minutes like 90.');
				startBtn.disabled = true;
				return;
			}
			const plan = planFocusUntil(minutes, this.plugin.settings.pomodoro);
			if (plan.phases.length === 0) {
				preview.setText(`Only ${minutes} min — not enough for a focus session.`);
				startBtn.disabled = true;
				return;
			}
			const n = plan.focusCount;
			const tail = plan.endsWithFill ? ' (last one shortened to fit)' : '';
			preview.setText(`${n} focus session${n === 1 ? '' : 's'} in the next ${minutes} min${tail}.`);
			startBtn.disabled = false;
		};

		new Setting(contentEl)
			.setName('Target time or minutes')
			.addText((text) => {
				text.setPlaceholder('10:30');
				text.inputEl.addEventListener('input', () => {
					this.value = text.getValue();
					refresh();
				});
				text.inputEl.addEventListener('keydown', (evt) => {
					if (evt.key === 'Enter' && !startBtn.disabled) {
						evt.preventDefault();
						this.submit();
					}
				});
				// Focus the field so the user can type immediately.
				window.setTimeout(() => text.inputEl.focus(), 0);
			});

		refresh();
	}

	private submit(): void {
		const minutes = parseUntilInput(this.value, new Date());
		if (minutes === null) return;
		const started = this.plugin.pomodoroService.startUntil(this.taskPath, this.taskName, minutes);
		if (started) this.close();
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
