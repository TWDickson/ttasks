// Minimal stub so vitest can import modules that reference the obsidian package.
// Only the identifiers used by tested pure-function modules are needed here.
export class Modal { open() {} close() {} titleEl = { setText() {} }; contentEl = { createEl() { return { addEventListener() {}, createDiv() { return { createEl() {} }; } }; }, empty() {} }; }
export class Component { load() {} unload() {} }
export class TAbstractFile { path = ''; name = ''; }
export class TFile extends TAbstractFile { extension = 'md'; basename = ''; }
export class TFolder extends TAbstractFile { children: unknown[] = []; }
export class MarkdownRenderer {
	static async render(_app: unknown, markdown: string, el: { innerHTML?: string }, _sourcePath: string, _component: unknown): Promise<void> {
		if (el) {
			el.innerHTML = markdown;
		}
	}
}
export class PluginSettingTab {}
export class Setting { setName() { return this; } setDesc() { return this; } addText() { return this; } addDropdown() { return this; } addToggle() { return this; } }
export class AbstractInputSuggest<T> { constructor(_app: unknown, _inputEl: unknown) {} getSuggestions(_q: string): T[] { return []; } renderSuggestion(_item: T, _el: HTMLElement) {} selectSuggestion(_item: T) {} setValue(_v: string) {} close() {} }
/**
 * Stand-in for Obsidian's FuzzySuggestModal. `getSuggestions` substitutes a
 * case-insensitive substring match for the real fuzzy scorer — enough to
 * exercise subclasses that layer their own matching on top of it.
 */
export class FuzzySuggestModal<T> {
	inputEl = { value: '', dispatchEvent(_e: unknown) {} };
	constructor(_app: unknown) {}
	getItems(): T[] { return []; }
	getItemText(_item: T): string { return ''; }
	getSuggestions(query: string): Array<{ item: T; match: { score: number; matches: never[] } }> {
		const q = query.toLowerCase();
		return this.getItems()
			.filter(item => this.getItemText(item).toLowerCase().includes(q))
			.map(item => ({ item, match: { score: 0, matches: [] as never[] } }));
	}
	setPlaceholder(_p: string) {}
	onOpen() {}
	open() {}
	close() {}
}
export function normalizePath(path: string): string { return path.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\/|\/$/g, ''); }
export class Notice { constructor(_msg: string, _ms?: number) {} }
export function setIcon(_el: HTMLElement, _icon: string) {}
export class App {}
