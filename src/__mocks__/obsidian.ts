// Minimal stub so vitest can import modules that reference the obsidian package.
// Only the identifiers used by tested pure-function modules are needed here.
export class Modal { open() {} close() {} titleEl = { setText() {} }; contentEl = { createEl() { return { addEventListener() {}, createDiv() { return { createEl() {} }; } }; }, empty() {} }; }
export class Component { load() {} unload() {} }
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
export class TFolder { path = ''; }
export class Notice { constructor(_msg: string, _ms?: number) {} }
export function setIcon(_el: HTMLElement, _icon: string) {}
export class App {}
