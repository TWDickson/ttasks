import { afterEach, describe, expect, it } from 'vitest';
import { en } from './en';
import { setLocale, t } from './index';

afterEach(() => setLocale('en'));

describe('t()', () => {
	it('returns a message with no placeholders as-is', () => {
		expect(t('graph.projectFilter.showAll')).toBe('Show all');
	});

	it('fills every placeholder', () => {
		expect(t('filter.selection', { label: 'Status', values: 'Active, Hold' })).toBe('Status: Active, Hold');
		expect(t('graph.projectFilter.hidden', { count: 3 })).toBe('3 hidden');
	});

	it('does not re-expand a placeholder-looking value', () => {
		expect(t('filter.clear', { label: '{label}' })).toBe('Clear {label}');
	});

	it('falls back to English for a language with no catalogue', () => {
		setLocale('zh-TW');
		expect(t('filter.clear', { label: 'area' })).toBe('Clear area');
	});

	it('is checked at compile time', () => {
		// @ts-expect-error — unknown key
		t('filter.nope');
		// @ts-expect-error — the message needs { label }
		t('filter.clear');
		// @ts-expect-error — `values` is missing
		t('filter.selection', { label: 'Status' });
		// @ts-expect-error — the message takes no parameters
		t('graph.projectFilter.all', { count: 1 });
		expect(true).toBe(true);
	});
});

describe('the English catalogue', () => {
	it('has no empty messages', () => {
		const empty: string[] = [];
		const walk = (node: object, path: string): void => {
			for (const [key, value] of Object.entries(node)) {
				const at = path ? `${path}.${key}` : key;
				if (typeof value === 'string') { if (!value.trim()) empty.push(at); }
				else walk(value as object, at);
			}
		};
		walk(en, '');
		expect(empty).toEqual([]);
	});
});
