export interface DeleteDeps<TFileLike> {
	promptForDeletion?: (file: TFileLike) => Promise<void> | void;
	trashFile?: (file: TFileLike) => Promise<void> | void;
	vaultDelete: (file: TFileLike) => Promise<void> | void;
}

/**
 * Builds a bound DeleteDeps from a fileManager-shaped object.
 *
 * Extracting this into a pure helper makes the binding contract explicit and
 * unit-testable. Passing `fileManager.trashFile` without `.bind(fileManager)`
 * was the root cause of a "Cannot read properties of undefined (reading 'vault')"
 * crash — Obsidian's internal methods rely on their `this` context.
 */
export function buildDeleteDeps<
	TFileLike,
	TFileManager extends {
		promptForDeletion?: (file: TFileLike) => Promise<void> | void;
		trashFile?: (file: TFileLike) => Promise<void> | void;
	}
>(
	fileManager: TFileManager,
	vaultDelete: (file: TFileLike) => Promise<void>,
): DeleteDeps<TFileLike> {
	return {
		promptForDeletion: fileManager.promptForDeletion?.bind(fileManager),
		trashFile: fileManager.trashFile?.bind(fileManager),
		vaultDelete,
	};
}

export interface DeleteOptions {
	prompt?: boolean;
}

export async function deleteFileSafely<TFileLike>(
	file: TFileLike,
	deps: DeleteDeps<TFileLike>,
	options: DeleteOptions = {}
): Promise<void> {
	if (options.prompt && deps.promptForDeletion) {
		await deps.promptForDeletion(file);
		return;
	}
	if (deps.trashFile) {
		await deps.trashFile(file);
		return;
	}
	await deps.vaultDelete(file);
}
