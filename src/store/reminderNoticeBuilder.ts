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
	const fragment = document.createDocumentFragment();
	const text = fragment.createEl('span', { text: message });
	text.style.cursor = actions.length > 0 ? 'pointer' : 'default';

	// Build the buttons into the fragment before the Notice consumes it; click
	// handlers are wired afterwards so they can close over the created notice.
	const actionButtons = actions.map((action) => {
		const button = fragment.createEl('button', { text: action.label });
		button.style.cssText = 'margin-left:8px;font-size:0.75rem;padding:2px 6px;border-radius:4px;cursor:pointer;';
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

	notice.noticeEl.style.cursor = actions.length > 0 ? 'pointer' : 'default';
	if (actions.length > 0) {
		notice.noticeEl.addEventListener('click', () => {
			invokeAction(actions[0]);
		});
	}
	return notice;
}