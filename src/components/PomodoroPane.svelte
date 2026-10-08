<script lang="ts">
	import type { Readable } from 'svelte/store';
	import type { PomodoroDialStyle } from '../settings/types';
	import type { PomodoroSession } from '../integration/pomodoro';
	import { formatRemaining, remainingFraction } from '../integration/pomodoro';
	import { icon } from '../utils/icon';

	// Service references passed in (no plugin/obsidian import) so the pane stays
	// testable in isolation — the host view wires these to PomodoroService.
	export let session: Readable<PomodoroSession | null>;
	/** Length of a focus phase in minutes — drives the idle dial readout. */
	export let focusMinutes: number;
	export let dialStyle: Readable<PomodoroDialStyle>;
	/** Task chosen (but not yet started) to focus on — null starts untethered. */
	export let pickedTask: Readable<{ path: string; name: string } | null>;
	export let onStart: () => void;
	export let onFocusUntil: () => void;
	export let onToggle: () => void;
	export let onSkip: () => void;
	export let onStop: () => void;
	/** Open the task a tethered session is focused on. */
	export let onOpenTask: (path: string) => void;
	export let onOpenSettings: () => void;
	/** Open the fuzzy task picker so Start/Focus-until run tethered to a choice. */
	export let onPickTask: () => void;
	export let onClearPickedTask: () => void;

	// SVG ring geometry — a circle traced from the top, sweeping clockwise as
	// time runs out (see remainingFraction). Kept in sync with the CSS radius.
	const RING_RADIUS = 44;
	const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

	$: active = $session;
	$: picked = $pickedTask;
	$: style = $dialStyle;
	$: showRing = style === 'ring' || style === 'ring-plain';
	$: showDigits = style !== 'ring-plain';
	$: phaseLabel = active
		? active.mode === 'focus' ? 'Focus' : active.mode === 'short-break' ? 'Short break' : 'Long break'
		: '';
	$: isUntil = active ? active.targetEndMs !== null : false;
	$: idleReadout = `${String(Math.max(0, Math.round(focusMinutes))).padStart(2, '0')}:00`;
	$: fraction = active ? remainingFraction(active) : 1;
	$: ringDashoffset = RING_CIRCUMFERENCE * (1 - fraction);
</script>

