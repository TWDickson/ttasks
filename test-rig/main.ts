/* Visual test rig entry. Mounts the real TaskBoard against an in-memory plugin
   mock, with the vault's actual Obsidian app.css + theme so renders match the
   app. URL params (used by shots.mjs and shareable by hand):
     ?theme=light|dark   ?view=list|kanban|agenda|graph|timeline|logbook|today|inbox
     ?detail=1 (open first task's detail)   ?modal=1 (open Create Task modal) */

import './vendor/obsidian-app.css';
import './vendor/theme-underwater.css';
import '../styles.css';
import './rig.css';

import { derived, get, writable } from 'svelte/store';
import TaskBoard from '../src/components/TaskBoard.svelte';
import TaskRail from '../src/components/TaskRail.svelte';
import TaskDetail from '../src/components/TaskDetail.svelte';
import PomodoroPane from '../src/components/PomodoroPane.svelte';
import { setIcon } from './obsidian-shim';
import { pomodoroStatusBarView } from '../src/integration/pomodoroStatusBar';
import type { PomodoroSession } from '../src/integration/pomodoro';
import { CreateTaskModal } from '../src/modals/CreateTaskModal';
import { FocusUntilModal } from '../src/modals/FocusUntilModal';
import { ShareSyncModal } from '../src/modals/ShareSyncModal';
import { combineBoardTasks, createBoardStateService } from '../src/store/BoardStateService';
import { getRegisteredTaskViews } from '../src/views/viewRegistry';
import { buildRigPlugin } from './fixtures';
import { fetchVaultPayload, mapVaultTasks } from './vaultTasks';

const params = new URLSearchParams(window.location.search);
const theme = params.get('theme') === 'light' ? 'light' : 'dark';
const viewId = params.get('view') ?? 'list';

// Real vault data by default (?data=fixtures forces the synthetic set)
const vaultPayload = params.get('data') === 'fixtures' ? null : await fetchVaultPayload();
const dataSource = vaultPayload ? 'vault' : 'fixtures';

function applyTheme(next: 'dark' | 'light'): void {
	document.body.classList.toggle('theme-dark', next === 'dark');
	document.body.classList.toggle('theme-light', next === 'light');
}

document.body.classList.add('mod-windows', 'obsidian-app');
applyTheme(theme);

const plugin = buildRigPlugin(vaultPayload
	? { tasks: mapVaultTasks(vaultPayload), settings: vaultPayload.settings ?? undefined }
	: {});

const boardState = createBoardStateService({
	defaultViewId: viewId,
	activeTaskPath: plugin.activeTaskPath,
	focusedTaskPath: plugin.focusedTaskPath,
});

// ── Rig chrome ───────────────────────────────────────────────────────────────

const root = document.getElementById('rig')!;
const bar = root.createDiv({ cls: 'rig-bar' });
bar.createSpan({ cls: 'rig-bar-title', text: 'TTasks rig' });
// `?chrome=0` hides the rig's own toolbar so a screenshot shows only the plugin.
if (params.get('chrome') === '0') bar.addClass('is-hidden');

const themeBtn = bar.createEl('button', { text: theme === 'dark' ? 'Light theme' : 'Dark theme' });
themeBtn.addEventListener('click', () => {
	const nowDark = document.body.classList.contains('theme-dark');
	applyTheme(nowDark ? 'light' : 'dark');
	themeBtn.setText(nowDark ? 'Dark theme' : 'Light theme');
});

for (const id of ['list', 'kanban', 'agenda', 'graph', 'timeline', 'today', 'inbox', 'logbook']) {
	const btn = bar.createEl('button', { text: id });
	if (id === viewId) btn.addClass('is-active');
	btn.addEventListener('click', () => {
		boardState.currentViewId.set(id);
		bar.querySelectorAll('button.is-active').forEach((b) => b.classList.remove('is-active'));
		btn.classList.add('is-active');
	});
}

bar.createSpan({ cls: 'rig-bar-spacer' });

const detailBtn = bar.createEl('button', { text: 'Open detail' });
detailBtn.addEventListener('click', () => openFirstDetail());

const modalBtn = bar.createEl('button', { text: 'Create modal' });
modalBtn.addEventListener('click', () => {
	new CreateTaskModal(plugin.app as never, plugin as never).open();
});

const dataBtn = bar.createEl('button', {
	text: dataSource === 'vault' ? 'Data: vault' : 'Data: fixtures',
	title: 'Toggle between real vault tasks and synthetic fixtures',
});
dataBtn.addEventListener('click', () => {
	const next = new URL(window.location.href);
	next.searchParams.set('data', dataSource === 'vault' ? 'fixtures' : 'vault');
	window.location.href = next.toString();
});

