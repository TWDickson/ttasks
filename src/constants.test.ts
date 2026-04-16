import { describe, expect, it } from 'vitest';
import { PRIORITY_COLORS } from './constants';
import type { TaskPriority } from './types';

// ── PRIORITY_COLORS ───────────────────────────────────────────────────────────
//
// Contract: a complete mapping of every TaskPriority to a CSS variable string.
// This is the single source of truth — all components import from here.

describe('PRIORITY_COLORS', () => {
	const ALL_PRIORITIES: TaskPriority[] = ['High', 'Medium', 'Low', 'None'];

	it('has an entry for every TaskPriority', () => {
		for (const p of ALL_PRIORITIES) {
			expect(PRIORITY_COLORS).toHaveProperty(p);
		}
	});

	it('all values are CSS variable strings', () => {
		for (const p of ALL_PRIORITIES) {
			expect(PRIORITY_COLORS[p]).toMatch(/^var\(--/);
		}
	});

	it('High maps to --color-red', () => {
		expect(PRIORITY_COLORS.High).toBe('var(--color-red)');
	});

	it('Medium maps to --color-orange', () => {
		expect(PRIORITY_COLORS.Medium).toBe('var(--color-orange)');
	});

	it('Low maps to --color-blue', () => {
		expect(PRIORITY_COLORS.Low).toBe('var(--color-blue)');
	});

	it('None maps to --text-faint', () => {
		expect(PRIORITY_COLORS.None).toBe('var(--text-faint)');
	});
});
