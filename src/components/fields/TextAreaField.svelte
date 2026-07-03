<script lang="ts">
	import type { FieldDefinition } from '../../schema/types';

	export let definition: FieldDefinition;
	export let value: string | null = '';
	export let error: string | null = null;
	export let readonly = false;
	export let onChange: ((value: string) => void) | undefined = undefined;
	export let onBlur: (() => void) | undefined = undefined;

	const handleChange = (e: Event) => {
		const textarea = e.target as HTMLTextAreaElement;
		onChange?.(textarea.value);
	};

	const handleBlur = () => {
		onBlur?.();
	};

	$: rows = definition.rows || 5;
</script>

<div class="tt-field tt-field-textarea">
	{#if definition.label}
		<label for={definition.name}>
			{definition.label}
			{#if definition.required}
				<span class="tt-field-required">*</span>
			{/if}
		</label>
	{/if}
	<textarea
		id={definition.name}
		class="tt-field-textarea-input"
		placeholder={definition.placeholder || ''}
		value={value || ''}
		disabled={readonly}
		{rows}
		on:input={handleChange}
		on:blur={handleBlur}
		class:tt-field-error={!!error}
	></textarea>
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

	.tt-field-textarea-input {
		padding: var(--tt-space-2, 8px) var(--tt-space-3, 12px);
		border: var(--tt-border-width, 1px) solid var(--background-modifier-border);
		border-radius: var(--tt-control-radius, var(--radius-m, 8px));
		background: var(--background-modifier-form-field);
		color: var(--text-normal);
		font-size: 0.88rem;
		font-family: var(--font-text);
		line-height: 1.5;
		resize: vertical;
		transition: border-color 0.12s;
	}

	.tt-field-textarea-input:focus {
		outline: none;
		border-color: var(--background-modifier-border-focus);
	}

	.tt-field-textarea-input:disabled {
		background: var(--background-secondary);
		color: var(--text-muted);
		cursor: not-allowed;
	}

	.tt-field-textarea-input.tt-field-error {
		border-color: var(--text-error);
	}

	.tt-field-error-msg {
		font-size: 0.75rem;
		color: var(--text-error);
		padding-top: 0.25rem;
	}
</style>
