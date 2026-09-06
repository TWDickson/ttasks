<script lang="ts">
	import type { FieldDefinition } from '../../schema/types';

	export let definition: FieldDefinition;
	export let value: number | null = null;
	export let error: string | null = null;
	export let readonly = false;
	export let min: number | undefined = 0;
	export let step: number | undefined = 1;
	export let onChange: ((value: number | null) => void) | undefined = undefined;
	export let onBlur: (() => void) | undefined = undefined;

	function handleInput(event: Event): void {
		const input = event.target as HTMLInputElement;
		if (!input.value) {
			onChange?.(null);
			return;
		}

		const parsed = Number.parseFloat(input.value);
		onChange?.(Number.isFinite(parsed) ? parsed : null);
	}

	function handleBlur(): void {
		onBlur?.();
	}

	function handleClear(): void {
		onChange?.(null);
	}
</script>

<div class="tt-field tt-field-number">
	{#if definition.label}
		<label class="tt-label" for={definition.name}>
			{definition.label}
			{#if definition.required}
				<span class="tt-field-required">*</span>
			{/if}
		</label>
	{/if}

	<div class="tt-number-control">
		<input
			id={definition.name}
			type="number"
			class="tt-field-input"
			placeholder={definition.placeholder || '—'}
			value={value == null ? '' : value}
			min={min}
			step={step}
			disabled={readonly}
			on:input={handleInput}
			on:change={handleInput}
			on:blur={handleBlur}
			class:tt-field-error={!!error}
		/>
		{#if value != null && !readonly}
			<button type="button" class="tt-number-clear" on:click={handleClear}>Clear</button>
		{/if}
	</div>

	{#if error}
		<div class="tt-field-error-msg">{error}</div>
	{/if}
</div>

<style>
	.tt-number-control {
		display: flex;
		gap: var(--tt-space-1, 4px);
		align-items: center;
	}

	.tt-field-input {
		flex: 1;
		min-width: 0;
	}

	.tt-number-clear {
		padding: 4px 10px;
		min-height: 28px;
		border: var(--border-width, 1px) solid var(--background-modifier-border);
		border-radius: var(--tt-button-radius, var(--button-radius, 8px));
		background: var(--interactive-normal, var(--background-secondary));
		color: var(--text-muted);
		font-size: 0.76rem;
		font-weight: 600;
		cursor: pointer;
		transition: background 0.12s, color 0.12s;
		white-space: nowrap;
	}

	.tt-number-clear:hover {
		background: var(--interactive-hover, var(--background-modifier-hover));
		color: var(--text-normal);
	}

	.tt-number-clear:focus-visible {
		outline: none;
		border-color: var(--background-modifier-border-focus);
	}
</style>
