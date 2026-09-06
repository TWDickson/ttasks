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
		<label class="tt-label" for={definition.name}>
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
	.tt-field-textarea-input {
		font-size: 0.88rem;
		font-family: var(--font-text);
		line-height: 1.5;
		resize: vertical;
	}
</style>
