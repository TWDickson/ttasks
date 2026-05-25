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
});
