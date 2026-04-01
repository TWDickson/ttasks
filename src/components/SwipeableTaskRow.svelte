<script lang="ts">
	import { onMount } from 'svelte';
	import type TTasksPlugin from '../main';
	import type { Task } from '../types';
	import type { QuickActionId } from '../settings';
	import { QUICK_ACTION_LABELS } from '../settings';

	export let plugin: TTasksPlugin;
	export let task: Task;
	export let active = false;
	export let categoryColors: Record<string, string>;
	export let taskTypeColors: Record<string, string>;
	export let onOpen: (path: string) => void;

	const PRIORITY_COLORS: Record<string, string> = {
		High: 'var(--color-red)',
		Medium: 'var(--color-orange)',
		Low: 'var(--color-blue)',
		None: 'var(--text-faint)',
	};

	const ACTION_COLORS: Record<QuickActionId, string> = {
		none: 'var(--background-modifier-border)',
		start: 'var(--color-blue)',
		complete: 'var(--color-green)',
		block: 'var(--color-red)',
		defer: 'var(--color-orange)',
	};

	type OpenSide = 'left' | 'right' | null;

	const OPEN_OFFSET = 84;
	const MAX_OFFSET = 104;
	const INTENT_THRESHOLD = 10;
	const OPEN_THRESHOLD = 44;

	let swipeCapable = false;
	let pointerId: number | null = null;
	let startX = 0;
	let startY = 0;
	let baseOffset = 0;
	let dragOffset = 0;
	let dragging = false;
	let suppressClick = false;
	let openSide: OpenSide = null;

	$: leftGestureAction = plugin.settings.quickActions.mobileSwipeLeftAction;
	$: rightGestureAction = plugin.settings.quickActions.mobileSwipeRightAction;
	$: revealLeftAction = rightGestureAction;
	$: revealRightAction = leftGestureAction;
	$: swipeEnabled = swipeCapable && plugin.settings.quickActions.mobileSwipeEnabled && task.type === 'task' && (leftGestureAction !== 'none' || rightGestureAction !== 'none');
	$: canRevealLeft = swipeEnabled && revealLeftAction !== 'none';
	$: canRevealRight = swipeEnabled && revealRightAction !== 'none';
	$: offsetX = dragging
		? dragOffset
		: openSide === 'left'
			? OPEN_OFFSET
			: openSide === 'right'
				? -OPEN_OFFSET
				: 0;

	function today(): string {
		return new Date().toISOString().slice(0, 10);
	}

	function isOverdue(due: string | null): boolean {
		if (!due) return false;
		return due < today();
	}

	function getBadgeStyle(color: string | undefined): string {
		return color ? `--tt-badge-color:${color};` : '';
	}

	function getActionColor(action: QuickActionId): string {
		return ACTION_COLORS[action] ?? ACTION_COLORS.none;
	}

	function clampOffset(value: number): number {
		const min = canRevealRight ? -MAX_OFFSET : 0;
		const max = canRevealLeft ? MAX_OFFSET : 0;
		return Math.max(min, Math.min(max, value));
	}

	function resetPointerState(): void {
		pointerId = null;
		startX = 0;
		startY = 0;
		baseOffset = 0;
		dragOffset = 0;
		dragging = false;
	}

	function onPointerDown(event: PointerEvent): void {
		if (!swipeEnabled || event.pointerType !== 'touch') return;
		pointerId = event.pointerId;
		startX = event.clientX;
		startY = event.clientY;
		baseOffset = openSide === 'left' ? OPEN_OFFSET : openSide === 'right' ? -OPEN_OFFSET : 0;
		dragOffset = baseOffset;
		dragging = false;
		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
	}

	function onPointerMove(event: PointerEvent): void {
		if (!swipeEnabled || pointerId !== event.pointerId) return;
		const dx = event.clientX - startX;
		const dy = event.clientY - startY;

		if (!dragging) {
			if (Math.abs(dx) < INTENT_THRESHOLD) return;
			if (Math.abs(dx) <= Math.abs(dy)) {
				resetPointerState();
				return;
			}
			dragging = true;
			suppressClick = true;
		}

		event.preventDefault();
		dragOffset = clampOffset(baseOffset + dx);
	}

	function onPointerUp(event: PointerEvent): void {
		if (pointerId !== event.pointerId) return;
		if (dragging) {
			if (dragOffset >= OPEN_THRESHOLD && canRevealLeft) {
				openSide = 'left';
			} else if (dragOffset <= -OPEN_THRESHOLD && canRevealRight) {
				openSide = 'right';
			} else {
				openSide = null;
			}
		}
		resetPointerState();
	}

	function onPointerCancel(event: PointerEvent): void {
		if (pointerId !== event.pointerId) return;
		resetPointerState();
	}

	function handleOpen(event: MouseEvent): void {
		if (suppressClick) {
			event.preventDefault();
			event.stopPropagation();
			suppressClick = false;
			return;
		}

		if (openSide) {
			event.preventDefault();
			openSide = null;
			return;
		}

		onOpen(task.path);
	}

	async function triggerAction(action: QuickActionId): Promise<void> {
		if (action === 'none') return;
		const didRun = await plugin.runQuickAction(action, task.path, { showNotice: false });
		if (didRun) openSide = null;
	}

	onMount(() => {
		if (typeof window === 'undefined') return;
		const media = window.matchMedia('(pointer: coarse)');
		const updateSwipeCapable = () => {
			swipeCapable = media.matches;
		};
		updateSwipeCapable();
		media.addEventListener?.('change', updateSwipeCapable);
		return () => {
			media.removeEventListener?.('change', updateSwipeCapable);
		};
	});
