import { describe, expect, it } from 'vitest';
import { ensureMdExt, pathLeaf, stripMdExt } from './pathUtils';

// ── ensureMdExt ───────────────────────────────────────────────────────────────
//
// Contract: return the path with a `.md` extension, adding one if absent.
// Must be idempotent — calling twice should not double-add `.md`.

describe('ensureMdExt', () => {
	it('adds .md to a bare path', () => {
		expect(ensureMdExt('Planner/Tasks/abc123-slug')).toBe('Planner/Tasks/abc123-slug.md');
	});

	it('does not double-add .md', () => {
		expect(ensureMdExt('Planner/Tasks/abc123-slug.md')).toBe('Planner/Tasks/abc123-slug.md');
	});

	it('returns empty string unchanged', () => {
		expect(ensureMdExt('')).toBe('');
	});

	it('handles a bare filename with no folder', () => {
		expect(ensureMdExt('abc123-slug')).toBe('abc123-slug.md');
	});

	it('only checks for lowercase .md (case-sensitive)', () => {
		// .MD is not the same as .md — should still append .md
		expect(ensureMdExt('Foo.MD')).toBe('Foo.MD.md');
	});

	it('is idempotent — calling twice gives the same result', () => {
		const once = ensureMdExt('path/to/task');
		expect(ensureMdExt(once)).toBe(once);
	});
});

// ── stripMdExt ────────────────────────────────────────────────────────────────
//
// Contract: return the path with a trailing `.md` removed.
// Must be idempotent — calling twice should not change the result.

describe('stripMdExt', () => {
	it('removes .md from a path', () => {
		expect(stripMdExt('Planner/Tasks/abc123-slug.md')).toBe('Planner/Tasks/abc123-slug');
	});

	it('is idempotent — no change if no .md', () => {
		expect(stripMdExt('Planner/Tasks/abc123-slug')).toBe('Planner/Tasks/abc123-slug');
	});

	it('returns empty string unchanged', () => {
		expect(stripMdExt('')).toBe('');
	});

	it('only strips the trailing .md, not .md mid-path', () => {
		expect(stripMdExt('Planner/Tasks.md/abc123-slug.md')).toBe('Planner/Tasks.md/abc123-slug');
	});

	it('calling twice gives the same result', () => {
		const once = stripMdExt('path/to/task.md');
		expect(stripMdExt(once)).toBe(once);
	});

	it('ensureMdExt and stripMdExt are inverse operations', () => {
		const path = 'Planner/Tasks/abc123-slug';
		expect(stripMdExt(ensureMdExt(path))).toBe(path);
		expect(ensureMdExt(stripMdExt(path + '.md'))).toBe(path + '.md');
	});
});

// ── pathLeaf ──────────────────────────────────────────────────────────────────
//
// Contract: strip the folder, the trailing `.md`, and the leading `{hex}-`
// filename prefix, yielding a fallback display label.

describe('pathLeaf', () => {
	it('strips folder, .md, and the hex prefix', () => {
		expect(pathLeaf('Planner/Tasks/a1b2c3-buy-milk.md')).toBe('buy-milk');
	});

	it('handles a bare filename with no folder', () => {
		expect(pathLeaf('a1b2c3-buy-milk.md')).toBe('buy-milk');
	});

	it('leaves a slug without a hex prefix intact', () => {
		expect(pathLeaf('Planner/Tasks/buy-milk.md')).toBe('buy-milk');
	});

	it('only strips a leading hex-digit prefix, not arbitrary words', () => {
		// "notes" contains non-hex letters, so it is not treated as a prefix.
		expect(pathLeaf('Planner/notes-2024.md')).toBe('notes-2024');
	});

	it('works on a path with no extension', () => {
		expect(pathLeaf('Planner/Tasks/deadbeef-slug')).toBe('slug');
	});
});
