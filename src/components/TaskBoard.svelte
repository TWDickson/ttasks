<script lang="ts">
	import { setIcon } from 'obsidian';
	import type TTasksPlugin from '../main';
	import { CreateTaskModal } from '../modals/CreateTaskModal';
	import TaskList from './TaskList.svelte';
	import TaskDetail from './TaskDetail.svelte';

	export let plugin: TTasksPlugin;

	// Destructure stores for Svelte reactivity
	const activeTaskPath = plugin.activeTaskPath;
	const tasks          = plugin.taskStore.tasks;

	type ViewMode = 'list' | 'kanban' | 'agenda';
	let currentView: ViewMode = 'list';

	$: showDetail = $activeTaskPath !== null;

	const VIEWS: { id: ViewMode; label: string; icon: string }[] = [
		{ id: 'list',   label: 'List',   icon: 'list' },
		{ id: 'kanban', label: 'Kanban', icon: 'columns-2' },
		{ id: 'agenda', label: 'Agenda', icon: 'calendar' },
	];

	function openNewTask()    { new CreateTaskModal(plugin.app, plugin).open(); }
	function openNewProject() { new CreateTaskModal(plugin.app, plugin, 'project').open(); }
	function closeDetail()    { activeTaskPath.set(null); }

	function icon(el: HTMLElement, name: string) {
		setIcon(el, name);
		return { update: (n: string) => setIcon(el, n) };
	}
</script>