</script>

<li class="tt-task" class:is-overdue={isOverdue(task.due_date)} class:is-active={active} class:is-swipe-enabled={swipeEnabled}>
	{#if canRevealLeft}
		<div class="tt-swipe-actions tt-swipe-actions-left" aria-hidden={openSide !== 'left' && !dragging}>
			<button
				type="button"
				class="tt-swipe-action"
				style={`--tt-action-color:${getActionColor(revealLeftAction)}`}
				on:click|stopPropagation={() => triggerAction(revealLeftAction)}
			>{QUICK_ACTION_LABELS[revealLeftAction]}</button>
		</div>
	{/if}

	{#if canRevealRight}
		<div class="tt-swipe-actions tt-swipe-actions-right" aria-hidden={openSide !== 'right' && !dragging}>
			<button
				type="button"
				class="tt-swipe-action"
				style={`--tt-action-color:${getActionColor(revealRightAction)}`}
				on:click|stopPropagation={() => triggerAction(revealRightAction)}
			>{QUICK_ACTION_LABELS[revealRightAction]}</button>
		</div>
	{/if}

	<button
		type="button"
		class="tt-task-btn"
		class:is-active={active}
		class:is-dragging={dragging}
		style={`transform: translateX(${offsetX}px);`}
		on:click={handleOpen}
		on:pointerdown={onPointerDown}
		on:pointermove={onPointerMove}
		on:pointerup={onPointerUp}
		on:pointercancel={onPointerCancel}
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
				<span class="tt-badge" class:tt-badge-overdue={isOverdue(task.due_date)}>{task.due_date}</span>
			{/if}
			{#if task.type === 'task' && task.task_type}
				<span class="tt-badge tt-badge-type" class:tt-badge-tinted={!!taskTypeColors?.[task.task_type]} style={getBadgeStyle(taskTypeColors?.[task.task_type])}>{task.task_type}</span>
			{/if}
		</div>
	</button>
</li>

<style>
	.tt-task {
		position: relative;
		display: flex;
		align-items: stretch;
		overflow: hidden;
		border-radius: var(--radius-m, 6px);
	}

	.tt-swipe-actions {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: stretch;
		pointer-events: none;
	}

	.tt-swipe-actions-left {
		justify-content: flex-start;
	}

	.tt-swipe-actions-right {
		justify-content: flex-end;
	}

	.tt-swipe-action {
		pointer-events: auto;
		min-width: 88px;
		border: none;
		border-radius: 0;
		background: var(--tt-action-color);
		color: var(--text-on-accent);
		font-size: 0.78rem;
		font-weight: 700;
		letter-spacing: 0.02em;
		padding: 0 14px;
		box-shadow: none;
	}

	.tt-task-btn {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		padding: 8px 12px;
		width: 100%;
		border: none;
		border-radius: var(--radius-m, 6px);
		background: var(--background-primary);
		color: var(--text-normal);
		cursor: pointer;
		text-align: left;
		transition: transform 0.14s ease, background 0.1s ease;
		box-shadow: none;
		touch-action: pan-y;
		position: relative;
		z-index: 1;
	}

	.tt-task-btn.is-dragging {
		transition: none;
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
		gap: 8px;
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
		gap: 4px;
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

	@media (hover: hover) and (pointer: fine) {
		.tt-task.is-swipe-enabled .tt-swipe-actions {
			display: none;
		}
	}
</style>