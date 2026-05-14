<script lang="ts">
	import type { BatchEligibility } from '../store/taskSelection';

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
			<button class="tt-batch-btn" disabled={busy} on:click={() => run(onComplete)}>
				✓ Complete
			</button>
		{/if}
		{#if eligibility.canArchive}
			<button class="tt-batch-btn" disabled={busy} on:click={() => run(onArchive)}>
				Archive
			</button>
		{/if}
		{#if eligibility.canDelete}
			<button class="tt-batch-btn tt-batch-btn-danger" disabled={busy} on:click={() => run(onDelete)}>
				Delete
			</button>
		{/if}
	</div>
	<button class="tt-batch-clear" on:click={onClear} title="Clear selection" aria-label="Clear selection">
		✕
	</button>
</div>

<style>
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

	.tt-batch-btn {
		padding: 5px 14px;
		border-radius: var(--button-radius, var(--radius-m, 8px));
		border: var(--border-width, 1px) solid var(--background-modifier-border);
		background: var(--interactive-normal, var(--background-secondary));
		color: var(--text-normal);
		font-size: 0.82rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.12s;
	}

	.tt-batch-btn:hover:not(:disabled) {
		background: var(--interactive-hover);
	}

	.tt-batch-btn:disabled {
		opacity: 0.5;
		cursor: default;
	}

	.tt-batch-btn-danger {
		color: var(--color-red);
		border-color: color-mix(in srgb, var(--color-red) 35%, var(--background-modifier-border));
	}

	.tt-batch-btn-danger:hover:not(:disabled) {
		background: color-mix(in srgb, var(--color-red) 10%, var(--background-primary));
	}

	.tt-batch-clear {
		flex-shrink: 0;
		background: transparent;
		border: none;
		color: var(--text-faint);
		font-size: 0.9rem;
		cursor: pointer;
		padding: 4px 6px;
		border-radius: 4px;
		line-height: 1;
	}

	.tt-batch-clear:hover {
		background: var(--background-modifier-hover);
		color: var(--text-normal);
	}
</style>
