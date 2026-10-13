import { describe, expect, it } from 'vitest';
import {
	safeRead,
	safeProcess,
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
			{ read: async () => 'abc', process: async () => {} },
			{ path: 'A.md' },
		);
		expect(result).toEqual({ ok: true, value: 'abc' });
	});

	it('returns error result when vault.read throws', async () => {
		const result = await safeRead(
			{ read: async () => { throw new Error('read fail'); }, process: async () => {} },
			{ path: 'A.md' },
		);
		expect(result.ok).toBe(false);
		expect(result.error).toBeInstanceOf(Error);
	});
});

describe('safeProcess', () => {
	it('returns ok on success', async () => {
		const result = await safeProcess(
			{ read: async () => '', process: async () => {} },
			{ path: 'A.md' },
			(c) => c,
		);
		expect(result).toEqual({ ok: true });
	});

	it('returns error result when vault.process throws', async () => {
		const result = await safeProcess(
			{ read: async () => '', process: async () => { throw new Error('process fail'); } },
			{ path: 'A.md' },
			(c) => c,
		);
		expect(result.ok).toBe(false);
		expect(result.error).toBeInstanceOf(Error);
	});
});
