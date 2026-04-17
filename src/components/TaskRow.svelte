<script lang="ts">
	import { onMount } from 'svelte';
	import { localDateString, daysBetweenLocal } from '../utils/dateUtils';
	import type TTasksPlugin from '../main';
	import type { Task } from '../types';
	import { PRIORITY_COLORS } from '../constants';

	export let plugin: TTasksPlugin;
	export let task: Task;
	export let active = false;
	export let categoryColors: Record<string, string>;
	export let taskTypeColors: Record<string, string>;
	export let onOpen: (path: string) => void;
	export let onContextMenu: ((task: Task, event: MouseEvent) => void) | undefined = undefined;

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

	function isOverdue(due: string | null): boolean {
		if (!due) return false;
		return due < today();
	}

	function relativeDate(due: string): string {
		const t = today();
		if (due === t) return 'Today';
		const diff = daysBetweenLocal(t, due);
		if (diff === 1) return 'Tomorrow';
		if (diff === -1) return 'Yesterday';
		if (diff < -1) return `${Math.abs(diff)}d overdue`;
		if (diff <= 7) return `In ${diff}d`;
		return due;
	}

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

<li class="tt-task" class:is-overdue={isOverdue(task.due_date)} class:is-active={active}>
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
			{#if task.category}
				<span class="tt-badge tt-badge-cat" class:tt-badge-tinted={!!categoryColors?.[task.category]} style={getBadgeStyle(categoryColors?.[task.category])}>{task.category}</span>
			{/if}
			{#if task.due_date}
				<span class="tt-badge" class:tt-badge-overdue={isOverdue(task.due_date)} title={task.due_date}>{relativeDate(task.due_date)}</span>
			{/if}
			{#if task.type === 'task' && task.task_type}
				<span class="tt-badge tt-badge-type" class:tt-badge-tinted={!!taskTypeColors?.[task.task_type]} style={getBadgeStyle(taskTypeColors?.[task.task_type])}>{task.task_type}</span>
			{/if}
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
