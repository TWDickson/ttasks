<script lang="ts">
	import type { FieldDefinition } from '../../schema/types';

	export let definition: FieldDefinition;
	export let value: string | null = '';
	export let options: string[] = [];
	export let optionLabels: Record<string, string> | undefined = undefined;
	export let error: string | null = null;
	export let readonly = false;
	export let onChange: ((value: string) => void) | undefined = undefined;
	export let onBlur: (() => void) | undefined = undefined;

	const handleChange = (e: Event) => {
		const select = e.target as HTMLSelectElement;
		onChange?.(select.value);
	};

	const handleBlur = () => {
		onBlur?.();
	};

	const getOptionLabel = (opt: string): string => {
		if (optionLabels?.[opt]) return optionLabels[opt];
		return opt || '— none —';
	};

	const getOptionColor = (opt: string): string | undefined => {
		if (typeof definition.optionColors === 'object' && !('type' in definition.optionColors)) {
			return (definition.optionColors as Record<string, string>)?.[opt];
		}
		return undefined;
	};
</script>

<div class="tt-field tt-field-select">
	{#if definition.label}
		<label for={definition.name}>
			{definition.label}
			{#if definition.required}
				<span class="tt-field-required">*</span>
			{/if}
		</label>
	{/if}
	<select
		id={definition.name}
		class="tt-field-select-input"
		value={value || ''}
		disabled={readonly}
		on:change={handleChange}
		on:blur={handleBlur}
		class:tt-field-error={!!error}
	>
		{#if definition.selectAllowEmpty}
			<option value="">— none —</option>
		{/if}
		{#each options as opt}
			<option value={opt}>
				{getOptionLabel(opt)}
			</option>
		{/each}
	</select>
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

	label {
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

	.tt-field-select-input {
		padding: var(--dropdown-padding, 0.45rem var(--tt-space-3, 12px));
		min-height: var(--tt-control-height, var(--input-height, 38px));
		line-height: 1.35;
		border: var(--tt-border-width, 1px) solid var(--background-modifier-border);
		border-radius: var(--tt-control-radius, var(--radius-m, 8px));
		background: var(--dropdown-background, var(--background-modifier-form-field));
		color: var(--text-normal);
		font-size: 0.9rem;
		transition: border-color 0.12s;
		cursor: pointer;
	}

	.tt-field-select-input:focus {
		outline: none;
		border-color: var(--background-modifier-border-focus);
	}

	.tt-field-select-input:disabled {
		background: var(--background-secondary);
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
