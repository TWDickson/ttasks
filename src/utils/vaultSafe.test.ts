import { describe, expect, it, vi } from 'vitest';
import {
	safeRead,
	safeModify,
	safeProcess,
	safeLocalStorage,
	safeLocalStorageSet,
	ensureFolderPath,
} from './vaultSafe';

describe('ensureFolderPath', () => {
	function fakeVault(existing: string[] = []) {
		const folders = new Set(existing);
		return {
			created: [] as string[],
			getAbstractFileByPath(path: string) {
				return folders.has(path) ? { path } : null;
			},
			async createFolder(path: string) {
				folders.add(path);
				this.created.push(path);
			},
		};
	}

	it('creates every missing segment top-down', async () => {
		const vault = fakeVault();
		await ensureFolderPath(vault, 'Planner/Archive/2026/05');
		expect(vault.created).toEqual(['Planner', 'Planner/Archive', 'Planner/Archive/2026', 'Planner/Archive/2026/05']);
	});

	it('skips segments that already exist', async () => {
		const vault = fakeVault(['Planner', 'Planner/Archive']);
		await ensureFolderPath(vault, 'Planner/Archive/2026');
		expect(vault.created).toEqual(['Planner/Archive/2026']);
	});

	it('does nothing when the full path already exists', async () => {
		const vault = fakeVault(['Planner', 'Planner/Tasks']);
		await ensureFolderPath(vault, 'Planner/Tasks');
		expect(vault.created).toEqual([]);
	});

	it('ignores empty segments from leading/trailing slashes', async () => {
		const vault = fakeVault();
		await ensureFolderPath(vault, '/Planner/');
		expect(vault.created).toEqual(['Planner']);
	});
});

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
