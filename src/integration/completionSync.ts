import type { Task } from '../types';
import { ensureMdExt, stripMdExt } from '../utils/pathUtils';
import { parseWikiLink } from '../utils/wikiLink';

interface FileLike {
	path: string;
}

interface AppLike {
	vault: {
		getAbstractFileByPath(path: string): unknown;
		cachedRead(file: FileLike): Promise<string>;
		process(file: FileLike, fn: (content: string) => string): Promise<string>;
	};
}

export type LinkPathResolver = (
	wikilinkPath: string,
	normalizedTaskPath: string,
	sourceFilePath: string,
) => boolean;

export interface CompletionSyncOptions {
	resolver?: LinkPathResolver;
}

function normalizeWikiPath(path: string): string {
	return stripMdExt(path.trim().replace(/\\/g, '/'));
}

export function buildUpdatedSourceLine(originalLine: string, checked: boolean): string {
	if (!/\[\[[^\]]+\]\]/.test(originalLine)) {
		return originalLine;
	}

	const marker = checked ? '[x]' : '[ ]';
	if (!/^\s*(?:[-*+]|\d+\.)\s+\[[^\]]\]/.test(originalLine)) {
		return originalLine;
	}

	return originalLine.replace(/^(\s*(?:[-*+]|\d+\.)\s+)\[[^\]]\]/, `$1${marker}`);
}

export function findTTasksLinkLine(lines: string[], taskPath: string, resolver?: LinkPathResolver): number {
	return findTTasksLinkLineFromSource(lines, taskPath, '', resolver);
}

function findTTasksLinkLineFromSource(
	lines: string[],
	taskPath: string,
	sourceFilePath: string,
	resolver?: LinkPathResolver,
): number {
	const normalizedTaskPath = normalizeWikiPath(taskPath);

	for (let i = 0; i < lines.length; i += 1) {
		const wikilinkPath = parseWikiLink(lines[i]);
		if (!wikilinkPath) continue;

		if (normalizeWikiPath(wikilinkPath) === normalizedTaskPath) {
			return i;
		}

		if (resolver?.(wikilinkPath, normalizedTaskPath, sourceFilePath)) {
			return i;
		}
	}

	return -1;
}

export async function syncCompletionToSource(
	task: Task,
	app: AppLike,
	completionStatus: string,
	options: CompletionSyncOptions = {},
): Promise<void> {
	if (!task.source) return;

	const sourcePath = parseWikiLink(task.source);
	if (!sourcePath) return;

	const file = app.vault.getAbstractFileByPath(ensureMdExt(sourcePath));
	if (!file || typeof (file as FileLike).path !== 'string') return;

	const typedFile = file as FileLike;
	const checked = task.status === completionStatus;

	// Cheap pre-check so the common "nothing to tick" case doesn't touch the file
	// at all — an identity write still bumps mtime and re-triggers the scan.
	const preview = rewriteSource(await app.vault.cachedRead(typedFile), task, typedFile.path, checked, options);
	if (preview === null) return;

	// The write itself re-derives from the content Obsidian hands the callback, so
	// an edit landing between the pre-check and here is preserved rather than
	// clobbered by a whole-file modify() built on the stale read.
	await app.vault.process(typedFile, (content) => {
		return rewriteSource(content, task, typedFile.path, checked, options) ?? content;
	});
}

/** Returns the updated file content, or null when this source needs no change. */
function rewriteSource(
	content: string,
	task: Task,
	sourceFilePath: string,
	checked: boolean,
	options: CompletionSyncOptions,
): string | null {
	const lines = content.split('\n');
	const linkLine = findTTasksLinkLineFromSource(lines, task.path, sourceFilePath, options.resolver);
	if (linkLine === -1) return null;

	const nextLine = buildUpdatedSourceLine(lines[linkLine], checked);
	if (nextLine === lines[linkLine]) return null;

	lines[linkLine] = nextLine;
	return lines.join('\n');
}
