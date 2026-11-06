<script lang="ts">
	// GP3 project filter: the toolbar pill and its popover of project checkboxes.
	// The pill itself is styled by the shared `.tt-graph-toolbar` rules in styles.css.
	//
	// The menu is a native popover where the WebView supports it (src/utils/popover.ts).
	// That retires the old full-screen backdrop button: it existed because a click on a
	// scaled/transformed graph node could win the hit-test over it, and the top layer
	// sits above every stacking context, so that can't happen to a native menu.
	import type { Task } from '../../types';
	import { t } from '../../i18n';
	import { icon } from '../../utils/icon';
	import { menuPopover, popoverId, supportsNativePopover } from '../../utils/popover';

	/** All projects, name-sorted. */
	export let projects: Task[];
	export let hiddenProjectPaths: Set<string>;
	export let onToggle: (projectPath: string) => void;
	export let onShowAll: () => void;

	let open = false;
	let triggerEl: HTMLButtonElement;
	const native = supportsNativePopover();
	const menuId = popoverId('tt-graph-project-filter');

	$: hiddenCount = projects.filter((project) => hiddenProjectPaths.has(project.path)).length;

	/** Native mode: the trigger's `popovertarget` toggles the menu, not this. */
	function onTriggerClick(): void {
		if (!native) open = !open;
	}
</script>

<div class="tt-graph-project-filter">
	<button
		bind:this={triggerEl}
		type="button"
		class="tt-graph-pill tt-graph-pill-toggle"
		class:is-active={hiddenCount > 0}
		aria-haspopup="true"
		aria-expanded={open}
		popovertarget={native ? menuId : undefined}
		on:click={onTriggerClick}
	>
		<span class="tt-graph-pill-icon" use:icon={'filter'}></span>
		<span class="tt-graph-pill-label">{t('graph.projectFilter.pill')}</span>
		<strong>{hiddenCount > 0 ? t('graph.projectFilter.hidden', { count: hiddenCount }) : t('graph.projectFilter.all')}</strong>
	</button>
	{#if native || open}
		<div
			id={menuId}
			class="tt-graph-project-filter-menu tt-popover"
			popover={native ? 'auto' : undefined}
			role="menu"
			use:menuPopover={{ anchor: triggerEl, native, align: 'end', gap: 6, onOpenChange: (next) => { open = next; } }}
		>
			<div class="tt-graph-project-filter-head">
				<span class="tt-graph-project-filter-title">{t('graph.projectFilter.title')}</span>
				<button
					type="button"
					class="tt-btn tt-btn-sm"
					disabled={hiddenCount === 0}
					on:click={onShowAll}
				>{t('graph.projectFilter.showAll')}</button>
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

	/* Anchored to the pill's right edge, expanding leftward: the Projects pill
		sits toward the right of the (wrapping) toolbar, so a left anchor overflows
		the panel on narrow/mobile viewports. Native: `align: 'end'` above. */
	.tt-graph-project-filter-menu:not([popover]) {
		position: absolute;
		top: calc(100% + 6px);
		right: 0;
		left: auto;
		z-index: 41;
	}

	.tt-graph-project-filter-menu {
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
