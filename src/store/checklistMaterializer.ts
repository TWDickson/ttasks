export interface ChecklistLink {
	checked: boolean;
	path: string;
}

interface ChecklistStackEntry {
	indent: number;
	path: string;
}

function indentationWidth(indent: string): number {
	let width = 0;
	for (const ch of indent) {
		width += ch === '\t' ? 4 : 1;
	}
	return width;
}

export async function materializeChecklistChildren(options: {
	body: string;
	parentPath: string;
	extractChecklistLink: (line: string) => ChecklistLink | null;
	createChecklistChild: (content: string, parentPath: string) => Promise<{ path: string; name: string }>;
}): Promise<string> {
	const { body, parentPath, extractChecklistLink, createChecklistChild } = options;
	if (!body) return body;

	const lines = body.split('\n');
	let inFence = false;
	let changed = false;
	const checklistStack: ChecklistStackEntry[] = [];

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		const trimmed = line.trimStart();
		if (trimmed.startsWith('```')) {
			inFence = !inFence;
			continue;
		}
		if (inFence) continue;

		const match = line.match(/^(\s*)- \[( |x|X)\]\s+(.+)$/);
		if (!match) continue;

		const indent = match[1] ?? '';
		const checkedMarker = (match[2] ?? ' ').toLowerCase();
		const content = (match[3] ?? '').trim();
		const indentWidth = indentationWidth(indent);

		while (checklistStack.length > 0 && checklistStack[checklistStack.length - 1]!.indent >= indentWidth) {
			checklistStack.pop();
		}

		const linked = extractChecklistLink(line);
		if (linked?.path) {
			checklistStack.push({ indent: indentWidth, path: linked.path });
			continue;
		}

		if (!content || checkedMarker !== ' ') continue;

		const effectiveParentPath = checklistStack.length > 0
			? checklistStack[checklistStack.length - 1]!.path
			: parentPath;
		const child = await createChecklistChild(content, effectiveParentPath);
		const childPath = child.path.replace(/\.md$/, '');
		lines[i] = `${indent}- [ ] [[${childPath}|${child.name}]]`;
		checklistStack.push({ indent: indentWidth, path: child.path });
		changed = true;
	}

	if (!changed) return body;
	return lines.join('\n').trim();
}