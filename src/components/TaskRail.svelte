<script lang="ts">
	import type { Readable, Writable } from 'svelte/store';
	import type { RegisteredTaskViewDefinition } from '../views/viewRegistry';
	import { resolveTaskViewIcon } from '../views/viewRegistry';
	import { icon } from '../utils/icon';

	export let views: Readable<RegisteredTaskViewDefinition[]>;
	export let currentViewId: Readable<string>;
	export let onSelectView: (viewId: string) => void;
	export let onAddSmartList: () => void;
	export let onSmartListContextMenu: (viewId: string, event: MouseEvent) => void;
	export let onNewTask: () => void;
	export let onNewProject: () => void;
	export let onShareSync: () => void;
	export let onOpenSettings: () => void;

	$: builtinViews = $views.filter((view) => view.source === 'builtin');
	$: smartListViews = $views.filter((view) => view.source === 'custom');
</script>

<nav class="tt-rail">
	<div class="tt-rail-views">
		<div class="tt-rail-group-title">Default Views</div>
		{#each builtinViews as view}
			<button
				class="tt-rail-item"
				class:is-active={$currentViewId === view.id}
				on:click={() => onSelectView(view.id)}
				aria-label={view.name}
			>
				<span class="tt-rail-icon" use:icon={resolveTaskViewIcon(view)}></span>
				<span class="tt-rail-label">{view.name}</span>
			</button>
		{/each}

		<div class="tt-rail-group-title tt-rail-group-title--smart">Smart Lists</div>
		{#if smartListViews.length === 0}
			<div class="tt-rail-empty">No smart lists yet</div>
		{/if}
		{#each smartListViews as view}
			<button
				class="tt-rail-item tt-rail-item--smart"
				class:is-active={$currentViewId === view.id}
				on:click={() => onSelectView(view.id)}
				on:contextmenu={(event) => onSmartListContextMenu(view.id, event)}
				aria-label={view.name}
				title="Right-click for Smart List options"
			>
				<span class="tt-rail-icon" use:icon={resolveTaskViewIcon(view)}></span>
				<span class="tt-rail-label">{view.name}</span>
			</button>
		{/each}

		<button class="tt-rail-add" on:click={onAddSmartList} aria-label="Add smart list">
			<span class="tt-rail-icon" use:icon={'plus'}></span>
			<span class="tt-rail-label">Add Smart List</span>
		</button>
	</div>

	<div class="tt-rail-actions">
		<button class="tt-rail-item" on:click={onNewTask} aria-label="New task">
			<span class="tt-rail-icon" use:icon={'plus'}></span>
			<span class="tt-rail-label">New task</span>
		</button>
		<button class="tt-rail-item" on:click={onNewProject} aria-label="New project">
			<span class="tt-rail-icon" use:icon={'folder-plus'}></span>
			<span class="tt-rail-label">New project</span>
		</button>
		<button class="tt-rail-item" on:click={onShareSync} aria-label="Share / Sync">
			<span class="tt-rail-icon" use:icon={'share-2'}></span>
			<span class="tt-rail-label">Share / Sync</span>
		</button>
		<div class="tt-rail-divider"></div>
		<button class="tt-rail-item" on:click={onOpenSettings} aria-label="Settings">
			<span class="tt-rail-icon" use:icon={'settings'}></span>
			<span class="tt-rail-label">Settings</span>
		</button>
	</div>
</nav>

<style>
	/* Fills the sidebar leaf; the sidebar itself provides background + border. */
	.tt-rail {
		display: flex;
		flex-direction: column;
		justify-content: space-between;
		height: 100%;
		padding: 8px 0;
	}

	.tt-rail-views,
	.tt-rail-actions {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 0 8px;
	}

	.tt-rail-views {
		overflow-y: auto;
	}

	.tt-rail-group-title {
		font-size: 0.68rem;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--text-faint);
		padding: 8px 10px 4px;
	}

	.tt-rail-group-title--smart {
		margin-top: 10px;
	}

	.tt-rail-empty {
		font-size: 0.76rem;
		color: var(--text-faint);
		padding: 2px 10px 6px;
	}

	.tt-rail-item {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 8px 10px;
		border: none;
		border-radius: var(--tt-button-radius);
		background: transparent;
		color: var(--text-muted);
		font-size: 0.88rem;
		font-weight: 500;
		cursor: pointer;
		text-align: left;
		transition: background 0.1s, color 0.1s;
		width: 100%;
	}
	.tt-rail-item:hover {
		background: var(--background-modifier-hover);
		color: var(--text-normal);
	}
	.tt-rail-item.is-active {
		background: var(--background-modifier-hover);
		color: var(--interactive-accent);
		font-weight: 600;
	}

	.tt-rail-add {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 8px 10px;
		border: 1px dashed var(--background-modifier-border);
		border-radius: var(--tt-button-radius);
		background: transparent;
		color: var(--text-muted);
		font-size: 0.82rem;
		cursor: pointer;
		margin-top: 4px;
	}

	.tt-rail-add:hover {
		color: var(--interactive-accent);
		border-color: var(--interactive-accent);
		background: color-mix(in srgb, var(--interactive-accent) 8%, transparent);
	}

	.tt-rail-divider {
		height: 1px;
		background: var(--background-modifier-border);
		margin: 4px 0;
	}

	.tt-rail-icon {
		width: 18px;
		height: 18px;
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
	}
</style>
