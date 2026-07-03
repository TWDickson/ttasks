import { setIcon } from 'obsidian';

/**
 * Svelte action that renders a Lucide icon into the element via Obsidian's
 * setIcon, so plugin iconography matches core UI instead of unicode glyphs.
 * Usage: <span use:icon={'chevron-down'}></span>
 */
export function icon(el: HTMLElement, name: string): { update: (name: string) => void } {
	setIcon(el, name);
	return { update: (next: string) => setIcon(el, next) };
}
