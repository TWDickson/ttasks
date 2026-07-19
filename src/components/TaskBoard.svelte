<script lang="ts">
	import { onDestroy } from 'svelte';
	import { writable } from 'svelte/store';
	import { Notice } from 'obsidian';
	import type TTasksPlugin from '../main';
	import type { Task } from '../types';
	import type { ExternalTask } from '../integration/types';
	import { CreateTaskModal } from '../modals/CreateTaskModal';
	import { GraphExpandModal } from '../modals/GraphExpandModal';
	import TaskList from './TaskList.svelte';
	import TaskKanban from './TaskKanban.svelte';
	import TaskAgenda from './TaskAgenda.svelte';
	import TaskGraph from './TaskGraph.svelte';
	import { createTaskQuery } from '../query/useTaskQuery';
	import { buildTaskSchedule } from '../store/taskSchedule';
	import { splitHolidayCalendar } from '../settings/holidays';
	import { resolveAreaOptions } from '../settings/managedListUtils';
	import { canToggleBuiltinCompleted, defaultCompletedVisibility } from './builtinViewCompletionToggle';
	import { canToggleLogbookRenderer, resolveViewRenderer, toggleLogbookRendererMode } from './logbookViewMode';
	import TaskArchiveView from './TaskArchiveView.svelte';
	import BatchActionBar from './BatchActionBar.svelte';
	import { batchEligibility, clearSelection, selectAll, toggleSelection } from '../store/taskSelection';
	import {
		type BoardStateStores,
		clearSelectionOnViewChange,
		combineBoardTasks,
		createBoardStateService,
	} from '../store/BoardStateService';
	import { localDateString } from '../utils/dateUtils';
	import { runBatchArchive, runBatchComplete, runBatchDelete } from './taskBoardBatchActions';
	import { confirmModal } from '../modals/confirmModal';
	import { buildBoardQuery } from './boardQuery';
	import type { FilterCondition } from '../query/types';
	import {
		getRegisteredTaskViews,
		resolveTaskViewDefinition,
		resolveTaskViewId,
	} from '../views/viewRegistry';
	import { editSmartList } from '../views/smartListActions';
	import { icon } from '../utils/icon';
	import { promoteTaskToTTasks } from '../integration/promoteTaskToTTasks';
	import {
		PRIORITIES,
		RENDERER_ARCHIVE,
		RENDERER_GRAPH,
		RENDERER_KANBAN,
		RENDERER_LIST,
		type RendererType,
	} from '../constants';

	export let plugin: TTasksPlugin;
	export let boardState: BoardStateStores | undefined = undefined;

	// Destructure stores for Svelte reactivity
	const resolvedBoardState = boardState ?? createBoardStateService({
		defaultViewId: resolveTaskViewId(plugin.settings, null),
		activeTaskPath: plugin.activeTaskPath,
		focusedTaskPath: plugin.focusedTaskPath,
	});
	const activeTaskPath = resolvedBoardState.activeTaskPath;
	const focusedTaskPath = resolvedBoardState.focusedTaskPath;
	const currentViewId = resolvedBoardState.currentViewId;
	const searchQuery = resolvedBoardState.searchQuery;
	const selectedPaths = resolvedBoardState.selectedPaths;
	const tasks = combineBoardTasks(plugin.taskStore.tasks, plugin.scanEngine.tasks);

	// Re-derive settings-based state whenever any leaf saves settings (e.g. the
	// rail adds a Smart List, or a Smart List query is edited in place).
	const settingsRevision = plugin.settingsRevision ?? writable(0);
	let registeredViews = getRegisteredTaskViews(plugin.settings);
	let currentView = resolveTaskViewDefinition(plugin.settings, $currentViewId) ?? registeredViews[0];
	$: { void $settingsRevision; registeredViews = getRegisteredTaskViews(plugin.settings); }
	$: { void $settingsRevision; currentViewId.set(resolveTaskViewId(plugin.settings, $currentViewId)); }
	$: { void $settingsRevision; currentView = resolveTaskViewDefinition(plugin.settings, $currentViewId) ?? registeredViews[0]; }

	// Allow external callers (e.g. ReminderService) to switch the active view.
	const unsubscribeActiveViewMode = plugin.activeViewMode.subscribe(mode => {
		if (mode !== null) {
			currentViewId.set(resolveTaskViewId(plugin.settings, mode));
			plugin.activeViewMode.set(null);
		}
	});
	onDestroy(unsubscribeActiveViewMode);

	const unsubscribeSelectionReset = clearSelectionOnViewChange(currentViewId, selectedPaths);
	onDestroy(unsubscribeSelectionReset);

	// ── Multi-select ──────────────────────────────────────────────────────────
	$: eligibility = batchEligibility($selectedPaths, $tasks);

	function handleSelect(path: string): void {
		selectedPaths.update((current) => toggleSelection(current, path));
	}

	async function batchComplete(): Promise<void> {
		const nextSelection = await runBatchComplete({
			selectedPaths: $selectedPaths,
			completionStatus: plugin.settings.completionStatus,
			today: localDateString(),
			updateTask: (path, updates) => plugin.taskStore.update(path, updates),
			clearSelection,
		});
		selectedPaths.set(nextSelection);
	}

	async function batchArchive(): Promise<void> {
		const nextSelection = await runBatchArchive({
			selectedPaths: $selectedPaths,
			archiveTask: (path) => plugin.archiveService.archiveTask(path),
			clearSelection,
		});
		selectedPaths.set(nextSelection);
	}

	async function batchDelete(): Promise<void> {
		const nextSelection = await runBatchDelete({
			selectedPaths: $selectedPaths,
			confirmDelete: (count) => confirmModal(plugin.app, {
				title: 'Delete tasks',
				body: `Delete ${count} task${count === 1 ? '' : 's'}? This cannot be undone.`,
				ctaLabel: 'Delete',
			}),
			deleteTask: (path) => plugin.taskStore.delete(path),
			clearSelection,
		});
		selectedPaths.set(nextSelection);
	}

	// ── Filter state (routed through the query engine) ────────────────────────
	let filterPriority = '';
	let filterArea     = '';
	let showCompletedByViewId: Record<string, boolean> = { ...(plugin.settings.showCompletedByViewId ?? {}) };
	let logbookRendererModeByViewId: Record<string, 'list' | 'kanban'> = {
		logbook: plugin.settings.logbookRendererMode,
	};

	$: observedAreas = [...new Set(
		$tasks.map(t => t.area).filter((a): a is string => !!a)
	)];
	// Settings is the source of truth; stray/legacy frontmatter areas appear
	// below a divider as a safety net.
	$: areaOptions = resolveAreaOptions(plugin.settings.areas ?? [], observedAreas);
	$: hasAreaOptions = areaOptions.managed.length > 0 || areaOptions.unmanaged.length > 0;

	$: hasActiveFilters = !!$searchQuery || !!filterPriority || !!filterArea;
	$: canToggleCompletedForCurrentView = canToggleBuiltinCompleted(currentView);
	$: showCompleted = showCompletedByViewId[currentView.id] ?? defaultCompletedVisibility(currentView);
	$: currentRenderer = resolveViewRenderer(currentView.id, currentView.renderer, logbookRendererModeByViewId) as RendererType;

	function effectiveQuery(
		view: typeof currentView,
		renderer: typeof currentRenderer,
		showCompletedForView: boolean,
	) {
		return buildBoardQuery(view, renderer, showCompletedForView);
	}

	let currentBoardQuery = effectiveQuery(currentView, currentRenderer, showCompleted);
	$: currentBoardQuery = effectiveQuery(currentView, currentRenderer, showCompleted);

	// Resolve dependency-chain schedules once for the whole board; passed to list
	// rows so tasks whose finish is implied by their chain show a projected badge.
	$: holidayCalendar = splitHolidayCalendar(plugin.settings.holidays);
	$: calendarConfig = {
		holidays: holidayCalendar.holidays,
		recurringHolidays: holidayCalendar.recurringHolidays,
		areaWorkweek: plugin.settings.areaWorkweek,
	};
	$: schedule = buildTaskSchedule($tasks, { calendarConfig });

	const { result: groupedTasks, query } = createTaskQuery(tasks, {
		filter: currentBoardQuery.filter,
		sort: currentBoardQuery.sort,
		group: currentBoardQuery.group,
		limit: currentBoardQuery.limit,
		limitPerGroup: currentBoardQuery.limitPerGroup,
		search: currentBoardQuery.search,
	});

	// Rebuild the filter spec whenever any filter control changes
	$: {
		const conditions = [...currentBoardQuery.filter.conditions];
		if (filterPriority) conditions.push({ field: 'priority', operator: 'is', value: filterPriority });
		if (filterArea)     conditions.push({ field: 'area',     operator: 'is', value: filterArea });
		query.update(q => ({
			...q,
			filter: { logic: currentBoardQuery.filter.logic, conditions },
			search: $searchQuery || currentBoardQuery.search || undefined,
			sort: currentBoardQuery.sort,
			group: currentBoardQuery.group,
			limit: currentBoardQuery.limit,
			limitPerGroup: currentBoardQuery.limitPerGroup,
		}));
	}

	function clearFilters() {
		searchQuery.set('');
		filterPriority = '';
		filterArea     = '';
	}

	async function toggleCompletedVisibility(view: typeof currentView) {
		const current = showCompletedByViewId[view.id] ?? defaultCompletedVisibility(view);
		showCompletedByViewId = {
			...showCompletedByViewId,
			[view.id]: !current,
		};
		plugin.settings.showCompletedByViewId = showCompletedByViewId;
		await plugin.saveSettings();
	}

	async function toggleLogbookRenderer(viewId: string) {
		const nextModes = toggleLogbookRendererMode(viewId, logbookRendererModeByViewId);
		logbookRendererModeByViewId = nextModes;
		const nextMode = nextModes.logbook ?? 'list';
		if (plugin.settings.logbookRendererMode === nextMode) return;
		plugin.settings.logbookRendererMode = nextMode;
		await plugin.saveSettings();
	}

	// ──────────────────────────────────────────────────────────────────────────

	$: configuredStatuses = plugin.settings.statuses ?? ['Active'];
	$: configuredStatusColors = plugin.settings.statusColors ?? {};
	$: configuredCategoryColors = plugin.settings.areaColors ?? {};
	$: configuredTaskTypeColors = plugin.settings.labelColors ?? {};
	$: configuredBlockStatus = plugin.settings.quickActions?.blockStatus ?? 'Blocked';

	$: if ($focusedTaskPath && !$tasks.some((task) => task.path === $focusedTaskPath)) {
		focusedTaskPath.set(null);
	}

	function openNewTask()    { new CreateTaskModal(plugin.app, plugin).open(); }
	function openContextMenu(task: Task, event: MouseEvent) {
		if ((task as ExternalTask).external) return;
		plugin.showTaskContextMenu(task, event);
	}

	function openGraphFullscreen(mode: 'dependency' | 'overview') {
		new GraphExpandModal(plugin.app, {
			plugin,
			groups: groupedTasks,
			statusColors: configuredStatusColors,
			areaColors: configuredCategoryColors,
			activeTaskPath,
			defaultGraphMode: mode,
			onOpen: (path) => {
				focusedTaskPath.set(path);
				plugin.taskStore.openDetail(path);
			},
			onContextMenu: openContextMenu,
		}).open();
	}

	async function promoteCapturedTask(external: ExternalTask): Promise<void> {
		try {
			const created = await promoteTaskToTTasks(external, plugin);
			await plugin.taskStore.openDetail(created.path);
			new Notice(`Promoted: ${created.name}`);
		} catch (error) {
			new Notice(error instanceof Error ? error.message : 'Unable to promote captured task.');
		}
	}
