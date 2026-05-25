export interface ParsedCheckbox {
	raw: string;
	statusChar: string;
	checked: boolean;
	cancelled: boolean;
	text: string;
	indentLevel: number;
	hasTTasksLink: boolean;
}

const CHECKBOX_PATTERN = /^([ \t]*)(?:[-*+]|\d+\.)\s+\[([^\]])\](?:\s(.*))?$/;

function getIndentLevel(indent: string): number {
	let level = 0;
	let pendingSpaces = 0;

	for (const char of indent) {
		if (char === '\t') {
			level += 1;
			pendingSpaces = 0;
			continue;
		}

		pendingSpaces += 1;
		if (pendingSpaces === 2) {
			level += 1;
			pendingSpaces = 0;
		}
	}

	return level;
}

function normalizeFolderPath(tasksFolder: string): string {
	return tasksFolder.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
}

export function isTTasksLink(text: string, tasksFolder: string): boolean {
	const normalizedFolder = normalizeFolderPath(tasksFolder);
	if (!normalizedFolder) {
		return false;
	}

	const wikiLinkPattern = /\[\[([^\]|#]+)(?:[#|][^\]]*)?\]\]/g;
	for (const match of text.matchAll(wikiLinkPattern)) {
		const linkPath = normalizeFolderPath(match[1] ?? '');
		if (linkPath === normalizedFolder || linkPath.startsWith(`${normalizedFolder}/`)) {
			return true;
		}
	}

	return false;
}

export function parseCheckboxLine(line: string): ParsedCheckbox | null {
	const match = line.match(CHECKBOX_PATTERN);
	if (!match) {
		return null;
	}

	const indent = match[1] ?? '';
	const statusChar = match[2] ?? ' ';
	const text = (match[3] ?? '').trim();

	return {
		raw: line,
		statusChar,
		checked: statusChar === 'x' || statusChar === 'X',
		cancelled: statusChar === '-',
		text,
		indentLevel: getIndentLevel(indent),
		hasTTasksLink: isTTasksLink(text, 'Planner/Tasks'),
	};
}