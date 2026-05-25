import { describe, expect, it, vi } from 'vitest';
import { normalizeCaptureSource } from '../settings';
import { ScanEngine } from './ScanEngine';

const captureConfig = normalizeCaptureSource({ path: 'Daily' });

describe('ScanEngine failure handling', () => {
	it('rescanFile background read failure resolves and cleans debounce state', async () => {
		vi.useFakeTimers();
		const reportError = vi.fn();
		const engine = new ScanEngine({ reportError });
		const file = { path: 'Daily/2026-05-25.md' } as any;
		const app = {
			vault: {
				cachedRead: vi.fn().mockRejectedValue(new Error('read failed')),
			},
		} as any;

		const promise = engine.rescanFile(app, file, captureConfig, 'Tasks');
		await vi.runAllTimersAsync();
		await expect(promise).resolves.toBeUndefined();

		expect(reportError).toHaveBeenCalledTimes(1);
		expect(reportError).toHaveBeenCalledWith(
			'background_non_blocking',
			expect.any(Error),
			expect.objectContaining({
				operation: 'scan.rescanFile',
				filePath: 'Daily/2026-05-25.md',
			}),
		);
		expect((engine as any).debounceByFilePath.has('Daily/2026-05-25.md')).toBe(false);
		vi.useRealTimers();
	});

	it('rescanFile clears debounce state on success', async () => {
		vi.useFakeTimers();
		const engine = new ScanEngine();
		const file = { path: 'Daily/2026-05-25.md' } as any;
		const app = {
			vault: {
				cachedRead: vi.fn().mockResolvedValue('- [ ] hello'),
			},
		} as any;

		const promise = engine.rescanFile(app, file, captureConfig, 'Tasks');
		await vi.runAllTimersAsync();
		await expect(promise).resolves.toBeUndefined();
		expect((engine as any).debounceByFilePath.has('Daily/2026-05-25.md')).toBe(false);
		vi.useRealTimers();
	});

	it('runFullScan preserves deterministic entry and line order under shuffled file completion timing', async () => {
		vi.useFakeTimers();
		const engine = new ScanEngine({ fullScanConcurrency: 2 });
		const files = [
			{ path: 'Daily/A.md' },
			{ path: 'Daily/B.md' },
			{ path: 'Daily/C.md' },
		] as any[];

		const contentByPath: Record<string, string> = {
			'Daily/A.md': '- [ ] A1\n- [ ] A2',
			'Daily/B.md': '- [ ] B1',
			'Daily/C.md': '- [ ] C1\n- [ ] C2',
		};
		const delayByPath: Record<string, number> = {
			'Daily/A.md': 40,
			'Daily/B.md': 5,
			'Daily/C.md': 20,
		};

		const app = {
			vault: {
				getMarkdownFiles: vi.fn(() => files),
				cachedRead: vi.fn((file: { path: string }) => new Promise<string>((resolve) => {
					setTimeout(() => resolve(contentByPath[file.path]), delayByPath[file.path]);
				})),
			},
		} as any;

		const fullScan = engine.runFullScan(app, {
			captureSources: [captureConfig],
			tasksFolder: 'Tasks',
		} as any);

		await vi.runAllTimersAsync();
		await fullScan;

		let tasks: any[] = [];
		const unsubscribe = engine.tasks.subscribe((value) => {
			tasks = value;
		});
		unsubscribe();

		expect(tasks.map((task) => task.name)).toEqual(['A1', 'A2', 'B1', 'C1', 'C2']);
		expect(tasks.map((task) => `${task.location.filePath}#${task.location.line}`)).toEqual([
			'Daily/A.md#1',
			'Daily/A.md#2',
			'Daily/B.md#1',
			'Daily/C.md#1',
			'Daily/C.md#2',
		]);

		vi.useRealTimers();
	});

	it('runFullScan isolates per-file failures without aborting all entries', async () => {
		const reportError = vi.fn();
		const engine = new ScanEngine({ reportError, fullScanConcurrency: 3 });
		const files = [
			{ path: 'Daily/A.md' },
			{ path: 'Daily/B.md' },
			{ path: 'Daily/C.md' },
		] as any[];

		const app = {
			vault: {
				getMarkdownFiles: vi.fn(() => files),
				cachedRead: vi.fn((file: { path: string }) => {
					if (file.path === 'Daily/B.md') {
						return Promise.reject(new Error('read failed for B'));
					}
					if (file.path === 'Daily/A.md') {
						return Promise.resolve('- [ ] A1');
					}
					return Promise.resolve('- [ ] C1');
				}),
			},
		} as any;

		await expect(engine.runFullScan(app, {
			captureSources: [captureConfig],
			tasksFolder: 'Tasks',
		} as any)).resolves.toBeUndefined();

		let tasks: any[] = [];
		const unsubscribe = engine.tasks.subscribe((value) => {
			tasks = value;
		});
		unsubscribe();

		expect(tasks.map((task) => task.name)).toEqual(['A1', 'C1']);
		expect(reportError).toHaveBeenCalledWith(
			'background_non_blocking',
			expect.any(Error),
			expect.objectContaining({
				operation: 'scan.runFullScan.entry',
				filePath: 'Daily/B.md',
			}),
		);
	});

	it('runFullScan respects the bounded concurrency cap', async () => {
		vi.useFakeTimers();
		let active = 0;
		let maxActive = 0;
		const engine = new ScanEngine({ fullScanConcurrency: 2 });
		const files = [
			{ path: 'Daily/A.md' },
			{ path: 'Daily/B.md' },
			{ path: 'Daily/C.md' },
			{ path: 'Daily/D.md' },
		] as any[];

		const app = {
			vault: {
				getMarkdownFiles: vi.fn(() => files),
				cachedRead: vi.fn(() => new Promise<string>((resolve) => {
					active += 1;
					maxActive = Math.max(maxActive, active);
					setTimeout(() => {
						active -= 1;
						resolve('- [ ] task');
					}, 20);
				})),
			},
		} as any;

		const fullScan = engine.runFullScan(app, {
			captureSources: [captureConfig],
			tasksFolder: 'Tasks',
		} as any);

		await vi.runAllTimersAsync();
		await fullScan;

		expect(maxActive).toBe(2);
		vi.useRealTimers();
	});
});
