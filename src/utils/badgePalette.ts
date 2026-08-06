/**
 * Resolved identity colours.
 *
 * `areaColors` / `labelColors` / `statusColors` are `Record<string, string>`
 * maps in settings, so the views used to hold the raw maps and look a colour up
 * at every render — making "is a colour configured?" a policy each call site
 * re-derived, with its own optional chain and its own fallback.
 *
 * A palette resolves that once. Once you hold a `ResolvedColor`, `color` is the
 * answer and `null` means the user hasn't set one — no map, no per-site policy.
 * Same move as `taskRef.ts`: resolve at the edge, hand the UI an object.
 *
 * Resolution is memoised per palette, so a board of 500 rows sharing three areas
 * allocates three objects — and the *same* three each render, which keeps
 * Svelte's change detection from seeing churn that isn't there.
 *
 * **Where these colours actually land** (the colour-spine model): an area's
 * colour is the card/row left edge, a status' colour drives graph nodes, kanban
 * column headers and the impediment badge, and a label's colour only tints its
 * control in the create modal. Area and label *badges* are deliberately neutral
 * pills that read no colour at all — see `.tt-badge-cat` in styles.css. Don't
 * reintroduce a colour there without changing the spine model first.
 */

/** The colour maps a palette reads. A subset of `TTasksSettings`. */
export interface BadgeColorSettings {
	areaColors?: Record<string, string> | null;
	labelColors?: Record<string, string> | null;
	statusColors?: Record<string, string> | null;
}

/** One resolved colour, plus its ready-to-render inline form. */
export interface ResolvedColor {
	/** The configured colour, or `null` when the user hasn't set one. */
	color: string | null;
	/** Inline style carrying `--tt-badge-color`, or `''` when unset. */
	style: string;
}

/**
 * Graph nodes, timeline bars and track chips need *a* colour to mix against —
 * an unconfigured status can't leave the custom property unset there the way a
 * badge can, because `color-mix()` with an invalid argument drops the whole
 * declaration rather than degrading.
 */
export const DEFAULT_STATUS_ACCENT = 'var(--interactive-accent)';

export interface BadgePalette {
	/** An area's configured colour. Tints its control in the create modal. */
	area(name: string): ResolvedColor;
	/** A label's configured colour. Tints its control in the create modal. */
	label(name: string): ResolvedColor;
	/** A status' colour. Drives kanban headers and the impediment badge. */
	status(name: string): ResolvedColor;
	/**
	 * The colour-spine value for a task's area — `undefined` (not null) so it
	 * drops straight into `style:--tt-area-color`, which omits the property
	 * entirely for `undefined` and lets the CSS fallback apply.
	 */
	areaSpine(area: string | null | undefined): string | undefined;
	/** A status colour that is always usable. Falls back to the theme accent. */
	statusAccent(status: string): string;
}

/**
 * Read one entry. Own-property only, and string-valued only: these maps are
 * built from user frontmatter, so an area literally named `constructor` would
 * otherwise resolve through the prototype and yield a function.
 */
function lookup(source: Record<string, string>, name: string): string | undefined {
	if (!Object.prototype.hasOwnProperty.call(source, name)) return undefined;
	const value = source[name];
	return typeof value === 'string' && value !== '' ? value : undefined;
}

function makeColor(color: string | undefined): ResolvedColor {
	if (!color) return { color: null, style: '' };
	return { color, style: `--tt-badge-color:${color};` };
}

/** One memoised resolver over a single colour map. */
function colorResolver(colors: Record<string, string> | null | undefined): (name: string) => ResolvedColor {
	const source = colors ?? {};
	const cache = new Map<string, ResolvedColor>();
	return (name: string): ResolvedColor => {
		const cached = cache.get(name);
		if (cached) return cached;
		const resolved = makeColor(lookup(source, name));
		cache.set(name, resolved);
		return resolved;
	};
}

/**
 * Build one palette per settings change and pass it down in place of the three
 * raw colour maps. Cheap to build — the per-name work is deferred to first use.
 */
export function buildBadgePalette(settings: BadgeColorSettings | null | undefined): BadgePalette {
	const area = colorResolver(settings?.areaColors);
	const label = colorResolver(settings?.labelColors);
	const status = colorResolver(settings?.statusColors);

	return {
		area,
		label,
		status,
		// Derived from the same resolution the callers see, so the spine and a
		// status accent can never disagree about whether a colour is configured.
		areaSpine: (name) => (name ? area(name).color ?? undefined : undefined),
		statusAccent: (name) => status(name).color ?? DEFAULT_STATUS_ACCENT,
	};
}
