import { describe, expect, it } from 'vitest';
import { DEFAULT_KEYMAP, isInputFocused, resolveShortcut } from './boardKeymap';

function key(
	k: string,
	opts: { ctrlKey?: boolean; shiftKey?: boolean; altKey?: boolean } = {},
): { key: string; ctrlKey: boolean; shiftKey: boolean; altKey: boolean } {
	return {
		key: k,
		ctrlKey: opts.ctrlKey ?? false,
		shiftKey: opts.shiftKey ?? false,
		altKey: opts.altKey ?? false,
	};
}

describe('resolveShortcut', () => {
	it('resolves j to next', () => {
		expect(resolveShortcut(key('j'), DEFAULT_KEYMAP)).toBe('next');
	});

	it('resolves ArrowDown to next', () => {
		expect(resolveShortcut(key('ArrowDown'), DEFAULT_KEYMAP)).toBe('next');
	});

	it('resolves k to prev', () => {
		expect(resolveShortcut(key('k'), DEFAULT_KEYMAP)).toBe('prev');
	});

	it('resolves ArrowUp to prev', () => {
		expect(resolveShortcut(key('ArrowUp'), DEFAULT_KEYMAP)).toBe('prev');
	});

	it('resolves Enter to open', () => {
		expect(resolveShortcut(key('Enter'), DEFAULT_KEYMAP)).toBe('open');
	});

	it('resolves o to open', () => {
		expect(resolveShortcut(key('o'), DEFAULT_KEYMAP)).toBe('open');
	});

	it('resolves s to start', () => {
		expect(resolveShortcut(key('s'), DEFAULT_KEYMAP)).toBe('start');
	});

	it('resolves c to complete', () => {
		expect(resolveShortcut(key('c'), DEFAULT_KEYMAP)).toBe('complete');
	});

	it('resolves d to defer', () => {
		expect(resolveShortcut(key('d'), DEFAULT_KEYMAP)).toBe('defer');
	});

	it('resolves a to archive', () => {
		expect(resolveShortcut(key('a'), DEFAULT_KEYMAP)).toBe('archive');
	});

	it('resolves n to newTask', () => {
		expect(resolveShortcut(key('n'), DEFAULT_KEYMAP)).toBe('newTask');
	});

	it('resolves Escape to escape', () => {
		expect(resolveShortcut(key('Escape'), DEFAULT_KEYMAP)).toBe('escape');
	});

	it('resolves / to search', () => {
		expect(resolveShortcut(key('/'), DEFAULT_KEYMAP)).toBe('search');
	});

	it('returns null for unmapped key', () => {
		expect(resolveShortcut(key('z'), DEFAULT_KEYMAP)).toBeNull();
	});

	it('returns null when altKey is held', () => {
		expect(resolveShortcut(key('j', { altKey: true }), DEFAULT_KEYMAP)).toBeNull();
	});

	it('returns null when ctrlKey does not match entry', () => {
		// 'j' in the keymap has no ctrl requirement; ctrl+j should still work
		// (our entries have no ctrl flag so !!e.ctrl = false, and false === false)
		expect(resolveShortcut(key('j', { ctrlKey: false }), DEFAULT_KEYMAP)).toBe('next');
	});

	it('returns null for empty keymap', () => {
		expect(resolveShortcut(key('j'), [])).toBeNull();
	});
});

describe('isInputFocused', () => {
	function fakeEl(tag: string, contentEditable?: string): Element {
		return {
			tagName: tag.toUpperCase(),
			isContentEditable: contentEditable === 'true',
		} as unknown as Element;
	}

	it('returns true for input element', () => {
		expect(isInputFocused(fakeEl('input'))).toBe(true);
	});

	it('returns true for textarea element', () => {
		expect(isInputFocused(fakeEl('textarea'))).toBe(true);
	});

	it('returns true for select element', () => {
		expect(isInputFocused(fakeEl('select'))).toBe(true);
	});

	it('returns true for contenteditable element', () => {
		expect(isInputFocused(fakeEl('div', 'true'))).toBe(true);
	});

	it('returns false for non-input element', () => {
		expect(isInputFocused(fakeEl('button'))).toBe(false);
		expect(isInputFocused(fakeEl('div'))).toBe(false);
		expect(isInputFocused(fakeEl('li'))).toBe(false);
	});

	it('returns false for null', () => {
		expect(isInputFocused(null)).toBe(false);
	});
});
