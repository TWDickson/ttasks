/* Browser shim for the `obsidian` package so plugin components render in the
   visual test rig. Implements just enough of the runtime surface the bundled
   components/modals touch: the HTMLElement DOM helpers, setIcon (real Lucide),
   Modal/Menu/Notice with Obsidian-like DOM, and inert stubs for the rest. */

import { createElement, icons } from 'lucide';

// ── Obsidian's HTMLElement prototype helpers ────────────────────────────────

type ElInfo = string | {
	cls?: string | string[];
	text?: string;
	attr?: Record<string, string | number | boolean | null>;
	type?: string;
	value?: string;
	placeholder?: string;
	title?: string;
	href?: string;
};

function applyInfo(el: HTMLElement, info?: ElInfo): void {
	if (!info) return;
	if (typeof info === 'string') {
		el.className = info;
		return;
	}
	if (info.cls) el.className = Array.isArray(info.cls) ? info.cls.join(' ') : info.cls;
	if (info.text != null) el.textContent = info.text;
	if (info.type) (el as HTMLInputElement).type = info.type;
	if (info.value != null) (el as HTMLInputElement).value = info.value;
	if (info.placeholder) (el as HTMLInputElement).placeholder = info.placeholder;
	if (info.title) el.title = info.title;
	if (info.href) (el as HTMLAnchorElement).href = info.href;
	if (info.attr) {
		for (const [key, value] of Object.entries(info.attr)) {
			if (value == null) continue;
			el.setAttribute(key, String(value));
		}
	}
}

const proto = HTMLElement.prototype as any;

proto.createEl ??= function (tag: string, info?: ElInfo, cb?: (el: HTMLElement) => void) {
	const el = document.createElement(tag);
	applyInfo(el, info);
	this.appendChild(el);
	cb?.(el);
	return el;
};
proto.createDiv ??= function (info?: ElInfo, cb?: (el: HTMLElement) => void) {
	return this.createEl('div', info, cb);
};
proto.createSpan ??= function (info?: ElInfo, cb?: (el: HTMLElement) => void) {
	return this.createEl('span', info, cb);
};
proto.empty ??= function () { while (this.firstChild) this.removeChild(this.firstChild); };
proto.detach ??= function () { this.remove(); };
proto.setText ??= function (text: string) { this.textContent = text; };
proto.addClass ??= function (...cls: string[]) { this.classList.add(...cls); };
proto.removeClass ??= function (...cls: string[]) { this.classList.remove(...cls); };
proto.hasClass ??= function (cls: string) { return this.classList.contains(cls); };
proto.toggleClass ??= function (cls: string, on: boolean) { this.classList.toggle(cls, on); };
proto.setAttr ??= function (name: string, value: string | number | boolean) { this.setAttribute(name, String(value)); };

// ── setIcon → real Lucide SVGs (same icon set Obsidian ships) ───────────────

function pascalCase(name: string): string {
	return name.split('-').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join('');
}

export function setIcon(el: HTMLElement, iconName: string): void {
	el.empty?.();
	const node = (icons as Record<string, any>)[pascalCase(iconName)];
	if (!node) return;
	const svg = createElement(node);
	svg.classList.add('svg-icon', `lucide-${iconName}`);
	svg.setAttribute('width', '18');
	svg.setAttribute('height', '18');
	el.appendChild(svg);
}

// ── Notice → corner toast ───────────────────────────────────────────────────

export class Notice {
	noticeEl: HTMLElement;
	constructor(message: string, durationMs = 4000) {
		let host = document.querySelector<HTMLElement>('.notice-container');
		if (!host) {
			host = document.body.createDiv({ cls: 'notice-container' });
		}
		this.noticeEl = host.createDiv({ cls: 'notice', text: message });
		window.setTimeout(() => this.hide(), durationMs);
	}
	setMessage(message: string): this { this.noticeEl.setText(message); return this; }
	hide(): void { this.noticeEl.remove(); }
}

// ── Menu → minimal floating context menu ────────────────────────────────────

interface MenuItemShim {
	setTitle(title: string): MenuItemShim;
	setIcon(icon: string): MenuItemShim;
	onClick(cb: () => void): MenuItemShim;
}

