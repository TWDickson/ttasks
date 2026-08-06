/**
 * Display labels for task links.
 *
 * A wikilink can point at a path the store doesn't know about — a note that was
 * deleted, moved outside the tasks folder, or never existed. The old behaviour
 * was to fall back to the filename (`pathLeaf`), which strips the `{hex}-`
 * prefix and renders a bare slug like `scrape-the-barnacles`. That reads as a
 * real title, so a broken link looked identical to a working one and the
 * underlying data defect stayed invisible.
 *
 * Instead we surface the one thing a dangling link genuinely still carries: the
 * task id. It's stable across renames and it's what hash-prefix search matches
 * on, so `Missing task (6d1f2a)` is a label you can act on. Callers get
 * `resolved: false` alongside it so the UI can mark the link as broken rather
 * than styling it like a name.
 */

import { taskIdFromPath } from './pathUtils';

/** Placeholder used when a link resolves to nothing and carries no usable id. */
export const MISSING_TASK_LABEL = 'Missing task';

/** TTasks names task files `{6hex}-{slug}.md`; only that shape is a real id. */
const TASK_ID_PATTERN = /^[0-9a-f]{4,}$/i;

export interface TaskLabel {
	/** Safe to render. Either a real name, or the missing-link placeholder. */
	text: string;
	/** False when `text` is a placeholder rather than a task's actual name. */
	resolved: boolean;
}

/**
 * The placeholder for an unresolvable path, including its task id when the
 * filename follows the `{hex}-{slug}` convention. A path that doesn't (a plain
 * note dragged into a relationship field) contributes no id — we say nothing
 * rather than echo its filename back as if it were a title.
 */
export function missingTaskLabel(path: string | null | undefined): string {
	const id = taskIdFromPath((path ?? '').trim());
	return TASK_ID_PATTERN.test(id) ? `${MISSING_TASK_LABEL} (${id})` : MISSING_TASK_LABEL;
}

/**
 * Resolve `path` to a display label via `resolveName`, which returns the task's
 * `name` or a nullish value if the path is unknown. Blank names count as
 * unresolved — an empty `name` field is the same data defect as a missing note.
 */
export function resolveTaskLabel(
	path: string | null | undefined,
	resolveName: (path: string) => string | null | undefined,
): TaskLabel {
	const clean = (path ?? '').trim();
	if (!clean) return { text: MISSING_TASK_LABEL, resolved: false };

	const name = resolveName(clean);
	if (name && name.trim()) return { text: name.trim(), resolved: true };

	return { text: missingTaskLabel(clean), resolved: false };
}

/** `resolveTaskLabel` for the common case of a `path -> name` map. */
export function resolveTaskLabelFromMap(
	path: string | null | undefined,
	nameByPath: Map<string, string>,
): TaskLabel {
	return resolveTaskLabel(path, (p) => nameByPath.get(p));
}
