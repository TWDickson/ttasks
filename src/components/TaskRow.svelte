<script lang="ts">
	import { today } from '../utils/todayStore';
	import type TTasksPlugin from '../main';
	import type { Task } from '../types';
	import type { ExternalTask } from '../integration/types';
	import { PRIORITY_COLORS } from '../constants';
	import { getTaskDateBadge, isTaskOverdue, formatHumanDate } from './taskDateMeta';
	import { canShowInlineReopen } from './taskRowActions';
	import { resolveInferredDueDate, type ResolvedTaskDate } from '../store/taskSchedule';
	import { icon } from '../utils/icon';

	export let plugin: TTasksPlugin;
	export let task: Task;
	export let viewId = '';
	export let active = false;
	export let areaColors: Record<string, string>;
	export let labelColors: Record<string, string>;
	export let onOpen: (path: string) => void;
	export let onContextMenu: ((task: Task, event: MouseEvent) => void) | undefined = undefined;
	export let onRestore: ((path: string) => Promise<void>) | undefined = undefined;
	/** Hierarchical indent level — each level adds 20px left padding. */
	export let indent = 0;
	/** Show a collapse/expand chevron on this row. */
	export let expandable = false;
	/** Current expand state (only relevant when expandable = true). */
	export let expanded = true;
	/** Called when the chevron is clicked. */
	export let onExpand: (() => void) | undefined = undefined;
	/** When true, a selection checkbox is shown before the row content. */
	export let selectable = false;
	/** Whether this task is currently selected. */
	export let selected = false;
	/** Called when the checkbox state changes. */
	export let onSelect: ((path: string) => void) | undefined = undefined;
	/** Whether this row is keyboard-focused in board navigation. */
	export let keyboardFocused = false;
	/** Promote callback for captured/external tasks. */
	export let onPromote: ((task: ExternalTask) => void) | undefined = undefined;
	/** Resolved dependency-chain schedule, used for the projected-date badge. */
	export let schedule: Map<string, ResolvedTaskDate> | undefined = undefined;

	$: overdue = isTaskOverdue(task, $today);
	$: dateBadge = getTaskDateBadge(task, $today);
	$: inferredDue = schedule ? resolveInferredDueDate(task, schedule.get(task.path)) : null;

	function getBadgeStyle(color: string | undefined): string {
		return color ? `--tt-badge-color:${color};` : '';
	}

	function handleOpen(): void {
		if (isCapturedTask(task)) {
			void plugin.openCapturedTask(task);
			return;
		}
		onOpen(task.path);
	}

	function handleContextMenu(event: MouseEvent): void {
		if (!onContextMenu) return;
		event.preventDefault();
		onContextMenu(task, event);
	}

	function handleHoverPreview(event: MouseEvent): void {
		plugin.triggerTaskHoverPreview(task.path, event);
	}

	async function handleRestore(event: MouseEvent): Promise<void> {
		event.preventDefault();
		event.stopPropagation();
		if (!onRestore) return;
		await onRestore(task.path);
	}

	$: showInlineReopen = canShowInlineReopen(viewId, task) && !!onRestore;

	function isCapturedTask(candidate: Task): candidate is ExternalTask {
		return (candidate as ExternalTask).external === true;
	}

	$: isCaptured = isCapturedTask(task);
	$: isFromPreviousDay = isCaptured && !!task.fromPreviousDay;

	function handlePromote(event: MouseEvent): void {
		event.preventDefault();
		event.stopPropagation();
		if (!isCaptured || !onPromote) return;
		onPromote(task);
	}
</script>

<li
	class="tt-task"
	class:is-overdue={overdue}
	class:is-active={active}
	class:is-keyboard-focused={keyboardFocused}
	data-task-path={task.path}
	style:padding-left={indent > 0 ? `${indent * 20}px` : undefined}
