/**
 * Search-term parsing for TTasks' free-text search box.
 *
 * Task notes are named `{6hex}-{slug}.md`, and that hex prefix is the only
 * stable identity a task has — it survives renames, and it's what shows up in
 * URLs, share exports, and `ttasks://` links. So the search box accepts it:
 *
 * - **`#a1b2`** — the sigil form. Matches on the task's id prefix *only*;
 *   name and notes are not considered. Use it when a hash also appears in the
 *   text of a task, or when a short prefix would otherwise be swamped.
 * - **`a1b2c3`** — a bare term that is all-hex and at least
 *   {@link MIN_BARE_HEX_LENGTH} characters long *additionally* matches on id
 *   prefix, on top of the usual name/notes match. Pasting a full hash then
 *   just works without learning any syntax.
 *
 * The minimum length on the bare form is what keeps it from being noisy: at
 * three hex characters a stray id collision runs about 1 in 4096 per task,
 * whereas one- and two-character terms would drag in a handful of unrelated
 * tasks on every keystroke.
 *
 * A `#` term that isn't valid hex (`#bug`, and Obsidian tags generally) falls
 * back to a plain text search for the literal string, so the sigil never
 * silently eats a query it can't serve.
 *
 * Pure module — no Obsidian imports (see `architectureBoundaries.test.ts`).
 */

/** Shortest bare hex run that also matches on id prefix. */
export const MIN_BARE_HEX_LENGTH = 3;

const HEX_ONLY = /^[0-9a-f]+$/;

/** A parsed search term: what to match, and where. */
export interface SearchTerm {
	/** Lower-cased text to match against name/notes. Empty when `idOnly`. */
	text: string;
	/** Lower-cased hex prefix to match against `Task.id`, or null if none applies. */
	idPrefix: string | null;
	/** True for the `#` sigil form — match id only, ignore name/notes. */
	idOnly: boolean;
}

/** The subset of a task that search reads. */
export interface SearchableTask {
	id: string;
	name: string;
	notes?: string;
}

/**
 * Parse a raw search box string into a {@link SearchTerm}.
 * Returns null for an empty or whitespace-only string — meaning "no search",
 * which callers should treat as matching everything rather than nothing.
 */
export function parseSearchTerm(raw: string): SearchTerm | null {
	const trimmed = raw.trim().toLowerCase();
	if (!trimmed) return null;

	if (trimmed.startsWith('#')) {
		const rest = trimmed.slice(1);
		if (rest && HEX_ONLY.test(rest)) {
			return { text: '', idPrefix: rest, idOnly: true };
		}
		// Not a hash — search for the literal text, `#` included.
		return { text: trimmed, idPrefix: null, idOnly: false };
	}

	const idPrefix =
		trimmed.length >= MIN_BARE_HEX_LENGTH && HEX_ONLY.test(trimmed) ? trimmed : null;

	return { text: trimmed, idPrefix, idOnly: false };
}

/** Whether a task satisfies a parsed search term. */
export function matchesSearchTerm(task: SearchableTask, term: SearchTerm): boolean {
	if (term.idPrefix && task.id.toLowerCase().startsWith(term.idPrefix)) {
		return true;
	}
	if (term.idOnly) return false;

	return (
		task.name.toLowerCase().includes(term.text) ||
		(task.notes ?? '').toLowerCase().includes(term.text)
	);
}

/**
 * Convenience wrapper: filter a list by a raw search string.
 * An empty search returns the list unchanged.
 */
export function filterBySearch<T extends SearchableTask>(tasks: T[], raw: string): T[] {
	const term = parseSearchTerm(raw);
	if (!term) return tasks;
	return tasks.filter(t => matchesSearchTerm(t, term));
}
