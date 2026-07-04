import type {
	Editor,
	EventRef,
	MarkdownView,
	Menu,
	TAbstractFile,
	Workspace,
} from 'obsidian';

export interface HoverLinkPayload {
	event: MouseEvent;
	source: string;
	hoverParent: unknown;
	targetEl: HTMLElement | null;
	linktext: string;
	sourcePath: string;
}

export type ExtendedWorkspace = Workspace & {
	trigger(event: 'hover-link', payload: HoverLinkPayload): void;
	on(event: 'editor-menu', callback: (menu: Menu, editor: Editor, view: MarkdownView) => void): EventRef;
	on(event: 'files-menu', callback: (menu: Menu, files: TAbstractFile[]) => void): EventRef;
};

/**
 * `setSize` is an undocumented member of the desktop sidedock splits. It is
 * optional here so callers stay guarded if Obsidian removes it.
 */
export type SidedockWithSize = Workspace['rightSplit'] & {
	setSize?: (size: number) => void;
};
