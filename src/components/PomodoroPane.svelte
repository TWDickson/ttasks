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
	<button type="button" class="tt-pomo-settings" on:click={onOpenSettings} aria-label="Pomodoro settings" use:icon={'settings'}></button>
	{#if active}
		<div class="tt-pomo-active" class:is-break={active.mode !== 'focus'} class:is-paused={!active.running}>
			<div class="tt-pomo-dial-wrap">
				{#if showRing}
					<svg class="tt-pomo-ring" viewBox="0 0 100 100" aria-hidden="true">
						<circle class="tt-pomo-ring-track" cx="50" cy="50" r={RING_RADIUS} />
						<circle
							class="tt-pomo-ring-progress"
							cx="50" cy="50" r={RING_RADIUS}
							stroke-dasharray={RING_CIRCUMFERENCE}
							stroke-dashoffset={ringDashoffset}
						/>
					</svg>
				{/if}
				{#if showDigits}
					<div class="tt-pomo-dial">{formatRemaining(active)}</div>
				{/if}
			</div>
			<div class="tt-pomo-phase">
				{phaseLabel}{active.isFill ? ' · final' : ''}{active.running ? '' : ' · paused'}
			</div>

			{#if active.taskName && active.taskPath}
				<button type="button" class="tt-pomo-task" on:click={() => onOpenTask(active.taskPath ?? '')}>
					{active.taskName}
				</button>
			{:else}
				<div class="tt-pomo-task tt-pomo-task-none">Untethered session</div>
			{/if}

			{#if isUntil}
				<div class="tt-pomo-target">Running until your target time</div>
			{/if}

			<div class="tt-pomo-controls">
				<button type="button" class="tt-btn tt-btn-primary" on:click={onToggle}>
					{active.running ? 'Pause' : 'Resume'}
				</button>
				<button type="button" class="tt-btn" on:click={onSkip}>Skip</button>
				<button type="button" class="tt-btn tt-btn-danger" on:click={onStop}>Stop</button>
			</div>

			{#if active.completedFocus > 0}
				<div class="tt-pomo-meta">{active.completedFocus} focus session{active.completedFocus === 1 ? '' : 's'} done</div>
			{/if}
		</div>
	{:else}
		<div class="tt-pomo-idle">
			<div class="tt-pomo-dial-wrap">
				{#if showRing}
					<svg class="tt-pomo-ring tt-pomo-ring-idle" viewBox="0 0 100 100" aria-hidden="true">
						<circle class="tt-pomo-ring-track" cx="50" cy="50" r={RING_RADIUS} />
						<circle class="tt-pomo-ring-progress" cx="50" cy="50" r={RING_RADIUS} stroke-dasharray={RING_CIRCUMFERENCE} stroke-dashoffset={0} />
					</svg>
				{/if}
				{#if showDigits}
					<div class="tt-pomo-dial tt-pomo-dial-idle">{idleReadout}</div>
				{/if}
			</div>
			<p class="tt-pomo-empty">No focus session running.</p>

			{#if picked}
				<div class="tt-pomo-picked">
					<span class="tt-pomo-picked-name">{picked.name}</span>
					<button type="button" class="tt-pomo-picked-clear" on:click={onClearPickedTask} aria-label="Clear chosen task" use:icon={'x'}></button>
				</div>
			{:else}
				<button type="button" class="tt-pomo-pick-task" on:click={onPickTask}>
					<span use:icon={'link'}></span>
					Choose a task…
				</button>
			{/if}

			<div class="tt-pomo-controls">
				<button type="button" class="tt-btn tt-btn-primary" on:click={onStart}>Start focus</button>
				<button type="button" class="tt-btn" on:click={onFocusUntil}>Focus until…</button>
			</div>
		</div>
	{/if}
</div>

<style>
	.tt-pomo-pane {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--tt-space-3, 12px);
		padding: var(--tt-space-4, 16px) var(--tt-space-3, 12px);
		text-align: center;
	}

	.tt-pomo-settings {
		position: absolute;
		top: var(--tt-space-2, 8px);
		right: var(--tt-space-2, 8px);
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		padding: 0;
		border: none;
		border-radius: var(--tt-button-radius);
		background: transparent;
		color: var(--text-faint);
		cursor: pointer;
	}
	.tt-pomo-settings:hover {
		color: var(--text-normal);
		background: var(--background-modifier-hover);
	}

	.tt-pomo-idle,
	.tt-pomo-active {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--tt-space-3, 12px);
		width: 100%;
	}

	.tt-pomo-dial-wrap {
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.tt-pomo-ring {
		width: 180px;
		height: 180px;
		transform: rotate(-90deg);
	}

	.tt-pomo-ring-idle {
		width: 140px;
		height: 140px;
	}

	.tt-pomo-ring-track,
	.tt-pomo-ring-progress {
		fill: none;
		stroke-width: 6;
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
		stroke: var(--color-green, var(--text-accent));
	}

	.is-paused .tt-pomo-ring-progress {
		opacity: 0.6;
	}

	/* Dial text overlays the ring rather than stacking beneath it. */
	.tt-pomo-ring + .tt-pomo-dial {
		position: absolute;
	}

	.tt-pomo-dial {
		font-size: 3.4rem;
		font-weight: 700;
		line-height: 1;
		font-variant-numeric: tabular-nums;
		letter-spacing: 0.02em;
		color: var(--text-normal);
	}

	.tt-pomo-ring-idle + .tt-pomo-dial {
		font-size: 2.6rem;
	}

	.tt-pomo-dial-idle {
		color: var(--text-muted);
	}

	.is-break .tt-pomo-dial {
		color: var(--color-green, var(--text-accent));
	}

	.is-paused .tt-pomo-dial {
		opacity: 0.6;
	}

	.tt-pomo-phase {
		font-size: var(--font-ui-small);
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--text-muted);
	}

	.tt-pomo-task {
		max-width: 100%;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		background: none;
		border: none;
		box-shadow: none;
		padding: 0;
		font-size: var(--font-ui-medium);
		color: var(--text-accent);
		cursor: pointer;
	}

	.tt-pomo-task-none {
		color: var(--text-faint);
		cursor: default;
	}

	.tt-pomo-target {
		font-size: var(--font-ui-smaller);
		color: var(--text-muted);
	}

	.tt-pomo-empty {
		margin: 0;
		color: var(--text-muted);
		font-size: var(--font-ui-small);
	}

	.tt-pomo-pick-task {
		display: flex;
		align-items: center;
		gap: var(--tt-space-1, 4px);
		border: none;
		background: none;
		padding: 0;
		color: var(--text-accent);
		font-size: var(--font-ui-small);
		cursor: pointer;
	}
	.tt-pomo-pick-task:hover {
		text-decoration: underline;
	}

	.tt-pomo-picked {
		display: flex;
		align-items: center;
		gap: var(--tt-space-2, 8px);
		max-width: 100%;
		padding: 4px 10px;
		border-radius: 999px;
		background: var(--background-modifier-hover);
		font-size: var(--font-ui-small);
	}

	.tt-pomo-picked-name {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: var(--text-accent);
	}

	.tt-pomo-picked-clear {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 16px;
		height: 16px;
		flex-shrink: 0;
		border: none;
		background: none;
		padding: 0;
		color: var(--text-faint);
		cursor: pointer;
	}
	.tt-pomo-picked-clear:hover {
		color: var(--text-normal);
	}

	.tt-pomo-controls {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: var(--tt-space-2, 8px);
	}

	.tt-pomo-meta {
		font-size: var(--font-ui-smaller);
		color: var(--text-faint);
	}
</style>
