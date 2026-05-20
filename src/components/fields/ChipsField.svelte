<script lang="ts">
	import type { FieldDefinition } from '../../schema/types';

	export let definition: FieldDefinition;
	export let value: string | string[] | null = [];
	export let options: string[] = [];
	export let optionLabels: Record<string, string> | undefined = undefined;
	export let optionColors: Record<string, string> | undefined = undefined;
	export let error: string | null = null;
	export let readonly = false;
	export let onChange: ((value: string | string[]) => void) | undefined = undefined;
	export let onBlur: (() => void) | undefined = undefined;

	let isMulti = false;
	let values: string[] = [];

	$: isMulti = definition.chipsType === 'multi';
	$: values = Array.isArray(value) ? value : value ? [value] : [];

	const handleChipClick = (opt: string) => {
		if (readonly) return;

		let newValues: string | string[];

		if (isMulti) {
			newValues = values.includes(opt) ? values.filter(v => v !== opt) : [...values, opt];
		} else {
			newValues = values.includes(opt) ? '' : opt;
		}

		onChange?.(newValues);
	};

	const getOptionColor = (opt: string): string | undefined => {
		if (optionColors?.[opt]) {
			return optionColors[opt];
		}
		if (typeof definition.optionColors === 'object' && !('type' in definition.optionColors)) {
			return (definition.optionColors as Record<string, string>)?.[opt];
		}
		return undefined;
	};

	const getOptionLabel = (opt: string): string => {
		if (optionLabels?.[opt]) return optionLabels[opt];
		return opt;
	};

	const handleBlur = () => {
		onBlur?.();
	};
</script>

<div class="tt-field tt-field-chips">
	{#if definition.label}
		<span class="tt-field-label">
			{definition.label}
			{#if definition.required}
				<span class="tt-field-required">*</span>
			{/if}
		</span>
	{/if}
	<div class="tt-chips-container" class:tt-field-error={!!error}>
		{#each options as opt}
			{@const isSelected = values.includes(opt)}
			{@const color = getOptionColor(opt)}
			<button
				type="button"
				class="tt-chip"
				class:tt-chip-active={isSelected}
				class:tt-chip-readonly={readonly}
				style={isSelected && color
					? `background-color: ${color}; border-color: ${color}; color: white;`
					: color
						? `border-color: ${color}; color: ${color};`
						: ''}
				on:click={() => handleChipClick(opt)}
				on:blur={handleBlur}
				disabled={readonly}
			>
				{getOptionLabel(opt)}
			</button>
		{/each}
	</div>
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

	.tt-chips-container {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		padding: 0.25rem;
		border-radius: 4px;
		border: 1px solid transparent;
		transition: border-color 200ms;
	}

	.tt-chips-container:focus-within {
		border-color: var(--interactive-accent);
	}

	.tt-chips-container.tt-field-error {
		border-color: var(--text-error);
	}

	.tt-chip {
		padding: 0.4rem 0.8rem;
		border: 1px solid var(--background-modifier-border);
		border-radius: 16px;
		background-color: var(--background-secondary);
		color: var(--text-normal);
		font-size: 0.875rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 150ms;
		white-space: nowrap;
	}

	.tt-chip:hover:not(:disabled) {
		border-color: var(--interactive-accent);
	}

	.tt-chip:focus {
		outline: none;
		box-shadow: 0 0 0 2px var(--interactive-accent-rgb, rgba(76, 175, 255, 0.2));
	}

	.tt-chip.tt-chip-active {
		background-color: var(--interactive-accent);
		border-color: var(--interactive-accent);
		color: var(--text-on-accent);
	}

	.tt-chip:disabled {
		cursor: not-allowed;
		opacity: 0.6;
	}

	.tt-chip.tt-chip-readonly {
		cursor: default;
	}

	.tt-field-error-msg {
		font-size: 0.75rem;
		color: var(--text-error);
		padding-top: 0.25rem;
	}
</style>
