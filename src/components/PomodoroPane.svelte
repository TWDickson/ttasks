<script lang="ts">
	import type { Readable } from 'svelte/store';
	import type { PomodoroSession } from '../integration/pomodoro';
	import { formatRemaining } from '../integration/pomodoro';

	// Service references passed in (no plugin/obsidian import) so the pane stays
	// testable in isolation — the host view wires these to PomodoroService.
	export let session: Readable<PomodoroSession | null>;
	/** Length of a focus phase in minutes — drives the idle dial readout. */
	export let focusMinutes: number;
	export let onStart: () => void;
	export let onFocusUntil: () => void;
	export let onToggle: () => void;
	export let onSkip: () => void;
	export let onStop: () => void;
	/** Open the task a tethered session is focused on. */
	export let onOpenTask: (path: string) => void;

	$: active = $session;
	$: phaseLabel = active
		? active.mode === 'focus' ? 'Focus' : active.mode === 'short-break' ? 'Short break' : 'Long break'
		: '';
	$: isUntil = active ? active.targetEndMs !== null : false;
	$: idleReadout = `${String(Math.max(0, Math.round(focusMinutes))).padStart(2, '0')}:00`;
</script>

<div class="tt-pomo-pane">
	{#if active}
		<div class="tt-pomo-active" class:is-break={active.mode !== 'focus'} class:is-paused={!active.running}>
			<div class="tt-pomo-dial">{formatRemaining(active)}</div>
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
			<div class="tt-pomo-dial tt-pomo-dial-idle">{idleReadout}</div>
			<p class="tt-pomo-empty">No focus session running.</p>
			<div class="tt-pomo-controls">
				<button type="button" class="tt-btn tt-btn-primary" on:click={onStart}>Start focus</button>
				<button type="button" class="tt-btn" on:click={onFocusUntil}>Focus until…</button>
			</div>
		</div>
	{/if}
</div>

<style>
	.tt-pomo-pane {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--tt-space-3, 12px);
		padding: var(--tt-space-4, 16px) var(--tt-space-3, 12px);
		text-align: center;
	}

	.tt-pomo-idle,
	.tt-pomo-active {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--tt-space-3, 12px);
		width: 100%;
	}

	.tt-pomo-dial {
		font-size: 3.4rem;
		font-weight: 700;
		line-height: 1;
		font-variant-numeric: tabular-nums;
		letter-spacing: 0.02em;
		color: var(--text-normal);
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
