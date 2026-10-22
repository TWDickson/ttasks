<script lang="ts">
	// GP3 project filter: the toolbar pill and its popover of project checkboxes.
	// The pill itself is styled by the shared `.tt-graph-toolbar` rules in styles.css.
	import { onMount } from 'svelte';
	import type { Task } from '../../types';
	import { icon } from '../../utils/icon';

	/** All projects, name-sorted. */
	export let projects: Task[];
	export let hiddenProjectPaths: Set<string>;
	export let onToggle: (projectPath: string) => void;
	export let onShowAll: () => void;

	let open = false;
	let rootEl: HTMLDivElement | null = null;

	$: hiddenCount = projects.filter((project) => hiddenProjectPaths.has(project.path)).length;

	// Belt-and-suspenders close: the fixed backdrop button below normally handles
	// click-off, but a click landing on an element inside a nested stacking
	// context (e.g. a scaled/transformed graph node) can win the hit-test over the
	// backdrop. Checking the actual event target's ancestry is robust to that.
	// Capture phase so this fires even if a click target inside the graph canvas
	// stops propagation before it would otherwise bubble to document.
	function onDocumentPointerDown(event: PointerEvent): void {
		if (!open) return;
		const target = event.target as Node | null;
		if (rootEl && target && rootEl.contains(target)) return;
		open = false;
	}

	onMount(() => {
		document.addEventListener('pointerdown', onDocumentPointerDown, true);
		return () => document.removeEventListener('pointerdown', onDocumentPointerDown, true);
	});
</script>

<div class="tt-graph-project-filter" bind:this={rootEl}>
	<button
		type="button"
		class="tt-graph-pill tt-graph-pill-toggle"
		class:is-active={hiddenCount > 0}
		aria-haspopup="true"
		aria-expanded={open}
		on:click={() => open = !open}
	>
		<span class="tt-graph-pill-icon" use:icon={'filter'}></span>
		<span class="tt-graph-pill-label">Projects</span>
		<strong>{hiddenCount > 0 ? `${hiddenCount} hidden` : 'All'}</strong>
	</button>
	{#if open}
		<button
			type="button"
			class="tt-graph-project-filter-backdrop"
			aria-label="Close project filter"
			on:click={() => open = false}
		></button>
		<div class="tt-graph-project-filter-menu" role="menu">
			<div class="tt-graph-project-filter-head">
				<span class="tt-graph-project-filter-title">Show projects</span>
				<button
					type="button"
					class="tt-btn tt-btn-sm"
					disabled={hiddenCount === 0}
					on:click={onShowAll}
				>Show all</button>
			</div>
			<div class="tt-graph-project-filter-list">
				{#each projects as project (project.path)}
					<label class="tt-graph-project-filter-item">
						<input
							type="checkbox"
							checked={!hiddenProjectPaths.has(project.path)}
							on:change={() => onToggle(project.path)}
						/>
						<span class="tt-graph-project-filter-name tt-title tt-title-sm tt-truncate">{project.name}</span>
					</label>
				{/each}
			</div>
		</div>
	{/if}
</div>

<style>
	.tt-graph-project-filter {
		position: relative;
		display: inline-flex;
	}

	.tt-graph-project-filter-backdrop {
		position: fixed;
		inset: 0;
		z-index: 40;
		background: transparent;
		border: none;
		padding: 0;
		cursor: default;
	}

	.tt-graph-project-filter-menu {
		position: absolute;
		top: calc(100% + 6px);
		/* Anchor to the pill's right edge and expand leftward: the Projects pill
		sits toward the right of the (wrapping) toolbar, so a left anchor
		overflows the panel on narrow/mobile viewports. */
		right: 0;
		left: auto;
		z-index: 41;
		min-width: 220px;
		max-width: min(320px, calc(100vw - 24px));
		padding: 8px;
		background: var(--background-primary);
		border: 1px solid var(--background-modifier-border);
		border-radius: 10px;
		box-shadow: var(--shadow-s);
	}

	.tt-graph-project-filter-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		padding: 2px 4px 8px;
		border-bottom: 1px solid var(--background-modifier-border);
		margin-bottom: 6px;
	}

	.tt-graph-project-filter-title {
		text-transform: uppercase;
		letter-spacing: 0.05em;
		font-size: 0.68rem;
		font-weight: 700;
		color: var(--text-muted);
	}

	.tt-graph-project-filter-list {
		display: flex;
		flex-direction: column;
		gap: 2px;
		max-height: 260px;
		overflow-y: auto;
	}

	.tt-graph-project-filter-item {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 5px 4px;
		border-radius: 6px;
		cursor: pointer;
		font-size: 0.85rem;
		color: var(--text-normal);
	}

	.tt-graph-project-filter-item:hover {
		background: var(--background-modifier-hover);
	}

	.tt-graph-project-filter-item input {
		flex: 0 0 auto;
		margin: 0;
	}

	/* Truncation and typography come from .tt-truncate / .tt-title. */
	.tt-graph-project-filter-name {
		min-width: 0;
	}
</style>
