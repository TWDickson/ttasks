import { type App, Modal } from 'obsidian';
import type { Readable, Writable } from 'svelte/store';
import TaskGraph from '../components/TaskGraph.svelte';
import type TTasksPlugin from '../main';
import type { Task } from '../types';
import type { TaskGroup } from '../query/types';

type GraphMode = 'dependency' | 'overview';

/**
 * Props needed to mount a standalone {@link TaskGraph}. Mirrors the subset of
 * TaskGraph's props the board passes; the modal reuses the same live stores
 * (`groups`, `activeTaskPath`) so the fullscreen copy stays in sync with the
 * board instance underneath it.
 */
export interface GraphExpandProps {
	plugin: TTasksPlugin;
	groups: Readable<TaskGroup[]>;
	statusColors: Record<string, string>;
	areaColors: Record<string, string>;
	activeTaskPath: Writable<string | null>;
	defaultGraphMode: GraphMode;
	onOpen: (path: string) => void;
	onContextMenu?: (task: Task, event: MouseEvent) => void;
}

/**
 * GP1: a (near-)fullscreen surface hosting the dependency/timeline graph, so the
 * graph is usable on mobile where its in-board leaf form is too cramped. Native
 * pop-out windows (`moveLeafToPopout`) are desktop-only and throw on mobile, so
 * a `Modal` is the one mechanism that works on both platforms. Obsidian modals
 * now implement `HistoryHandler` (1.10+), so the phone back gesture closes this
 * for free, alongside the in-graph collapse button and Esc.
 */
export class GraphExpandModal extends Modal {
	private component: TaskGraph | null = null;
	private readonly graphProps: GraphExpandProps;

	constructor(app: App, props: GraphExpandProps) {
		super(app);
		this.graphProps = props;
	}

	onOpen(): void {
		this.modalEl.addClass('tt-graph-fullscreen-modal');
		this.contentEl.addClass('tt-graph-fullscreen-content');

		this.component = new TaskGraph({
			target: this.contentEl,
			props: {
				...this.graphProps,
				// Opening a task slides the detail drawer in; on mobile it would sit
				// behind this modal, so close first, then hand off to the board's
				// open handler. The hand-off is deferred to the next frame *after*
				// close: closing a Modal pops Obsidian's history/focus stack, and if
				// we revealed the detail drawer synchronously that focus-restore could
				// land afterwards and leave the board on top (the "drawer opens behind"
				// symptom on mobile). rAF lets the close settle first.
				onOpen: (path: string) => {
					this.close();
					window.requestAnimationFrame(() => this.graphProps.onOpen(path));
				},
				// This instance IS the fullscreen surface: its toggle collapses back
				// to the board rather than opening another modal.
				isFullscreen: true,
				onToggleFullscreen: () => this.close(),
			},
		});
	}

	onClose(): void {
		this.component?.$destroy();
		this.component = null;
		this.contentEl.empty();
	}
}
