import { describe, expect, it, vi } from 'vitest';
import {
	safeRead,
	safeModify,
	safeProcess,
	safeLocalStorage,
	safeLocalStorageSet,
} from './vaultSafe';

describe('safeRead', () => {
	it('returns ok + content on success', async () => {
		const result = await safeRead(
			{ read: async () => 'abc', modify: async () => {}, process: async () => {} },
			{ path: 'A.md' },
		);
		expect(result).toEqual({ ok: true, value: 'abc' });
	});

	it('returns error result when vault.read throws', async () => {
		const result = await safeRead(
			{ read: async () => { throw new Error('read fail'); }, modify: async () => {}, process: async () => {} },
			{ path: 'A.md' },
		);
		expect(result.ok).toBe(false);
		expect(result.error).toBeInstanceOf(Error);
	});
});

describe('safeModify', () => {
	it('returns ok on success', async () => {
		const result = await safeModify(
			{ read: async () => '', modify: async () => {}, process: async () => {} },
			{ path: 'A.md' },
			'next',
		);
		expect(result).toEqual({ ok: true });
	});

	it('returns error result when vault.modify throws', async () => {
		const result = await safeModify(
			{ read: async () => '', modify: async () => { throw new Error('modify fail'); }, process: async () => {} },
			{ path: 'A.md' },
			'next',
		);
		expect(result.ok).toBe(false);
		expect(result.error).toBeInstanceOf(Error);
	});
});

describe('safeProcess', () => {
	it('returns ok on success', async () => {
		const result = await safeProcess(
			{ read: async () => '', modify: async () => {}, process: async () => {} },
			{ path: 'A.md' },
			(c) => c,
		);
		expect(result).toEqual({ ok: true });
	});

	it('returns error result when vault.process throws', async () => {
		const result = await safeProcess(
			{ read: async () => '', modify: async () => {}, process: async () => { throw new Error('process fail'); } },
			{ path: 'A.md' },
			(c) => c,
		);
		expect(result.ok).toBe(false);
		expect(result.error).toBeInstanceOf(Error);
	});
});

describe('safeLocalStorage', () => {
	it('returns null when getItem throws', () => {
		const getItem = vi.fn(() => { throw new Error('blocked'); });
		vi.stubGlobal('localStorage', { getItem, setItem: vi.fn() });
		expect(safeLocalStorage('k')).toBeNull();
	});

	it('returns value when getItem succeeds', () => {
		vi.stubGlobal('localStorage', { getItem: vi.fn(() => 'v'), setItem: vi.fn() });
		expect(safeLocalStorage('k')).toBe('v');
	});
});

describe('safeLocalStorageSet', () => {
	it('returns false when setItem throws', () => {
		vi.stubGlobal('localStorage', { getItem: vi.fn(), setItem: vi.fn(() => { throw new Error('quota'); }) });
		expect(safeLocalStorageSet('k', 'v')).toBe(false);
	});

	it('returns true when setItem succeeds', () => {
		vi.stubGlobal('localStorage', { getItem: vi.fn(), setItem: vi.fn() });
		expect(safeLocalStorageSet('k', 'v')).toBe(true);
	});
});
