<script lang="ts">
	import type { FieldDefinition } from '../../schema/types';

	interface Props {
		definition: FieldDefinition;
		value: string | null;
		error?: string;
		readonly?: boolean;
		onChange?: (value: string) => void;
		onBlur?: () => void;
	}

	let { definition, value = '', error, readonly = false, onChange, onBlur }: Props = $props();

	const handleChange = (e: Event) => {
		const input = e.target as HTMLInputElement;
		onChange?.(input.value);
	};
</script>

<div class="tt-field tt-field-text">
	{#if definition.label}
		<label for={definition.name}>
			{definition.label}
			{#if definition.required}
				<span class="tt-field-required">*</span>
			{/if}
		</label>
	{/if}
	<input
		id={definition.name}
		type="text"
		class="tt-field-input"
		placeholder={definition.placeholder || ''}
		value={value || ''}
		disabled={readonly}
		{onChange: handleChange}
		{onBlur}
		class:tt-field-error={!!error}
	/>
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

	.tt-field-input {
		padding: 0.5rem 0.75rem;
		border: 1px solid var(--background-modifier-border);
		border-radius: 4px;
		background-color: var(--background-primary);
		color: var(--text-normal);
		font-size: 0.875rem;
		font-family: var(--font-monospace);
		transition: border-color 200ms;
	}

	.tt-field-input:focus {
		outline: none;
		border-color: var(--interactive-accent);
		box-shadow: 0 0 0 2px var(--interactive-accent-rgb, rgba(76, 175, 255, 0.1));
	}

	.tt-field-input:disabled {
		background-color: var(--background-secondary);
		color: var(--text-muted);
		cursor: not-allowed;
	}

	.tt-field-input.tt-field-error {
		border-color: var(--text-error);
	}

	.tt-field-error-msg {
		font-size: 0.75rem;
		color: var(--text-error);
		padding-top: 0.25rem;
	}
</style>
