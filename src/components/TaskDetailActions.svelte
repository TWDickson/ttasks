<script lang="ts">
	import type { Task } from '../types';
	import { icon } from '../utils/icon';

	export let task: Task;
	export let onMarkComplete: () => Promise<void>;
	export let onOpenInEditor: () => void;
	export let onDelete: () => Promise<void>;
	export let onArchive: (() => Promise<void>) | undefined = undefined;
</script>

<hr class="tt-divider" />
<div class="tt-actions">
	<button class="tt-btn" on:click={onOpenInEditor}>
		Open in editor
	</button>
	{#if !task.is_complete}
		<button class="tt-btn tt-btn-primary" on:click={onMarkComplete}>
			<span class="tt-btn-icon" use:icon={'check'}></span>
			Mark Complete
		</button>
	{:else if onArchive}
		<button class="tt-btn" on:click={onArchive} title="Move to archive folder">
			<span class="tt-btn-icon" use:icon={'archive'}></span>
			Archive
		</button>
	{/if}
	<button class="tt-btn tt-btn-danger tt-actions-delete" on:click={onDelete}>
		Delete
	</button>
</div>

<div class="tt-meta-footer">
	{#if task.created}<span>Created {task.created}</span>{/if}
	{#if task.completed}<span>Completed {task.completed}</span>{/if}
</div>

<style>
	/* .tt-divider and the .tt-btn system are plugin-global (styles.css). */

	.tt-actions {
		display: flex;
		gap: var(--tt-space-2, 8px);
		flex-wrap: wrap;
	}

	/* Fixed gap (not an auto push) so Delete sits just apart from the pair. */
	.tt-actions-delete {
		margin-left: var(--tt-space-4, 16px);
	}

	.tt-btn-icon {
		display: flex;
		align-items: center;
	}

	.tt-btn-icon :global(svg) {
		width: 15px;
		height: 15px;
	}

	.tt-meta-footer {
		display: flex;
		gap: 16px;
		font-size: 0.72rem;
		color: var(--text-faint);
	}
</style>
