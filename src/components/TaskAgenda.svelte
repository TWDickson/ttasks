<script lang="ts">
	import type TTasksPlugin from '../main';
	import TaskRow from './TaskRow.svelte';
	import type { Readable, Writable } from 'svelte/store';
	import type { Task } from '../types';
	import type { TaskGroup } from '../query/types';
	import type { ResolvedTaskDate } from '../store/taskSchedule';
	import { AGENDA_BUCKET_LABELS, AGENDA_BUCKET_COLORS, isAgendaBucketKey } from '../query/agendaBuckets';

	export let plugin: TTasksPlugin;
	export let groups: Readable<TaskGroup[]>;
	export let schedule: Map<string, ResolvedTaskDate> | undefined = undefined;
	export let areaColors: Record<string, string>;
	export let labelColors: Record<string, string>;
	export let activeTaskPath: Writable<string | null>;
	export let onOpen: (path: string) => void;
	export let onContextMenu: ((task: Task, event: MouseEvent) => void) | undefined = undefined;

	// Bucket keys/order/labels/colors live in query/agendaBuckets — the same source
	// the engine assigns buckets from — so the view can't drift from the engine.

	$: totalCount = $groups.reduce((n, group) => n + group.tasks.length, 0);

	// Unrecognized keys (e.g. a new engine bucket) fall back to the raw key + a
	// neutral color rather than being dropped, so their tasks never vanish.
	function bucketLabel(key: string): string {
		return isAgendaBucketKey(key) ? AGENDA_BUCKET_LABELS[key] : key;
	}

	function bucketColor(key: string): string {
		return isAgendaBucketKey(key) ? AGENDA_BUCKET_COLORS[key] : 'var(--text-muted)';
	}

</script>

<div class="tt-agenda">
	{#if totalCount === 0}
		<div class="tt-empty">No upcoming tasks.</div>
	{:else}
		{#each $groups as group (group.key)}
			<section class="tt-group">
				<h3 class="tt-group-heading">
					<span
						class="tt-group-label"
						style="color: {bucketColor(group.key)}"
					>{bucketLabel(group.key)}</span>
					<span class="tt-count">{group.tasks.length}</span>
				</h3>
				<ul class="tt-task-list">
					{#each group.tasks as task (task.path)}
						<TaskRow
							{plugin}
							{task}
							{schedule}
							active={$activeTaskPath === task.path}
							{areaColors}
							{labelColors}
							{onOpen}
							onContextMenu={onContextMenu}
						/>
					{/each}
				</ul>
			</section>
		{/each}
	{/if}
</div>

<style>
	.tt-agenda {
		overflow-y: auto;
		flex: 1;
		padding: 8px 4px;
		display: flex;
		flex-direction: column;
		gap: 16px;
		max-width: 660px;
	}

	/* .tt-empty, .tt-group-heading, .tt-count are plugin-global (styles.css). */
	/* The bucket label carries its own color, so the heading base stays muted. */

	/* .tt-task-list (incl. row separators) is plugin-global (styles.css). */

</style>
