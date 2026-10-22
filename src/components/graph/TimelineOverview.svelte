<script lang="ts">
	// The timeline: a date axis over two tracks — Defined (dated or inferred
	// windows) and Underdefined (no-estimate tasks parked after their upstream
	// work). Opens scrolled to today. Takes callbacks, never the plugin.
	import { onMount } from 'svelte';
	import type { Readable } from 'svelte/store';
	import type { Task } from '../../types';
	import type { BadgePalette } from '../../utils/badgePalette';
	import type { CalendarConfig } from '../../store/graph/taskGraphDates';
	import { buildHybridTimeline, type HybridTimelineGrouping } from '../../store/graph/taskGraph';
	import {
		buildTimelineNonWorkingBands,
		buildTimelineTicks,
		collectProjectHolidayDates,
		diffDays,
		intersectsViewport,
		percentAtDate,
		parseIsoDate,
		startOfToday,
	} from '../../store/graph/graphTimeline';
	import { groupingLabel } from '../../store/graph/graphPresentation';
	import { buildTaskRefIndex, resolveTaskRef, taskRefName } from '../../utils/taskRef';
	import { today } from '../../utils/todayStore';
	import TimelineTrack from './TimelineTrack.svelte';

	export let tasks: Task[];
	export let palette: BadgePalette;
	export let activeTaskPath: Readable<string | null>;
	export let calendarConfig: CalendarConfig;
	export let showCompleted: boolean;
	export let grouping: HybridTimelineGrouping;
	export let onShowCompletedChange: (show: boolean) => void;
	export let onGroupingChange: (grouping: HybridTimelineGrouping) => void;
	export let onOpen: (path: string) => void;
	export let onHoverPreview: (event: MouseEvent, task: Task) => void;
	export let onContextMenu: ((event: MouseEvent, task: Task) => void) | undefined = undefined;

	const PIXELS_PER_DAY = 54;
	const SIDEBAR_WIDTH = 220;
	/* On a phone, 220px of name column leaves barely any chart. */
	const SIDEBAR_WIDTH_NARROW = 124;

	let scrollEl: HTMLDivElement | null = null;
	let viewportWidth = 0;
	let scrollLeft = 0;
	let shouldAutoFocus = true;

	// An anchor whose task isn't loaded reads as `Missing task (id)`; we never
	// print its filename, which would look like a title it doesn't have.
	$: refIndex = buildTaskRefIndex(tasks);
	$: anchorLabel = (path: string): string => {
		const ref = resolveTaskRef(path, refIndex);
		return ref ? taskRefName(ref) : '';
	};

	$: visibleTasks = showCompleted ? tasks : tasks.filter((task) => task.type !== 'task' || !task.is_complete);
	// Re-derived when the date rolls over so the today marker and range padding follow it.
	$: todayDate = parseIsoDate($today) ?? startOfToday();
	$: timeline = buildHybridTimeline(visibleTasks, { grouping, calendarConfig, today: todayDate });
	$: timelineTaskCount = timeline.defined.length + timeline.underdefined.length;
	$: hiddenCompletedCount = Math.max(0, tasks.filter((task) => task.type === 'task' && task.is_complete).length - visibleTasks.filter((task) => task.type === 'task' && task.is_complete).length);
	$: spanDays = Math.max(1, diffDays(timeline.rangeStart, timeline.rangeEnd) + 1);
	$: canvasWidth = Math.max(viewportWidth, Math.round(spanDays * PIXELS_PER_DAY));
	$: todayPercent = percentAtDate(todayDate, timeline.rangeStart, timeline.rangeEnd);
	$: dayWidthPercent = 100 / spanDays;
	$: visibleStartPercent = canvasWidth > 0 ? (scrollLeft / canvasWidth) * 100 : 0;
	$: visibleEndPercent = canvasWidth > 0 ? ((scrollLeft + viewportWidth) / canvasWidth) * 100 : 100;
	$: virtualStartPercent = Math.max(0, visibleStartPercent - 8);
	$: virtualEndPercent = Math.min(100, visibleEndPercent + 8);
	$: inViewport = (item: { leftPercent: number; widthPercent: number }): boolean =>
		intersectsViewport(item.leftPercent, item.widthPercent, virtualStartPercent, virtualEndPercent);
	$: visibleDefined = timeline.defined.filter(inViewport);
	$: visibleUnderdefined = timeline.underdefined.filter(inViewport);
	$: ticks = buildTimelineTicks(timeline.rangeStart, timeline.rangeEnd);
	// Bands show the universal holiday list plus any legacy per-project holidays.
	$: holidayDates = new Set<string>([...collectProjectHolidayDates(visibleTasks), ...calendarConfig.holidays]);
	$: recurringHolidays = new Set<string>(calendarConfig.recurringHolidays ?? []);
	$: nonWorkingBands = buildTimelineNonWorkingBands(timeline.rangeStart, timeline.rangeEnd, holidayDates, recurringHolidays);
	$: grouped = timeline.definedGroups.length > 1 || timeline.underdefinedGroups.length > 1;
	// The name column is always present — it's the only place a task's title is
	// guaranteed readable — so the axis and both tracks always reserve the same
	// gutter. They must agree: a mismatch shifts their percentage bases apart and
	// the axis "Today" line lands offset from the tracks' today band. That's why
	// the width is applied inline from this one value rather than set in CSS,
	// where a media query could move it without the axis noticing.
	$: sidebarPx = viewportWidth > 0 && viewportWidth < 560 ? SIDEBAR_WIDTH_NARROW : SIDEBAR_WIDTH;

	$: if (shouldAutoFocus && scrollEl && canvasWidth > 0) {
		requestAnimationFrame(() => focusAroundToday());
		shouldAutoFocus = false;
	}

	function updateViewport(): void {
		viewportWidth = scrollEl?.clientWidth ?? 0;
	}

	let resizeObserver: ResizeObserver | null = null;

	onMount(() => {
		updateViewport();
		if (typeof ResizeObserver !== 'undefined') resizeObserver = new ResizeObserver(updateViewport);
		window.addEventListener('resize', updateViewport);
		return () => {
			window.removeEventListener('resize', updateViewport);
			resizeObserver?.disconnect();
			resizeObserver = null;
		};
	});

	// The scroll box is recreated when the timeline goes empty and back.
	$: if (resizeObserver && scrollEl) resizeObserver.observe(scrollEl);

	function focusAroundToday(): void {
		if (!scrollEl) return;
		const width = scrollEl.clientWidth;
		if (width <= 0) return;
		const todayX = (todayPercent / 100) * canvasWidth;
		const target = Math.max(0, Math.min(canvasWidth - width, todayX - width * 0.33));
		scrollEl.scrollLeft = target;
		scrollLeft = target;
	}

	function toggleCompleted(): void {
		showCompleted = !showCompleted;
		onShowCompletedChange(showCompleted);
	}

	function cycleGrouping(): void {
		grouping = grouping === 'project' ? 'dependency' : grouping === 'dependency' ? 'none' : 'project';
		onGroupingChange(grouping);
	}

	function handleContextMenu(event: MouseEvent, task: Task): void {
		if (!onContextMenu) return;
		event.preventDefault();
		onContextMenu(event, task);
	}
