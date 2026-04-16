<script lang="ts">
	import { Modal, Notice } from 'obsidian';
	import { onMount } from 'svelte';
	import { localDateString, daysBetweenLocal } from '../utils/dateUtils';
	import type TTasksPlugin from '../main';
	import type { Task } from '../types';
	import type { QuickActionId } from '../settings';
	import { QUICK_ACTION_LABELS } from '../settings';
	import { PRIORITY_COLORS } from '../constants';

	export let plugin: TTasksPlugin;
	export let task: Task;
	export let active = false;
	export let categoryColors: Record<string, string>;
	export let taskTypeColors: Record<string, string>;
	export let onOpen: (path: string) => void;
	export let onContextMenu: ((task: Task, event: MouseEvent) => void) | undefined = undefined;

	type MenuPrimaryAction = QuickActionId | 'edit';
	type DeferPreset = 1 | 3 | 7 | 'custom';

	const ACTION_COLORS: Record<MenuPrimaryAction, string> = {
		none: 'var(--background-modifier-border)',
		start: 'var(--color-blue)',
		complete: 'var(--color-green)',
		block: 'var(--color-red)',
		defer: 'var(--color-orange)',
		edit: 'var(--color-cyan)',
	};

	const HOLD_DELAY_MS = 400;
	const MOVE_CANCEL_PX = 8;
	const MENU_HALF_WIDTH = 172;
	const MENU_MARGIN = 12;
	const MENU_HEIGHT_ESTIMATE = 196;
	const CLOSE_TILE_HALF_WIDTH = 54;

	let touchCapable = false;
	let menuTimeout: number | null = null;
	let holdTimer: number | null = null;
	let holdFired = false;
	let suppressNextClick = false;
	let holdStartX = 0;
	let holdStartY = 0;
	let holdMenuOpen = false;
	let menuAbove = true;
	let menuX = 0;
	let menuY = 0;
	let rowButtonEl: HTMLButtonElement | null = null;
	let rowEl: HTMLLIElement | null = null;
	let activePrimary: MenuPrimaryAction | null = null;
	let activeDeferPreset: DeferPreset | null = null;

	const DEFER_PRESETS_BASE: DeferPreset[] = [1, 3, 7, 'custom'];

	$: holdEnabled = touchCapable && plugin.settings.quickActions.mobileHoldEnabled && task.type === 'task';
	$: handedness = plugin.settings.quickActions.mobileHandedness ?? 'right';
	$: menuTimeoutMs = plugin.settings.quickActions.mobileHoldTimeoutMs ?? 2400;
	$: topActions = handedness === 'left'
		? (['complete', 'edit'] as MenuPrimaryAction[])
		: (['edit', 'complete'] as MenuPrimaryAction[]);
	$: bottomActions = handedness === 'left'
		? (['defer', 'start'] as MenuPrimaryAction[])
		: (['start', 'defer'] as MenuPrimaryAction[]);
	$: deferPresets = handedness === 'left' ? [...DEFER_PRESETS_BASE].reverse() : DEFER_PRESETS_BASE;
	$: showDeferOptions = activePrimary === 'defer';

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

	function getActionColor(action: MenuPrimaryAction): string {
		return ACTION_COLORS[action] ?? ACTION_COLORS.none;
	}

	function getActionLabel(action: MenuPrimaryAction): string {
		if (action === 'edit') return 'Edit';
		return QUICK_ACTION_LABELS[action];
	}

	function getDeferPresetLabel(preset: DeferPreset): string {
		if (preset === 'custom') return 'Custom';
		return `+${preset}d`;
	}

	function clearTimers(): void {
		if (menuTimeout !== null) {
			window.clearTimeout(menuTimeout);
			menuTimeout = null;
		}
		if (holdTimer !== null) {
			window.clearTimeout(holdTimer);
			holdTimer = null;
		}
	}

	function scheduleMenuTimeout(): void {
		if (menuTimeout !== null) window.clearTimeout(menuTimeout);
		menuTimeout = window.setTimeout(() => {
			closeHoldMenu();
		}, menuTimeoutMs);
	}

	function closeHoldMenu(): void {
		holdMenuOpen = false;
		activePrimary = null;
		activeDeferPreset = null;
		clearTimers();
	}

	function getMenuBoundaryRect(): DOMRect {
		return new DOMRect(0, 0, window.innerWidth, window.innerHeight);
	}

	function openHoldMenuAt(clientX: number, clientY: number): void {
		// Short haptic pulse on supported devices (Android). iOS WKWebView does not
		// support navigator.vibrate and will silently ignore this.
		navigator.vibrate?.(8);

		const boundary = getMenuBoundaryRect();

		const clampedClientX = Math.max(
			boundary.left + CLOSE_TILE_HALF_WIDTH + MENU_MARGIN,
			Math.min(boundary.right - CLOSE_TILE_HALF_WIDTH - MENU_MARGIN, clientX)
		);
		menuX = clampedClientX;

		const spaceAbove = clientY - boundary.top;
		const spaceBelow = boundary.bottom - clientY;
		menuAbove = spaceAbove >= MENU_HEIGHT_ESTIMATE || spaceAbove >= spaceBelow;
		menuY = Math.max(boundary.top + MENU_MARGIN, Math.min(boundary.bottom - MENU_MARGIN, clientY));
		holdMenuOpen = true;
		activePrimary = null;
		activeDeferPreset = null;
		scheduleMenuTimeout();
	}

	function onTaskPointerDown(event: PointerEvent): void {
		if (!holdEnabled) return;
		if (holdMenuOpen) return;
		holdFired = false;
		holdStartX = event.clientX;
		holdStartY = event.clientY;
		holdTimer = window.setTimeout(() => {
			holdFired = true;
			holdTimer = null;
			openHoldMenuAt(holdStartX, holdStartY);
		}, HOLD_DELAY_MS);
	}

	function onTaskPointerMove(event: PointerEvent): void {
		if (holdTimer === null) return;
		const dx = Math.abs(event.clientX - holdStartX);
		const dy = Math.abs(event.clientY - holdStartY);
		if (dx > MOVE_CANCEL_PX || dy > MOVE_CANCEL_PX) {
			window.clearTimeout(holdTimer);
			holdTimer = null;
		}
	}

	function onTaskPointerCancel(): void {
		if (holdTimer !== null) {
			window.clearTimeout(holdTimer);
			holdTimer = null;
		}
		holdFired = false;
	}

	function onTaskPointerUp(): void {
		if (holdTimer !== null) {
			window.clearTimeout(holdTimer);
			holdTimer = null;
		}
		if (holdFired) {
			suppressNextClick = true;
			holdFired = false;
		}
	}

	async function executePrimaryAction(action: MenuPrimaryAction): Promise<void> {
		if (action === 'edit') {
			onOpen(task.path);
			return;
		}
		if (action === 'none') return;
		await plugin.runQuickAction(action, task.path, { showNotice: false });
	}

	function promptCustomDeferDays(): Promise<number | null> {
		return new Promise((resolve) => {
			const modal = new Modal(plugin.app);
			let settled = false;
			modal.titleEl.setText('Defer by how many days?');
			const input = modal.contentEl.createEl('input', {
				cls: 'tt-modal-input',
				attr: { type: 'number', min: '1', max: '365', step: '1', placeholder: 'Days', value: String(plugin.settings.quickActions.deferDays ?? 1) },
			});
			input.style.marginBottom = '12px';
			input.focus();
			const submit = () => {
				const parsed = parseInt(input.value, 10);
				if (isNaN(parsed) || parsed < 1 || parsed > 365) {
					new Notice('TTasks: enter a number between 1 and 365.');
					return;
				}
				settled = true;
				modal.close();
				resolve(parsed);
			};
			input.addEventListener('keydown', (e: KeyboardEvent) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } });
			const btnRow = modal.contentEl.createDiv({ cls: 'modal-button-container' });
			btnRow.createEl('button', { text: 'Cancel' }).addEventListener('click', () => modal.close());
			btnRow.createEl('button', { text: 'Defer', cls: 'mod-cta' }).addEventListener('click', submit);
			modal.onClose = () => { if (!settled) resolve(null); };
			modal.open();
		});
	}

	async function executeDeferPreset(preset: DeferPreset): Promise<void> {
		if (preset === 'custom') {
			const days = await promptCustomDeferDays();
			if (days === null) return;
			await deferByDays(days);
			return;
		}
		await deferByDays(preset);
	}

	async function deferByDays(days: number): Promise<void> {
		const base = task.due_date ?? today();
		const date = new Date(base + 'T00:00:00');
		date.setDate(date.getDate() + days);
		await plugin.taskStore.update(task.path, {
			due_date: date.toISOString().slice(0, 10),
		});
	}

	function handleOpen(event: MouseEvent): void {
		if (suppressNextClick) {
			suppressNextClick = false;
			event.preventDefault();
			event.stopPropagation();
			return;
		}
		if (holdMenuOpen) {
			event.preventDefault();
			closeHoldMenu();
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

	async function onPrimaryClick(action: MenuPrimaryAction): Promise<void> {
		scheduleMenuTimeout();
		if (action === 'defer') {
			activePrimary = 'defer';
			return;
		}
		await executePrimaryAction(action);
		closeHoldMenu();
	}

	function onDismissClick(): void {
		closeHoldMenu();
	}

	async function onDeferPresetClick(preset: DeferPreset): Promise<void> {
		scheduleMenuTimeout();
		await executeDeferPreset(preset);
		closeHoldMenu();
	}

	onMount(() => {
		if (typeof window === 'undefined') return;
		const media = window.matchMedia('(pointer: coarse)');
		const updateTouchCapable = () => {
			touchCapable = media.matches;
		};
		const onWindowPointerDown = (event: PointerEvent) => {
			if (!holdMenuOpen) return;
			const target = event.target as Node | null;
			if (!target) return;
			if (rowEl?.contains(target)) return;
			closeHoldMenu();
		};
		updateTouchCapable();
		media.addEventListener?.('change', updateTouchCapable);
		window.addEventListener('pointerdown', onWindowPointerDown, { capture: true });
		return () => {
			clearTimers();
			media.removeEventListener?.('change', updateTouchCapable);
			window.removeEventListener('pointerdown', onWindowPointerDown, { capture: true } as EventListenerOptions);
		};
	});
</script>

<li class="tt-task" class:is-overdue={isOverdue(task.due_date)} class:is-active={active} class:is-hold-open={holdMenuOpen} bind:this={rowEl}>
	{#if holdMenuOpen}
		<div
			class="tt-hold-menu"
			class:is-left-handed={handedness === 'left'}
			class:is-below={!menuAbove}
			style={`--tt-menu-x:${menuX}px; --tt-menu-y:${menuY}px;`}
		>
			<div class="tt-hold-lava" aria-hidden="true"></div>
			<div class="tt-hold-cluster">
				<div class="tt-hold-row tt-hold-row-top" role="group" aria-label="Primary quick actions">
					{#each topActions as action (action)}
						<button
							type="button"
							class="tt-hold-action tt-hold-action-primary"
							class:is-active={activePrimary === action}
							data-hold-primary={action}
							style={`--tt-action-color:${getActionColor(action)}`}
							on:click|stopPropagation={() => onPrimaryClick(action)}
						><span class="tt-hold-label">{getActionLabel(action)}</span></button>
					{/each}
				</div>
				<div class="tt-hold-row tt-hold-row-bottom" role="group" aria-label="Secondary quick actions">
					<button
						type="button"
						class="tt-hold-action tt-hold-action-secondary"
						class:is-active={activePrimary === bottomActions[0]}
						data-hold-primary={bottomActions[0]}
						style={`--tt-action-color:${getActionColor(bottomActions[0])}`}
						on:click|stopPropagation={() => onPrimaryClick(bottomActions[0])}
					><span class="tt-hold-label">{getActionLabel(bottomActions[0])}</span></button>
					<button
						type="button"
						class="tt-hold-close-tile"
						on:click|stopPropagation={onDismissClick}
						aria-label="Dismiss quick menu"
					><span class="tt-hold-label">×</span></button>
					<button
						type="button"
						class="tt-hold-action tt-hold-action-secondary"
						class:is-active={activePrimary === bottomActions[1]}
						data-hold-primary={bottomActions[1]}
						style={`--tt-action-color:${getActionColor(bottomActions[1])}`}
						on:click|stopPropagation={() => onPrimaryClick(bottomActions[1])}
					><span class="tt-hold-label">{getActionLabel(bottomActions[1])}</span></button>
				</div>
			</div>
			{#if showDeferOptions}
				<div class="tt-hold-row tt-hold-defer" role="group" aria-label="Defer presets">
					{#each deferPresets as preset (preset)}
						<button
							type="button"
							class="tt-hold-action tt-hold-action-defer"
							class:is-active={activeDeferPreset === preset}
							data-defer-preset={String(preset)}
							style={`--tt-action-color:${ACTION_COLORS.defer}`}
							on:click|stopPropagation={() => onDeferPresetClick(preset)}
						><span class="tt-hold-label">{getDeferPresetLabel(preset)}</span></button>
					{/each}
				</div>
			{/if}
		</div>
	{/if}

	<button
		type="button"
		class="tt-task-btn"
		class:is-active={active}
		bind:this={rowButtonEl}
		on:pointerdown={onTaskPointerDown}
		on:pointermove={onTaskPointerMove}
		on:pointercancel={onTaskPointerCancel}
		on:pointerup={onTaskPointerUp}
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

	.tt-hold-menu {
		--tt-tile-w: 100px;
		--tt-tile-h: 115px;
		--tt-gap: 6px;
		--tt-row-step-y: calc((var(--tt-tile-h) * 3 / 4) + (var(--tt-gap) / 2));
		--tt-close-center-y: calc(var(--tt-row-step-y) + (var(--tt-tile-h) / 2));
		position: fixed;
		left: var(--tt-menu-x);
		top: var(--tt-menu-y);
		z-index: 9999;
		display: flex;
		flex-direction: column;
		gap: var(--tt-gap);
		pointer-events: none;
		transform: translate(-50%, calc(-1 * var(--tt-close-center-y)));
		/* GPU acceleration for crisp rendering */
		-webkit-transform: translate(-50%, calc(-1 * var(--tt-close-center-y)));
		-webkit-perspective: 1000;
		backface-visibility: hidden;
		-webkit-font-smoothing: antialiased;
		-moz-osx-font-smoothing: grayscale;
		will-change: transform;
	}

	.tt-hold-menu.is-below {
		transform: translate(-50%, calc(-1 * var(--tt-close-center-y)));
		-webkit-transform: translate(-50%, calc(-1 * var(--tt-close-center-y)));
	}

	.tt-hold-lava {
		display: none;
	}

	.tt-hold-menu.is-below .tt-hold-lava {
		top: 42%;
	}

	.tt-hold-cluster {
		display: flex;
		flex-direction: column;
		gap: 0;
		pointer-events: auto;
	}

	.tt-hold-row {
		display: flex;
		gap: var(--tt-gap);
		pointer-events: auto;
		justify-content: center;
	}

	.tt-hold-row-top {
		transform: translateY(0);
	}

	.tt-hold-row-bottom {
		margin-top: calc(var(--tt-row-step-y) - var(--tt-tile-h));
	}

	.tt-hold-defer {
		opacity: 1;
		transform: translateY(-6px) scale(1);
		transition: opacity 170ms ease, transform 170ms cubic-bezier(0.2, 0.9, 0.2, 1);
		gap: var(--tt-gap);
	}

	.tt-hold-action {
		--tt-stroke-width: 2.5px;
		--tt-stroke-color: color-mix(in srgb, var(--tt-action-color) 78%, var(--background-modifier-border-focus));
		--tt-fill-color: color-mix(in srgb, var(--tt-action-color) 46%, var(--background-primary));
		border: none;
		background: transparent;
		color: var(--text-normal);
		font-size: 0.8rem;
		font-weight: 700;
		letter-spacing: 0.02em;
		border-radius: 0;
		width: var(--tt-tile-w);
		height: var(--tt-tile-h);
		padding: 0 12px;
		line-height: 1.05;
		text-align: center;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		position: relative;
		isolation: isolate;
		box-shadow: none;
		transform: scale(0.85);
		opacity: 0;
		animation: tt-action-pop 180ms cubic-bezier(0.2, 0.9, 0.2, 1) forwards;
		/* High-DPI rendering */
		backface-visibility: hidden;
		-webkit-font-smoothing: antialiased;
		-moz-osx-font-smoothing: grayscale;
		-webkit-touch-callout: none;
		will-change: transform, opacity;
	}

	.tt-hold-action::before,
	.tt-hold-action::after,
	.tt-hold-close-tile::before,
	.tt-hold-close-tile::after {
		content: '';
		position: absolute;
		pointer-events: none;
		-webkit-clip-path: polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%);
		clip-path: polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%);
	}

	.tt-hold-action::before,
	.tt-hold-close-tile::before {
		inset: 0;
		background: var(--tt-stroke-color);
		z-index: 0;
	}

	.tt-hold-action::after,
	.tt-hold-close-tile::after {
		inset: var(--tt-stroke-width);
		background: var(--tt-fill-color);
		z-index: 1;
	}

	.tt-hold-label {
		position: relative;
		z-index: 2;
	}

	.tt-hold-close-tile {
		--tt-stroke-width: 2.5px;
		--tt-stroke-color: var(--background-modifier-border-focus);
		--tt-fill-color: var(--background-secondary);
		border: none;
		background: transparent;
		color: var(--text-muted);
		font-size: 1.08rem;
		font-weight: 600;
		width: var(--tt-tile-w);
		height: var(--tt-tile-h);
		padding: 0;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		position: relative;
		isolation: isolate;
		box-shadow: none;
		/* High-DPI rendering */
		backface-visibility: hidden;
		-webkit-font-smoothing: antialiased;
		-moz-osx-font-smoothing: grayscale;
		-webkit-touch-callout: none;
	}

	.tt-hold-close-tile:active {
		transform: scale(0.96);
		will-change: auto;
	}

	.tt-hold-action.is-active {
		background: color-mix(in srgb, var(--tt-action-color) 40%, var(--background-primary));
		--tt-stroke-color: color-mix(in srgb, var(--tt-action-color) 72%, var(--background-modifier-border-focus));
		transform: scale(1.04);
		will-change: auto;
	}

	.tt-hold-action-primary:nth-child(2) {
		animation-delay: 25ms;
	}

	.tt-hold-action-secondary {
		animation-delay: 50ms;
	}

	.tt-hold-action-defer {
		animation-delay: 90ms;
	}

	.tt-hold-action:active {
		transform: scale(0.96);
		will-change: auto;
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

	@keyframes tt-lava-in {
		from {
			opacity: 0;
			transform: translate(-50%, -50%) scale(0.72);
			backface-visibility: hidden;
		}
		to {
			opacity: 1;
			transform: translate(-50%, -50%) scale(1);
			backface-visibility: hidden;
		}
	}

	@keyframes tt-action-pop {
		from {
			opacity: 0;
			transform: scale(0.82) translateY(2px);
			backface-visibility: hidden;
		}
		to {
			opacity: 1;
			transform: scale(1) translateY(0);
			backface-visibility: hidden;
		}
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

	@media (hover: hover) and (pointer: fine) {
		.tt-hold-menu {
			display: none;
		}
	}
</style>