<script lang="ts">
	import type { FieldDefinition } from '../../schema/types';
	import { localDateString } from '../../utils/dateUtils';

	export let definition: FieldDefinition;
	export let value: string | null = '';
	export let error: string | null = null;
	export let readonly = false;
	export let onChange: ((value: string) => void) | undefined = undefined;
	export let onBlur: (() => void) | undefined = undefined;

	const handleDateChange = (e: Event) => {
		const input = e.target as HTMLInputElement;
		onChange?.(input.value);
	};

	const handleBlur = () => {
		onBlur?.();
	};

	const handleToday = () => {
		onChange?.(localDateString());
	};

	const handleClear = () => {
		onChange?.('');
	};
</script>

<div class="tt-field tt-field-date">
	{#if definition.label}
		<label for={definition.name}>
			{definition.label}
			{#if definition.required}
				<span class="tt-field-required">*</span>
			{/if}
		</label>
	{/if}
	<div class="tt-date-control">
		<input
			id={definition.name}
			type="date"
			class="tt-field-input"
			value={value || ''}
			disabled={readonly}
			on:input={handleDateChange}
			on:change={handleDateChange}
			on:blur={handleBlur}
			class:tt-field-error={!!error}
		/>
		{#if definition.dateHasButtons && !readonly}
			<div class="tt-date-actions">
				<button type="button" class="tt-date-btn" on:click={handleToday}>
					Today
				</button>
				<button type="button" class="tt-date-btn" on:click={handleClear}>
					Clear
				</button>
			</div>
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

	.tt-date-control {
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

	.tt-date-actions {
		display: flex;
		gap: 0.25rem;
	}

	.tt-date-btn {
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

	.tt-date-btn:hover {
		background-color: var(--interactive-accent);
		color: white;
		border-color: var(--interactive-accent);
	}

	.tt-date-btn:focus {
		outline: none;
		box-shadow: 0 0 0 2px var(--interactive-accent-rgb, rgba(76, 175, 255, 0.2));
	}

	.tt-field-error-msg {
		font-size: 0.75rem;
		color: var(--text-error);
		padding-top: 0.25rem;
	}
</style>