<div class="tt-pomo-pane">
	<button type="button" class="tt-pomo-settings clickable-icon" on:click={onOpenSettings} aria-label="Pomodoro settings" use:icon={'settings'}></button>
	<div
		class="tt-pomo-body"
		class:is-idle={!active}
		class:is-break={active && active.mode !== 'focus'}
		class:is-paused={active && !active.running}
	>
		<!-- One fixed-size dial for idle and running, so Start doesn't make the
		layout jump. The phase label sits inside it, under the digits. -->
		<div class="tt-pomo-dial-wrap" class:has-ring={showRing}>
			{#if showRing}
				<svg class="tt-pomo-ring" viewBox="0 0 100 100" aria-hidden="true">
					<circle class="tt-pomo-ring-track" cx="50" cy="50" r={RING_RADIUS} />
					{#if active}
						<circle
							class="tt-pomo-ring-progress"
							cx="50" cy="50" r={RING_RADIUS}
							stroke-dasharray={RING_CIRCUMFERENCE}
							stroke-dashoffset={ringDashoffset}
						/>
					{/if}
				</svg>
			{/if}
			<div class="tt-pomo-dial-text">
				{#if showDigits}
					<div class="tt-pomo-dial">{active ? formatRemaining(active) : idleReadout}</div>
				{/if}
				<div class="tt-pomo-phase">
					{#if active}
						{phaseLabel}{active.isFill ? ' · final' : ''}{active.running ? '' : ' · paused'}
					{:else}
						Ready
					{/if}
				</div>
			</div>
		</div>

		{#if active}
			{#if active.taskName && active.taskPath}
				<button type="button" class="tt-pomo-link tt-title tt-truncate" on:click={() => onOpenTask(active.taskPath ?? '')}>
					{active.taskName}
				</button>
			{:else}
				<div class="tt-pomo-task-none">Untethered session</div>
			{/if}
			{#if isUntil}
				<div class="tt-pomo-meta">Running until your target time</div>
			{/if}
		{:else if picked}
			<div class="tt-pomo-picked">
				<span class="tt-pomo-picked-name tt-title tt-title-sm tt-truncate">{picked.name}</span>
				<button type="button" class="tt-pomo-picked-clear clickable-icon" on:click={onClearPickedTask} aria-label="Clear chosen task" use:icon={'x'}></button>
			</div>
		{:else}
			<button type="button" class="tt-pomo-link tt-pomo-pick-task" on:click={onPickTask}>
				<span class="tt-pomo-link-icon" use:icon={'link'}></span>
				Choose a task…
			</button>
		{/if}

		<div class="tt-pomo-controls">
			{#if active}
				<button type="button" class="tt-btn tt-btn-primary" on:click={onToggle}>
					{active.running ? 'Pause' : 'Resume'}
				</button>
				<button type="button" class="tt-btn" on:click={onSkip}>Skip</button>
				<button type="button" class="tt-btn tt-btn-danger" on:click={onStop}>Stop</button>
			{:else}
				<button type="button" class="tt-btn tt-btn-primary" on:click={onStart}>Start focus</button>
				<button type="button" class="tt-btn" on:click={onFocusUntil}>Focus until…</button>
			{/if}
		</div>

		{#if active && active.completedFocus > 0}
			<div class="tt-pomo-meta">{active.completedFocus} focus session{active.completedFocus === 1 ? '' : 's'} done</div>
		{/if}
	</div>
</div>

<style>
	.tt-pomo-pane {
		position: relative;
		padding: var(--tt-space-4) var(--tt-space-3);
	}

	/* Native icon-button chrome via .clickable-icon; only placement here. */
	.tt-pomo-settings {
		position: absolute;
		top: var(--tt-space-2);
		right: var(--tt-space-2);
	}

	.tt-pomo-body {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--tt-space-3);
		max-width: 320px;
		margin: 0 auto;
		text-align: center;
	}

	/* ── Dial ── */
	.tt-pomo-dial-wrap {
		position: relative;
		display: grid;
		place-items: center;
		margin-top: var(--tt-space-2);
	}

	.tt-pomo-dial-wrap.has-ring {
		width: 184px;
		height: 184px;
	}

	.tt-pomo-ring {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		transform: rotate(-90deg);
	}

	.tt-pomo-ring-track,
	.tt-pomo-ring-progress {
		fill: none;
		stroke-width: 4;
	}

	.tt-pomo-ring-track {
		stroke: var(--background-modifier-border);
	}

	.tt-pomo-ring-progress {
		stroke: var(--interactive-accent);
		stroke-linecap: round;
		transition: stroke-dashoffset 1s linear;
	}

	.is-break .tt-pomo-ring-progress {
		stroke: var(--color-green);
	}

	.tt-pomo-dial-text {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--tt-space-1);
	}

	.tt-pomo-dial {
		font-size: 3rem;
		font-weight: 600;
		line-height: 1;
		font-variant-numeric: tabular-nums;
		letter-spacing: -0.01em;
		color: var(--text-normal);
	}

	/* Inside a ring the digits must clear the stroke: ~120px wide in a 184px dial. */
	.has-ring .tt-pomo-dial {
		font-size: 2.4rem;
	}

	.is-idle .tt-pomo-dial {
		color: var(--text-muted);
	}

	.is-break .tt-pomo-dial {
		color: var(--color-green);
	}

	.tt-pomo-phase {
		font-size: var(--font-ui-smaller);
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--text-muted);
	}

	.is-paused .tt-pomo-dial,
	.is-paused .tt-pomo-ring-progress {
		opacity: 0.5;
	}

	/* ── Task line ── */
	.tt-pomo-body button.tt-pomo-link {
		display: inline-flex;
		align-items: center;
		gap: var(--tt-space-1);
		max-width: 100%;
		height: auto;
		padding: 2px 6px;
		border: none;
		box-shadow: none;
		background: transparent;
		color: var(--text-accent);
		cursor: pointer;
	}

	.tt-pomo-body button.tt-pomo-link:hover {
		background: var(--background-modifier-hover);
		box-shadow: none;
	}

	.tt-pomo-pick-task {
		font-size: var(--font-ui-small);
	}

	.tt-pomo-link-icon {
		display: inline-flex;
		--icon-size: var(--icon-s);
	}

	.tt-pomo-task-none {
		font-size: var(--font-ui-small);
		color: var(--text-faint);
	}

	.tt-pomo-picked {
		display: flex;
		align-items: center;
		gap: var(--tt-space-1);
		max-width: 100%;
		padding: 2px 4px 2px 12px;
		border-radius: 999px;
		background: var(--background-modifier-hover);
	}

	/* Sizing and truncation from .tt-title / .tt-truncate; the accent colour is
	this pane's own signal that a task is currently picked. */
	.tt-pomo-picked-name {
		color: var(--text-accent);
	}

	.tt-pomo-picked-clear {
		flex-shrink: 0;
		--icon-size: var(--icon-xs);
	}

	/* ── Controls ── */
	.tt-pomo-controls {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: var(--tt-space-2);
	}

	.tt-pomo-meta {
		font-size: var(--font-ui-smaller);
		color: var(--text-faint);
	}
</style>
