<script lang="ts">
	import type { FieldDefinition } from '../../schema/types';

	export let definition: FieldDefinition;
	export let value: string | null = '';
	export let error: string | null = null;
	export let readonly = false;
	export let onChange: ((value: string) => void) | undefined = undefined;
	export let onBlur: (() => void) | undefined = undefined;

	const handleChange = (e: Event) => {
		onChange?.((e.target as HTMLInputElement).value);
	};

	const handleClear = () => {
		onChange?.('');
	};
</script>

<div class="tt-field tt-field-time">
	{#if definition.label}
		<label class="tt-label" for={definition.name}>{definition.label}</label>
	{/if}
	<div class="tt-date-control">
		<input
			id={definition.name}
			type="time"
			class="tt-field-input"
			value={value || ''}
			disabled={readonly}
			on:input={handleChange}
			on:change={handleChange}
			on:blur={() => onBlur?.()}
			class:tt-field-error={!!error}
		/>
		{#if value && !readonly}
			<button type="button" class="tt-date-btn" on:click={handleClear}>Clear</button>
		{/if}
	</div>
	{#if error}
		<div class="tt-field-error-msg">{error}</div>
	{/if}
</div>

<style>
	.tt-date-control {
		display: flex;
		gap: var(--tt-space-1, 4px);
		align-items: center;
	}

	.tt-field-input {
		flex: 1;
		min-width: 0;
	}

	.tt-date-btn {
		padding: 4px 10px;
		min-height: 28px;
		border: var(--border-width, 1px) solid var(--background-modifier-border);
		border-radius: var(--tt-button-radius, var(--button-radius, 8px));
		background: var(--interactive-normal, var(--background-secondary));
		color: var(--text-muted);
		font-size: 0.76rem;
		font-weight: 600;
		cursor: pointer;
		white-space: nowrap;
	}

	.tt-date-btn:hover {
		background: var(--interactive-hover, var(--background-modifier-hover));
		color: var(--text-normal);
	}
</style>