>
	{#if selectable}
		{#if !isCaptured}
		<input
			type="checkbox"
			class="tt-task-checkbox"
			checked={selected}
			aria-label="Select task"
			on:click|stopPropagation
			on:change|stopPropagation={() => onSelect?.(task.path)}
		/>
		{/if}
	{/if}
	{#if expandable}
		<button
			type="button"
			class="tt-expand-btn"
			aria-label={expanded ? 'Collapse' : 'Expand'}
			on:click|stopPropagation={onExpand}
		><span class="tt-expand-icon" use:icon={expanded ? 'chevron-down' : 'chevron-right'}></span></button>
	{:else if indent > 0}
		<span class="tt-expand-spacer" aria-hidden="true"></span>
	{/if}
	<button
		type="button"
		class="tt-task-btn"
		class:is-active={active}
		data-task-path={task.path}
		on:click={handleOpen}
		on:mouseenter={handleHoverPreview}
		on:contextmenu={handleContextMenu}
	>
		<div class="tt-task-main">
			<span
				class="tt-priority-dot"
				class:is-none={task.priority === 'None'}
				style={`background:${PRIORITY_COLORS[task.priority] ?? PRIORITY_COLORS.None}`}
				title={`Priority: ${task.priority}`}
			></span>
			<span class="tt-task-name">{task.name}</span>
		</div>
		<div class="tt-task-meta">
			{#if isCaptured}
				<span class="tt-badge tt-badge-captured">captured</span>
			{/if}
			{#if isFromPreviousDay}
				<span class="tt-badge tt-badge-previous-day">from yesterday</span>
			{/if}
			{#if task.area}
				<span class="tt-badge tt-badge-cat" class:tt-badge-tinted={!!areaColors?.[task.area]} style={getBadgeStyle(areaColors?.[task.area])}>{task.area}</span>
			{/if}
			{#if dateBadge}
				<span
					class="tt-badge"
					class:tt-badge-overdue={dateBadge.isOverdue}
					class:tt-badge-completed={dateBadge.kind === 'completed'}
					title={dateBadge.title}
				>{dateBadge.label}</span>
			{:else if inferredDue}
				<span
					class="tt-badge tt-badge-inferred"
					title="Projected finish, inferred from dependency chain"
				>~{formatHumanDate(inferredDue, $today)}</span>
			{/if}
			{#each task.labels as label (label)}
				<span class="tt-badge tt-badge-type" class:tt-badge-tinted={!!labelColors?.[label]} style={getBadgeStyle(labelColors?.[label])}>{label}</span>
			{/each}
		</div>
	</button>
	{#if showInlineReopen}
		<button type="button" class="tt-inline-reopen" on:click={handleRestore} aria-label="Reopen task">Reopen</button>
	{/if}
	{#if isCaptured}
		<button type="button" class="tt-inline-promote" on:click={handlePromote} aria-label="Promote task">Promote</button>
	{/if}
</li>

<style>
	/* Hover/active live on the row so the checkbox sits inside the highlight. */
	.tt-task {
		position: relative;
		display: flex;
		align-items: center;
		overflow: hidden;
		border-radius: var(--radius-m, 8px);
		min-height: 36px;
		transition: background 0.1s ease;
	}

	.tt-task:hover {
		background: var(--background-modifier-hover);
	}

	/* Selected uses an accent tint (not the neutral hover grey) so it stays */
	/* distinguishable from a hovered-but-unselected row. The tint is painted */
	/* on an inset overlay, not the row, so the box hugs the content instead */
	/* of filling the full 36px row slab. */
	.tt-task.is-active,
	.tt-task.is-active:hover {
		background: transparent;
	}

	.tt-task.is-active::before {
		content: '';
		position: absolute;
		inset: 3px 2px;
		border-radius: var(--radius-s, 6px);
		background: color-mix(in srgb, var(--interactive-accent) 14%, var(--background-primary));
		box-shadow: inset 2px 0 0 var(--interactive-accent);
		pointer-events: none;
	}

	/* Selected + hovered = a distinct third state (stronger tint). */
	.tt-task.is-active:hover::before {
		background: color-mix(in srgb, var(--interactive-accent) 22%, var(--background-primary));
	}

	/* Positioned so the selection overlay (::before) can't paint over it. */
	.tt-task-checkbox {
		position: relative;
		flex-shrink: 0;
		width: 16px;
		height: 16px;
		margin-left: var(--tt-space-2, 8px);
		cursor: pointer;
		accent-color: var(--interactive-accent);
	}

	.tt-expand-btn {
		position: relative;
		flex-shrink: 0;
		width: 20px;
		min-height: 24px;
		background: none;
		border: none;
		padding: 0;
		cursor: pointer;
		color: var(--text-muted);
		line-height: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: var(--radius-s, 4px);
	}
	.tt-expand-btn:hover {
		color: var(--text-normal);
		background: var(--background-modifier-hover);
	}

	.tt-expand-icon {
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.tt-expand-icon :global(svg) {
		width: 14px;
		height: 14px;
	}

	.tt-expand-spacer {
		flex-shrink: 0;
		width: 20px;
	}

	.tt-task-btn {
		flex: 1;
		min-width: 0;
		/* Obsidian's app.css gives buttons a fixed height; this button wraps */
		/* name + badge rows (two lines on mobile), so it must size to content. */
		height: auto;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--tt-space-2);
		padding: var(--tt-space-2) var(--tt-space-3);
		border: none;
		border-radius: 0;
		background: transparent;
		color: var(--text-normal);
		cursor: pointer;
		text-align: left;
		box-shadow: none;
		-webkit-touch-callout: none;
		-webkit-user-select: none;
		user-select: none;
		touch-action: pan-y;
		position: relative;
		z-index: 1;
	}

	.tt-inline-reopen {
		position: relative;
		align-self: center;
		margin-left: var(--tt-space-1);
		padding: 4px 8px;
		border: 1px solid var(--background-modifier-border);
		border-radius: var(--button-radius, var(--radius-m, 8px));
		background: transparent;
		color: var(--text-muted);
		font-size: 0.72rem;
		font-weight: 600;
		cursor: pointer;
		white-space: nowrap;
	}

	.tt-inline-reopen:hover {
		color: var(--text-normal);
		background: var(--interactive-hover, var(--background-modifier-hover));
	}

	.tt-inline-promote {
		position: relative;
		align-self: center;
		margin-left: var(--tt-space-1);
		padding: 4px 8px;
		border: 1px solid color-mix(in srgb, var(--color-cyan) 45%, var(--background-modifier-border));
		border-radius: var(--button-radius, var(--radius-m, 8px));
		background: color-mix(in srgb, var(--color-cyan) 12%, transparent);
		color: var(--color-cyan);
		font-size: 0.72rem;
		font-weight: 700;
		cursor: pointer;
		white-space: nowrap;
	}

	.tt-inline-promote:hover {
		background: color-mix(in srgb, var(--color-cyan) 22%, transparent);
	}

	.tt-task.is-keyboard-focused .tt-task-btn {
		outline: 2px solid var(--interactive-accent);
		outline-offset: -2px;
	}

	.tt-task-btn.is-active .tt-task-name {
		color: var(--interactive-accent);
		font-weight: 500;
	}

	.tt-task-btn.is-active .tt-priority-dot {
		outline: 2px solid var(--interactive-accent);
		outline-offset: 1px;
	}

	.tt-task-btn:focus-visible {
		outline: 2px solid var(--interactive-accent);
		outline-offset: -2px;
	}

	.tt-task.is-overdue .tt-task-name {
		color: var(--color-red);
	}

	/* Overdue red outranks the selected accent even if rule order changes. */
	.tt-task.is-overdue .tt-task-btn.is-active .tt-task-name {
		color: var(--color-red);
	}

	.tt-task-main {
		display: flex;
		align-items: center;
		gap: var(--tt-space-2);
		min-width: 0;
	}

	.tt-priority-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	/* No-priority rows show no dot; the hidden span keeps names aligned. */
	.tt-priority-dot.is-none {
		visibility: hidden;
	}

	.tt-task-name {
		font-size: 0.9rem;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		flex: 1;
	}

	.tt-task-meta {
		display: flex;
		align-items: center;
		gap: var(--tt-space-1);
		flex-shrink: 0;
	}

	/* .tt-badge and its variants are plugin-global (styles.css). */

	@media (max-width: 768px) {
		.tt-task-btn {
			flex-direction: column;
			align-items: flex-start;
			gap: 4px;
		}

		/* Names wrap on mobile; pin the dot to the first line like kanban cards. */
		.tt-task-main {
			align-items: flex-start;
		}

		.tt-priority-dot {
			margin-top: 6px;
		}

		.tt-task-meta {
			padding-left: 16px; /* align under name, past the priority dot */
			flex-wrap: wrap;
		}

		.tt-task-name {
			white-space: normal;
			overflow: visible;
			text-overflow: unset;
			-webkit-line-clamp: 2;
			display: -webkit-box;
			-webkit-box-orient: vertical;
		}
	}
</style>
