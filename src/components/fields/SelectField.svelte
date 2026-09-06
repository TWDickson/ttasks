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
		<label class="tt-label" for={definition.name}>
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
	.tt-field-select-input {
		padding: var(--dropdown-padding, 0.45rem var(--tt-space-3, 12px));
		min-height: var(--tt-control-height, var(--input-height, 38px));
		line-height: 1.35;
		background: var(--dropdown-background, var(--background-modifier-form-field));
		cursor: pointer;
	}
</style>