</script>

<div class="tt-board">

	<!-- Column: filter + content. The nav rail and detail pane live in their
		own sidebar leaves (TaskRailView / TaskDetailView). -->
	<div class="tt-board-main">

			<!-- Filter bar -->
			<div class="tt-filter-bar">
				<div class="tt-search-wrap">
					<span class="tt-search-icon" use:icon={'search'}></span>
					<input
						class="tt-search-input"
						type="text"
						placeholder="Search tasks…"
						bind:value={$searchQuery}
					/>
					{#if $searchQuery}
						<button class="tt-search-clear" on:click={() => searchQuery.set('')} aria-label="Clear search">
							<span use:icon={'x'}></span>
						</button>
					{/if}
				</div>

				<select class="tt-filter-select" bind:value={filterPriority} aria-label="Filter by priority">
					<option value="">Priority</option>
					{#each PRIORITIES as p}
						<option value={p}>{p}</option>
					{/each}
				</select>

				{#if hasAreaOptions}
					<select class="tt-filter-select" bind:value={filterArea} aria-label="Filter by area">
						<option value="">Area</option>
						{#each areaOptions.managed as a}
							<option value={a}>{a}</option>
						{/each}
						{#if areaOptions.unmanaged.length > 0}
							<option value="" disabled>──────</option>
							{#each areaOptions.unmanaged as a}
								<option value={a}>{a}</option>
							{/each}
						{/if}
					</select>
				{/if}

				{#if hasActiveFilters}
					<button class="tt-filter-clear" on:click={clearFilters}>Clear</button>
				{/if}

				{#if canToggleCompletedForCurrentView}
					<button class="tt-filter-toggle-completed" on:click={() => toggleCompletedVisibility(currentView)}>
						{showCompleted ? 'Hide Completed' : 'Show Completed'}
					</button>
				{/if}

				{#if canToggleLogbookRenderer(currentView.id)}
					<button class="tt-filter-toggle-completed" on:click={() => void toggleLogbookRenderer(currentView.id)}>
						{currentRenderer === RENDERER_KANBAN ? 'Archive List' : 'Archive Board'}
					</button>
				{/if}

				{#if currentView.source === 'custom'}
					<button
						class="tt-filter-edit-view"
						on:click={() => editSmartList(plugin, currentView.id)}
						aria-label="Edit current Smart List"
					>
						<span use:icon={'sliders-horizontal'}></span>
						<span>Edit View</span>
					</button>
				{/if}
			</div>

			<!-- View content -->
			<div class="tt-board-content">
				{#if currentRenderer === RENDERER_LIST}
					<TaskList
						{plugin}
						viewId={currentView.id}
						groups={groupedTasks}
						{schedule}
						statuses={configuredStatuses}
						hierarchy={currentView.presentation.hierarchy}
						areaColors={configuredCategoryColors}
						labelColors={configuredTaskTypeColors}
						{activeTaskPath}
						focusedTaskPath={$focusedTaskPath}
						onOpen={(path) => {
							focusedTaskPath.set(path);
							plugin.taskStore.openDetail(path);
						}}
						onRestore={currentView.id === 'logbook' ? ((path) => plugin.taskStore.restore(path)) : undefined}
						onContextMenu={openContextMenu}
						onPromote={promoteCapturedTask}
						onNewTask={openNewTask}
						selectable={true}
						selectedPaths={$selectedPaths}
						onSelect={handleSelect}
					/>
					{#if $selectedPaths.size > 0}
						<BatchActionBar
							selectedCount={$selectedPaths.size}
							{eligibility}
							onArchive={batchArchive}
							onComplete={batchComplete}
							onDelete={batchDelete}
							onClear={() => { selectedPaths.set(clearSelection()); }}
						/>
					{/if}
				{:else if currentRenderer === RENDERER_KANBAN}
					<TaskKanban
						{plugin}
						groups={groupedTasks}
						statuses={configuredStatuses}
						statusColors={configuredStatusColors}
						blockStatus={configuredBlockStatus}
						areaColors={configuredCategoryColors}
						labelColors={configuredTaskTypeColors}
						kanbanCardFields={plugin.settings.kanbanCardFields}
						{activeTaskPath}
						store={plugin.taskStore}
						onOpen={(path) => {
							focusedTaskPath.set(path);
							plugin.taskStore.openDetail(path);
						}}
						onContextMenu={openContextMenu}
					/>
				{:else if currentRenderer === RENDERER_GRAPH}
					<TaskGraph
						{plugin}
						groups={groupedTasks}
						defaultGraphMode={currentView.presentation.graphMode}
						statusColors={configuredStatusColors}
						areaColors={configuredCategoryColors}
						{activeTaskPath}
						onOpen={(path) => {
							focusedTaskPath.set(path);
							plugin.taskStore.openDetail(path);
						}}
						onContextMenu={openContextMenu}
						onToggleFullscreen={() => openGraphFullscreen(currentView.presentation.graphMode)}
					/>
				{:else if currentRenderer === RENDERER_ARCHIVE}
					<TaskArchiveView {plugin} />
				{:else}
					<TaskAgenda
						{plugin}
						groups={groupedTasks}
						{schedule}
						areaColors={configuredCategoryColors}
						labelColors={configuredTaskTypeColors}
						{activeTaskPath}
						onOpen={(path) => {
							focusedTaskPath.set(path);
							plugin.taskStore.openDetail(path);
						}}
						onContextMenu={openContextMenu}
					/>
				{/if}
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
	/* Design tokens (--tt-space-*, --tt-*-radius) are defined once in styles.css */
	/* on .tt-board and inherit to every descendant component. */

	/* ── Root ──────────────────────────────────────────────────────────────────── */
	/* The board leaf is a single column: filter bar + view content. The nav
		rail and detail pane live in their own sidebar leaves. */
	.tt-board {
		display: flex;
		flex-direction: column;
		height: 100%;
		overflow: hidden;
		position: relative; /* anchor for the FAB */
	}

	.tt-board-main {
		flex: 1;
		display: flex;
		flex-direction: column;
		overflow: hidden;
		min-width: 0;
	}

	/* ── Filter bar ────────────────────────────────────────────────────────────── */
	.tt-filter-bar {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 6px 10px;
		/* Shared header height so the main-view header border-bottom lines up */
		/* pixel-for-pixel with the detail pane's topbar (BUGFIX #7). */
		min-height: 44px;
		box-sizing: border-box;
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
		transition: border-color 0.12s;
	}

	/* The input's own outline is suppressed, so the wrapper must carry focus. */
	.tt-search-wrap:focus-within {
		border-color: var(--background-modifier-border-focus);
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

	.tt-filter-edit-view,
	.tt-filter-toggle-completed {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font-size: 0.8rem;
		font-weight: 600;
		padding: 4px 10px;
		border: var(--border-width, 1px) solid var(--background-modifier-border);
		border-radius: var(--tt-button-radius);
		background: transparent;
		color: var(--text-muted);
		cursor: pointer;
		white-space: nowrap;
		flex-shrink: 0;
	}

	.tt-filter-edit-view:hover,
	.tt-filter-toggle-completed:hover {
		color: var(--text-normal);
		background: var(--interactive-hover, var(--background-modifier-hover));
	}

	/* ── View content ──────────────────────────────────────────────────────────── */
	.tt-board-content {
		flex: 1;
		overflow: hidden; /* each view manages its own scroll */
		display: flex;
		flex-direction: column;
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
		transition: background 0.12s;
		z-index: 10;
	}
	.tt-fab:hover { background: var(--interactive-accent-hover); }
	.tt-fab-left  { right: unset; left: 16px; }

	/* ── Mobile ────────────────────────────────────────────────────────────────── */
	@media (max-width: 768px) {
		/* FAB above safe area */
		.tt-fab {
			bottom: calc(20px + env(safe-area-inset-bottom, 0px));
		}
	}
</style>
