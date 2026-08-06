/**
 * Resolved badge colours.
 *
 * `areaColors` / `labelColors` / `statusColors` are `Record<string, string>`
 * maps in settings, so the views used to hold the raw maps and look a colour up
 * at every render. That made "is a colour configured?" a policy each call site
 * re-derived, twice over — once for the class and once for the style:
 *
 *     class:tt-badge-tinted={!!areaColors?.[task.area]}
 *     style={getBadgeStyle(areaColors?.[task.area])}
 *
 * …with `getBadgeStyle` copy-pasted into each component that needed it, which is
 * the same failure mode as a shared-looking CSS class defined inside one
 * component's `<style>` block.
 *
 * A `TaskBadge` resolves that once. Once you hold a badge, `badge.text`,
 * `badge.tinted` and `badge.style` are the answer — no map, no optional chain,
 * no per-site fallback. This mirrors `taskRef.ts`: build the index once, resolve
 * O(1), and let the resolved object carry the "it wasn't there" case instead of
 * leaving a `null` every caller must remember to check.
 *
 * Resolution is memoised per palette, so a board of 500 rows sharing three areas
 * allocates three badges — and the *same* three objects each render, which keeps
 * Svelte's change detection from seeing churn that isn't there.
 */

/** The colour maps a palette reads. A subset of `TTasksSettings`. */
export interface BadgeColorSettings {
	areaColors?: Record<string, string> | null;
	labelColors?: Record<string, string> | null;
	statusColors?: Record<string, string> | null;
}

/** A render-ready badge: text plus everything needed to colour it. */
export interface TaskBadge {
	/** The text to render. */
	text: string;
	/** The configured colour, or `null` when the user hasn't set one. */
	color: string | null;
	/** `color !== null`. Drives `class:tt-badge-tinted`. */
	tinted: boolean;
	/** Inline style carrying `--tt-badge-color`, or `''` when untinted. */
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
	/** Badge for an area name. */
	area(name: string): TaskBadge;
	/** Badge for a label value. */
	label(name: string): TaskBadge;
	/** Badge for a status name. */
	status(name: string): TaskBadge;
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

function makeBadge(text: string, color: string | undefined): TaskBadge {
	if (!color) return { text, color: null, tinted: false, style: '' };
	return { text, color, tinted: true, style: `--tt-badge-color:${color};` };
}

/** One memoised resolver over a single colour map. */
function badgeResolver(colors: Record<string, string> | null | undefined): (name: string) => TaskBadge {
	const source = colors ?? {};
	const cache = new Map<string, TaskBadge>();
	return (name: string): TaskBadge => {
		const cached = cache.get(name);
		if (cached) return cached;
		const badge = makeBadge(name, lookup(source, name));
		cache.set(name, badge);
		return badge;
	};
}

/**
 * Build one palette per settings change and pass it down in place of the three
 * raw colour maps. Cheap to build — the per-name work is deferred to first use.
 */
export function buildBadgePalette(settings: BadgeColorSettings | null | undefined): BadgePalette {
	const area = badgeResolver(settings?.areaColors);
	const label = badgeResolver(settings?.labelColors);
	const status = badgeResolver(settings?.statusColors);

	return {
		area,
		label,
		status,
		// Derived from the same resolution as the badge, so a spine and its badge
		// can never disagree about whether a colour is configured.
		areaSpine: (name) => (name ? area(name).color ?? undefined : undefined),
		statusAccent: (name) => status(name).color ?? DEFAULT_STATUS_ACCENT,
	};
}
