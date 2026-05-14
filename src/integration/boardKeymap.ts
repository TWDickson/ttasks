export type BoardShortcutId =
	| 'next' | 'prev' | 'open' | 'start' | 'complete'
	| 'defer' | 'archive' | 'newTask' | 'escape' | 'search';

export interface KeymapEntry {
	key: string;
	ctrl?: boolean;
	shift?: boolean;
	id: BoardShortcutId;
}

export const DEFAULT_KEYMAP: KeymapEntry[] = [
	{ key: 'j', id: 'next' },
	{ key: 'ArrowDown', id: 'next' },
	{ key: 'k', id: 'prev' },
	{ key: 'ArrowUp', id: 'prev' },
	{ key: 'Enter', id: 'open' },
	{ key: 'o', id: 'open' },
	{ key: 's', id: 'start' },
	{ key: 'c', id: 'complete' },
	{ key: 'd', id: 'defer' },
	{ key: 'a', id: 'archive' },
	{ key: 'n', id: 'newTask' },
	{ key: 'Escape', id: 'escape' },
	{ key: '/', id: 'search' },
];

/**
 * Resolves a KeyboardEvent to a board shortcut ID using the given keymap.
 * Returns null when no entry matches or when altKey is held (preserve OS combos).
 */
export function resolveShortcut(
	event: { key: string; ctrlKey: boolean; shiftKey: boolean; altKey: boolean },
	keymap: KeymapEntry[],
): BoardShortcutId | null {
	if (event.altKey) return null;
	const entry = keymap.find(
		e => e.key === event.key
			&& !!e.ctrl === event.ctrlKey
			&& !!e.shift === event.shiftKey,
	);
	return entry?.id ?? null;
}

/**
 * Returns true when the active element is an input, textarea, select,
 * or a contenteditable element — meaning keyboard shortcuts should be suppressed.
 */
export function isInputFocused(activeEl: Element | null): boolean {
	if (!activeEl) return false;
	const tag = activeEl.tagName.toLowerCase();
	if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
	return (activeEl as HTMLElement).isContentEditable === true;
}
