import { describe, expect, it, vi } from 'vitest';
import { deleteFileSafely } from './safeDelete';

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
