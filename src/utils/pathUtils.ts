/**
 * Path utilities for TTasks.
 *
 * Centralises the `.md` extension handling that previously appeared as inline
 * `path.replace(/\.md$/, '')` or `path.endsWith('.md') ? path : path + '.md'`
 * expressions scattered across ~11 files.
 */

/**
 * Return `path` with a `.md` extension, adding one if absent.
 * Idempotent — calling twice returns the same result.
 * Returns an empty string unchanged.
 */
export function ensureMdExt(path: string): string {
	if (!path) return path;
	return path.endsWith('.md') ? path : `${path}.md`;
}

/**
 * Return `path` with any trailing `.md` extension removed.
 * Idempotent — calling twice returns the same result.
 * Returns an empty string unchanged.
 */
export function stripMdExt(path: string): string {
	if (!path) return path;
	return path.endsWith('.md') ? path.slice(0, -3) : path;
}
