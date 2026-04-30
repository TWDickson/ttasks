<script lang="ts">
	import { onMount } from 'svelte';
	import { localDateString } from '../utils/dateUtils';
	import type TTasksPlugin from '../main';
	import type { Task } from '../types';
	import { PRIORITY_COLORS } from '../constants';
	import { getTaskDateBadge, isTaskOverdue } from './taskDateMeta';

	export let plugin: TTasksPlugin;
	export let task: Task;
	export let active = false;
	export let areaColors: Record<string, string>;
	export let labelColors: Record<string, string>;
	export let onOpen: (path: string) => void;
	export let onContextMenu: ((task: Task, event: MouseEvent) => void) | undefined = undefined;
	/** Hierarchical indent level — each level adds 20px left padding. */
	export let indent = 0;
	/** Show a collapse/expand chevron on this row. */
	export let expandable = false;
	/** Current expand state (only relevant when expandable = true). */
	export let expanded = true;
	/** Called when the chevron is clicked. */
	export let onExpand: (() => void) | undefined = undefined;

	let cachedToday = localDateString();

	function today(): string {
		return cachedToday;
	}

	// Refresh cached today at midnight
	onMount(() => {
		const scheduleRefresh = () => {
			const now = new Date();
			const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
			const ms = tomorrow.getTime() - now.getTime() + 100; // 100ms past midnight
			return window.setTimeout(() => {
				cachedToday = localDateString();
				midnightTimer = scheduleRefresh();
			}, ms);
		};
		let midnightTimer = scheduleRefresh();
		return () => window.clearTimeout(midnightTimer);
	});

	function isOverdue(task: Task): boolean {
		return isTaskOverdue(task, today());
	}

	$: dateBadge = getTaskDateBadge(task, today());

	function getBadgeStyle(color: string | undefined): string {
		return color ? `--tt-badge-color:${color};` : '';
	}

	function handleOpen(): void {
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
</script>

<li
	class="tt-task"
	class:is-overdue={isOverdue(task)}
	class:is-active={active}
	style:padding-left={indent > 0 ? `${indent * 20}px` : undefined}
>
	{#if expandable}
		<button
			type="button"
			class="tt-expand-btn"
			aria-label={expanded ? 'Collapse' : 'Expand'}
			on:click|stopPropagation={onExpand}
		>{expanded ? '▾' : '▸'}</button>
	{:else if indent > 0}
		<span class="tt-expand-spacer" aria-hidden="true"></span>
	{/if}
	<button
		type="button"
		class="tt-task-btn"
		class:is-active={active}
		on:click={handleOpen}
		on:mouseenter={handleHoverPreview}
		on:contextmenu={handleContextMenu}
	>
		<div class="tt-task-main">
			<span
				class="tt-priority-dot"
				style={`background:${PRIORITY_COLORS[task.priority] ?? PRIORITY_COLORS.None}`}
				title={`Priority: ${task.priority}`}
			></span>
			<span class="tt-task-name">{task.name}</span>
		</div>
		<div class="tt-task-meta">
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
			{/if}
			{#each task.labels as label (label)}
				<span class="tt-badge tt-badge-type" class:tt-badge-tinted={!!labelColors?.[label]} style={getBadgeStyle(labelColors?.[label])}>{label}</span>
			{/each}
		</div>
	</button>
</li>

<style>
	.tt-task {
		--tt-space-1: var(--size-4-1, 4px);
		--tt-space-2: var(--size-4-2, 8px);
		--tt-space-3: var(--size-4-3, 12px);
		--tt-button-radius: var(--button-radius, var(--radius-m, 8px));
		position: relative;
		display: flex;
		align-items: stretch;
		overflow: visible;
		border-radius: var(--radius-m, 8px);
	}

	.tt-expand-btn {
		flex-shrink: 0;
		width: 20px;
		background: none;
		border: none;
		padding: 0;
		cursor: pointer;
		color: var(--text-muted);
		font-size: 0.75rem;
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

	.tt-expand-spacer {
		flex-shrink: 0;
		width: 20px;
	}

	.tt-task-btn {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--tt-space-2);
		padding: var(--tt-space-2) var(--tt-space-3);
		width: 100%;
		border: none;
		border-radius: var(--tt-button-radius);
		background: var(--background-primary);
		color: var(--text-normal);
		cursor: pointer;
		text-align: left;
		transition: background 0.1s ease;
		box-shadow: none;
		-webkit-touch-callout: none;
		-webkit-user-select: none;
		user-select: none;
		touch-action: pan-y;
		position: relative;
		z-index: 1;
	}

	.tt-task-btn:hover {
		background: var(--background-modifier-hover);
		box-shadow: none;
	}

	.tt-task-btn.is-active {
		background: var(--background-modifier-hover);
		border-left: 2px solid var(--interactive-accent);
		padding-left: 10px;
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

	.tt-badge {
		font-size: 0.7rem;
		padding: 2px 6px;
		border-radius: 999px;
		background: var(--background-modifier-border);
		border: 1px solid transparent;
		color: var(--text-muted);
		white-space: nowrap;
	}

	.tt-badge-tinted {
		background: color-mix(in srgb, var(--tt-badge-color) 18%, var(--background-primary));
		border-color: color-mix(in srgb, var(--tt-badge-color) 42%, var(--background-modifier-border));
		color: var(--tt-badge-color);
	}

	.tt-badge-overdue {
		background: var(--color-red);
		color: var(--text-on-accent);
	}

	.tt-badge-completed {
		background: color-mix(in srgb, var(--color-green) 88%, var(--background-primary));
		color: var(--text-on-accent);
	}

	.tt-badge-type {
		background: var(--background-secondary);
	}

	@media (max-width: 768px) {
		.tt-task-btn {
			flex-direction: column;
			align-items: flex-start;
			gap: 4px;
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
