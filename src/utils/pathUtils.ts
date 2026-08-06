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

/*
 * `pathLeaf` used to live here: it reduced a task path to its slug and was used
 * as a fallback label wherever a task's `name` couldn't be resolved. That made
 * every dangling link render a plausible-looking title, so broken relationships
 * were invisible in the UI. It's deliberately gone — use `resolveTaskLabel`
 * from utils/taskLabel, which reports an unresolvable link as such.
 */

/**
 * Split a task filename into its `{id}-{slug}` halves at the first dash.
 * The id is the task's stable identity — it survives renames, and it's what
 * hash-prefix search matches on.
 *
 * A basename with no dash is treated as all id and no slug, which is what
 * `TaskStore` has always done for hand-created notes.
 */
export function splitTaskBasename(basename: string): { id: string; slug: string } {
	const dashIdx = basename.indexOf('-');
	if (dashIdx < 0) return { id: basename, slug: '' };
	return { id: basename.substring(0, dashIdx), slug: basename.substring(dashIdx + 1) };
}

/** The `{id}` half of a task's filename, given its full vault path. */
export function taskIdFromPath(path: string): string {
	const leaf = path.split('/').pop() ?? path;
	return splitTaskBasename(stripMdExt(leaf)).id;
}
