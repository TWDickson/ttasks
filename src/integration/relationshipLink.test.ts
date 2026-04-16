import { describe, expect, it, vi } from 'vitest';
import { buildAliasedLink } from './relationshipLink';

describe('buildAliasedLink', () => {
	it('uses generated markdown link when available', () => {
		const file = { path: 'Tasks/a.md' };
		const generated = buildAliasedLink({
			targetPathWithoutExt: 'Tasks/a',
			alias: 'Task A',
			sourcePath: 'Tasks/b.md',
			resolveFile: () => file,
			generateMarkdownLink: vi.fn(() => '[[a|Task A]]'),
		});

		expect(generated).toBe('[[a|Task A]]');
	});

	it('falls back to aliased wikilink when generation fails', () => {
		const generated = buildAliasedLink({
			targetPathWithoutExt: 'Tasks/a',
			alias: 'Task A',
			sourcePath: 'Tasks/b.md',
			resolveFile: () => null,
			generateMarkdownLink: undefined,
		});

		expect(generated).toBe('[[Tasks/a|Task A]]');
	});
});
