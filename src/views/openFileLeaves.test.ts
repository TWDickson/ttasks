import { describe, expect, it } from 'vitest';
import { isPathOpenInMarkdownEditor, type FileLeaf } from './openFileLeaves';

function leafFor(file: string | undefined): FileLeaf {
	return { getViewState: () => ({ type: 'markdown', state: file === undefined ? {} : { file } }) };
}

function workspaceOf(markdownLeaves: FileLeaf[], others: Record<string, FileLeaf[]> = {}) {
	return {
		getLeavesOfType: (type: string) => (type === 'markdown' ? markdownLeaves : others[type] ?? []),
	};
}

describe('isPathOpenInMarkdownEditor', () => {
	it('finds a file open in a background (deferred) tab', () => {
		// The regression this module exists for: a deferred leaf has no live
		// `view.file`, but its view state still names the note.
		const workspace = workspaceOf([leafFor('Tasks/a1b2c3-thing.md')]);

		expect(isPathOpenInMarkdownEditor(workspace, 'Tasks/a1b2c3-thing.md')).toBe(true);
	});

	it('finds the file when several tabs are open and only one matches', () => {
		const workspace = workspaceOf([
			leafFor('Daily/2026-08-07.md'),
			leafFor('Tasks/a1b2c3-thing.md'),
			leafFor('Archive/old.md'),
		]);

		expect(isPathOpenInMarkdownEditor(workspace, 'Tasks/a1b2c3-thing.md')).toBe(true);
	});

	it('is false when no markdown tab holds the file', () => {
		const workspace = workspaceOf([leafFor('Daily/2026-08-07.md')]);

		expect(isPathOpenInMarkdownEditor(workspace, 'Tasks/a1b2c3-thing.md')).toBe(false);
	});

	it('is false with no markdown tabs open at all', () => {
		expect(isPathOpenInMarkdownEditor(workspaceOf([]), 'Tasks/a1b2c3-thing.md')).toBe(false);
	});

	it('does not match on a prefix or a same-named file in another folder', () => {
		const workspace = workspaceOf([leafFor('Archive/Tasks/a1b2c3-thing.md')]);

		expect(isPathOpenInMarkdownEditor(workspace, 'Tasks/a1b2c3-thing.md')).toBe(false);
	});

	it('tolerates a leaf whose state carries no file', () => {
		// A brand-new empty markdown leaf, or one Obsidian has not populated yet.
		const workspace = workspaceOf([leafFor(undefined), leafFor('Tasks/a1b2c3-thing.md')]);

		expect(isPathOpenInMarkdownEditor(workspace, 'Tasks/a1b2c3-thing.md')).toBe(true);
	});

	it('ignores non-markdown leaves holding the same path', () => {
		const workspace = workspaceOf([], { 'ttasks-detail': [leafFor('Tasks/a1b2c3-thing.md')] });

		expect(isPathOpenInMarkdownEditor(workspace, 'Tasks/a1b2c3-thing.md')).toBe(false);
	});
});
