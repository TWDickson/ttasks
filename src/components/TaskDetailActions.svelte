<script lang="ts">
	import type { Task } from '../types';

	export let task: Task;
	export let onMarkComplete: () => Promise<void>;
	export let onOpenInEditor: () => void;
	export let onDelete: () => Promise<void>;
	export let onArchive: (() => Promise<void>) | undefined = undefined;
</script>

<hr class="tt-divider" />
<div class="tt-actions">
	{#if !task.is_complete}
		<button class="tt-btn tt-btn-primary" on:click={onMarkComplete}>
			✓ Mark Complete
		</button>
	{:else if onArchive}
		<button class="tt-btn" on:click={onArchive} title="Move to archive folder">
			Archive
		</button>
	{/if}
	<button class="tt-btn" on:click={onOpenInEditor}>
		Open in editor
	</button>
	<button class="tt-btn tt-btn-danger" on:click={onDelete}>
		Delete
	</button>
</div>

<div class="tt-meta-footer">
	{#if task.created}<span>Created {task.created}</span>{/if}
	{#if task.completed}<span>Completed {task.completed}</span>{/if}
</div>

<style>
	.tt-divider {
		border: none;
		border-top: 1px solid var(--background-modifier-border);
		margin: 0;
	}

	.tt-actions {
		display: flex;
		gap: var(--size-4-2, 8px);
		flex-wrap: wrap;
	}

	.tt-btn {
		padding: 7px 16px;
		border-radius: var(--button-radius, var(--radius-m, 8px));
		border: var(--border-width, 1px) solid var(--background-modifier-border);
		background: var(--interactive-normal, var(--background-secondary));
		color: var(--text-normal);
		font-size: 0.88rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.12s;
	}

	.tt-btn:hover {
		background: var(--interactive-hover, var(--background-modifier-hover));
	}

	.tt-btn-primary {
		background: var(--interactive-accent);
		border-color: var(--interactive-accent);
		color: var(--text-on-accent);
	}

	.tt-btn-primary:hover {
		background: var(--interactive-accent-hover);
		border-color: var(--interactive-accent-hover);
	}

	.tt-btn-danger {
		color: var(--color-red);
		border-color: color-mix(in srgb, var(--color-red) 35%, var(--background-modifier-border));
		margin-left: auto;
	}

	.tt-btn-danger:hover {
		background: color-mix(in srgb, var(--color-red) 10%, var(--background-primary));
		border-color: color-mix(in srgb, var(--color-red) 60%, var(--background-modifier-border));
	}

	.tt-meta-footer {
		display: flex;
		gap: 16px;
		font-size: 0.72rem;
		color: var(--text-faint);
	}
</style>
