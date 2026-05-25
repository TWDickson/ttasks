export interface VaultOpResult<T> {
	ok: boolean;
	value?: T;
	error?: Error;
}

interface FileLike {
	path: string;
}

interface VaultLike {
	read(file: FileLike): Promise<string>;
	modify(file: FileLike, content: string): Promise<void>;
	process(file: FileLike, fn: (content: string) => string): Promise<unknown>;
}

function toError(error: unknown): Error {
	if (error instanceof Error) return error;
	return new Error(String(error));
}

function logFailure(opName: string, filePath: string, error: Error): void {
	console.error(`TTasks ${opName} failed for ${filePath}:`, error);
}

export async function safeRead(
	vault: VaultLike,
	file: FileLike,
): Promise<VaultOpResult<string>> {
	try {
		const content = await vault.read(file);
		return { ok: true, value: content };
	} catch (error) {
		const wrapped = toError(error);
		logFailure('safeRead', file.path, wrapped);
		return { ok: false, error: wrapped };
	}
}

export async function safeModify(
	vault: VaultLike,
	file: FileLike,
	content: string,
): Promise<VaultOpResult<void>> {
	try {
		await vault.modify(file, content);
		return { ok: true };
	} catch (error) {
		const wrapped = toError(error);
		logFailure('safeModify', file.path, wrapped);
		return { ok: false, error: wrapped };
	}
}

export async function safeProcess(
	vault: VaultLike,
	file: FileLike,
	fn: (content: string) => string,
): Promise<VaultOpResult<void>> {
	try {
		await vault.process(file, fn);
		return { ok: true };
	} catch (error) {
		const wrapped = toError(error);
		logFailure('safeProcess', file.path, wrapped);
		return { ok: false, error: wrapped };
	}
}

export function safeLocalStorage(key: string): string | null {
	try {
		return localStorage.getItem(key);
	} catch (error) {
		console.error(`TTasks safeLocalStorage failed for key "${key}":`, error);
		return null;
	}
}

export function safeLocalStorageSet(key: string, value: string): boolean {
	try {
		localStorage.setItem(key, value);
		return true;
	} catch (error) {
		console.error(`TTasks safeLocalStorageSet failed for key "${key}":`, error);
		return false;
	}
}
