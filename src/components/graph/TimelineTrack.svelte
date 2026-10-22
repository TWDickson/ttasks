<script lang="ts">
	// One track of the timeline: a pinned name column beside a canvas of bars.
	// The Defined track draws dated/inferred windows; the Underdefined track draws
	// no-estimate tasks parked after the work they follow.
	import type { Task } from '../../types';
	import type {
		HybridTimelineDefinedItem,
		HybridTimelineGroupBand,
		HybridTimelineUnderdefinedItem,
	} from '../../store/graph/taskGraph';
	import type { BadgePalette } from '../../utils/badgePalette';
	import { buildLaneHeaders } from '../../store/graph/graphLaneLayout';
	import { summarizeByStatus } from '../../store/graph/graphPresentation';
	import { formatDateISO } from '../../store/graph/graphTimeline';

	type Item = HybridTimelineDefinedItem | HybridTimelineUnderdefinedItem;

	export let title: string;
	/** Every item in the track — the name column lists them all. */
	export let items: Item[];
	/** The items inside the horizontal viewport (plus margin) — only these get bars. */
	export let visibleItems: Item[];
	export let groups: HybridTimelineGroupBand[];
	export let rowCount: number;
	/** Either track has more than one group, so both reserve caption room. */
	export let grouped: boolean;
	export let sidebarPx: number;
	export let scrollLeft: number;
	export let todayPercent: number;
	export let dayWidthPercent: number;
	export let activeTaskPath: string | null;
	export let palette: BadgePalette;
	/** Display name for an underdefined item's anchor. */
	export let anchorLabel: (path: string) => string;
	export let onOpen: (path: string) => void;
	export let onHoverPreview: (event: MouseEvent, task: Task) => void;
	export let onContextMenu: (event: MouseEvent, task: Task) => void;

	const ROW_HEIGHT = 34;
	const ROW_GAP = 8;
	const TRACK_PADDING = 8;
	/* Vertical room reserved above the first row when the tracks are grouped, so
		a group's caption has somewhere to sit that isn't on top of the first bar
		of that group. Zero when there's nothing to caption. */
	const GROUP_LABEL_SPACE = 15;

	$: trackPaddingPx = TRACK_PADDING + (grouped ? GROUP_LABEL_SPACE : 0);
	$: heightPx = Math.max(42, rowCount * ROW_HEIGHT + Math.max(0, rowCount - 1) * ROW_GAP + trackPaddingPx + TRACK_PADDING);
	$: statusSummary = summarizeByStatus(items.map((item) => item.task));
	$: laneHeaders = buildLaneHeaders(groups, ROW_HEIGHT, ROW_GAP, trackPaddingPx);

	const rowTop = (row: number): number => trackPaddingPx + row * (ROW_HEIGHT + ROW_GAP);

	function groupBandStyle(band: { startRow: number; endRow: number }): string {
		const height = (band.endRow - band.startRow + 1) * ROW_HEIGHT + Math.max(0, band.endRow - band.startRow) * ROW_GAP;
		return `top:${rowTop(band.startRow)}px;height:${height}px;`;
	}

	function groupLabelStyle(band: { startRow: number }): string {
		return `top:${rowTop(band.startRow) - GROUP_LABEL_SPACE}px;`;
	}

	/** A name-column row sits at the same vertical offset as its bar. */
	function nameRowStyle(item: Item): string {
		return `top:${rowTop(item.row)}px;height:${ROW_HEIGHT}px;--tt-bar-accent:${palette.statusAccent(item.task.status)};`;
	}

	function barStyle(item: Item): string {
		return `left:${item.leftPercent.toFixed(3)}%;width:${item.widthPercent.toFixed(3)}%;top:${rowTop(item.row)}px;--tt-bar-accent:${palette.statusAccent(item.task.status)};`;
	}

	function barLabel(item: Item): string {
		return 'anchorPath' in item
			? `${item.task.name} — follows ${anchorLabel(item.anchorPath)}`
			: `${item.task.name} — ${formatDateISO(item.start)} to ${formatDateISO(item.end)}${item.isInferred ? ' (estimated)' : ''}`;
	}

	function onBarKeydown(event: KeyboardEvent, path: string): void {
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			onOpen(path);
		}
	}
