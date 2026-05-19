<script lang="ts">
	import type { FieldDefinition } from '../../schema/types';

	interface Props {
		definition: FieldDefinition;
		value: string | null;
		options: string[];
		optionLabels?: Record<string, string>;
		error?: string;
		readonly?: boolean;
		onChange?: (value: string) => void;
		onBlur?: () => void;
	}

	let { definition, value = '', options = [], optionLabels, error, readonly = false, onChange, onBlur }: Props = $props();

	const handleChange = (e: Event) => {
		const select = e.target as HTMLSelectElement;
		onChange?.(select.value);
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
		{onChange: handleChange}
		{onBlur}
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
		gap: 0.5rem;
	}

	label {
		font-size: 0.875rem;
		font-weight: 500;
		color: var(--text-normal);
	}

	.tt-field-required {
		color: var(--text-error);
		margin-left: 0.25rem;
	}

	.tt-field-select-input {
		padding: 0.5rem 0.75rem;
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
