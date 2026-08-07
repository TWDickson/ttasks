/* Asking "is this file open in an editor?" without touching `leaf.view`.
 *
 * Since Obsidian 1.7.2 — which is our `minAppVersion` — a tab that isn't in the
 * foreground holds a `DeferredView` placeholder instead of the real `MarkdownView`,
 * and a `DeferredView` has no `file`. Reaching through `leaf.view.file.path` is
 * exactly the cast the API tells you not to make ("Do not attempt to cast this to
 * your custom View without first checking instanceof"), and it answers *false* for
 * a note that is genuinely open, merely in a background tab.
 *
 * The leaf's view *state* has no such gap: `getLeavesOfType('markdown')` matches
 * deferred leaves, and their persisted state still names the file. Same technique
 * as `leafHygiene.ts` — read the state, not the live view.
 */

/** The slice of `WorkspaceLeaf` this module touches. */
export interface FileLeaf {
	getViewState(): { type?: string; state?: Record<string, unknown> };
}

/** The slice of `Workspace` this module touches. */
export interface FileLeafWorkspace {
	getLeavesOfType(viewType: string): FileLeaf[];
}

/**
 * True when `path` is open in any markdown tab, foreground or background.
 *
 * A false negative here is not cosmetic: callers use it to decide whether to let
 * the editor flush before a whole-body rewrite, so getting it wrong can drop the
 * user's unsaved edits.
 */
export function isPathOpenInMarkdownEditor(workspace: FileLeafWorkspace, path: string): boolean {
	return workspace.getLeavesOfType('markdown').some((leaf) => {
		const file = leaf.getViewState().state?.file;
		return typeof file === 'string' && file === path;
	});
}
