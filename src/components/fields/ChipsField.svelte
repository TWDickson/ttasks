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
					? `background-color: color-mix(in srgb, ${color} 18%, var(--background-primary)); border-color: color-mix(in srgb, ${color} 60%, var(--background-modifier-border)); color: ${color}; box-shadow: inset 0 0 0 1px color-mix(in srgb, ${color} 60%, transparent);`
					: color
						? `border-color: color-mix(in srgb, ${color} 42%, var(--background-modifier-border)); color: ${color};`
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
		gap: var(--tt-space-1, 4px);
	}

	.tt-field-label {
		font-size: var(--tt-font-label, 0.72rem);
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--text-muted);
	}

	.tt-field-required {
		color: var(--text-error);
		margin-left: 0.25rem;
	}

	.tt-chips-container {
		display: flex;
		flex-wrap: wrap;
		gap: var(--tt-space-1, 4px);
		border-radius: var(--tt-control-radius, var(--radius-m, 8px));
		border: 1px solid transparent;
	}

	.tt-chips-container.tt-field-error {
		border-color: var(--text-error);
	}

	.tt-chip {
		padding: var(--tt-space-1, 4px) 14px;
		min-height: 30px;
		border: var(--tt-border-width, 1px) solid var(--background-modifier-border);
		border-radius: 999px;
		background: var(--interactive-normal, var(--background-secondary));
		color: var(--text-muted);
		font-size: 0.82rem;
		font-weight: 600;
		cursor: pointer;
		transition: background 0.12s, color 0.12s, border-color 0.12s;
		white-space: nowrap;
	}

	.tt-chip:hover:not(:disabled) {
		border-color: var(--text-muted);
		color: var(--text-normal);
	}

	.tt-chip:focus-visible {
		outline: none;
		border-color: var(--background-modifier-border-focus);
	}

	/* Theme-accent fill for chips without a user-configured color; colored chips */
	/* get an inline tinted style from the markup so text stays readable. */
	.tt-chip.tt-chip-active {
		background: var(--interactive-accent);
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
