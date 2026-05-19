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
		<label for={definition.name}>
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

	.tt-number-control {
		display: flex;
		gap: 0.5rem;
		align-items: center;
	}

	.tt-field-input {
		padding: 0.5rem 0.75rem;
		border: 1px solid var(--background-modifier-border);
		border-radius: 4px;
		background-color: var(--background-primary);
		color: var(--text-normal);
		font-size: 0.875rem;
		flex: 1;
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

	.tt-number-clear {
		padding: 0.4rem 0.6rem;
		border: 1px solid var(--background-modifier-border);
		border-radius: 3px;
		background-color: var(--background-secondary);
		color: var(--text-normal);
		font-size: 0.75rem;
		cursor: pointer;
		transition: all 150ms;
		white-space: nowrap;
	}

	.tt-number-clear:hover {
		background-color: var(--interactive-accent);
		color: var(--text-on-accent);
		border-color: var(--interactive-accent);
	}

	.tt-number-clear:focus {
		outline: none;
		box-shadow: 0 0 0 2px var(--interactive-accent-rgb, rgba(76, 175, 255, 0.2));
	}

	.tt-field-error-msg {
		font-size: 0.75rem;
		color: var(--text-error);
		padding-top: 0.25rem;
	}
</style>
