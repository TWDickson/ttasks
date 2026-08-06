import { describe, expect, it } from 'vitest';
import { buildBadgePalette, DEFAULT_STATUS_ACCENT } from './badgePalette';

describe('buildBadgePalette', () => {
	it('resolves a configured colour', () => {
		const palette = buildBadgePalette({ areaColors: { Work: '#f59e0b' } });

		expect(palette.area('Work')).toEqual({
			color: '#f59e0b',
			style: '--tt-badge-color:#f59e0b;',
		});
	});

	it('resolves an unconfigured name to a null colour, not an absent object', () => {
		const palette = buildBadgePalette({ areaColors: { Work: '#f59e0b' } });

		// The caller always gets an object; `null` is the "no colour set" case each
		// call site used to re-derive with `!!colors?.[name]`.
		expect(palette.area('Home')).toEqual({ color: null, style: '' });
	});

	it('keeps the three colour maps separate', () => {
		const palette = buildBadgePalette({
			areaColors: { Shared: '#area' },
			labelColors: { Shared: '#label' },
			statusColors: { Shared: '#status' },
		});

		expect(palette.area('Shared').color).toBe('#area');
		expect(palette.label('Shared').color).toBe('#label');
		expect(palette.status('Shared').color).toBe('#status');
	});

	it('tolerates absent settings and absent maps', () => {
		for (const palette of [buildBadgePalette(null), buildBadgePalette(undefined), buildBadgePalette({})]) {
			expect(palette.area('Work').color).toBeNull();
			expect(palette.label('bug').style).toBe('');
			expect(palette.status('Active').color).toBeNull();
		}
	});

	it('returns the same object for repeated lookups', () => {
		// 500 rows sharing three areas should allocate three objects, and hand Svelte
		// an unchanged reference rather than churn it re-renders on.
		const palette = buildBadgePalette({ areaColors: { Work: '#f59e0b' } });

		expect(palette.area('Work')).toBe(palette.area('Work'));
		expect(palette.area('Home')).toBe(palette.area('Home'));
	});

	describe('areaSpine', () => {
		it('gives the raw colour for a configured area', () => {
			const palette = buildBadgePalette({ areaColors: { Work: '#f59e0b' } });

			expect(palette.areaSpine('Work')).toBe('#f59e0b');
		});

		it('is undefined for an unclassified or unconfigured area', () => {
			const palette = buildBadgePalette({ areaColors: { Work: '#f59e0b' } });

			// `undefined`, not null: `style:--tt-area-color` omits the property
			// entirely for undefined, which is what lets the CSS fallback apply.
			expect(palette.areaSpine(null)).toBeUndefined();
			expect(palette.areaSpine(undefined)).toBeUndefined();
			expect(palette.areaSpine('')).toBeUndefined();
			expect(palette.areaSpine('Home')).toBeUndefined();
		});

		it('agrees with the resolver about whether a colour exists', () => {
			const palette = buildBadgePalette({ areaColors: { Work: '#f59e0b', Home: '' } });

			for (const area of ['Work', 'Home', 'Errands']) {
				expect(palette.areaSpine(area)).toBe(palette.area(area).color ?? undefined);
			}
		});
	});

	describe('statusAccent', () => {
		it('gives the configured colour when there is one', () => {
			const palette = buildBadgePalette({ statusColors: { Blocked: '#ef4444' } });

			expect(palette.statusAccent('Blocked')).toBe('#ef4444');
		});

		it('falls back to the theme accent so color-mix() never sees an invalid value', () => {
			const palette = buildBadgePalette({ statusColors: { Blocked: '#ef4444' } });

			expect(palette.statusAccent('Active')).toBe(DEFAULT_STATUS_ACCENT);
		});
	});

	describe('hostile map keys', () => {
		it('does not resolve inherited Object properties as colours', () => {
			// Area names come from user frontmatter, so `constructor` is reachable.
			const palette = buildBadgePalette({ areaColors: {} });

			expect(palette.area('constructor').color).toBeNull();
			expect(palette.area('toString').style).toBe('');
			expect(palette.areaSpine('constructor')).toBeUndefined();
		});

		it('ignores non-string and empty values', () => {
			const palette = buildBadgePalette({
				areaColors: { Bad: 42 as unknown as string, Blank: '' },
			});

			expect(palette.area('Bad').color).toBeNull();
			expect(palette.area('Blank').color).toBeNull();
		});
	});
});
