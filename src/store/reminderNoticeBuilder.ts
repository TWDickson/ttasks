import { Notice } from 'obsidian';

export interface NoticeAction {
	label: string;
	onClick: () => void;
}

export function buildReminderNotice(
	message: string,
	actions: NoticeAction[] = [],
	durationMs = 0,
): Notice {
	const hasActions = actions.length > 0;
	const fragment = document.createDocumentFragment();
	const text = fragment.createEl('span', { text: message });
	if (hasActions) text.addClass('tt-reminder-notice');

	// Build the buttons into the fragment before the Notice consumes it; click
	// handlers are wired afterwards so they can close over the created notice.
	const actionButtons = actions.map((action) => {
		const button = fragment.createEl('button', { text: action.label, cls: 'tt-reminder-notice-action' });
		return { button, action };
	});

	const notice = new Notice(fragment, durationMs);
	const invokeAction = (action: NoticeAction): void => {
		notice.hide();
		action.onClick();
	};

	for (const { button, action } of actionButtons) {
		button.addEventListener('click', (event) => {
			event.stopPropagation();
			invokeAction(action);
		});
	}

	if (hasActions) {
		notice.noticeEl.addClass('tt-reminder-notice');
		notice.noticeEl.addEventListener('click', () => {
			invokeAction(actions[0]);
		});
	}
	return notice;
}