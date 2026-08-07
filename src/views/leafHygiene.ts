/* Repairing the workspace layout after the plugin was absent for a session.
 *
 * Obsidian persists every sidebar leaf into workspace.json (workspace-mobile.json
 * on mobile) as `{ type, state }`, and restores it on launch whether or not the
 * plugin that owns that type is loaded. If TTasks is disabled — or simply not
 * installed on that device yet — our leaves come back as dead tabs: Obsidian has
 * no registered view for `ttasks-rail`, so it renders the placeholder ("ghost")
 * icon. Enabling the plugin later does not retroactively rehydrate them, because
 * `registerView` only affects leaves created *after* it runs.
 *
 * That leaves two things to repair, and this module does both structurally so it
 * can be tested without an Obsidian runtime:
 *
 *   1. A ghost still declares our type in its persisted view state even though
 *      its live view isn't ours. Re-applying that state builds the real view in
 *      place, so the tab comes back to life instead of staying dead.
 *   2. Whatever ghosts couldn't be revived, plus any leaf we duplicated in an
 *      earlier session, are collapsed to one leaf per type.
 *
 * Both steps are scoped strictly to view types we own — an unrelated dead tab
 * from some other plugin is none of our business, and a leaf whose persisted
 * type Obsidian has already discarded is indistinguishable from an ordinary
 * empty tab, so it is deliberately left for the user to close.
 */

/** The slice of `WorkspaceLeaf` this module touches. */
export interface HygieneLeaf {
	getViewState(): { type?: string; state?: Record<string, unknown> };
	setViewState(state: { type: string; state?: Record<string, unknown> }): Promise<void> | void;
	detach(): void;
	view: { getViewType(): string };
}

/** The slice of `Workspace` this module touches. */
export interface HygieneWorkspace {
	iterateAllLeaves(callback: (leaf: HygieneLeaf) => void): void;
}

export interface LeafHygieneResult {
	/** Ghost leaves whose persisted type we re-applied to rebuild the real view. */
	rehydrated: number;
	/** Surplus leaves detached so each view type is left with exactly one. */
	detached: number;
}

/**
 * Rehydrate ghost leaves and collapse duplicates for the given view types.
 *
 * Deliberately keeps the *first* leaf of each type in workspace iteration order:
 * that is the one the user's saved layout put earliest, so their sidebar keeps
 * the position they chose rather than jumping to wherever the newest duplicate
 * landed.
 */
export async function repairPluginLeaves(
	workspace: HygieneWorkspace,
	viewTypes: readonly string[],
): Promise<LeafHygieneResult> {
	const owned = new Set(viewTypes);
	const byType = new Map<string, HygieneLeaf[]>();

	workspace.iterateAllLeaves((leaf) => {
		/* The persisted state, not `leaf.view.getViewType()` — a ghost's live view
		   is Obsidian's placeholder, but its saved state still names us. */
		const type = leaf.getViewState().type;
		if (!type || !owned.has(type)) return;
		const existing = byType.get(type);
		if (existing) existing.push(leaf);
		else byType.set(type, [leaf]);
	});

	let rehydrated = 0;
	let detached = 0;

	for (const [type, leaves] of byType) {
		/* Detach the surplus before rehydrating, so we never pay to build a view
		   we're about to throw away. */
		for (const surplus of leaves.slice(1)) {
			surplus.detach();
			detached += 1;
		}

		const keep = leaves[0];
		if (keep.view.getViewType() === type) continue;
		await keep.setViewState({ type, state: keep.getViewState().state });
		rehydrated += 1;
	}

	return { rehydrated, detached };
}
