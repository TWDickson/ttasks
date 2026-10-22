import { afterEach, describe, expect, it, vi } from 'vitest';
import { startWorkerTicker } from './workerTicker';

class FakeWorker {
	static last: FakeWorker | null = null;
	onmessage: (() => void) | null = null;
	onerror: (() => void) | null = null;
	posted: unknown[] = [];
	terminated = false;
	constructor(public url: string) {
		FakeWorker.last = this;
	}
	postMessage(data: unknown) {
		this.posted.push(data);
	}
	terminate() {
		this.terminated = true;
	}
}

describe('startWorkerTicker', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.useRealTimers();
		FakeWorker.last = null;
	});

	function stubWorkerRuntime() {
		vi.stubGlobal('Worker', FakeWorker);
		vi.stubGlobal('URL', { createObjectURL: () => 'blob:tick', revokeObjectURL: vi.fn() });
	}

	it('ticks on worker messages and terminates the worker on stop', () => {
		stubWorkerRuntime();
		const onTick = vi.fn();
		const stop = startWorkerTicker(onTick, 1000);
		const worker = FakeWorker.last!;
		expect(worker.posted).toEqual([1000]);
		worker.onmessage?.();
		worker.onmessage?.();
		expect(onTick).toHaveBeenCalledTimes(2);
		stop();
		expect(worker.terminated).toBe(true);
	});

	it('falls back to setInterval when the worker errors (e.g. CSP)', () => {
		vi.useFakeTimers();
		stubWorkerRuntime();
		const onTick = vi.fn();
		const stop = startWorkerTicker(onTick, 1000);
		FakeWorker.last!.onerror?.();
		vi.advanceTimersByTime(3000);
		expect(onTick).toHaveBeenCalledTimes(3);
		stop();
		vi.advanceTimersByTime(3000);
		expect(onTick).toHaveBeenCalledTimes(3);
	});

	it('falls back to setInterval when the runtime has no Worker', () => {
		vi.useFakeTimers();
		vi.stubGlobal('Worker', undefined);
		const onTick = vi.fn();
		const stop = startWorkerTicker(onTick, 1000);
		vi.advanceTimersByTime(2000);
		expect(onTick).toHaveBeenCalledTimes(2);
		stop();
	});
});
