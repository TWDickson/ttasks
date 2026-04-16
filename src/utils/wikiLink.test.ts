import { describe, expect, it } from 'vitest';
import { parseWikiLink, parseWikiLinks, extractChecklistLink } from './wikiLink';

// ── parseWikiLink ─────────────────────────────────────────────────────────────
//
// Contract: extract the path portion from a `[[path|alias]]` or `[[path]]`
// string.  Returns null for anything that doesn't contain a valid wikilink.

describe('parseWikiLink', () => {
	it('extracts path from an aliased wikilink', () => {
		expect(parseWikiLink('[[Planner/Tasks/abc123-slug|My Task]]')).toBe('Planner/Tasks/abc123-slug');
	});

	it('extracts path from a non-aliased wikilink', () => {
		expect(parseWikiLink('[[Planner/Tasks/abc123-slug]]')).toBe('Planner/Tasks/abc123-slug');
	});

	it('returns null for null input', () => {
		expect(parseWikiLink(null)).toBeNull();
	});

	it('returns null for undefined input', () => {
		expect(parseWikiLink(undefined)).toBeNull();
	});

	it('returns null for empty string', () => {
		expect(parseWikiLink('')).toBeNull();
	});

	it('returns null for plain text with no wikilink', () => {
		expect(parseWikiLink('just plain text')).toBeNull();
	});

	it('returns the first match when text surrounds the wikilink', () => {
		expect(parseWikiLink('prefix [[path/task|Name]] suffix')).toBe('path/task');
	});

	it('handles paths with spaces', () => {
		expect(parseWikiLink('[[Planner/Tasks/my task|My Task]]')).toBe('Planner/Tasks/my task');
	});
});

// ── parseWikiLinks ────────────────────────────────────────────────────────────
//
// Contract: map an array of wikilink strings to their path portions, filtering
// out any that fail to parse.  Non-array input returns [].

describe('parseWikiLinks', () => {
	it('extracts paths from an array of aliased wikilinks', () => {
		expect(parseWikiLinks(['[[a/b|A]]', '[[c/d|C]]'])).toEqual(['a/b', 'c/d']);
	});

	it('returns empty array for empty input', () => {
		expect(parseWikiLinks([])).toEqual([]);
	});

	it('returns empty array for non-array string input', () => {
		expect(parseWikiLinks('not an array')).toEqual([]);
	});

	it('returns empty array for null input', () => {
		expect(parseWikiLinks(null)).toEqual([]);
	});

	it('filters out entries that do not parse as wikilinks', () => {
		expect(parseWikiLinks(['[[a/b|A]]', 'not a link', '[[c/d|C]]'])).toEqual(['a/b', 'c/d']);
	});

	it('handles mixed aliased and non-aliased entries', () => {
		expect(parseWikiLinks(['[[a/b|A]]', '[[c/d]]'])).toEqual(['a/b', 'c/d']);
	});
});

// ── extractChecklistLink ──────────────────────────────────────────────────────
//
// Contract: parse a markdown checklist line of the form:
//   `- [ ] [[path|alias]]`  or  `- [x] [[path|alias]]`
//
// Returns { checked, path } where path always ends in `.md`.
// Returns null if the line is not a wikilink checklist item.

describe('extractChecklistLink', () => {
	it('parses an unchecked item with an aliased wikilink', () => {
		expect(extractChecklistLink('- [ ] [[Planner/Tasks/abc123-slug|My Task]]'))
			.toEqual({ checked: false, path: 'Planner/Tasks/abc123-slug.md' });
	});

	it('parses a checked item with lowercase x', () => {
		expect(extractChecklistLink('- [x] [[Planner/Tasks/abc123-slug|My Task]]'))
			.toEqual({ checked: true, path: 'Planner/Tasks/abc123-slug.md' });
	});

	it('parses a checked item with uppercase X', () => {
		expect(extractChecklistLink('- [X] [[Planner/Tasks/abc123-slug|My Task]]'))
			.toEqual({ checked: true, path: 'Planner/Tasks/abc123-slug.md' });
	});

	it('handles indented checklist items', () => {
		expect(extractChecklistLink('    - [ ] [[path/task|Task]]'))
			.toEqual({ checked: false, path: 'path/task.md' });
	});

	it('handles tab-indented checklist items', () => {
		expect(extractChecklistLink('\t- [ ] [[path/task|Task]]'))
			.toEqual({ checked: false, path: 'path/task.md' });
	});

	it('handles a non-aliased wikilink', () => {
		expect(extractChecklistLink('- [ ] [[Planner/Tasks/abc123-slug]]'))
			.toEqual({ checked: false, path: 'Planner/Tasks/abc123-slug.md' });
	});

	it('does not double-add .md when path already ends in .md', () => {
		expect(extractChecklistLink('- [ ] [[Planner/Tasks/abc123-slug.md|My Task]]'))
			.toEqual({ checked: false, path: 'Planner/Tasks/abc123-slug.md' });
	});

	it('returns null for a plain text line', () => {
		expect(extractChecklistLink('Just a regular line')).toBeNull();
	});

	it('returns null for a checklist item without a wikilink', () => {
		expect(extractChecklistLink('- [ ] plain text task')).toBeNull();
	});

	it('returns null for an empty string', () => {
		expect(extractChecklistLink('')).toBeNull();
	});
});