</script>

<div class="tt-graph-toolbar">
	<div class="tt-graph-summary">
		<div class="tt-graph-pill">
			<span class="tt-graph-pill-label">Defined Track</span>
			<strong>{timeline.defined.length}</strong>
		</div>
		<div class="tt-graph-pill">
			<span class="tt-graph-pill-label">Underdefined Track</span>
			<strong>{timeline.underdefined.length}</strong>
		</div>
		<div class="tt-graph-pill">
			<span class="tt-graph-pill-label">Total Tasks</span>
			<strong>{timelineTaskCount}</strong>
		</div>
		<button type="button" class="tt-graph-pill tt-graph-pill-toggle" on:click={toggleCompleted}>
			<span class="tt-graph-pill-label">Completed</span>
			<strong>{showCompleted ? 'Shown' : `${hiddenCompletedCount} hidden`}</strong>
		</button>
		<button type="button" class="tt-graph-pill tt-graph-pill-toggle" on:click={cycleGrouping}>
			<span class="tt-graph-pill-label">Grouping</span>
			<strong>{groupingLabel(grouping)}</strong>
		</button>
		<button type="button" class="tt-graph-pill tt-graph-pill-toggle" on:click={focusAroundToday}>
			<strong>Jump to Today</strong>
		</button>
	</div>
	<p class="tt-graph-note">
		Defined track shows dated/inferred windows. Underdefined track shows no-estimate tasks that anchor after resolved upstream work. Timeline opens focused around today; drag horizontally for history/future.
	</p>
