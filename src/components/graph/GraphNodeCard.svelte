<script lang="ts">
	// One task card on the dependency graph. Positioned absolutely in layout
	// pixels; DOM events are forwarded so the graph owns open/pin/hover.
	import type { TaskGraphNode } from '../../store/graph/taskGraph';
	import type { BadgePalette } from '../../utils/badgePalette';
	import { priorityColor } from '../../constants';
	import { nodeSubtitle } from '../../store/graph/graphPresentation';
	import { formatHumanDate } from '../taskDateMeta';

	export let node: TaskGraphNode;
	export let palette: BadgePalette;
	export let today: string;
	/** Projected finish from the dependency chain, shown when the task has no date. */
	export let projectedEnd: string | null;
	export let active = false;
	export let ready = false;
	export let traced = false;

	// Fixed height: the layout engine spaces rows assuming node.height, so the
	// card must never grow past it — content clamps/ellipsizes instead.
	$: style = `left:${node.x}px;top:${node.y}px;width:${node.width}px;height:${node.height}px;` +
		`--tt-node-accent:${palette.statusAccent(node.task.status)};--tt-priority-accent:${priorityColor(node.task.priority)};`;
</script>

<button
	type="button"
	class="tt-graph-node"
	class:is-active={active}
	class:is-cycle={node.isCycle}
	class:is-blocked={node.isBlockedChain}
	class:is-ready={ready}
	class:is-traced={traced}
	{style}
	on:click
	on:pointerup
	on:keydown
	on:mouseenter
	on:mouseleave
	on:contextmenu
