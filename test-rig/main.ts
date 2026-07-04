/* Visual test rig entry. Mounts the real TaskBoard against an in-memory plugin
   mock, with the vault's actual Obsidian app.css + theme so renders match the
   app. URL params (used by shots.mjs and shareable by hand):
     ?theme=light|dark   ?view=list|kanban|agenda|graph|logbook|today|inbox
     ?detail=1 (open first task's detail)   ?modal=1 (open Create Task modal) */

import './vendor/obsidian-app.css';
import './vendor/theme-underwater.css';
import '../styles.css';
import './rig.css';

import { writable } from 'svelte/store';
import TaskBoard from '../src/components/TaskBoard.svelte';
import TaskRail from '../src/components/TaskRail.svelte';
import TaskDetail from '../src/components/TaskDetail.svelte';
import { CreateTaskModal } from '../src/modals/CreateTaskModal';
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

const themeBtn = bar.createEl('button', { text: theme === 'dark' ? 'Light theme' : 'Dark theme' });
themeBtn.addEventListener('click', () => {
	const nowDark = document.body.classList.contains('theme-dark');
	applyTheme(nowDark ? 'light' : 'dark');
	themeBtn.setText(nowDark ? 'Dark theme' : 'Light theme');
});

for (const id of ['list', 'kanban', 'agenda', 'graph', 'today', 'inbox', 'logbook']) {
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

// ── Mount the three workspace panes ──────────────────────────────────────────
// Mirrors the real layout: rail = left sidebar leaf, board = main leaf,
// detail = right sidebar leaf (drawer overlay on mobile viewports).

const stage = root.createDiv({ cls: 'rig-stage' });
const railPane = stage.createDiv({ cls: 'rig-rail tt-rail-view' });
const boardPane = stage.createDiv({ cls: 'rig-board' });
const detailPane = stage.createDiv({ cls: 'rig-detail tt-detail-view' });

const railViews = writable(getRegisteredTaskViews(plugin.settings as never));

new TaskRail({
	target: railPane,
	props: {
		views: railViews,
		currentViewId: boardState.currentViewId,
		onSelectView: (id: string) => boardState.currentViewId.set(id),
		onAddSmartList: () => console.info('[rig] addSmartList'),
		onSmartListContextMenu: (id: string) => console.info(`[rig] smartListMenu:${id}`),
		onNewTask: () => new CreateTaskModal(plugin.app as never, plugin as never).open(),
		onNewProject: () => new CreateTaskModal(plugin.app as never, plugin as never, 'project').open(),
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

// Signal readiness for the screenshot script
document.body.dataset.rigReady = '1';
