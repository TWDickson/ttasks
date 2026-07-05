<script lang="ts">
	import { today } from '../utils/todayStore';
	import type { Readable, Writable } from 'svelte/store';
	import type { Task, TaskStatus } from '../types';
	import type { TaskGroup } from '../query/types';
	import type TaskStore from '../store/TaskStore';
	import type TTasksPlugin from '../main';
	import { PRIORITY_COLORS } from '../constants';
	import { labelForGroup } from './viewAdapters';
	import { getTaskDateBadge, isTaskOverdue } from './taskDateMeta';
	import { buildDepCountBadge, isFieldEnabled, type KanbanCardField } from './kanbanCardFields';
	import { deserializeCollapsed, isColumnCollapsed, serializeCollapsed, toggleColumnCollapse } from './kanbanCollapse';
	import { icon } from '../utils/icon';

	export let plugin: TTasksPlugin;
	export let groups: Readable<TaskGroup[]>;
	export let statuses: string[];
	export let statusColors: Record<string, string>;
	export let areaColors: Record<string, string>;
	export let labelColors: Record<string, string>;
	export let blockStatus = 'Blocked';
	export let kanbanCardFields: KanbanCardField[] = ['area', 'dueDate', 'labels', 'depCount'];
	export let activeTaskPath: Writable<string | null>;
	export let store: TaskStore;
	export let onOpen: (path: string) => void;
	export let onContextMenu: ((task: Task, event: MouseEvent) => void) | undefined = undefined;

	type Column = { id: TaskStatus; label: string; accent?: string };

	let activeColumn: TaskStatus = statuses?.[0] ?? 'Active';
	let draggingPath: string | null = null;
	let dragOverCol: TaskStatus | null = null;
	let collapsedColumns = deserializeCollapsed(plugin.settings.kanbanCollapsedColumns);

	async function handleToggleCollapse(columnId: string): Promise<void> {
		collapsedColumns = toggleColumnCollapse(collapsedColumns, columnId);
		plugin.settings.kanbanCollapsedColumns = serializeCollapsed(collapsedColumns);
		await plugin.saveSettings();
	}

	$: COLUMNS = (() => {
		const tasksByStatus = new Map<string, Task[]>();
		for (const group of $groups) {
			tasksByStatus.set(group.key, group.tasks.filter(t => t.type !== 'project'));
		}
		return (statuses ?? []).map(status => ({
			id: status as TaskStatus,
			label: labelForGroup(status),
			accent: statusColors?.[status],
			tasks: tasksByStatus.get(status) ?? [],
		}));
	})();
	$: allTasks = COLUMNS.flatMap(column => column.tasks);

	$: if (!COLUMNS.some(col => col.id === activeColumn)) {
		activeColumn = COLUMNS[0]?.id ?? 'Active';
	}

	function isOverdue(task: Task, todayDate: string): boolean {
		return isTaskOverdue(task, todayDate);
	}

	function getDateBadge(task: Task, todayDate: string) {
		return getTaskDateBadge(task, todayDate);
	}

	// Resolve a dependency link to its task (via the store, so completed
	// dependencies not visible on the board still count correctly). Kept
	// consistent with the Detail panel's "blocked by open" number.
	function resolveDependencyTask(link: string): { is_complete: boolean } | null {
		return store.getByPath(link) ?? null;
	}

	function onDragStart(e: DragEvent, path: string) {
		draggingPath = path;
		e.dataTransfer?.setData('text/plain', path);
		if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
	}

	function onDragOver(e: DragEvent, colId: TaskStatus) {
		e.preventDefault();
		if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
		dragOverCol = colId;
	}

	function onDragLeave(e: DragEvent) {
		// Only clear if leaving the column entirely (not entering a child)
		const rel = e.relatedTarget as HTMLElement | null;
		if (!rel || !(e.currentTarget as HTMLElement).contains(rel)) {
			dragOverCol = null;
		}
	}

	function onDrop(e: DragEvent, colId: TaskStatus) {
		e.preventDefault();
		dragOverCol = null;
		if (!draggingPath) return;
		moveDraggingTaskTo(colId);
	}

	function moveDraggingTaskTo(colId: TaskStatus) {
		if (!draggingPath) return;
		const task = store.getByPath(draggingPath);
		draggingPath = null;
		if (!task || task.status === colId) return;
		store.setStatus(task, colId);
	}

	function onCardKeyDown(e: KeyboardEvent, path: string) {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			onOpen(path);
		}
	}

	function onCardContextMenu(event: MouseEvent, task: Task): void {
		if (!onContextMenu) return;
		event.preventDefault();
		onContextMenu(task, event);
	}

	function onCardHover(event: MouseEvent, task: Task): void {
		plugin.triggerTaskHoverPreview(task.path, event);
	}

	function onDragEnd() {
		draggingPath = null;
		dragOverCol = null;
	}

	function getBadgeStyle(color: string | undefined): string {
		return color ? `--tt-badge-color:${color};` : '';
	}

	function getColumnLabelId(colId: TaskStatus): string {
		return `tt-kanban-col-${String(colId).toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
	}
</script>

<div class="tt-kanban-wrap">

	<!-- Mobile: status tab strip -->
	<div class="tt-kanban-tabs">
		{#each COLUMNS as col}
			<button
				class="tt-kanban-tab"
				class:is-active={activeColumn === col.id}
				style={activeColumn === col.id && col.accent ? `color:${col.accent};border-bottom-color:${col.accent}` : ''}
				on:click={() => activeColumn = col.id}
			>
				{col.label}
				{#if col.tasks.length > 0}<span class="tt-tab-count">{col.tasks.length}</span>{/if}
			</button>
		{/each}
	</div>

	<div class="tt-kanban">
		{#each COLUMNS as col}
			{@const cards = col.tasks}
			{@const collapsed = isColumnCollapsed(collapsedColumns, col.id)}
			<div
				class="tt-kanban-col"
				class:is-active-col={activeColumn === col.id}
				class:is-drag-over={dragOverCol === col.id}
				class:tt-col-collapsed={collapsed}
				role="group"
				aria-labelledby={getColumnLabelId(col.id)}
				on:dragover={(e) => onDragOver(e, col.id)}
				on:dragleave={onDragLeave}
				on:drop={(e) => onDrop(e, col.id)}
			>
				{#if collapsed}
					<!-- Whole collapsed column is one expand button (tiny chevron was unhittable). -->
					<button
						class="tt-kanban-col-header tt-col-expand-btn"
						title="Expand {col.label} column"
						aria-label="Expand {col.label} column"
						on:click={() => handleToggleCollapse(col.id)}
					>
						<span class="tt-col-collapsed-run">
							<span
								id={getColumnLabelId(col.id)}
								class="tt-kanban-col-label"
								style={col.accent ? `color:${col.accent}` : ''}
							>{col.label}</span>
							<span class="tt-count">{cards.length}</span>
						</span>
						<span class="tt-col-collapse-icon" use:icon={'chevron-right'}></span>
					</button>
				{:else}
					<div class="tt-kanban-col-header">
						<span
							id={getColumnLabelId(col.id)}
							class="tt-kanban-col-label"
							style={col.accent ? `color:${col.accent}` : ''}
						>{col.label}</span>
						<span class="tt-count">{cards.length}</span>
						<button
							class="tt-col-collapse-btn"
							title="Collapse column"
							on:click|stopPropagation={() => handleToggleCollapse(col.id)}
							aria-label="Collapse"
						><span class="tt-col-collapse-icon" use:icon={'chevron-left'}></span></button>
					</div>
				{/if}

				{#if !collapsed}
				<div class="tt-kanban-col-body">
					{#if cards.length === 0}
						<div class="tt-kanban-empty">Drop tasks here</div>
					{:else}
						{#each cards as task (task.path)}
							<div
								class="tt-kanban-card"
								class:is-active={$activeTaskPath === task.path}
								class:is-overdue={isOverdue(task, $today)}
								class:is-dragging={draggingPath === task.path}
								draggable="true"
								role="button"
								tabindex="0"
								on:click={() => onOpen(task.path)}
								on:keydown={(e) => onCardKeyDown(e, task.path)}
								on:mouseenter={(event) => onCardHover(event, task)}
								on:contextmenu={(event) => onCardContextMenu(event, task)}
								on:dragstart={(e) => onDragStart(e, task.path)}
								on:dragend={onDragEnd}
							>
								<div class="tt-card-top">
									<span
										class="tt-priority-dot"
										style="background:{PRIORITY_COLORS[task.priority] ?? PRIORITY_COLORS.None}"
										title="Priority: {task.priority}"
									></span>
									<span class="tt-card-name">{task.name}</span>
								</div>

								{#if task.status === blockStatus && task.blocked_reason}
									<p class="tt-card-blocked-reason">{task.blocked_reason}</p>
								{/if}

								<div class="tt-card-meta">
									{#if task.area && isFieldEnabled(kanbanCardFields, 'area')}
										<span class="tt-badge tt-badge-cat" class:tt-badge-tinted={!!areaColors?.[task.area]} style={getBadgeStyle(areaColors?.[task.area])}>{task.area}</span>
									{/if}
									{#if isFieldEnabled(kanbanCardFields, 'dueDate')}
										{@const badge = getDateBadge(task, $today)}
										{#if badge}
											<span
												class="tt-badge"
												class:tt-badge-overdue={badge.isOverdue}
												class:tt-badge-completed={badge.kind === 'completed'}
												title={badge.title}
											>
												{badge.label}
											</span>
										{/if}
									{/if}
									{#if isFieldEnabled(kanbanCardFields, 'labels')}
										{#each task.labels as label (label)}
											<span class="tt-badge tt-badge-type" class:tt-badge-tinted={!!labelColors?.[label]} style={getBadgeStyle(labelColors?.[label])}>{label}</span>
										{/each}
									{/if}
									{#if isFieldEnabled(kanbanCardFields, 'depCount')}
										{@const depBadge = buildDepCountBadge(task, resolveDependencyTask)}
										{#if depBadge}
											{@const depLabel = [depBadge.blockedByOpen > 0 ? `⏸${depBadge.blockedByOpen}` : '', depBadge.unblocks > 0 ? `→${depBadge.unblocks}` : ''].filter(Boolean).join(' ')}
											{#if depLabel}
												<span class="tt-badge tt-badge-dep" title="Blocked by {depBadge.blockedByOpen} open of {depBadge.blockedByTotal} · Unblocks {depBadge.unblocks}">
													{depLabel}
												</span>
											{/if}
										{/if}
									{/if}
									<!-- Mobile-only: inline status change -->
									<select
										class="tt-card-status-select"
										value={task.status}
										on:click|stopPropagation
										on:change|stopPropagation={(e) => {
											const target = e.currentTarget;
											if (target.value !== task.status) {
												store.setStatus(task, target.value);
											}
										}}
									>
										{#each statuses as s}
											<option value={s}>{s}</option>
										{/each}
									</select>
								</div>
							</div>
						{/each}
					{/if}
				</div>
				{/if}
			</div>
		{/each}
	</div>

</div>

<style>
	/* Design tokens inherit from .tt-board (styles.css). */

	/* ── Wrapper ────────────────────────────────────────────────────────────────── */
	.tt-kanban-wrap {
		display: flex;
		flex-direction: column;
		height: 100%;
		overflow: clip; /* clip layout overflow without blocking child scroll */
	}

	/* ── Mobile tab strip (hidden on desktop) ───────────────────────────────────── */
	.tt-kanban-tabs {
		display: none;
	}

	/* ── Board ──────────────────────────────────────────────────────────────────── */
	.tt-kanban {
		display: flex;
		gap: var(--tt-space-3);
		padding: var(--tt-space-3);
		padding-bottom: 20px; /* room for horizontal scrollbar */
		height: 100%;
		overflow-x: auto;
		overflow-y: hidden;
		align-items: stretch;
		box-sizing: border-box;
		/* Force a visible scrollbar — macOS hides overlay scrollbars until hover */
		scrollbar-width: thin;
		scrollbar-color: var(--scrollbar-thumb-bg, var(--interactive-normal)) transparent;
	}
	.tt-kanban::-webkit-scrollbar { height: 6px; }
	.tt-kanban::-webkit-scrollbar-thumb {
		background: var(--scrollbar-thumb-bg, var(--interactive-normal));
		border-radius: 3px;
	}
	.tt-kanban::-webkit-scrollbar-track { background: transparent; }

	/* ── Column ─────────────────────────────────────────────────────────────────── */
	.tt-kanban-col {
		width: 240px;
		flex-shrink: 0;
		display: flex;
		flex-direction: column;
		height: 100%;
		min-height: 0;
		max-height: 100%;
		background: var(--background-primary-alt, var(--background-secondary));
		border-radius: var(--radius-m, 8px);
		overflow: hidden;
		border: 2px solid transparent;
		transition: border-color 0.12s;
	}

	.tt-kanban-col.is-drag-over {
		border-color: var(--interactive-accent);
	}

	.tt-col-collapsed {
		width: 52px !important;
		min-width: 52px;
		flex: none;
		overflow: hidden;
		cursor: pointer;
		opacity: 0.7;
		transition: opacity 0.15s, background 0.15s;
	}

	.tt-col-collapsed:hover {
		opacity: 1;
		background: var(--background-modifier-hover);
	}

	.tt-col-collapsed .tt-kanban-col-header {
		flex-direction: column;
		align-items: center;
		gap: 6px;
		padding: 10px 6px;
		height: 100%;
		cursor: pointer;
	}

	/* Title + count share one vertical writing-mode wrapper so they read as a
	   single continuous line; the chevron stays pinned at the bottom. */
	.tt-col-collapsed-run {
		flex: 1;
		min-height: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		writing-mode: vertical-rl;
		overflow: hidden;
	}

	.tt-col-collapsed .tt-kanban-col-label {
		flex: none;
	}

	/* Collapsed header is a single full-height expand button */
	.tt-col-expand-btn {
		border: none;
		background: transparent;
		cursor: pointer;
		width: 100%;
		height: 100%;
		color: var(--text-muted);
	}

	.tt-col-expand-btn:hover {
		background: var(--background-modifier-hover);
	}

	.tt-col-collapse-btn {
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		min-width: 24px;
		min-height: 24px;
		background: transparent;
		border: none;
		color: var(--text-faint);
		cursor: pointer;
		padding: 2px;
		border-radius: var(--radius-s, 4px);
		line-height: 1;
	}

	.tt-col-collapse-icon {
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.tt-col-collapse-icon :global(svg) {
		width: 14px;
		height: 14px;
	}

	.tt-col-collapse-btn:hover {
		background: var(--background-modifier-hover);
		color: var(--text-normal);
	}

	.tt-kanban-col-header {
		display: flex;
		align-items: center;
		gap: var(--tt-space-1);
		padding: 10px 12px 8px;
		flex-shrink: 0;
		border-bottom: 1px solid var(--background-modifier-border);
	}

	.tt-kanban-col-label {
		font-size: 0.72rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--text-muted);
		flex: 1;
	}

	/* .tt-count is plugin-global (styles.css). */

	.tt-kanban-col-body {
		flex: 1;
		overflow-y: auto;
		padding: var(--tt-space-2);
		display: flex;
		flex-direction: column;
		gap: var(--tt-space-1);
		/* Ensure the drop zone is always full-height */
		min-height: 60px;
	}

	.tt-kanban-empty {
		text-align: center;
		padding: var(--tt-space-4) 0;
		color: var(--text-faint);
		font-size: 0.82rem;
		border: 1px dashed var(--background-modifier-border);
		border-radius: var(--radius-s, 4px);
	}

	/* ── Card ───────────────────────────────────────────────────────────────────── */
	.tt-kanban-card {
		display: flex;
		flex-direction: column;
		gap: 7px;
		padding: 10px 12px;
		border: none;
		border-radius: var(--radius-m, 8px);
		background: var(--background-primary);
		color: var(--text-normal);
		cursor: grab;
		text-align: left;
		width: 100%;
		box-shadow: 0 1px 3px rgba(var(--mono-rgb-100), 0.08);
		border-left: 3px solid transparent;
		transition: background 0.1s, box-shadow 0.1s, border-left-color 0.1s;
	}

	.tt-kanban-card:hover {
		background: var(--background-modifier-hover);
		box-shadow: 0 2px 6px rgba(var(--mono-rgb-100), 0.12);
	}

	.tt-kanban-card.is-active {
		border-left-color: var(--interactive-accent);
		background: color-mix(in srgb, var(--interactive-accent) 12%, var(--background-primary));
	}

	.tt-kanban-card.is-active:hover {
		background: color-mix(in srgb, var(--interactive-accent) 20%, var(--background-primary));
	}

	.tt-kanban-card.is-dragging {
		opacity: 0.4;
		cursor: grabbing;
	}

	.tt-card-top {
		display: flex;
		align-items: flex-start;
		gap: 8px;
	}

	.tt-priority-dot {
		width: 9px;
		height: 9px;
		border-radius: 50%;
		flex-shrink: 0;
		margin-top: 4px;
	}

	.tt-card-name {
		font-size: 0.9rem;
		line-height: 1.4;
		word-break: break-word;
		font-weight: 500;
	}

	.tt-kanban-card.is-active .tt-card-name {
		color: var(--interactive-accent);
	}

	.tt-kanban-card.is-overdue .tt-card-name {
		color: var(--color-red);
	}

	.tt-card-blocked-reason {
		font-size: 0.76rem;
		color: var(--text-muted);
		margin: 0;
		padding-left: 17px;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	/* ── Badges (visuals are plugin-global in styles.css) ───────────────────────── */
	.tt-card-meta {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
		padding-left: 17px;
	}

	/* Status select: hidden on desktop, visible on mobile */
	.tt-card-status-select {
		display: none;
	}

	/* ── Mobile ─────────────────────────────────────────────────────────────────── */
	@media (max-width: 768px) {
		/* Keep the native dropdown arrow so it reads as a control, not a badge. */
		.tt-card-status-select {
			display: inline-block;
			font-size: 0.68rem;
			padding: 2px 6px;
			min-height: 24px;
			border-radius: 999px;
			border: 1px solid var(--background-modifier-border);
			background: var(--background-secondary);
			color: var(--text-muted);
			cursor: pointer;
		}
		.tt-kanban-tabs {
			display: flex;
			overflow-x: auto;
			flex-shrink: 0;
			border-bottom: 1px solid var(--background-modifier-border);
			background: var(--background-secondary);
			scrollbar-width: none;
		}
		.tt-kanban-tabs::-webkit-scrollbar { display: none; }

		.tt-kanban-tab {
			flex-shrink: 0;
			display: flex;
			align-items: center;
			gap: 5px;
			padding: 10px 14px;
			border: none;
			background: transparent;
			color: var(--text-muted);
			font-size: 0.85rem;
			font-weight: 500;
			cursor: pointer;
			border-bottom: 2px solid transparent;
			white-space: nowrap;
			transition: color 0.1s, border-color 0.1s;
		}
		.tt-kanban-tab.is-active {
			color: var(--interactive-accent);
			border-bottom-color: var(--interactive-accent);
			font-weight: 600;
		}

		.tt-tab-count {
			font-size: 0.72rem;
			background: var(--background-modifier-border);
			border-radius: 999px;
			padding: 1px 6px;
		}

		.tt-kanban {
			padding: 8px;
		}
		.tt-kanban-col {
			display: none;
			width: 100%;
		}
		.tt-kanban-col.is-active-col {
			display: flex;
		}

		/* Touch devices: use pointer cursor, no grab */
		.tt-kanban-card {
			cursor: pointer;
		}
	}
</style>
