<script lang="ts">
	/**
	 * A multi-select filter control for the board toolbar — the spreadsheet
	 * column-header pattern: click the header, tick the values you want to see.
	 *
	 * Replaces a native <select>, which could only ever ask "is it exactly this
	 * one?". "Blocked or Hold" is a single question a user has, and it was
	 * unanswerable from the toolbar.
	 *
	 * Takes no plugin or store reference (architecture rule AR-1): options in,
	 * selection out. `secondaryOptions` renders below a divider for values that
	 * exist in the vault but not in settings — the same safety net the old area
	 * <select> had, kept because a task filed under a since-deleted area is
	 * exactly the one you need to find.
	 */
	import { createEventDispatcher } from 'svelte';
	import { icon } from '../utils/icon';

	export let label: string;
	// readonly: StatusPolicy.all and the PRIORITIES tuple are both frozen, and
	// this component only ever reads them.
	export let options: readonly string[] = [];
	export let secondaryOptions: readonly string[] = [];
	export let selected: readonly string[] = [];
	/**
	 * Marks the trigger active for a slotted control, which has no `selected`
	 * list of its own to count (the due-date range is two inputs, not a set).
	 */
	export let active = false;

	const dispatch = createEventDispatcher<{ change: string[] }>();

	let open = false;
	let rootEl: HTMLElement;

	// A slotted control brings its own content, so an empty option list is not a
	// reason to render nothing.
	$: hasContent = options.length > 0 || secondaryOptions.length > 0 || !!$$slots.default;
	$: count = selected.length;
	$: isActive = count > 0 || active;
	/**
	 * One selection reads better as the value itself ("High") than as a count
	 * ("Priority 1") — it's the common case and the label is already right there.
	 */
	$: summary = count === 1 ? selected[0] : label;

	function toggle(value: string): void {
		const next = selected.includes(value)
			? selected.filter((v) => v !== value)
			: [...selected, value];
		dispatch('change', next);
	}

	function clear(): void {
		dispatch('change', []);
	}

	function onWindowPointerDown(event: MouseEvent): void {
		if (!open) return;
		if (rootEl && !rootEl.contains(event.target as Node)) open = false;
	}

	/**
	 * Window-level and in the **capture** phase, which is what makes Escape scope
	 * correctly: the board registers its shortcut handler on `document`, so a
	 * bubble-phase listener here would always run second and the board would clear
	 * the search before this menu ever closed. Capture runs first, and stopping
	 * propagation there keeps the keypress from reaching the board at all.
	 */
	function onWindowKeyDown(event: KeyboardEvent): void {
		if (event.key === 'Escape' && open) {
			event.stopPropagation();
			open = false;
		}
	}
</script>

<svelte:window on:mousedown={onWindowPointerDown} on:keydown|capture={onWindowKeyDown} />

{#if hasContent}
	<div class="tt-filter-dropdown" bind:this={rootEl}>
		<button
			type="button"
			class="tt-filter-select tt-filter-trigger"
			class:is-active={isActive}
			aria-haspopup="true"
			aria-expanded={open}
			aria-label={count > 0 ? `${label}: ${selected.join(', ')}` : `Filter by ${label.toLowerCase()}`}
			on:click={() => { open = !open; }}
		>
			<span class="tt-filter-trigger-label">{summary}</span>
			{#if count > 1}
				<span class="tt-count">{count}</span>
			{/if}
			<span class="tt-filter-caret" use:icon={'chevron-down'}></span>
		</button>

		{#if open}
			<div class="tt-filter-menu" role="group" aria-label={label}>
				{#if $$slots.default}
					<slot />
				{:else}
				{#each options as option (option)}
					<label class="tt-filter-option">
						<input
							type="checkbox"
							checked={selected.includes(option)}
							on:change={() => toggle(option)}
						/>
						<span class="tt-truncate">{option}</span>
					</label>
				{/each}

				{#if secondaryOptions.length > 0}
					{#if options.length > 0}
						<div class="tt-divider"></div>
					{/if}
					{#each secondaryOptions as option (option)}
						<label class="tt-filter-option">
							<input
								type="checkbox"
								checked={selected.includes(option)}
								on:change={() => toggle(option)}
							/>
							<span class="tt-truncate">{option}</span>
						</label>
					{/each}
				{/if}

				{#if count > 0}
					<div class="tt-divider"></div>
					<button type="button" class="tt-btn tt-btn-sm tt-filter-clear" on:click={clear}>
						Clear {label.toLowerCase()}
					</button>
				{/if}
				{/if}
			</div>
		{/if}
	</div>
{/if}

<style>
	.tt-filter-dropdown {
		position: relative;
		flex-shrink: 0;
	}

	.tt-filter-trigger {
		display: flex;
		align-items: center;
		gap: 4px;
		/* Themes give bare <button> a fixed height; this control sits in a row of
			selects and inputs, so it has to opt out. See the theme-specificity trap
			in CLAUDE.md. */
		height: auto;
		max-width: 160px;
	}

	.tt-filter-trigger.is-active {
		border-color: var(--interactive-accent);
		color: var(--text-normal);
	}

	.tt-filter-trigger-label {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.tt-filter-caret {
		display: flex;
		align-items: center;
		opacity: 0.7;
	}

	.tt-filter-caret :global(svg) {
		width: 13px;
		height: 13px;
	}

	.tt-filter-menu {
		position: absolute;
		top: calc(100% + 4px);
		left: 0;
		z-index: var(--layer-menu, 50);
		min-width: 168px;
		max-height: 320px;
		overflow-y: auto;
		padding: 4px;
		border: var(--border-width, 1px) solid var(--background-modifier-border);
		border-radius: var(--tt-control-radius);
		background: var(--background-primary);
		box-shadow: var(--shadow-s, 0 2px 8px rgba(0, 0, 0, 0.2));
	}

	.tt-filter-option {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 4px 6px;
		border-radius: var(--tt-control-radius);
		font-size: 0.82rem;
		cursor: pointer;
	}

	.tt-filter-option:hover {
		background: var(--background-modifier-hover);
	}

	.tt-filter-option input {
		flex-shrink: 0;
		margin: 0;
	}

	.tt-filter-clear {
		width: 100%;
	}
</style>
