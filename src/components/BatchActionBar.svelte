<script lang="ts">
	import type { BatchEligibility } from '../store/taskSelection';
	import { icon } from '../utils/icon';

	export let selectedCount: number;
	export let eligibility: BatchEligibility;
	export let onArchive: () => Promise<void>;
	export let onComplete: () => Promise<void>;
	export let onDelete: () => Promise<void>;
	export let onClear: () => void;

	let busy = false;

	async function run(fn: () => Promise<void>): Promise<void> {
		if (busy) return;
		busy = true;
		try { await fn(); } finally { busy = false; }
	}
</script>

<div class="tt-batch-bar" role="toolbar" aria-label="Batch actions">
	<span class="tt-batch-count">{selectedCount} selected</span>
	<div class="tt-batch-actions">
		{#if eligibility.canComplete}
			<button class="tt-btn tt-btn-sm" disabled={busy} on:click={() => run(onComplete)}>
				<span class="tt-batch-icon" use:icon={'check'}></span>
				Complete
			</button>
		{/if}
		{#if eligibility.canArchive}
			<button class="tt-btn tt-btn-sm" disabled={busy} on:click={() => run(onArchive)}>
				Archive
			</button>
		{/if}
		{#if eligibility.canDelete}
			<button class="tt-btn tt-btn-sm tt-btn-danger" disabled={busy} on:click={() => run(onDelete)}>
				Delete
			</button>
		{/if}
	</div>
	<button class="tt-batch-clear" on:click={onClear} title="Clear selection" aria-label="Clear selection">
		<span class="tt-batch-icon" use:icon={'x'}></span>
	</button>
</div>

<style>
	/* Action buttons use the global .tt-btn system (styles.css). */

	.tt-batch-bar {
		position: sticky;
		bottom: 0;
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 10px 16px;
		background: var(--background-modifier-cover, var(--background-secondary));
		border-top: 1px solid var(--background-modifier-border);
		backdrop-filter: blur(8px);
		z-index: 10;
	}

	.tt-batch-count {
		font-size: 0.82rem;
		font-weight: 600;
		color: var(--text-muted);
		white-space: nowrap;
		margin-right: 4px;
	}

	.tt-batch-actions {
		display: flex;
		gap: 6px;
		flex: 1;
	}

	.tt-batch-icon {
		display: flex;
		align-items: center;
	}

	.tt-batch-icon :global(svg) {
		width: 14px;
		height: 14px;
	}

	.tt-batch-clear {
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		min-width: 28px;
		min-height: 28px;
		background: transparent;
		border: none;
		color: var(--text-faint);
		cursor: pointer;
		padding: 4px;
		border-radius: var(--radius-s, 4px);
		line-height: 1;
	}

	.tt-batch-clear:hover {
		background: var(--background-modifier-hover);
		color: var(--text-normal);
	}
</style>
