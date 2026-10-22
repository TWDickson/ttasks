<script lang="ts" context="module">
	import type { LaneHeader } from '../../store/graph/graphLaneLayout';

	/** A lane header after project padding; `rawHeightPx` is the un-padded node-row height. */
	export type DependencyLaneHeader = LaneHeader & { rawHeightPx: number };
</script>

<script lang="ts">
	// The sticky project-name chips down the dependency graph's left gutter. They
	// live inside the scaled stage, so positions are in layout (unscaled) pixels.
	import { laneHeaderClass } from '../../store/graph/graphPresentation';
	import { icon } from '../../utils/icon';

	export let headers: DependencyLaneHeader[];
	export let laneWidth: number;
	/** Horizontal scroll, in layout pixels — keeps the chips pinned to the viewport's left edge. */
	export let stickyOffset: number;
	export let onAddTask: (projectPath: string) => void;

	const COMPACT_HEIGHT = 132;
	// Labels rotate to vertical early so the slim gutter fits them without clipping.
	const ROTATE_LABEL_LENGTH = 8;

	// Only genuine project lanes are clickable — satellite / unassigned strips
	// aren't a project you can parent a task to.
	function isProjectLane(header: DependencyLaneHeader): boolean {
		return !header.isSatellite && header.key !== '__unassigned__';
	}

	function headerClass(lane: DependencyLaneHeader): string {
		// Decide compact/rotate from the un-padded node-row height so the symmetric
		// lane padding never flips a lane's label layout.
		const base = laneHeaderClass({ label: lane.label, heightPx: lane.rawHeightPx }, COMPACT_HEIGHT, ROTATE_LABEL_LENGTH);
		return lane.isSatellite ? `${base} is-satellite` : base;
	}

	// Marquee action for a project lane label: if the name is taller than its
	// (vertical) viewport, expose the overflow so CSS can scroll it on hover —
	// letting the full name be read without a tooltip. `label` is passed so the
	// action re-measures when the text changes.
	function marqueeLabel(run: HTMLElement, _label: string) {
		const viewport = run.parentElement;
		let raf = 0;
		const measure = (): void => {
			if (!viewport) return;
			const overflow = viewport.scrollHeight - viewport.clientHeight;
			if (overflow > 6) {
				viewport.style.setProperty('--tt-marquee', `${overflow}px`);
				viewport.style.setProperty('--tt-marquee-dur', `${Math.max(2.6, overflow / 24)}s`);
				viewport.classList.add('is-truncated');
			} else {
				viewport.classList.remove('is-truncated');
				viewport.style.removeProperty('--tt-marquee');
				viewport.style.removeProperty('--tt-marquee-dur');
			}
		};
		const schedule = (): void => { cancelAnimationFrame(raf); raf = requestAnimationFrame(measure); };
		schedule();
		const observer = new ResizeObserver(schedule);
		if (viewport) observer.observe(viewport);
		return {
			update: schedule,
			destroy(): void { cancelAnimationFrame(raf); observer.disconnect(); },
		};
	}
</script>