<div class="tt-board">

	<!-- ── Desktop nav rail (hidden on mobile) ──────────────────────────────── -->
	<nav class="tt-board-rail">
		<div class="tt-rail-views">
			{#each VIEWS as view}
				<button
					class="tt-rail-item"
					class:is-active={currentView === view.id}
					on:click={() => currentView = view.id}
					aria-label={view.label}
				>
					<span class="tt-rail-icon" use:icon={view.icon}></span>
					<span class="tt-rail-label">{view.label}</span>
				</button>
			{/each}
		</div>

		<div class="tt-rail-actions">
			<button class="tt-rail-item" on:click={openNewTask}    aria-label="New task">
				<span class="tt-rail-icon" use:icon={'plus'}></span>
				<span class="tt-rail-label">New task</span>
			</button>
			<button class="tt-rail-item" on:click={openNewProject} aria-label="New project">
				<span class="tt-rail-icon" use:icon={'folder-plus'}></span>
				<span class="tt-rail-label">New project</span>
			</button>
		</div>
	</nav>

	<!-- ── Main body ─────────────────────────────────────────────────────────── -->
	<div class="tt-board-body">

		<!-- Mobile tab bar (hidden on desktop) -->
		<div class="tt-board-tabs">
			{#each VIEWS as view}
				<button
					class="tt-tab-btn"
					class:is-active={currentView === view.id}
					on:click={() => currentView = view.id}
				>{view.label}</button>
			{/each}
		</div>

		<!-- View content -->
		<div class="tt-board-content">
			{#if currentView === 'list'}
				<TaskList
					{tasks}
					onOpen={(path) => plugin.taskStore.openDetail(path)}
				/>
			{:else if currentView === 'kanban'}
				<div class="tt-placeholder">Kanban — coming soon</div>
			{:else}
				<div class="tt-placeholder">Agenda — coming soon</div>
			{/if}
		</div>

		<!-- Backdrop: mobile gets dark overlay, desktop is transparent click-target -->
		{#if showDetail}
			<div class="tt-detail-backdrop" on:click={closeDetail}></div>
		{/if}

		<!-- Detail panel: absolute overlay on both desktop and mobile -->
		<div class="tt-board-detail" class:is-visible={showDetail}>
			<div class="tt-detail-topbar">
				<button class="tt-back-btn" on:click={closeDetail}>
					<span use:icon={'arrow-left'}></span>
					<span>Back</span>
				</button>
				<button class="tt-close-btn" on:click={closeDetail} aria-label="Close">
					<span use:icon={'x'}></span>
				</button>
			</div>
			<div class="tt-detail-scroll">
				<TaskDetail
					{tasks}
					{activeTaskPath}
					store={plugin.taskStore}
				/>
			</div>
		</div>

	</div>

	<!-- ── FAB ───────────────────────────────────────────────────────────────── -->
	{#if plugin.settings.fabPosition !== 'hidden'}
		<button
			class="tt-fab"
			class:tt-fab-left={plugin.settings.fabPosition === 'left'}
			on:click={openNewTask}
			aria-label="New task"
		>
			<span use:icon={'plus'}></span>
		</button>
	{/if}

</div>

<style>
	/* ── Root ──────────────────────────────────────────────────────────────────── */
	.tt-board {
		display: flex;
		flex-direction: row;
		height: 100%;
		overflow: hidden;
		position: relative;
	}

	/* ── Desktop nav rail ──────────────────────────────────────────────────────── */
	.tt-board-rail {
		width: 160px;
		flex-shrink: 0;
		display: flex;
		flex-direction: column;
		justify-content: space-between;
		border-right: 1px solid var(--background-modifier-border);
		padding: 8px 0;
		background: var(--background-secondary);
	}

	.tt-rail-views,
	.tt-rail-actions {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 0 8px;
	}

	.tt-rail-item {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 8px 10px;
		border: none;
		border-radius: var(--radius-m, 6px);
		background: transparent;
		color: var(--text-muted);
		font-size: 0.88rem;
		font-weight: 500;
		cursor: pointer;
		text-align: left;
		transition: background 0.1s, color 0.1s;
		width: 100%;
	}
	.tt-rail-item:hover {
		background: var(--background-modifier-hover);
		color: var(--text-normal);
	}
	.tt-rail-item.is-active {
		background: var(--background-modifier-hover);
		color: var(--interactive-accent);
		font-weight: 600;
	}

	.tt-rail-icon {
		width: 18px;
		height: 18px;
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	/* ── Body ──────────────────────────────────────────────────────────────────── */
	.tt-board-body {
		flex: 1;
		display: flex;
		flex-direction: column;
		overflow: hidden;
		position: relative; /* anchor for absolute detail panel */
	}

	/* Mobile tab bar — hidden on desktop */
	.tt-board-tabs {
		display: none;
	}

	.tt-board-content {
		flex: 1;
		overflow-y: auto;
		overflow-x: hidden;
	}

	/* ── Detail panel — absolute overlay on both viewports ──────────────────────── */
	.tt-board-detail {
		position: absolute;
		top: 0;
		right: 0;
		bottom: 0;
		width: 380px;
		display: flex;
		flex-direction: column;
		background: var(--background-primary);
		border-left: 1px solid var(--background-modifier-border);
		box-shadow: -4px 0 16px rgba(0, 0, 0, 0.12);
		transform: translateX(100%);
		transition: transform 0.22s ease;
		z-index: 5;
	}
	.tt-board-detail.is-visible {
		transform: translateX(0);
	}

	/* ── Backdrop ───────────────────────────────────────────────────────────────── */
	.tt-detail-backdrop {
		position: absolute;
		inset: 0;
		z-index: 4;
		/* Desktop: transparent click-target only */
		background: transparent;
		pointer-events: auto;
	}

	/* ── Detail topbar ──────────────────────────────────────────────────────────── */
	.tt-detail-topbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 6px 8px;
		border-bottom: 1px solid var(--background-modifier-border);
		flex-shrink: 0;
	}

	.tt-back-btn,
	.tt-close-btn {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 6px 10px;
		border: none;
		border-radius: var(--radius-m, 6px);
		background: transparent;
		color: var(--text-muted);
		font-size: 0.88rem;
		cursor: pointer;
		transition: background 0.1s, color 0.1s;
	}
	.tt-back-btn:hover,
	.tt-close-btn:hover {
		background: var(--background-modifier-hover);
		color: var(--text-normal);
	}

	/* Desktop: hide back button, show close button */
	.tt-back-btn  { display: none; }
	.tt-close-btn { display: flex; margin-left: auto; }

	.tt-detail-scroll {
		flex: 1;
		overflow-y: auto;
	}

	/* ── FAB ───────────────────────────────────────────────────────────────────── */
	.tt-fab {
		position: absolute;
		bottom: calc(16px + env(safe-area-inset-bottom, 0px));
		right: 16px;
		width: 52px;
		height: 52px;
		border-radius: 50%;
		border: none;
		background: var(--interactive-accent);
		color: var(--text-on-accent);
		font-size: 1.4rem;
		cursor: pointer;
		box-shadow: 0 2px 10px rgba(0, 0, 0, 0.25);
		display: flex;
		align-items: center;
		justify-content: center;
		transition: filter 0.12s;
		z-index: 10;
	}
	.tt-fab:hover { filter: brightness(1.1); }
	.tt-fab-left  { right: unset; left: 16px; }

	/* ── Placeholder ───────────────────────────────────────────────────────────── */
	.tt-placeholder {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 100%;
		color: var(--text-muted);
		font-size: 0.9rem;
	}

	/* ── Mobile ────────────────────────────────────────────────────────────────── */
	@media (max-width: 768px) {
		.tt-board-rail { display: none; }

		/* Tab bar */
		.tt-board-tabs {
			display: flex;
			flex-shrink: 0;
			border-bottom: 1px solid var(--background-modifier-border);
			background: var(--background-secondary);
		}

		.tt-tab-btn {
			flex: 1;
			padding: 12px 8px;
			border: none;
			background: transparent;
			color: var(--text-muted);
			font-size: 0.88rem;
			font-weight: 500;
			cursor: pointer;
			border-bottom: 2px solid transparent;
			transition: color 0.1s, border-color 0.1s;
		}
		.tt-tab-btn.is-active {
			color: var(--interactive-accent);
			border-bottom-color: var(--interactive-accent);
			font-weight: 600;
		}

		/* Detail: full-screen on mobile */
		.tt-board-detail {
			inset: 0;
			width: 100%;
			border-left: none;
			box-shadow: none;
		}

		/* Mobile backdrop: dark overlay */
		.tt-detail-backdrop {
			background: rgba(0, 0, 0, 0.35);
		}

		/* Mobile: show back button, hide X close button */
		.tt-back-btn  { display: flex; }
		.tt-close-btn { display: none; }

		/* FAB above safe area */
		.tt-fab {
			bottom: calc(20px + env(safe-area-inset-bottom, 0px));
		}
	}
</style>
