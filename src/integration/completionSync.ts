import type { Task } from '../types';
import { ensureMdExt, stripMdExt } from '../utils/pathUtils';
import { parseWikiLink } from '../utils/wikiLink';

interface FileLike {
	path: string;
}

interface AppLike {
	vault: {
		getAbstractFileByPath(path: string): unknown;
		read(file: FileLike): Promise<string>;
		modify(file: FileLike, content: string): Promise<void>;
	};
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

export function findTTasksLinkLine(lines: string[], taskPathFragment: string): number {
	for (let i = 0; i < lines.length; i += 1) {
		if (lines[i].includes(`[[${taskPathFragment}`)) {
			return i;
		}
	}
	return -1;
}

export async function syncCompletionToSource(
	task: Task,
	app: AppLike,
	completionStatus: string,
): Promise<void> {
	if (!task.source) return;

	const sourcePath = parseWikiLink(task.source);
	if (!sourcePath) return;

	const file = app.vault.getAbstractFileByPath(ensureMdExt(sourcePath));
	if (!file || typeof (file as FileLike).path !== 'string') return;

	const typedFile = file as FileLike;
	const content = await app.vault.read(typedFile);
	const lines = content.split('\n');
	const linkLine = findTTasksLinkLine(lines, stripMdExt(task.path));
	if (linkLine === -1) return;

	const nextLine = buildUpdatedSourceLine(lines[linkLine], task.status === completionStatus);
	if (nextLine === lines[linkLine]) return;

	lines[linkLine] = nextLine;
	await app.vault.modify(typedFile, lines.join('\n'));
}
