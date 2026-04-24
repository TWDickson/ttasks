<script lang="ts">
	import { setIcon } from 'obsidian';
	import { derived } from 'svelte/store';
	import type TTasksPlugin from '../main';
	import type { Task } from '../types';
	import { CreateTaskModal } from '../modals/CreateTaskModal';
	import TaskList from './TaskList.svelte';
	import TaskKanban from './TaskKanban.svelte';
	import TaskAgenda from './TaskAgenda.svelte';
	import TaskGraph from './TaskGraph.svelte';
	import TaskDetail from './TaskDetail.svelte';
	import { createTaskQuery } from '../query/useTaskQuery';
	import type { FilterCondition } from '../query/types';

	export let plugin: TTasksPlugin;

	// Destructure stores for Svelte reactivity
	const activeTaskPath = plugin.activeTaskPath;
	const tasks          = plugin.taskStore.tasks;

	type ViewMode = 'list' | 'kanban' | 'agenda' | 'graph';
	let currentView: ViewMode = 'list';

	// Allow external callers (e.g. ReminderService) to switch the active view.
	plugin.activeViewMode.subscribe(mode => {
		if (mode !== null) {
			currentView = mode;
			plugin.activeViewMode.set(null);
		}
	});

	// Panel open state is decoupled from task selection so the panel can show
	// an empty state (e.g. after deletion) without collapsing.
	let panelOpen = false;
	$: if ($activeTaskPath !== null) panelOpen = true;

	// ── Filter state (routed through the query engine) ────────────────────────
	let searchQuery    = '';
	let filterPriority = '';
	let filterArea     = '';

	$: areas = [...new Set(
		$tasks.map(t => t.area).filter((a): a is string => !!a)
	)].sort();

	$: hasActiveFilters = !!searchQuery || !!filterPriority || !!filterArea;

	const { result: groupedTasks, query } = createTaskQuery(tasks, {
		filter:  { logic: 'and', conditions: [] },
		sort:    [],
		groupBy: null,
	});

	// Rebuild the filter spec whenever any filter control changes
	$: {
		const conditions: FilterCondition[] = [];
		if (filterPriority) conditions.push({ field: 'priority', operator: 'is', value: filterPriority });
		if (filterArea)     conditions.push({ field: 'area',     operator: 'is', value: filterArea });
		query.update(q => ({ ...q, filter: { logic: 'and', conditions }, search: searchQuery || undefined }));
	}

	// Flatten groups back to a task list — views still expect Readable<Task[]>
	// until Step 4 migrates them to consume TaskGroup[] directly.
	const displayTasks = derived(groupedTasks, groups => groups.flatMap(g => g.tasks));

	function clearFilters() {
		searchQuery    = '';
		filterPriority = '';
		filterArea     = '';
	}

	// ──────────────────────────────────────────────────────────────────────────

	const VIEWS: { id: ViewMode; label: string; icon: string }[] = [
		{ id: 'list',   label: 'List',   icon: 'list' },
		{ id: 'kanban', label: 'Kanban', icon: 'columns-2' },
		{ id: 'agenda', label: 'Agenda', icon: 'calendar' },
		{ id: 'graph',  label: 'Graph',  icon: 'git-branch-plus' },
	];

	$: configuredStatuses = plugin.settings.statuses ?? ['Active'];
	$: configuredStatusColors = plugin.settings.statusColors ?? {};
	$: configuredCategoryColors = plugin.settings.areaColors ?? {};
	$: configuredTaskTypeColors = plugin.settings.labelColors ?? {};
	$: configuredBlockStatus = plugin.settings.quickActions?.blockStatus ?? 'Blocked';

	function openNewTask()    { new CreateTaskModal(plugin.app, plugin).open(); }
	function openNewProject() { new CreateTaskModal(plugin.app, plugin, 'project').open(); }
	function closeDetail()    { panelOpen = false; activeTaskPath.set(null); }
	function openContextMenu(task: Task, event: MouseEvent) {
		plugin.showTaskContextMenu(task, event);
	}
	function openSettings()   {
		plugin.openPluginSettings();
	}

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
			<div class="tt-rail-divider"></div>
			<button class="tt-rail-item" on:click={openSettings} aria-label="Settings">
				<span class="tt-rail-icon" use:icon={'settings'}></span>
				<span class="tt-rail-label">Settings</span>
			</button>
		</div>
	</nav>

	<!-- ── Main body ─────────────────────────────────────────────────────────── -->
	<div class="tt-board-body">

		<!-- Inner column: tabs + filter + content always stack vertically -->
		<div class="tt-board-main">

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

			<!-- Filter bar -->
			<div class="tt-filter-bar">
				<div class="tt-search-wrap">
					<span class="tt-search-icon" use:icon={'search'}></span>
					<input
						class="tt-search-input"
						type="text"
						placeholder="Search tasks…"
						bind:value={searchQuery}
					/>
					{#if searchQuery}
						<button class="tt-search-clear" on:click={() => searchQuery = ''} aria-label="Clear search">
							<span use:icon={'x'}></span>
						</button>
					{/if}
				</div>

				<select class="tt-filter-select" bind:value={filterPriority} aria-label="Filter by priority">
					<option value="">Priority</option>
					<option value="High">High</option>
					<option value="Medium">Medium</option>
					<option value="Low">Low</option>
					<option value="None">None</option>
				</select>

				{#if areas.length > 0}
					<select class="tt-filter-select" bind:value={filterArea} aria-label="Filter by area">
						<option value="">Area</option>
						{#each areas as a}
							<option value={a}>{a}</option>
						{/each}
					</select>
				{/if}

				{#if hasActiveFilters}
					<button class="tt-filter-clear" on:click={clearFilters}>Clear</button>
				{/if}
			</div>

			<!-- View content -->
			<div class="tt-board-content">
				{#if currentView === 'list'}
					<TaskList
						{plugin}
						tasks={displayTasks}
						statuses={configuredStatuses}
						areaColors={configuredCategoryColors}
						labelColors={configuredTaskTypeColors}
						{activeTaskPath}
						onOpen={(path) => plugin.taskStore.openDetail(path)}
						onContextMenu={openContextMenu}
						onNewTask={openNewTask}
					/>
				{:else if currentView === 'kanban'}
					<TaskKanban
						{plugin}
						tasks={displayTasks}
						statuses={configuredStatuses}
						statusColors={configuredStatusColors}
						blockStatus={configuredBlockStatus}
						areaColors={configuredCategoryColors}
						labelColors={configuredTaskTypeColors}
						{activeTaskPath}
						store={plugin.taskStore}
						onOpen={(path) => plugin.taskStore.openDetail(path)}
						onContextMenu={openContextMenu}
					/>
				{:else if currentView === 'graph'}
					<TaskGraph
						{plugin}
						tasks={displayTasks}
						statusColors={configuredStatusColors}
						{activeTaskPath}
						onOpen={(path) => plugin.taskStore.openDetail(path)}
						onContextMenu={openContextMenu}
					/>
				{:else}
					<TaskAgenda
						{plugin}
						tasks={displayTasks}
						areaColors={configuredCategoryColors}
						labelColors={configuredTaskTypeColors}
						{activeTaskPath}
						onOpen={(path) => plugin.taskStore.openDetail(path)}
						onContextMenu={openContextMenu}
					/>
				{/if}
			</div>

		</div>

		<!-- Backdrop: mobile gets dark overlay, desktop is transparent click-target -->
		{#if panelOpen}
			<button class="tt-detail-backdrop" type="button" aria-label="Close detail panel" on:click={closeDetail}></button>
		{/if}

		<!-- Detail panel -->
		<div class="tt-board-detail" class:is-visible={panelOpen}>
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
					{plugin}
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
			class:tt-fab-hidden={panelOpen}
			on:click={openNewTask}
			aria-label="New task"
		>
			<span use:icon={'plus'}></span>
		</button>
	{/if}

</div>

<style>
	:global(.tt-board) {
		--tt-space-1: var(--size-4-1, 4px);
		--tt-space-2: var(--size-4-2, 8px);
		--tt-space-3: var(--size-4-3, 12px);
		--tt-control-radius: var(--input-radius, var(--radius-m, 8px));
		--tt-button-radius: var(--button-radius, var(--radius-m, 8px));
	}

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
		position: relative;
		z-index: 1; /* paint above content hover backgrounds */
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
		border-radius: var(--tt-button-radius);
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

	.tt-rail-divider {
		height: 1px;
		background: var(--background-modifier-border);
		margin: 4px 0;
	}

	.tt-rail-icon {
		width: 18px;
		height: 18px;
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	/* ── Filter bar ────────────────────────────────────────────────────────────── */
	.tt-filter-bar {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 6px 10px;
		border-bottom: 1px solid var(--background-modifier-border);
		flex-shrink: 0;
		background: var(--background-primary);
	}

	.tt-search-wrap {
		display: flex;
		align-items: center;
		flex: 1;
		background: var(--background-modifier-form-field);
		border: var(--input-border-width, var(--border-width, 1px)) solid var(--background-modifier-border);
		border-radius: var(--tt-control-radius);
		padding: 0 8px;
		gap: 6px;
		min-width: 0;
	}

	.tt-search-icon {
		width: 14px;
		height: 14px;
		flex-shrink: 0;
		color: var(--text-muted);
		display: flex;
		align-items: center;
	}

	.tt-search-input {
		flex: 1;
		border: none;
		background: transparent;
		color: var(--text-normal);
		font-size: 0.88rem;
		padding: 5px 0;
		outline: none;
		min-width: 0;
	}
	.tt-search-input::placeholder { color: var(--text-faint); }

	.tt-search-clear {
		display: flex;
		align-items: center;
		padding: 2px;
		border: none;
		background: transparent;
		color: var(--text-muted);
		cursor: pointer;
		border-radius: var(--radius-s, 4px);
		flex-shrink: 0;
	}
	.tt-search-clear:hover { color: var(--text-normal); }

	.tt-filter-select {
		font-size: 0.82rem;
		padding: 4px 6px;
		border: var(--input-border-width, var(--border-width, 1px)) solid var(--background-modifier-border);
		border-radius: var(--tt-control-radius);
		background: var(--dropdown-background, var(--background-modifier-form-field));
		color: var(--text-normal);
		cursor: pointer;
		flex-shrink: 0;
	}

	.tt-filter-clear {
		font-size: 0.8rem;
		padding: 4px 10px;
		border: var(--border-width, 1px) solid var(--background-modifier-border);
		border-radius: var(--tt-button-radius);
		background: transparent;
		color: var(--text-muted);
		cursor: pointer;
		white-space: nowrap;
		flex-shrink: 0;
	}
	.tt-filter-clear:hover {
		color: var(--text-normal);
		background: var(--interactive-hover, var(--background-modifier-hover));
	}

	/* ── Body ──────────────────────────────────────────────────────────────────── */
	.tt-board-body {
		flex: 1;
		display: flex;
		flex-direction: column;
		overflow: hidden;
		position: relative; /* anchor for absolute detail panel */
	}

	/* Inner column that always stacks tabs → filter → content vertically */
	.tt-board-main {
		flex: 1;
		display: flex;
		flex-direction: column;
		overflow: hidden;
		min-width: 0;
	}

	/* Mobile tab bar — hidden on desktop */
	.tt-board-tabs {
		display: none;
	}

	.tt-board-content {
		flex: 1;
		overflow: hidden; /* each view manages its own scroll */
		display: flex;
		flex-direction: column;
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
		border-left: 2px solid var(--interactive-accent);
		box-shadow: -6px 0 28px rgba(var(--mono-rgb-100), 0.18);
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
		border: 0;
		background: rgba(var(--mono-rgb-100), 0.28);
		pointer-events: auto;
		cursor: default;
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
		border-radius: var(--tt-button-radius);
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
		box-shadow: 0 2px 10px rgba(var(--mono-rgb-100), 0.25);
		display: flex;
		align-items: center;
		justify-content: center;
		transition: filter 0.12s;
		z-index: 10;
	}
	.tt-fab:hover { background: var(--interactive-accent-hover); }
	.tt-fab-left  { right: unset; left: 16px; }


	/* ── Wide: persistent side-by-side detail panel ───────────────────────────── */
	@media (min-width: 900px) {
		.tt-board-body {
			flex-direction: row;
		}

		/* tt-board-main already flex: 1 — no change needed */

		.tt-board-content {
			flex: 1;
			min-width: 0;
		}

		/* Switch from transform slide to width expansion so list reflows smoothly */
		.tt-board-detail {
			position: relative;
			width: 0;
			flex-shrink: 0;
			overflow: hidden;
			transform: none;
			box-shadow: none;
			border-left: none;
			transition: width 0.22s ease;
		}

		.tt-board-detail.is-visible {
			width: 380px;
			border-left: 1px solid var(--background-modifier-border);
		}

		/* No backdrop needed — panel is a sibling, not an overlay */
		.tt-detail-backdrop {
			display: none;
		}
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
			background: rgba(var(--mono-rgb-100), 0.35);
		}

		/* Mobile: show back button, hide X close button */
		.tt-back-btn  { display: flex; }
		.tt-close-btn { display: none; }

		/* FAB above safe area */
		.tt-fab {
			bottom: calc(20px + env(safe-area-inset-bottom, 0px));
		}

		/* Hide FAB when detail panel covers content on mobile */
		.tt-fab.tt-fab-hidden {
			display: none;
		}
	}
</style>
