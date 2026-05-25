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
	let notice: Notice;
	const invokeAction = (action: NoticeAction): void => {
		notice.hide();
		action.onClick();
	};

	for (const action of actions) {
		const button = fragment.createEl('button', { text: action.label });
		button.style.cssText = 'margin-left:8px;font-size:0.75rem;padding:2px 6px;border-radius:4px;cursor:pointer;';
		button.addEventListener('click', (event) => {
			event.stopPropagation();
			invokeAction(action);
		});
	}

	notice = new Notice(fragment, durationMs);
	notice.noticeEl.style.cursor = actions.length > 0 ? 'pointer' : 'default';
	if (actions.length > 0) {
		notice.noticeEl.addEventListener('click', () => {
			invokeAction(actions[0]);
		});
	}
	return notice;
}