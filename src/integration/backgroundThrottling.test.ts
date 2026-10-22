import { describe, expect, it, vi } from 'vitest';
import { setBackgroundThrottling } from './backgroundThrottling';

describe('setBackgroundThrottling', () => {
	it('reaches webContents through electron.remote', () => {
		const contents = { setBackgroundThrottling: vi.fn() };
		const req = vi.fn((id: string) => (id === 'electron' ? { remote: { getCurrentWebContents: () => contents } } : null));
		expect(setBackgroundThrottling(false, req)).toBe(true);
		expect(contents.setBackgroundThrottling).toHaveBeenCalledWith(false);
	});

	it('falls back to @electron/remote', () => {
		const contents = { setBackgroundThrottling: vi.fn() };
		const req = (id: string) => {
			if (id === 'electron') return {};
			if (id === '@electron/remote') return { getCurrentWebContents: () => contents };
			throw new Error('not found');
		};
		expect(setBackgroundThrottling(true, req)).toBe(true);
		expect(contents.setBackgroundThrottling).toHaveBeenCalledWith(true);
	});

	it('is a silent no-op with no route', () => {
		expect(setBackgroundThrottling(false, () => { throw new Error('no module'); })).toBe(false);
		expect(setBackgroundThrottling(false, () => ({ remote: { getCurrentWebContents: () => ({}) } }))).toBe(false);
	});
});
