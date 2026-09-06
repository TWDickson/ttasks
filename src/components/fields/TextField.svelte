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
		<label class="tt-label" for={definition.name}>
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
