<script lang="ts">
	import type { FieldDefinition } from '../../schema/types';

	export let definition: FieldDefinition;
	export let value: string | null = '';
	export let error: string | null = null;
	export let readonly = false;
	export let onChange: ((value: string) => void) | undefined = undefined;
	export let onBlur: (() => void) | undefined = undefined;

	const handleChange = (e: Event) => {
		const input = e.target as HTMLInputElement;
		onChange?.(input.value);
	};

	const handleBlur = () => {
		onBlur?.();
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
		on:input={handleChange}
		on:blur={handleBlur}
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

	.tt-field-input {
		padding: var(--tt-space-2, 8px) var(--tt-space-3, 12px);
		border: var(--tt-border-width, 1px) solid var(--background-modifier-border);
		border-radius: var(--tt-control-radius, var(--radius-m, 8px));
		background: var(--background-modifier-form-field);
		color: var(--text-normal);
		font-size: 0.9rem;
		transition: border-color 0.12s;
	}

	.tt-field-input:focus {
		outline: none;
		border-color: var(--background-modifier-border-focus);
	}

	.tt-field-input:disabled {
		background: var(--background-secondary);
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
