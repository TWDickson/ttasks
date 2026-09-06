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
		<label class="tt-label" for={definition.name}>
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
	.tt-date-control {
		display: flex;
		gap: var(--tt-space-1, 4px);
		align-items: center;
	}

	.tt-field-input {
		flex: 1;
		min-width: 0;
	}

	.tt-date-actions {
		display: flex;
		gap: var(--tt-space-1, 4px);
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
		transition: background 0.12s, color 0.12s;
		white-space: nowrap;
	}

	.tt-date-btn:hover {
		background: var(--interactive-hover, var(--background-modifier-hover));
		color: var(--text-normal);
	}

	.tt-date-btn:focus-visible {
		outline: none;
		border-color: var(--background-modifier-border-focus);
	}
</style>