</div>

{#if timelineTaskCount === 0}
	<div class="tt-graph-empty">No scheduled tasks. Add a start or due date, or chain tasks with dependencies and estimated durations to see them here.</div>
{:else}
	<div class="tt-overview-scroll" bind:this={scrollEl} on:scroll={() => { scrollLeft = scrollEl?.scrollLeft ?? 0; }}>
		<div class="tt-overview-axis" style={`width:${canvasWidth}px;`}>
			<!-- Inner wrapper shares the tracks' sidebar gutter so its % base matches the track canvases. -->
			<div class="tt-overview-axis-inner" style={`margin-left:${sidebarPx}px;width:${canvasWidth - sidebarPx}px;`}>
				{#each nonWorkingBands as band (band.id)}
					<div class="tt-overview-nonworking" class:is-weekend={band.kind === 'weekend'} class:is-holiday={band.kind === 'holiday'} style={`left:${band.leftPercent.toFixed(3)}%;width:${band.widthPercent.toFixed(3)}%;`}></div>
				{/each}
				{#each ticks as tick}
					<div class="tt-overview-tick" class:is-start={tick.position === 'start'} class:is-end={tick.position === 'end'} style={`left:${tick.leftPercent.toFixed(3)}%;`}>
						<span>{tick.label}</span>
					</div>
				{/each}
				<div class="tt-overview-today" style={`left:${todayPercent.toFixed(3)}%;`}><span>Today</span></div>
			</div>
		</div>

		<div class="tt-hybrid-shell" style={`width:${canvasWidth}px;`}>
			<div class="tt-hybrid-calendar-overlay" aria-hidden="true" style={`left:${sidebarPx}px;`}>
				{#each nonWorkingBands as band (band.id)}
					<div class="tt-hybrid-calendar-band" class:is-weekend={band.kind === 'weekend'} class:is-holiday={band.kind === 'holiday'} style={`left:${band.leftPercent.toFixed(3)}%;width:${band.widthPercent.toFixed(3)}%;`}></div>
				{/each}
			</div>
			<TimelineTrack
				title="Defined Track"
				items={timeline.defined}
				visibleItems={visibleDefined}
				groups={timeline.definedGroups}
				rowCount={timeline.definedRowCount}
				{grouped}
				{sidebarPx}
				{scrollLeft}
				{todayPercent}
				{dayWidthPercent}
				activeTaskPath={$activeTaskPath}
				{palette}
				{anchorLabel}
				{onOpen}
				{onHoverPreview}
				onContextMenu={handleContextMenu}
			/>
			<TimelineTrack
				title="Underdefined Track"
				items={timeline.underdefined}
				visibleItems={visibleUnderdefined}
				groups={timeline.underdefinedGroups}
				rowCount={timeline.underdefinedRowCount}
				{grouped}
				{sidebarPx}
				{scrollLeft}
				{todayPercent}
				{dayWidthPercent}
				activeTaskPath={$activeTaskPath}
				{palette}
				{anchorLabel}
				{onOpen}
				{onHoverPreview}
				onContextMenu={handleContextMenu}
			/>
		</div>
	</div>
{/if}

<style>
	.tt-overview-scroll {
		flex: 1;
		min-height: 0;
		overflow: auto;
		padding: 10px 12px 16px;
		display: flex;
		flex-direction: column;
		gap: 14px;
	}

	.tt-hybrid-shell {
		position: relative;
		display: flex;
		flex-direction: column;
		gap: 12px;
		padding-bottom: 8px;
	}

	.tt-hybrid-calendar-overlay {
		position: absolute;
		left: 0;
		right: 0;
		top: 30px;
		bottom: 8px;
		pointer-events: none;
		z-index: 0;
	}

	.tt-hybrid-calendar-band {
		position: absolute;
		top: 0;
		bottom: 0;
	}

	.tt-hybrid-calendar-band.is-weekend {
		background:
			repeating-linear-gradient(
				45deg,
				color-mix(in srgb, var(--text-muted) 14%, transparent) 0,
				color-mix(in srgb, var(--text-muted) 14%, transparent) 3px,
				transparent 3px,
				transparent 7px
			),
			color-mix(in srgb, var(--background-modifier-border) 40%, transparent);
	}

	.tt-hybrid-calendar-band.is-holiday {
		background: color-mix(in srgb, var(--color-red) 22%, transparent);
	}

	.tt-overview-axis {
		position: sticky;
		top: 0;
		min-width: 100%;
		height: 26px;
		background: linear-gradient(180deg, var(--background-primary), color-mix(in srgb, var(--background-primary) 82%, transparent));
		border-bottom: 1px solid var(--background-modifier-border);
		z-index: 2;
	}

	.tt-overview-nonworking {
		position: absolute;
		top: 0;
		bottom: 0;
		pointer-events: none;
	}

	.tt-overview-nonworking.is-weekend {
		background:
			repeating-linear-gradient(
				45deg,
				color-mix(in srgb, var(--text-muted) 14%, transparent) 0,
				color-mix(in srgb, var(--text-muted) 14%, transparent) 3px,
				transparent 3px,
				transparent 7px
			),
			color-mix(in srgb, var(--background-modifier-border) 38%, transparent);
	}

	.tt-overview-nonworking.is-holiday {
		background: color-mix(in srgb, var(--color-red) 24%, transparent);
	}

	.tt-overview-axis-inner {
		position: relative;
		height: 100%;
	}

	/* No translateX: the line's left edge sits exactly on the day boundary (matches the band). */
	.tt-overview-today {
		position: absolute;
		top: 0;
		bottom: -10px;
		border-left: 2px dashed color-mix(in srgb, var(--color-red) 80%, var(--interactive-accent));
		pointer-events: none;
	}

	.tt-overview-today > span {
		position: absolute;
		top: -1px;
		left: 8px;
		font-size: 0.66rem;
		font-weight: 700;
		color: color-mix(in srgb, var(--color-red) 80%, var(--text-normal));
		white-space: nowrap;
	}

	.tt-overview-tick {
		position: absolute;
		top: 3px;
		transform: translateX(-50%);
		font-size: 0.66rem;
		color: var(--text-faint);
		white-space: nowrap;
	}

	.tt-overview-tick.is-start {
		transform: translateX(0);
	}

	.tt-overview-tick.is-end {
		transform: translateX(-100%);
	}

	.tt-overview-tick::after {
		content: '';
		position: absolute;
		left: 50%;
		top: 16px;
		width: 1px;
		height: 10px;
		background: var(--background-modifier-border);
		transform: translateX(-50%);
	}

	@media (max-width: 900px) {
		.tt-overview-scroll {
			padding-inline: 8px;
		}
	}
</style>
