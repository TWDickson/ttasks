import { ItemView, WorkspaceLeaf } from 'obsidian';
import type TTasksPlugin from '../main';
import PomodoroPane from '../components/PomodoroPane.svelte';
import { FocusUntilModal } from '../modals/FocusUntilModal';

export const TASK_POMODORO_VIEW_TYPE = 'ttasks-pomodoro';

/**
 * Sidebar leaf hosting the dedicated Pomodoro pane — the timer's home, separate
 * from the task detail pane. Reflects the single shared session from
 * PomodoroService and drives it through the service API. Starting/until-ing from
 * here is untethered (no task); a task's own detail pane still starts a session
 * bound to that task.
 */
export class PomodoroView extends ItemView {
	private plugin: TTasksPlugin;
	private component: PomodoroPane | null = null;

	constructor(leaf: WorkspaceLeaf, plugin: TTasksPlugin) {
		super(leaf);
		this.plugin = plugin;
		this.navigation = false;
	}

	getViewType():    string { return TASK_POMODORO_VIEW_TYPE; }
	getDisplayText(): string { return 'Pomodoro'; }
	getIcon():        string { return 'timer'; }

	async onOpen(): Promise<void> {
		this.contentEl.addClass('tt-pomodoro-view');
		this.component = new PomodoroPane({
			target: this.contentEl,
			props: {
				session: this.plugin.pomodoroService.session,
				focusMinutes: this.plugin.settings.pomodoro.focusMinutes,
				onStart: () => this.plugin.pomodoroService.start(null, null),
				onFocusUntil: () => new FocusUntilModal(this.app, this.plugin, null, null).open(),
				onToggle: () => this.plugin.pomodoroService.toggle(),
				onSkip: () => this.plugin.pomodoroService.skip(),
				onStop: () => this.plugin.pomodoroService.stop(),
				onOpenTask: (path: string) => {
					if (path) void this.plugin.taskStore.openFile(path);
				},
			},
		});
	}

	async onClose(): Promise<void> {
		this.component?.$destroy();
		this.component = null;
		this.contentEl.empty();
	}
}
