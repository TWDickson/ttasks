import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { createTodayStore } from './todayStore';

describe('createTodayStore', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('starts at the current local date', () => {
		vi.setSystemTime(new Date('2026-04-24T09:00:00'));
		const store = createTodayStore();
		const unsub = store.subscribe(() => {});
		expect(get(store)).toBe('2026-04-24');
		unsub();
	});

	it('flips to the next date just after midnight', () => {
		vi.setSystemTime(new Date('2026-04-24T23:59:00'));
		const store = createTodayStore();
		const seen: string[] = [];
		const unsub = store.subscribe((value) => seen.push(value));

		// Advance past midnight into the next day.
		vi.setSystemTime(new Date('2026-04-25T00:00:01'));
		vi.advanceTimersByTime(61 * 1000 + 200);

		expect(seen[seen.length - 1]).toBe('2026-04-25');
		unsub();
	});

	it('clears its timer on last unsubscribe', () => {
		vi.setSystemTime(new Date('2026-04-24T09:00:00'));
		const clearSpy = vi.spyOn(globalThis, 'clearTimeout');
		const store = createTodayStore();
		const unsub = store.subscribe(() => {});
		unsub();
		expect(clearSpy).toHaveBeenCalled();
		clearSpy.mockRestore();
	});
});
