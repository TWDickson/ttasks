import { ItemView, WorkspaceLeaf } from 'obsidian';
import { derived, get, writable, type Writable } from 'svelte/store';
import type TTasksPlugin from '../main';
import PomodoroPane from '../components/PomodoroPane.svelte';
import { FocusUntilModal } from '../modals/FocusUntilModal';
import { TaskJumpSuggestModal } from '../editor/TaskJumpSuggestModal';

export const TASK_POMODORO_VIEW_TYPE = 'ttasks-pomodoro';

/**
 * Sidebar leaf hosting the dedicated Pomodoro pane — the timer's home, separate
 * from the task detail pane. Reflects the single shared session from
 * PomodoroService and drives it through the service API. Starting/until-ing from
 * here is untethered by default, but "Choose a task…" lets you pick one first so
 * Start/Focus-until run tethered to it, same as starting from a task's own
 * detail pane.
 */
export class PomodoroView extends ItemView {
	private plugin: TTasksPlugin;
	private component: PomodoroPane | null = null;
	/** Task chosen (but not yet started) via "Choose a task…"; cleared once a session begins. */
	private pickedTask: Writable<{ path: string; name: string } | null> = writable(null);

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
		const dialStyle = derived(this.plugin.settingsRevision, () => this.plugin.settings.pomodoro.dialStyle);
		this.component = new PomodoroPane({
			target: this.contentEl,
			props: {
				session: this.plugin.pomodoroService.session,
				focusMinutes: this.plugin.settings.pomodoro.focusMinutes,
				dialStyle,
				pickedTask: this.pickedTask,
				onStart: () => {
					const task = get(this.pickedTask);
					this.plugin.pomodoroService.start(task?.path ?? null, task?.name ?? null);
					this.pickedTask.set(null);
				},
				onFocusUntil: () => {
					const task = get(this.pickedTask);
					new FocusUntilModal(this.app, this.plugin, task?.path ?? null, task?.name ?? null).open();
					this.pickedTask.set(null);
				},
				onToggle: () => this.plugin.pomodoroService.toggle(),
				onSkip: () => this.plugin.pomodoroService.skip(),
				onStop: () => this.plugin.pomodoroService.stop(),
				onOpenTask: (path: string) => {
					if (path) void this.plugin.taskStore.openFile(path);
				},
				onOpenSettings: () => this.plugin.openPluginSettings('pomodoro'),
				onPickTask: () => this.openTaskPicker(),
				onClearPickedTask: () => this.pickedTask.set(null),
			},
		});
	}

	private openTaskPicker(): void {
		const tasks = get(this.plugin.taskStore.tasks).filter((task) => !task.is_complete);
		if (tasks.length === 0) return;
		new TaskJumpSuggestModal(this.app, tasks, (task) => {
			this.pickedTask.set({ path: task.path, name: task.name });
		}, '', 'Choose a task to focus on...').open();
	}

	async onClose(): Promise<void> {
		this.component?.$destroy();
		this.component = null;
		this.contentEl.empty();
	}
}
