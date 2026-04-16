import { describe, expect, it, vi } from 'vitest';
import { deleteFileSafely, buildDeleteDeps } from './safeDelete';

describe('deleteFileSafely', () => {
	it('uses promptForDeletion when prompt option is true and API exists', async () => {
		const file = { path: 'Tasks/a.md' };
		const promptForDeletion = vi.fn(async () => {});
		const trashFile = vi.fn(async () => {});
		const vaultDelete = vi.fn(async () => {});

		await deleteFileSafely(file, { promptForDeletion, trashFile, vaultDelete }, { prompt: true });

		expect(promptForDeletion).toHaveBeenCalledWith(file);
		expect(trashFile).not.toHaveBeenCalled();
		expect(vaultDelete).not.toHaveBeenCalled();
	});

	it('uses trashFile when prompt is false', async () => {
		const file = { path: 'Tasks/a.md' };
		const promptForDeletion = vi.fn(async () => {});
		const trashFile = vi.fn(async () => {});
		const vaultDelete = vi.fn(async () => {});

		await deleteFileSafely(file, { promptForDeletion, trashFile, vaultDelete }, { prompt: false });

		expect(trashFile).toHaveBeenCalledWith(file);
		expect(vaultDelete).not.toHaveBeenCalled();
	});

	it('falls back to vault delete when trash API is unavailable', async () => {
		const file = { path: 'Tasks/a.md' };
		const vaultDelete = vi.fn(async () => {});

		await deleteFileSafely(file, { vaultDelete }, { prompt: false });

		expect(vaultDelete).toHaveBeenCalledWith(file);
	});
});

// ── buildDeleteDeps ──────────────────────────────────────────────────────────

describe('buildDeleteDeps', () => {
	it('binds trashFile so this context is preserved when called', async () => {
		// Simulates the Obsidian fileManager pattern: a method that reads `this`
		// and throws if called without the correct context.
		const fileManager = {
			internalState: 'vault-ref',
			trashFile: async function (file: unknown) {
				if (!this?.internalState) {
					throw new TypeError("Cannot read properties of undefined (reading 'internalState')");
				}
				void file;
			},
		};
		const vaultDelete = vi.fn(async () => {});

		const deps = buildDeleteDeps(fileManager, vaultDelete);

		// Should not throw — this is bound correctly
		await expect(deps.trashFile?.({ path: 'Tasks/a.md' })).resolves.toBeUndefined();
	});

	it('regression: unbound trashFile loses this and throws', async () => {
		// This is exactly what caused the original bug.
		// Demonstrates why .bind() is required and that omitting it breaks things.
		const fileManager = {
			internalState: 'vault-ref',
			trashFile: async function (file: unknown) {
				if (!this?.internalState) {
					throw new TypeError("Cannot read properties of undefined (reading 'internalState')");
				}
				void file;
			},
		};

		// Passing unbound — the bug pattern
		const unboundTrash = fileManager.trashFile;
		await expect(unboundTrash({ path: 'Tasks/a.md' })).rejects.toThrow(TypeError);
	});

	it('binds promptForDeletion so this context is preserved when called', async () => {
		const fileManager = {
			internalState: 'vault-ref',
			promptForDeletion: async function (file: unknown) {
				if (!this?.internalState) {
					throw new TypeError("Cannot read properties of undefined (reading 'internalState')");
				}
				void file;
			},
		};
		const vaultDelete = vi.fn(async () => {});

		const deps = buildDeleteDeps(fileManager, vaultDelete);

		await expect(deps.promptForDeletion?.({ path: 'Tasks/a.md' })).resolves.toBeUndefined();
	});

	it('omits promptForDeletion when not present on fileManager', () => {
		const fileManager = {
			trashFile: async (_file: unknown) => {},
		};
		const deps = buildDeleteDeps(fileManager, vi.fn(async () => {}));
		expect(deps.promptForDeletion).toBeUndefined();
	});

	it('omits trashFile when not present on fileManager', () => {
		const fileManager = {};
		const deps = buildDeleteDeps(fileManager, vi.fn(async () => {}));
		expect(deps.trashFile).toBeUndefined();
	});

	it('passes vaultDelete through as-is', () => {
		const vaultDelete = vi.fn(async () => {});
		const deps = buildDeleteDeps({}, vaultDelete);
		expect(deps.vaultDelete).toBe(vaultDelete);
	});
});