export class Menu {
	private entries: Array<{ title: string; icon?: string; onClick?: () => void }> = [];

	addItem(cb: (item: MenuItemShim) => void): this {
		const entry: { title: string; icon?: string; onClick?: () => void } = { title: '' };
		const item: MenuItemShim = {
			setTitle: (title) => { entry.title = title; return item; },
			setIcon: (iconName) => { entry.icon = iconName; return item; },
			onClick: (fn) => { entry.onClick = fn; return item; },
		};
		cb(item);
		this.entries.push(entry);
		return this;
	}

	addSeparator(): this { return this; }

	showAtMouseEvent(event: MouseEvent): void {
		document.querySelector('.rig-menu')?.remove();
		const menuEl = document.body.createDiv({ cls: 'rig-menu' });
		menuEl.style.left = `${event.clientX}px`;
		menuEl.style.top = `${event.clientY}px`;
		for (const entry of this.entries) {
			const row = menuEl.createDiv({ cls: 'rig-menu-item' });
			if (entry.icon) setIcon(row.createSpan({ cls: 'rig-menu-icon' }), entry.icon);
			row.createSpan({ text: entry.title });
			row.addEventListener('click', () => { menuEl.remove(); entry.onClick?.(); });
		}
		window.setTimeout(() => {
			document.addEventListener('click', () => menuEl.remove(), { once: true });
		}, 0);
	}

	showAtPosition(pos: { x: number; y: number }): void {
		this.showAtMouseEvent({ clientX: pos.x, clientY: pos.y } as MouseEvent);
	}
}

// ── Modal → Obsidian's modal DOM structure ──────────────────────────────────

export class Modal {
	app: unknown;
	containerEl: HTMLElement;
	modalEl: HTMLElement;
	titleEl: HTMLElement;
	contentEl: HTMLElement;
	scope = { register: () => {} };

	constructor(app: unknown) {
		this.app = app;
		this.containerEl = document.createElement('div');
		this.containerEl.className = 'modal-container mod-dim';
		const bg = this.containerEl.createDiv({ cls: 'modal-bg' });
		bg.addEventListener('click', () => this.close());
		this.modalEl = this.containerEl.createDiv({ cls: 'modal' });
		const closeBtn = this.modalEl.createDiv({ cls: 'modal-close-button' });
		closeBtn.addEventListener('click', () => this.close());
		this.titleEl = this.modalEl.createDiv({ cls: 'modal-title' });
		this.contentEl = this.modalEl.createDiv({ cls: 'modal-content' });
	}

	onOpen(): void {}
	onClose: (() => void) | null = null;

	open(): void {
		document.body.appendChild(this.containerEl);
		this.onOpen();
	}

	close(): void {
		this.containerEl.remove();
		this.onClose?.();
	}
}

// ── Inert stubs (imported but not exercised by the rig) ─────────────────────