>
	<div class="tt-graph-node-top">
		<span class="tt-graph-priority-dot"></span>
		<span class="tt-graph-status">{node.task.status}</span>
	</div>
	<div class="tt-graph-name tt-title tt-title-strong">{node.task.name}</div>
	<div class="tt-graph-meta">
		<span>{nodeSubtitle(node)}</span>
		{#if node.task.is_complete && node.task.completed}
			<span>Done {formatHumanDate(node.task.completed, today)}</span>
		{:else if node.task.due_date}
			<span>Due {formatHumanDate(node.task.due_date, today)}</span>
		{:else if projectedEnd}
			<span aria-label="Projected from dependencies">~{projectedEnd}</span>
		{/if}
	</div>
</button>

<style>
	.tt-graph-node {
		position: absolute;
		box-sizing: border-box;
		overflow: hidden;
		display: flex;
		flex-direction: column;
		justify-content: space-between;
		gap: 6px;
		padding: 10px 12px 10px 16px;
		border-radius: var(--radius-xl, 16px);
		border: var(--border-width, 1px) solid color-mix(in srgb, var(--tt-node-accent) 42%, var(--background-modifier-border));
		background: linear-gradient(180deg, color-mix(in srgb, var(--tt-node-accent) 12%, var(--background-primary)), var(--background-primary));
		box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--background-primary) 72%, transparent), 0 8px 24px rgba(var(--mono-rgb-100), 0.08);
		cursor: pointer;
		text-align: left;
		transition: opacity 0.28s ease;
	}

	.tt-graph-node::before {
		content: '';
		position: absolute;
		inset: 0 auto 0 0;
		width: 5px;
		z-index: 0;
		pointer-events: none;
		border-radius: var(--radius-xl, 16px) 0 0 var(--radius-xl, 16px);
		background: var(--tt-node-accent);
	}

	.tt-graph-node > * {
		position: relative;
		z-index: 1;
	}

	.tt-graph-node.is-active {
		box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--interactive-accent) 45%, transparent), 0 0 0 2px color-mix(in srgb, var(--interactive-accent) 28%, transparent), 0 10px 24px rgba(var(--mono-rgb-100), 0.12);
	}

	.tt-graph-node.is-blocked {
		background: linear-gradient(180deg, color-mix(in srgb, var(--color-orange) 12%, var(--background-primary)), var(--background-primary));
	}

	/* "Ready now" highlight: open, unblocked work pops green; everything else
	in the graph recedes so the actionable tasks read at a glance. */
	.tt-graph-node.is-ready {
		box-shadow:
			inset 0 0 0 1px color-mix(in srgb, var(--color-green) 60%, transparent),
			0 0 0 2px color-mix(in srgb, var(--color-green) 42%, transparent),
			0 0 18px color-mix(in srgb, var(--color-green) 28%, transparent);
	}

	/* The dims below are driven by state on the parent graph's stage, hence the
	`:global()` on the stage half of each selector. */
	:global(.tt-graph-stage.highlight-ready) .tt-graph-node:not(.is-ready) {
		opacity: 0.3;
	}

	.tt-graph-node.is-cycle {
		box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--color-red) 40%, transparent), 0 0 0 2px color-mix(in srgb, var(--color-red) 18%, transparent), 0 10px 24px rgba(var(--mono-rgb-100), 0.12);
	}

	/* Click-pinned chain tracing, node side. `traceSets` has always carried both
	halves, but only `.edges` was ever consumed — the node-level signal came from
	the lane spotlight's `is-dim`, so removing that (2026-07-26) left the trace
	reading as a few recoloured strokes and nothing else. These rules put the
	chain back on the nodes themselves. Last among the ring treatments on purpose,
	matching `.tt-graph-edge.is-traced`: a pin is a deliberate, transient act and
	outranks the resting cycle/ready rings until it's cleared. Still nothing dims. */
	.tt-graph-node.is-traced {
		border-color: color-mix(in srgb, var(--interactive-accent) 58%, var(--background-modifier-border));
		box-shadow:
			inset 0 0 0 1px color-mix(in srgb, var(--interactive-accent) 38%, transparent),
			0 0 0 2px color-mix(in srgb, var(--interactive-accent) 30%, transparent),
			0 8px 24px rgba(var(--mono-rgb-100), 0.1);
	}

	/* Everything off the pinned chain recedes. Rings alone were not enough: a
	project lane here runs to 18 tasks, so marking 3 still leaves 15 competing at
	full strength — reported 2026-08-12 as "everything else is fully visible and
	it makes it more challenging to pick them out".

	This is not the spotlight that came out on 2026-07-26. That one was ambient —
	it fired on hover and on lane rollover, so the graph churned as the pointer
	wandered, which is what made it intolerable. This fires only on a deliberate
	pin and clears on Esc or a click on empty canvas. Dimmed nodes keep full
	pointer events, so clicking one re-pins the chain from there.

	Edges go further down than nodes: a node still has to be readable enough to
	click, while a background edge only has to stay out of the way. */
	:global(.tt-graph-stage.chain-pinned) .tt-graph-node:not(.is-traced) {
		opacity: 0.3;
	}

	/* The node you actually clicked — the chain's origin. Same accent, turned up,
	so the trace still tells you where it was cast from. */
	.tt-graph-node.is-traced.is-active {
		box-shadow:
			inset 0 0 0 1px color-mix(in srgb, var(--interactive-accent) 55%, transparent),
			0 0 0 3px color-mix(in srgb, var(--interactive-accent) 45%, transparent),
			0 0 20px color-mix(in srgb, var(--interactive-accent) 26%, transparent);
	}

	.tt-graph-node-top {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 0.68rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--text-muted);
		font-weight: 700;
	}

	.tt-graph-priority-dot {
		width: 9px;
		height: 9px;
		border-radius: 999px;
		background: var(--tt-priority-accent);
		flex-shrink: 0;
	}

	.tt-graph-status {
		min-width: 0;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	/* Content budget inside the fixed 122px card (102px after padding):
	top row ~13px + 3-line name ~52px + meta ~14px + two 6px gaps = ~91px. */
	.tt-graph-name {
		/* Size/weight/colour from .tt-title + .tt-title-strong. The tight
		line-height is load-bearing for the 3-line budget above. */
		line-height: 1.18;
		width: 100%;
		word-break: break-word;
		overflow-wrap: break-word;
		max-height: 3.6em;
		display: -webkit-box;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 3;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.tt-graph-meta {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 10px;
		font-size: 0.72rem;
		color: var(--text-muted);
		white-space: nowrap;
	}

	.tt-graph-meta > span:first-child {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.tt-graph-meta > span + span {
		flex-shrink: 0;
	}

</style>
