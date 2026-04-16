export interface DeleteDeps<TFileLike> {
	promptForDeletion?: (file: TFileLike) => Promise<void> | void;
	trashFile?: (file: TFileLike) => Promise<void> | void;
	vaultDelete: (file: TFileLike) => Promise<void> | void;
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
