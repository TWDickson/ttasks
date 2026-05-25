import { describe, expect, it, vi } from 'vitest';
import { withConcurrencyLimit } from './concurrency';

describe('withConcurrencyLimit', () => {
	it('runs all tasks when count is below the limit', async () => {
		const calls: number[] = [];
		const result = await withConcurrencyLimit([
			async () => { calls.push(1); return 'a'; },
			async () => { calls.push(2); return 'b'; },
		], 5);

		expect(calls).toEqual([1, 2]);
		expect(result).toEqual(['a', 'b']);
	});

	it('limits concurrent executions to the requested cap', async () => {
		vi.useFakeTimers();
		let active = 0;
		let maxActive = 0;
		const tasks = Array.from({ length: 4 }, (_, index) => async () => {
			active++;
			maxActive = Math.max(maxActive, active);
			await new Promise<void>((resolve) => setTimeout(resolve, 10));
			active--;
			return index;
		});
		const promise = withConcurrencyLimit(tasks, 2);
		await vi.runAllTimersAsync();
		const result = await promise;

		expect(maxActive).toBeLessThanOrEqual(2);
		expect(result).toEqual([0, 1, 2, 3]);
		vi.useRealTimers();
	});

	it('returns results in input order', async () => {
		const result = await withConcurrencyLimit([
			async () => 'first',
			async () => 'second',
			async () => 'third',
		], 2);

		expect(result).toEqual(['first', 'second', 'third']);
	});

	it('returns undefined for failed tasks without aborting', async () => {
		const result = await withConcurrencyLimit([
			async () => 'ok',
			async () => { throw new Error('boom'); },
			async () => 'still-ok',
		], 2);

		expect(result).toEqual(['ok', undefined, 'still-ok']);
	});

	it('returns an empty array for no tasks', async () => {
		expect(await withConcurrencyLimit([], 5)).toEqual([]);
	});

	it('falls back to sequential execution when limit is 1', async () => {
		const order: number[] = [];
		const result = await withConcurrencyLimit([
			async () => { order.push(1); return 'one'; },
			async () => { order.push(2); return 'two'; },
		], 1);

		expect(order).toEqual([1, 2]);
		expect(result).toEqual(['one', 'two']);
	});
});