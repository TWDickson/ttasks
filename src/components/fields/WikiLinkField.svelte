<script lang="ts">
	import type { FieldDefinition, FieldContext } from '../../schema/types';
	import type { Task } from '../../types';
	import { sortDependencyFirst } from '../../utils/dependencySort';

	export let definition: FieldDefinition;
	export let value: string | string[] | null = [];
	export let options: Task[] = [];
	export let context: FieldContext | undefined = undefined;
	export let error: string | null = null;
	export let readonly = false;
	export let onChange: ((value: string | string[]) => void) | undefined = undefined;
	export let onBlur: (() => void) | undefined = undefined;

	const isMulti = definition.chipsType === 'multi';
	$: values = Array.isArray(value) ? value.map(v => v.replace(/\.md$/, '')) : value ? [value.replace(/\.md$/, '')] : [];

	// Sort options by parent_task (same-project first)
	$: parentTaskPath = context?.values?.parent_task || null;
	$: sortedOptions = [...options].sort((a, b) => sortDependencyFirst(a, b, parentTaskPath));

	const handleRemoveChip = (path: string) => {
		if (readonly) return;
		const normalizedPath = path.replace(/\.md$/, '');
		let newValues: string | string[];

		if (isMulti) {
			newValues = values.filter(v => v !== normalizedPath);
		} else {
			newValues = '';
		}

		onChange?.(newValues);
	};

	const handleSelectChange = (e: Event) => {
		const select = e.target as HTMLSelectElement;
		if (!select.value) return;

		const path = select.value.replace(/\.md$/, '');
		let newValues: string | string[];

		if (isMulti) {
			newValues = values.includes(path) ? values : [...values, path];
		} else {
			newValues = path;
		}

		onChange?.(newValues);
		select.value = ''; // Reset dropdown
	};

	const handleBlur = () => {
		onBlur?.();
	};

	const getTaskLabel = (path: string): string => {
		const task = options.find(t => t.path.replace(/\.md$/, '') === path);
		if (task) return task.name;
		return path.split('/').pop() || path;
	};
</script>

<div class="tt-field tt-field-wikilink">
	{#if definition.label}
		<span class="tt-field-label">
			{definition.label}
			{#if definition.required}
				<span class="tt-field-required">*</span>
			{/if}
		</span>
	{/if}

	{#if isMulti}
		<!-- Multi-select mode: chips + dropdown -->
		<div class="tt-wikilink-chips">
			{#each values as path}
				{@const label = getTaskLabel(path)}
				<span class="tt-chip tt-chip-wikilink">
					{label}
					{#if !readonly}
						<button
							type="button"
							class="tt-chip-remove"
							on:click={() => handleRemoveChip(path)}
							on:blur={handleBlur}
							title="Remove"
						>
							×
						</button>
					{/if}
				</span>
			{/each}
		</div>

		<select
			class="tt-field-select-input"
			value=""
			disabled={readonly}
			on:change={handleSelectChange}
			on:blur={handleBlur}
			class:tt-field-error={!!error}
		>
			<option value="">+ Add dependency…</option>
			{#each sortedOptions as task}
				{@const path = task.path.replace(/\.md$/, '')}
				{#if !values.includes(path)}
					<option value={path}>
						{task.name}
					</option>
				{/if}
			{/each}
		</select>
	{:else}
		<!-- Single-select mode: just dropdown -->
		<select
			class="tt-field-select-input"
			value={values[0] || ''}
			disabled={readonly}
			on:change={handleSelectChange}
			on:blur={handleBlur}
			class:tt-field-error={!!error}
		>
			{#if definition.selectAllowEmpty}
				<option value="">— none —</option>
			{/if}
			{#each sortedOptions as task}
				{@const path = task.path.replace(/\.md$/, '')}
				<option value={path}>
					{task.name}
				</option>
			{/each}
		</select>
	{/if}

	{#if error}
		<div class="tt-field-error-msg">{error}</div>
	{/if}
</div>

<style>
	.tt-field {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.tt-field-label {
		font-size: 0.875rem;
		font-weight: 500;
		color: var(--text-normal);
	}

	.tt-field-required {
		color: var(--text-error);
		margin-left: 0.25rem;
	}

	.tt-wikilink-chips {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin-bottom: 0.5rem;
	}

	.tt-chip {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.4rem 0.8rem;
		border: 1px solid var(--interactive-accent);
		border-radius: 16px;
		background-color: color-mix(in srgb, var(--interactive-accent) 15%, var(--background-primary));
		color: var(--interactive-accent);
		font-size: 0.875rem;
		font-weight: 500;
	}

	.tt-chip-wikilink {
		cursor: default;
	}

	.tt-chip-remove {
		padding: 0;
		width: 1.2em;
		height: 1.2em;
		border: none;
		background: none;
		color: inherit;
		font-size: 1.2em;
		cursor: pointer;
		transition: transform 150ms;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.tt-chip-remove:hover {
		transform: scale(1.2);
	}

	.tt-field-select-input {
		padding: 0.45rem 0.75rem;
		min-height: var(--input-height, 36px);
		line-height: 1.35;
		border: 1px solid var(--background-modifier-border);
		border-radius: 4px;
		background-color: var(--background-primary);
		color: var(--text-normal);
		font-size: 0.875rem;
		transition: border-color 200ms;
		cursor: pointer;
	}

	.tt-field-select-input:focus {
		outline: none;
		border-color: var(--interactive-accent);
		box-shadow: 0 0 0 2px var(--interactive-accent-rgb, rgba(76, 175, 255, 0.1));
	}

	.tt-field-select-input:disabled {
		background-color: var(--background-secondary);
		color: var(--text-muted);
		cursor: not-allowed;
	}

	.tt-field-select-input.tt-field-error {
		border-color: var(--text-error);
	}

	.tt-field-error-msg {
		font-size: 0.75rem;
		color: var(--text-error);
		padding-top: 0.25rem;
	}
</style>