// ── Pomodoro pane scene ──────────────────────────────────────────────────────
// ?pomo=idle | active mounts just the dedicated Pomodoro pane for visual checks.
// ?dial=digital | ring | ring-plain picks the dial style (defaults to settings).
const pomoScene = params.get('pomo');
if (pomoScene) {
	const pomoStage = root.createDiv({ cls: 'rig-stage' });
	const pomoPane = pomoStage.createDiv({ cls: 'rig-detail tt-pomodoro-view' });
	pomoStage.classList.add('detail-open');
	if (pomoScene === 'active') {
		// A focus-until session so the "final"/target affordances show too.
		plugin.pomodoroService.startUntil(null, null, 33);
	}
	const dialParam = params.get('dial');
	if (dialParam === 'digital' || dialParam === 'ring' || dialParam === 'ring-plain') {
		plugin.settings.pomodoro.dialStyle = dialParam;
	}
	const pickedTask = writable<{ path: string; name: string } | null>(
		params.get('picked') ? { path: 'Tasks/rig-picked.md', name: 'Rig picked task' } : null,
	);
	new PomodoroPane({
		target: pomoPane,
		props: {
			session: plugin.pomodoroService.session,
			focusMinutes: plugin.settings.pomodoro.focusMinutes,
			dialStyle: writable(plugin.settings.pomodoro.dialStyle),
			pickedTask,
			onStart: () => plugin.pomodoroService.start(null, null),
			onFocusUntil: () => new FocusUntilModal(plugin.app as never, plugin as never, null, null).open(),
			onToggle: () => plugin.pomodoroService.toggle(),
			onSkip: () => plugin.pomodoroService.skip(),
			onStop: () => plugin.pomodoroService.stop(),
			onOpenTask: (p: string) => console.info('[rig] openTask', p),
			onOpenSettings: () => console.info('[rig] openSettings pomodoro'),
			onPickTask: () => console.info('[rig] pickTask'),
			onClearPickedTask: () => pickedTask.set(null),
		},
	});
	document.body.dataset.rigReady = '1';
} else if (params.get('pomostatus')) {
	// ── Pomodoro status-bar scene ────────────────────────────────────────────
	// ?pomostatus=1 renders the desktop status-bar countdown across its states
	// (focus / break / paused / untethered) so the CSS can be eyeballed — the
	// real Obsidian status bar can't be hosted in the rig.
	const bar = root.createDiv({ cls: 'rig-stage' });
	bar.style.padding = '24px';
	bar.style.display = 'flex';
	bar.style.flexDirection = 'column';
	bar.style.gap = '16px';

	const base: PomodoroSession = {
		taskPath: 'tasks/a.md', taskName: 'Draft the Q3 report', mode: 'focus',
		durationSec: 1500, remainingSec: 754, running: true, completedFocus: 0,
		targetEndMs: null, isFill: false, phaseEndsAtMs: null,
	};
	const states: Array<[string, PomodoroSession]> = [
		['focus (running)', base],
		['short break', { ...base, mode: 'short-break', remainingSec: 296 }],
		['paused', { ...base, running: false, remainingSec: 61 }],
		['final fill', { ...base, isFill: true, remainingSec: 128 }],
		['untethered', { ...base, taskPath: null, taskName: null, remainingSec: 45 }],
	];
	for (const [caption, session] of states) {
		const view = pomodoroStatusBarView(session);
		if (!view) continue;
		const row = bar.createDiv();
		row.style.display = 'flex';
		row.style.alignItems = 'center';
		row.style.gap = '16px';
		const label = row.createSpan({ text: caption });
		label.style.width = '140px';
		label.style.color = 'var(--text-muted)';
		// Mimic the status-bar container so themed status-bar styling applies.
		const statusBar = row.createDiv({ cls: 'status-bar' });
		statusBar.style.position = 'static';
		const item = statusBar.createDiv({ cls: 'status-bar-item ttasks-pomo-statusbar' });
		item.toggleClass('is-break', view.mode !== 'focus');
		item.toggleClass('is-paused', !view.running);
		setIcon(item.createSpan({ cls: 'ttasks-pomo-statusbar-icon' }), 'timer');
		item.createSpan({ cls: 'ttasks-pomo-statusbar-text', text: view.text });
		const tip = row.createSpan({ text: view.tooltip.replace(/\n/g, '  ·  ') });
		tip.style.color = 'var(--text-faint)';
		tip.style.fontSize = 'var(--font-ui-smaller)';
	}
	document.body.dataset.rigReady = '1';
} else {

// ── Mount the three workspace panes ──────────────────────────────────────────
// Mirrors the real layout: rail = left sidebar leaf, board = main leaf,
// detail = right sidebar leaf (drawer overlay on mobile viewports).

const stage = root.createDiv({ cls: 'rig-stage' });
const railPane = stage.createDiv({ cls: 'rig-rail tt-rail-view' });
const boardPane = stage.createDiv({ cls: 'rig-board' });
const detailPane = stage.createDiv({ cls: 'rig-detail tt-detail-view' });

const railViews = writable(getRegisteredTaskViews(plugin.settings as never));
const railInboxCount = derived(
	plugin.taskStore.tasks,
	(tasks) => tasks.filter((task) => task.is_inbox && !task.is_complete).length,
);

new TaskRail({
	target: railPane,
	props: {
		views: railViews,
		inboxCount: railInboxCount,
		currentViewId: boardState.currentViewId,
		onSelectView: (id: string) => boardState.currentViewId.set(id),
		onAddSmartList: () => console.info('[rig] addSmartList'),
		onSmartListContextMenu: (id: string) => console.info(`[rig] smartListMenu:${id}`),
		onNewTask: () => new CreateTaskModal(plugin.app as never, plugin as never).open(),
		onNewProject: () => new CreateTaskModal(plugin.app as never, plugin as never, 'project').open(),
		onShareSync: () => console.info('[rig] shareSync'),
		onOpenSettings: () => console.info('[rig] openSettings'),
	},
});

new TaskBoard({
	target: boardPane,
	props: {
		plugin: plugin as never,
		boardState,
	},
});

new TaskDetail({
	target: detailPane,
	props: {
		plugin: plugin as never,
		tasks: combineBoardTasks(plugin.taskStore.tasks, plugin.scanEngine.tasks),
		activeTaskPath: plugin.activeTaskPath,
		store: plugin.taskStore as never,
	},
});

// The right "sidebar" expands whenever a task is active, like revealLeaf would.
plugin.activeTaskPath.subscribe((path) => {
	stage.classList.toggle('detail-open', path !== null);
});

function openFirstDetail(): void {
	let first: string | null = null;
	const unsub = plugin.taskStore.tasks.subscribe((tasks) => {
		first = tasks.find((t) => t.type === 'task')?.path ?? null;
	});
	unsub();
	if (first) plugin.activeTaskPath.set(first);
}

if (params.get('detail') === '1') openFirstDetail();
if (params.get('modal') === '1') {
	new CreateTaskModal(plugin.app as never, plugin as never).open();
}
if (params.get('share') === '1') {
	new ShareSyncModal(plugin.app as never, plugin as never).open();
}

/* ?share=import — opens the modal on the Import tab with a paste already
   previewed, so the per-item review list (expand/reject rows, rendered note
   bodies) can be screenshotted. The paste is built from the live task set so the
   entries resolve to real names instead of "not found". */
if (params.get('share') === 'import') {
	new ShareSyncModal(plugin.app as never, plugin as never).open();
	const sample = get(plugin.taskStore.tasks).filter((task) => task.type === 'task').slice(0, 4);
	const paste = JSON.stringify({
		tasks: [
			{ ref: sample[0]?.id, status: 'In Progress', priority: 'High' },
			{ ref: sample[1]?.id, due_date: '2026-08-14', estimated_days: 3 },
			{
				ref: sample[2]?.id,
				notes: '## Revised plan\n\nPull the **schema freeze** forward and split the migration:\n\n- dry run against a copy\n- verify row counts\n- cut over\n\n> Rollback is a single `git revert`.',
			},
			{ action: 'create', name: 'Draft the QA checklist', depends_on: [sample[0]?.name].filter(Boolean) },
			{ action: 'delete', ref: sample[3]?.id },
		],
	}, null, 2);

	// Drive the modal through its own UI rather than reaching into its state —
	// the rig should exercise the same path a user does.
	requestAnimationFrame(() => {
		const tabs = Array.from(document.querySelectorAll<HTMLButtonElement>('.tt-share-tab'));
		tabs.find((tab) => tab.textContent === 'Import')?.click();
		const textarea = document.querySelector<HTMLTextAreaElement>('.tt-share-import-text');
		if (textarea) {
			textarea.value = paste;
			textarea.dispatchEvent(new Event('input'));
		}
		const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('.modal-button-container button'));
		buttons.find((btn) => btn.textContent === 'Preview changes')?.click();
		// Expand the note-body row: the rendered markdown is the point of the scene.
		requestAnimationFrame(() => {
			document.querySelectorAll<HTMLButtonElement>('.tt-import-group')[1]
				?.querySelector<HTMLButtonElement>('.tt-import-expand')?.click();
		});
	});
}

// Signal readiness for the screenshot script
document.body.dataset.rigReady = '1';

}