</script>

<section class="tt-hybrid-track">
	<div class="tt-hybrid-track-header">
		<h4 class="tt-overview-category-title">{title}</h4>
		<div class="tt-track-status-summary">
			{#each statusSummary as summary (summary.status)}
				<span class="tt-track-status-chip" style={`--tt-chip-accent:${palette.statusAccent(summary.status)};`}>
					{summary.status} {summary.count}
				</span>
			{/each}
		</div>
	</div>
	<div class="tt-hybrid-track-body">
		<!-- Pinned name column. `transform: translateX(scrollLeft)` rather
			than position:sticky — the whole shell is one wide scrolling
			box, and sticky inside it has no scrollport to stick to. -->
		<div class="tt-hybrid-lane-sidebar" style={`width:${sidebarPx}px;height:${heightPx}px;transform:translateX(${scrollLeft}px);`}>
			{#each laneHeaders as header (header.key)}
				<div class="tt-hybrid-lane-group" style={`top:${header.topPx}px;height:${header.heightPx}px;`} aria-hidden="true"></div>
			{/each}
			{#each items as item (item.path)}
				<button
					type="button"
					class="tt-hybrid-name"
					class:is-active={activeTaskPath === item.path}
					class:is-done={item.task.is_complete}
					style={nameRowStyle(item)}
					title={item.task.name}
					on:click={() => onOpen(item.path)}
					on:mouseenter={(event) => onHoverPreview(event, item.task)}
					on:contextmenu={(event) => onContextMenu(event, item.task)}
				>
					<span class="tt-title tt-title-sm tt-truncate">{item.task.name}</span>
				</button>
			{/each}
		</div>
		<div class="tt-hybrid-track-canvas" style={`height:${heightPx}px;`}>
			<div class="tt-hybrid-today-band" style={`left:${todayPercent.toFixed(3)}%;width:${dayWidthPercent.toFixed(3)}%;`}></div>
			{#each groups as group (group.key)}
				<div class="tt-hybrid-group-band" style={groupBandStyle(group)}></div>
			{/each}
			{#if groups.length > 1}
				{#each groups as group (`label-${group.key}`)}
					<!-- The group's name rides the left edge of the viewport rather
						than the start of the band, so it stays readable at any
						horizontal scroll position. -->
					<div
						class="tt-hybrid-group-label"
						style={`${groupLabelStyle(group)}transform:translateX(${scrollLeft}px);`}
					>{group.label}</div>
				{/each}
			{/if}
			{#each visibleItems as item (item.path)}
				<button
					type="button"
					class="tt-overview-bar"
					class:tt-hybrid-defined-item={!('anchorPath' in item)}
					class:tt-hybrid-underdefined-item={'anchorPath' in item}
					class:is-done={item.task.is_complete}
					class:is-active={activeTaskPath === item.path}
					class:is-inferred={'isInferred' in item && item.isInferred}
					style={barStyle(item)}
					tabindex="0"
					aria-label={barLabel(item)}
					aria-pressed={activeTaskPath === item.path}
					on:click={() => onOpen(item.path)}
					on:keydown={(event) => onBarKeydown(event, item.path)}
					on:mouseenter={(event) => onHoverPreview(event, item.task)}
					on:contextmenu={(event) => onContextMenu(event, item.task)}
				>
					<!-- A defined bar carries no label: the pinned name column has the
						title, and a two-day bar could only ever render "Re…". The
						accessible name lives on aria-label above. -->
					{#if 'anchorPath' in item}
						<span class="tt-hybrid-underdefined-anchor">after {anchorLabel(item.anchorPath)}</span>
					{/if}
				</button>
			{/each}
		</div>
	</div>
</section>

<style>
	.tt-hybrid-track {
		position: relative;
		display: flex;
		flex-direction: column;
		gap: 6px;
		z-index: 2;
	}

	.tt-hybrid-track-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		flex-wrap: wrap;
		position: sticky;
		left: 0;
		max-width: 100vw;
		z-index: 3;
	}

	.tt-track-status-summary {
		display: inline-flex;
		flex-wrap: wrap;
		gap: 6px;
		flex-shrink: 1;
		min-width: 0;
	}

	.tt-track-status-chip {
		padding: 2px 7px;
		border-radius: 999px;
		font-size: 0.66rem;
		font-weight: 700;
		letter-spacing: 0.03em;
		color: var(--text-muted);
		background: color-mix(in srgb, var(--tt-chip-accent) 14%, var(--background-primary));
		border: 1px solid color-mix(in srgb, var(--tt-chip-accent) 40%, var(--background-modifier-border));
	}

	.tt-hybrid-track-body {
		display: flex;
		align-items: flex-start;
	}

	.tt-hybrid-lane-sidebar {
		/* Width comes from overviewSidebarPx inline — see the comment there. */
		flex-shrink: 0;
		position: relative;
		border-right: 1px solid var(--background-modifier-border);
		border-radius: var(--radius-m, 8px) 0 0 var(--radius-m, 8px);
		background: var(--background-primary-alt, var(--background-secondary));
		overflow: hidden;
		z-index: 4;
	}

	/* Group banding behind the names, so a project's rows read as one block. */
	.tt-hybrid-lane-group {
		position: absolute;
		left: 0;
		right: 0;
		border-bottom: 1px dashed color-mix(in srgb, var(--background-modifier-border) 60%, transparent);
		pointer-events: none;
	}

	/* One row per task, vertically aligned with that task's bar. */
	.tt-hybrid-name {
		position: absolute;
		left: 0;
		right: 0;
		display: flex;
		align-items: center;
		justify-content: flex-start;
		gap: 6px;
		padding: 0 8px 0 10px;
		/* The colour spine, same idea as a list row's left edge. */
		border-left: 3px solid color-mix(in srgb, var(--tt-bar-accent) 70%, transparent);
		background: none;
		border-top: none;
		border-right: none;
		border-bottom: none;
		border-radius: 0;
		box-shadow: none;
		color: var(--text-normal);
		font-size: 0.78rem;
		text-align: left;
		/* Themes give bare <button> a fixed height; these rows are positioned. */
		height: auto;
		cursor: pointer;
	}

	.tt-hybrid-name:hover {
		background: var(--background-modifier-hover);
	}

	.tt-hybrid-name.is-active {
		background: color-mix(in srgb, var(--interactive-accent) 14%, transparent);
	}

	.tt-hybrid-name.is-done {
		opacity: 0.5;
		text-decoration: line-through;
		text-decoration-color: color-mix(in srgb, var(--text-muted) 72%, transparent);
	}

	/* Pinned to the viewport's left edge inside the canvas, so a group stays
		named however far the chart is scrolled. */
	.tt-hybrid-group-label {
		position: absolute;
		left: 8px;
		z-index: 1;
		padding: 1px 6px;
		border-radius: var(--radius-s, 4px);
		background: color-mix(in srgb, var(--background-primary) 82%, transparent);
		font-size: 0.62rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--text-faint);
		pointer-events: none;
	}

	/* Only the rounding changes when a lane sidebar precedes the canvas — the
		sizing below is unconditional. It used to live here, which meant that with
		a single lane (grouping "None", or one project) the sidebar wasn't
		rendered, the canvas had no flex-grow inside its flex row, and it
		collapsed to its 2px of border: every bar positioned at a percentage of
		nothing, and the whole timeline drew blank. */
	.tt-hybrid-lane-sidebar + .tt-hybrid-track-canvas {
		border-radius: 0 var(--radius-m, 8px) var(--radius-m, 8px) 0;
		border-left: none;
	}

	.tt-hybrid-track-canvas {
		position: relative;
		flex: 1;
		min-width: 0;
		border-radius: var(--radius-m, 8px);
		border: var(--border-width, 1px) solid var(--background-modifier-border);
		background: repeating-linear-gradient(
			90deg,
			color-mix(in srgb, var(--background-secondary) 76%, transparent),
			color-mix(in srgb, var(--background-secondary) 76%, transparent) 24px,
			var(--background-primary) 24px,
			var(--background-primary) 48px
		);
		overflow: hidden;
	}

	.tt-hybrid-group-band {
		position: absolute;
		left: 0;
		right: 0;
		border-top: 1px dashed color-mix(in srgb, var(--background-modifier-border) 80%, transparent);
		background: linear-gradient(180deg, color-mix(in srgb, var(--background-secondary) 35%, transparent), transparent 40%);
		pointer-events: none;
		z-index: 0;
	}

	.tt-hybrid-underdefined-item {
		border-style: dashed;
		height: 28px;
		padding: 3px 8px;
		align-items: flex-start;
		flex-direction: column;
		gap: 1px;
	}

	.tt-hybrid-underdefined-anchor {
		font-size: 0.62rem;
		font-weight: 600;
		color: var(--text-faint);
		line-height: 1.05;
	}

	.tt-hybrid-today-band {
		position: absolute;
		top: 0;
		bottom: 0;
		background: color-mix(in srgb, var(--color-red) 8%, transparent);
		border-left: 2px solid color-mix(in srgb, var(--color-red) 50%, var(--interactive-accent));
		border-radius: 2px;
		pointer-events: none;
		z-index: 0;
	}

	.tt-overview-category-title {
		margin: 0;
		font-size: 0.78rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--text-muted);
	}

	.tt-overview-bar {
		position: absolute;
		top: 4px;
		height: 24px;
		padding: 0 8px;
		border-radius: var(--radius-s, 4px);
		border: var(--border-width, 1px) solid color-mix(in srgb, var(--tt-bar-accent) 52%, var(--background-modifier-border));
		background: linear-gradient(180deg, color-mix(in srgb, var(--tt-bar-accent) 18%, var(--background-primary)), color-mix(in srgb, var(--tt-bar-accent) 10%, var(--background-secondary)));
		color: var(--text-normal);
		font-size: 0.73rem;
		font-weight: 600;
		display: flex;
		align-items: center;
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
		cursor: pointer;
		transition: border-color 0.14s ease, box-shadow 0.14s ease, background-color 0.14s ease;
		z-index: 3;
	}

	.tt-overview-bar:hover {
		transform: none;
		box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--interactive-accent) 38%, transparent), 0 0 0 1px color-mix(in srgb, var(--interactive-accent) 18%, transparent);
	}

	.tt-overview-bar.is-done {
		opacity: 0.46;
		filter: saturate(0.56) contrast(0.92);
	}

	.tt-overview-bar.is-inferred {
		border-style: dashed;
		opacity: 0.82;
	}

	.tt-overview-bar.is-active {
		box-shadow: 0 0 0 2px color-mix(in srgb, var(--interactive-accent) 35%, transparent);
	}

	@media (max-width: 900px) {
		.tt-overview-category-title {
			font-size: 0.72rem;
		}

		.tt-hybrid-track-header {
			align-items: flex-start;
			gap: 5px;
		}

		.tt-track-status-summary {
			max-width: 100%;
			overflow-x: auto;
			padding-bottom: 2px;
			-webkit-overflow-scrolling: touch;
		}

		.tt-track-status-chip {
			font-size: 0.62rem;
			white-space: nowrap;
		}

		.tt-hybrid-track-canvas {
			border-radius: var(--radius-s, 6px);
		}

		.tt-overview-bar {
			font-size: 0.68rem;
			padding-inline: 6px;
		}

		.tt-hybrid-underdefined-item {
			height: 24px;
			padding: 2px 6px;
		}

		.tt-hybrid-underdefined-anchor {
			display: none;
		}
	}
</style>
