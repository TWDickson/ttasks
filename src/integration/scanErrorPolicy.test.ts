import { describe, expect, it, vi } from 'vitest';
import { handleScanError } from './scanErrorPolicy';

describe('handleScanError', () => {
	it('logs only for background_non_blocking failures', () => {
		const log = vi.fn();
		const notice = vi.fn();

		handleScanError(
			'background_non_blocking',
			new Error('boom'),
			{ operation: 'scan.rescanFile', filePath: 'Daily/today.md' },
			{ log, notice },
		);

		expect(log).toHaveBeenCalledTimes(1);
		expect(notice).not.toHaveBeenCalled();
		expect(String(log.mock.calls[0][0])).toContain('scan.rescanFile');
		expect(String(log.mock.calls[0][0])).toContain('Daily/today.md');
	});

	it('shows one concise Notice for user_triggered_single failures', () => {
		const log = vi.fn();
		const notice = vi.fn();

		handleScanError(
			'user_triggered_single',
			new Error('boom'),
			{ operation: 'promote.rescanFile', filePath: 'Daily/today.md', userMessage: 'TTasks: task promoted, but refresh failed.' },
			{ log, notice },
		);

		expect(log).toHaveBeenCalledTimes(1);
		expect(notice).toHaveBeenCalledTimes(1);
		expect(notice).toHaveBeenCalledWith('TTasks: task promoted, but refresh failed.');
	});

	it('does not emit Notice for user_triggered_bulk failures', () => {
		const log = vi.fn();
		const notice = vi.fn();

		handleScanError(
			'user_triggered_bulk',
			new Error('boom'),
			{ operation: 'import.promote', filePath: 'Daily/today.md' },
			{ log, notice },
		);

		expect(log).toHaveBeenCalledTimes(1);
		expect(notice).not.toHaveBeenCalled();
	});
});
