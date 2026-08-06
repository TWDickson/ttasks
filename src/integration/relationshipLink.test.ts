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

	// A null alias means "we don't know this task's name". Writing one derived
	// from the filename would persist a fake title into the vault, so we write a
	// bare link instead and let Obsidian show the raw target — honestly broken.
	it('writes a bare link when the alias is unknown', () => {
		const generated = buildAliasedLink({
			targetPathWithoutExt: 'Tasks/abc123-gone',
			alias: null,
			sourcePath: 'Tasks/b.md',
			resolveFile: () => null,
		});

		expect(generated).toBe('[[Tasks/abc123-gone]]');
	});

	it('treats a blank alias as unknown', () => {
		const generated = buildAliasedLink({
			targetPathWithoutExt: 'Tasks/abc123-gone',
			alias: '   ',
			sourcePath: 'Tasks/b.md',
			resolveFile: () => null,
		});

		expect(generated).toBe('[[Tasks/abc123-gone]]');
	});

	it('passes undefined rather than a null alias to the Obsidian link generator', () => {
		const generateMarkdownLink = vi.fn(() => '[[abc123-gone]]');
		buildAliasedLink({
			targetPathWithoutExt: 'Tasks/abc123-gone',
			alias: null,
			sourcePath: 'Tasks/b.md',
			resolveFile: () => ({ path: 'Tasks/abc123-gone.md' }),
			generateMarkdownLink,
		});

		expect(generateMarkdownLink).toHaveBeenCalledWith(
			{ path: 'Tasks/abc123-gone.md' }, 'Tasks/b.md', undefined, undefined,
		);
	});
});
