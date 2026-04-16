/**
 * Wiki-link parsing utilities for TTasks.
 *
 * Centralises the `[[path|alias]]` regex logic that previously lived as private
 * methods on TaskStore, making it independently testable and reusable.
 */

import { ensureMdExt } from './pathUtils';

const WIKILINK_RE = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/;

/**
 * Extract the path portion from a `[[path|alias]]` or `[[path]]` string.
 *
 * Returns null when the input is falsy or contains no valid wikilink.
 */
export function parseWikiLink(val: unknown): string | null {
	if (!val) return null;
	const match = String(val).match(WIKILINK_RE);
	return match ? (match[1] ?? null) : null;
}

/**
 * Map an array of wikilink strings to their path portions, filtering out any
 * entries that do not contain a valid wikilink.
 *
 * Returns [] for non-array input.
 */
export function parseWikiLinks(val: unknown): string[] {
	if (!Array.isArray(val)) return [];
	return val.map(v => parseWikiLink(v)).filter((v): v is string => v !== null);
}

/**
 * Parse a markdown checklist line of the form:
 *   `[indent]- [ ] [[path|alias]]`   →  { checked: false, path: 'path.md' }
 *   `[indent]- [x] [[path|alias]]`   →  { checked: true,  path: 'path.md' }
 *
 * The returned `path` always ends in `.md` so it matches vault file paths.
 * Returns null when the line is not a wikilink checklist item.
 */
export function extractChecklistLink(line: string): { checked: boolean; path: string } | null {
	const match = line.match(/^\s*- \[( |x|X)\]\s+\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/);
	if (!match) return null;
	const rawPath = (match[2] ?? '').trim();
	if (!rawPath) return null;
	return {
		checked: (match[1] ?? ' ').toLowerCase() === 'x',
		path: ensureMdExt(rawPath),
	};
}