<div class="tt-dependency-lanes" style={`--tt-dependency-lane-width:${laneWidth}px;transform:translateX(${stickyOffset}px);`}>
	{#each headers as lane (lane.key)}
		{#if isProjectLane(lane)}
			<!-- GP5: the chip's label body is a plain (non-interactive) label;
			only the `+` footer below is clickable (adds a task to the
			project). Lane focus/dim was removed 2026-07-26 — lanes are
			statically framed and the chain trace is the only highlight. -->
			<div
				class={`${headerClass(lane)} is-clickable`}
				style={`top:${lane.topPx}px;height:${lane.heightPx}px;`}
			>
				<div class="tt-dependency-lane-focus">
					<span class="tt-dependency-lane-label">
						<span class="tt-dependency-lane-label-run" use:marqueeLabel={lane.label}>{lane.label}</span>
					</span>
					<span class="tt-dependency-lane-count">{lane.taskCount}</span>
				</div>
				<button
					type="button"
					class="tt-dependency-lane-add-btn"
					aria-label={`Add task to ${lane.label}`}
					on:click={() => onAddTask(lane.key)}
				>
					<span class="tt-dependency-lane-add" use:icon={'plus'}></span>
				</button>
			</div>
		{:else}
			<div
				class={headerClass(lane)}
				style={`top:${lane.topPx}px;height:${lane.heightPx}px;`}
				aria-hidden="true"
			>
				<span class="tt-dependency-lane-label">{lane.label}</span>
				<span class="tt-dependency-lane-count">{lane.taskCount}</span>
			</div>
		{/if}
	{/each}
</div>

<style>
	.tt-dependency-lanes {
		position: absolute;
		inset: 0 auto 0 8px;
		width: var(--tt-dependency-lane-width, 136px);
		pointer-events: none;
		z-index: 10;
	}

	.tt-dependency-lane-header {
		position: absolute;
		left: 0;
		right: 0;
		display: flex;
		flex-direction: column;
		justify-content: flex-start;
		align-items: flex-start;
		gap: 8px;
		padding: 8px 5px 8px 8px;
		border-radius: var(--radius-m);
		border: var(--border-width, 1px) solid color-mix(in srgb, var(--text-accent) 30%, var(--background-modifier-border));
		background: linear-gradient(
			180deg,
			color-mix(in srgb, var(--background-secondary) 86%, var(--background-primary)),
			color-mix(in srgb, var(--background-secondary-alt) 92%, var(--background-primary))
		);
		box-shadow:
			inset 3px 0 0 color-mix(in srgb, var(--interactive-accent) 62%, transparent),
			inset 0 0 0 1px color-mix(in srgb, var(--background-primary) 35%, transparent),
			0 1px 0 color-mix(in srgb, var(--text-faint) 18%, transparent);
		overflow: hidden;
		transition: border-color 120ms ease, background 120ms ease, opacity 0.28s ease;
	}

	.tt-dependency-lane-label {
		display: -webkit-box;
		font-size: 12px;
		font-weight: 600;
		line-height: 1.25;
		color: color-mix(in srgb, var(--text-normal) 88%, var(--text-muted));
		overflow: hidden;
		overflow-wrap: anywhere;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 5;
	}

	.tt-dependency-lane-count {
		margin-top: auto;
		font-size: 11px;
		font-weight: 700;
		color: color-mix(in srgb, var(--text-normal) 75%, var(--text-faint));
		background: color-mix(in srgb, var(--interactive-accent) 20%, var(--background-modifier-border));
		padding: 1px 6px;
		border-radius: var(--radius-s);
		border: 1px solid color-mix(in srgb, var(--interactive-accent) 22%, transparent);
	}

	.tt-dependency-lane-header.is-compact {
		align-items: center;
		padding: 6px 6px 6px 8px;
		gap: 4px;
	}

	.tt-dependency-lane-header.is-rotated .tt-dependency-lane-label {
		display: block;
		/* Clip to the space the flex layout gives us (not to content), so a long
		name overflows and can be measured / marqueed; short-lane names truncate. */
		flex: 1 1 0;
		min-height: 0;
		font-size: 12px;
		line-height: 1.05;
		max-height: none;
		/* One vertical line, never wrapped to extra columns (which overflow the
		slim gutter on short lanes); long names truncate with an ellipsis. */
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		writing-mode: vertical-rl;
		text-orientation: mixed;
		transform: rotate(180deg);
		letter-spacing: 0.3px;
	}

	/* Inner text run of a project label — the element the marquee translates. */
	.tt-dependency-lane-label-run {
		display: block;
		white-space: nowrap;
	}

	/* When the name is longer than its viewport: fade the cut edge to hint more,
	and scroll the whole name through on hover/focus (a tooltip-free reveal). */
	.tt-dependency-lane-label.is-truncated {
		-webkit-mask-image: linear-gradient(to bottom, #000 82%, transparent);
		mask-image: linear-gradient(to bottom, #000 82%, transparent);
	}

	.tt-dependency-lane-header.is-clickable:hover .tt-dependency-lane-label.is-truncated .tt-dependency-lane-label-run {
		animation: tt-lane-marquee var(--tt-marquee-dur, 3.5s) ease-in-out infinite;
	}

	@keyframes tt-lane-marquee {
		0%, 14% { transform: translateY(0); }
		50%, 64% { transform: translateY(calc(-1 * var(--tt-marquee, 0px))); }
		100% { transform: translateY(0); }
	}

	@media (prefers-reduced-motion: reduce) {
		.tt-dependency-lane-header.is-clickable:hover .tt-dependency-lane-label.is-truncated .tt-dependency-lane-label-run {
			animation: none;
		}
	}

	@media (min-width: 1024px) {
		.tt-dependency-lane-header.is-rotated .tt-dependency-lane-label {
			font-size: 13px;
			letter-spacing: 0.4px;
		}
	}

	@media (max-width: 767px) {
		.tt-dependency-lane-header.is-rotated .tt-dependency-lane-label {
			font-size: 11px;
			letter-spacing: 0.2px;
		}

		.tt-dependency-lane-header.is-rotated {
			padding: 6px 6px 6px 8px;
			gap: 4px;
		}
	}

	.tt-dependency-lane-header.is-compact .tt-dependency-lane-count {
		margin-top: 0;
	}

	/* Satellite: a thin, muted, dashed unassigned strip parked next to its
	related project (reads as "unassigned, but tied to the adjacent lane"). */
	.tt-dependency-lane-header.is-satellite {
		right: auto;
		width: 30%;
		min-width: 22px;
		padding: 6px 4px;
		border-style: dashed;
		border-color: color-mix(in srgb, var(--text-faint) 40%, transparent);
		background: color-mix(in srgb, var(--background-secondary) 55%, transparent);
		box-shadow: none;
		opacity: 0.9;
	}

	.tt-dependency-lane-header.is-satellite .tt-dependency-lane-label {
		font-size: 10px;
		font-weight: 500;
		color: var(--text-muted);
		-webkit-line-clamp: 3;
	}

	.tt-dependency-lane-header.is-satellite .tt-dependency-lane-count {
		background: transparent;
		border-color: transparent;
		color: var(--text-faint);
		padding: 0;
	}

	/* Clickable project chip (GP5) — a container of two subshapes: the label body
	(tap → focus/pin the lane) and a `+` footer (tap → add a task). Padding + gap
	move onto the inner buttons so the `+` can sit flush at the bottom edge. */
	.tt-dependency-lane-header.is-clickable {
		pointer-events: auto;
		padding: 0;
		gap: 0;
		transition: border-color 120ms ease, background 120ms ease, opacity 0.28s ease,
			box-shadow 120ms ease;
	}

	.tt-dependency-lane-header.is-clickable:hover {
		border-color: color-mix(in srgb, var(--interactive-accent) 55%, var(--background-modifier-border));
		background: linear-gradient(
			180deg,
			color-mix(in srgb, var(--interactive-accent) 14%, var(--background-secondary)),
			color-mix(in srgb, var(--background-secondary-alt) 92%, var(--background-primary))
		);
	}

	/* Label body — fills the chip above the `+` footer, laying out the label +
	count exactly as the old single-button chip did (inherits the header's
	cross-axis alignment so compact chips stay centred). Non-interactive: the
	click-to-focus interaction is disabled for now; only the `+` footer clicks. */
	.tt-dependency-lane-focus {
		flex: 1 1 auto;
		min-height: 0;
		width: 100%;
		display: flex;
		flex-direction: column;
		align-items: inherit;
		justify-content: flex-start;
		gap: 6px;
		padding: 8px 5px 4px 8px;
	}

	.tt-dependency-lane-header.is-compact .tt-dependency-lane-focus {
		padding: 6px 6px 2px 8px;
		gap: 4px;
	}

	/* `+` footer subshape — full-width strip flush to the chip's bottom edge,
	divided from the body by a hairline so the two read as one card. */
	.tt-dependency-lane-add-btn {
		flex: 0 0 auto;
		width: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 3px 0;
		margin: 0;
		background: none;
		border: none;
		border-top: 1px solid color-mix(in srgb, var(--text-faint) 20%, transparent);
		color: var(--text-faint);
		cursor: pointer;
		opacity: 0.5;
		transition: opacity 120ms ease, color 120ms ease, background 120ms ease;
	}

	.tt-dependency-lane-add-btn:hover,
	.tt-dependency-lane-add-btn:focus-visible {
		opacity: 1;
		color: var(--interactive-accent);
		background: color-mix(in srgb, var(--interactive-accent) 12%, transparent);
		outline: none;
	}

	.tt-dependency-lane-add {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 14px;
	}

	.tt-dependency-lane-add :global(svg) {
		width: 14px;
		height: 14px;
	}

	/* Touch: expand the `+` footer's hit area to the mobile ≥44px minimum without
	growing its visual strip (matches the node-add affordance). */
	@media (pointer: coarse) {
		.tt-dependency-lane-add-btn {
			position: relative;
			padding: 6px 0;
		}

		.tt-dependency-lane-add-btn::after {
			content: '';
			position: absolute;
			inset: -6px 0;
		}
	}
</style>