export class App {}
export class Component { load(): void {} unload(): void {} addChild<T>(child: T): T { return child; } }
export class MarkdownRenderer {
	static async render(_app: unknown, markdown: string, el: HTMLElement, _sourcePath: string, _component: unknown): Promise<void> {
		// Cheap markdown-ish preview: paragraphs + inline code stay readable.
		el.innerHTML = markdown
			.split(/\n{2,}/)
			.map((block) => `<p>${block.replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\n/g, '<br>')}</p>`)
			.join('');
	}
}
export class TAbstractFile { path = ''; name = ''; }
export class TFile extends TAbstractFile { extension = 'md'; basename = ''; }
export class TFolder extends TAbstractFile { children: unknown[] = []; }
export class Vault {
	getAbstractFileByPath(): null { return null; }
	getMarkdownFiles(): TFile[] { return []; }
	async read(): Promise<string> { return ''; }
	async cachedRead(): Promise<string> { return ''; }
}
export class Plugin {}
export class PluginSettingTab {}
export class Setting {
	settingEl: HTMLElement;
	nameEl: HTMLElement;
	descEl: HTMLElement;
	controlEl: HTMLElement;
	constructor(containerEl: HTMLElement) {
		this.settingEl = containerEl.createDiv({ cls: 'setting-item' });
		const info = this.settingEl.createDiv({ cls: 'setting-item-info' });
		this.nameEl = info.createDiv({ cls: 'setting-item-name' });
		this.descEl = info.createDiv({ cls: 'setting-item-description' });
		this.controlEl = this.settingEl.createDiv({ cls: 'setting-item-control' });
	}
	setName(name: string): this { this.nameEl.setText(name); return this; }
	setDesc(desc: string): this { this.descEl.setText(desc); return this; }
	setClass(cls: string): this { this.settingEl.addClass(cls); return this; }
	setHeading(): this { this.settingEl.addClass('setting-item-heading'); return this; }
	addText(cb: (t: any) => void): this {
		const inputEl = this.controlEl.createEl('input', { type: 'text' }) as HTMLInputElement;
		const t = {
			inputEl,
			setValue: (v: string) => { inputEl.value = v; return t; },
			setPlaceholder: (v: string) => { inputEl.placeholder = v; return t; },
			getValue: () => inputEl.value,
			onChange: (fn: (v: string) => void) => { inputEl.addEventListener('input', () => fn(inputEl.value)); return t; },
		};
		cb(t);
		return this;
	}
	addToggle(cb: (t: any) => void): this {
		const el = this.controlEl.createEl('input', { type: 'checkbox' }) as HTMLInputElement;
		const t = {
			setValue: (v: boolean) => { el.checked = v; return t; },
			onChange: (fn: (v: boolean) => void) => { el.addEventListener('change', () => fn(el.checked)); return t; },
		};
		cb(t);
		return this;
	}
	addDropdown(cb: (d: any) => void): this {
		const el = this.controlEl.createEl('select') as HTMLSelectElement;
		const d = {
			selectEl: el,
			addOption: (value: string, label: string) => { el.createEl('option', { value, text: label }); return d; },
			setValue: (v: string) => { el.value = v; return d; },
			onChange: (fn: (v: string) => void) => { el.addEventListener('change', () => fn(el.value)); return d; },
		};
		cb(d);
		return this;
	}
	addButton(cb: (b: any) => void): this {
		const el = this.controlEl.createEl('button');
		const b = {
			buttonEl: el,
			setButtonText: (v: string) => { el.setText(v); return b; },
			setCta: () => { el.addClass('mod-cta'); return b; },
			setWarning: () => { el.addClass('mod-warning'); return b; },
			setIcon: (name: string) => { setIcon(el, name); return b; },
			setTooltip: (v: string) => { el.title = v; return b; },
			onClick: (fn: () => void) => { el.addEventListener('click', fn); return b; },
		};
		cb(b);
		return this;
	}
	addExtraButton(cb: (b: any) => void): this { return this.addButton(cb); }
	addTextArea(cb: (t: any) => void): this {
		const el = this.controlEl.createEl('textarea') as HTMLTextAreaElement;
		const t = {
			inputEl: el,
			setValue: (v: string) => { el.value = v; return t; },
			setPlaceholder: (v: string) => { el.placeholder = v; return t; },
			onChange: (fn: (v: string) => void) => { el.addEventListener('input', () => fn(el.value)); return t; },
		};
		cb(t);
		return this;
	}
}
export class ItemView {}
export class WorkspaceLeaf {}
export class Editor {}
export class EditorSuggest { constructor(_app: unknown) {} }
export class FuzzySuggestModal extends Modal {}
export class AbstractInputSuggest<T> {
	constructor(_app: unknown, _inputEl: unknown) {}
	getSuggestions(_q: string): T[] { return []; }
	renderSuggestion(_item: T, _el: HTMLElement): void {}
	selectSuggestion(_item: T): void {}
	setValue(_v: string): void {}
	close(): void {}
}
export const Platform = { isMobile: false, isDesktop: true, isIosApp: false, isAndroidApp: false };
export function normalizePath(path: string): string {
	return path.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\/|\/$/g, '');
}
export function debounce<T extends (...args: any[]) => void>(fn: T, wait = 0): T {
	let timer: number | undefined;
	return ((...args: any[]) => {
		window.clearTimeout(timer);
		timer = window.setTimeout(() => fn(...args), wait);
	}) as T;
}
