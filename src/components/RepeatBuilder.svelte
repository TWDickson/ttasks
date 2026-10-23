<script lang="ts">
	/**
	 * Builds a custom repeat rule. Plugin-free: it takes the current rule and
	 * hands the result to `onSave`, so it can be tested and shown in the rig on
	 * its own. The form model and validation live in `src/repeat/builder.ts`.
	 */
	import { builderFromRule, ruleFromBuilder, type BuilderState } from '../repeat/builder';
	import { describeRepeat } from '../repeat/describe';
	import { WEEKDAYS, type NthTarget, type RepeatCalendar, type RepeatRule, type Weekday } from '../repeat/types';
	import { previewOccurrences } from './taskDetailRepeat';
	import { formatHumanDate } from '../utils/dateUtils';

	export let rule: RepeatRule | null;
	export let dueDate: string | null;
	export let today: string;
	export let calendar: RepeatCalendar | undefined = undefined;
	export let onSave: (rule: RepeatRule) => void;
	export let onCancel: () => void;

	let state: BuilderState = builderFromRule(rule, dueDate, today);

	$: result = ruleFromBuilder(state);
	$: preview = result.rule ? previewOccurrences(result.rule, dueDate, today, 3, calendar) : [];

	const DAY_SHORT: Record<Weekday, string> = { mon: 'Mo', tue: 'Tu', wed: 'We', thu: 'Th', fri: 'Fr', sat: 'Sa', sun: 'Su' };
	const DAY_LONG: Record<Weekday, string> = {
		mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday',
	};
	const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
	const NTH_OPTIONS: { value: number; label: string }[] = [
		{ value: 1, label: 'first' }, { value: 2, label: 'second' }, { value: 3, label: 'third' },
		{ value: 4, label: 'fourth' }, { value: 5, label: 'fifth' }, { value: -1, label: 'last' },
	];
	const NTH_TARGETS: { value: NthTarget; label: string }[] = [
		...WEEKDAYS.map((d) => ({ value: d as NthTarget, label: DAY_LONG[d] })),
		{ value: 'day', label: 'day' },
		{ value: 'weekday', label: 'weekday' },
		{ value: 'weekend-day', label: 'weekend day' },
		{ value: 'working-day', label: 'working day' },
	];

	function toggleWeekday(day: Weekday): void {
		state = {
			...state,
			weekdays: state.weekdays.includes(day) ? state.weekdays.filter((d) => d !== day) : [...state.weekdays, day],
		};
	}

	function save(): void {
		if (result.rule) onSave(result.rule);
	}
</script>

<div class="tt-repeat-builder" role="group" aria-label="Custom repeat">
	<div class="tt-rb-row">
		<span class="tt-rb-text">Every</span>
		<input
			class="tt-field-input tt-rb-number"
			type="number"
			min="1"
			aria-label="Repeat interval"
			value={state.every}
			on:input={(e) => (state = { ...state, every: Number(e.currentTarget.value) })}
		/>
		<select class="tt-field-select-input" aria-label="Repeat unit" bind:value={state.unit}>
			<option value="day">{state.every === 1 ? 'day' : 'days'}</option>
			<option value="week">{state.every === 1 ? 'week' : 'weeks'}</option>
			<option value="month">{state.every === 1 ? 'month' : 'months'}</option>
			<option value="year">{state.every === 1 ? 'year' : 'years'}</option>
		</select>
	</div>

	{#if state.unit === 'week'}
		<div class="tt-rb-row tt-rb-days" role="group" aria-label="On these days">
			{#each WEEKDAYS as day}
				<button
					type="button"
					class="tt-btn tt-btn-sm tt-rb-day"
					aria-pressed={state.weekdays.includes(day)}
					aria-label={DAY_LONG[day]}
					on:click={() => toggleWeekday(day)}
				>{DAY_SHORT[day]}</button>
			{/each}
		</div>
	{/if}

	{#if state.unit === 'month' || state.unit === 'year'}
		<div class="tt-rb-row">
			<span class="tt-rb-text">On</span>
			{#if state.unit === 'year'}
				<select class="tt-field-select-input" aria-label="Month" bind:value={state.month}>
					{#each MONTHS as name, i}<option value={i + 1}>{name}</option>{/each}
				</select>
			{/if}
			<select class="tt-field-select-input" aria-label="Which day" bind:value={state.monthMode}>
				<option value="day">day</option>
				<option value="last">the last day</option>
				{#if state.unit === 'month'}<option value="nth">the…</option>{/if}
			</select>
			{#if state.monthMode === 'day'}
				<input
					class="tt-field-input tt-rb-number"
					type="number"
					min="1"
					max="31"
					aria-label="Day of the month"
					value={state.monthday}
					on:input={(e) => (state = { ...state, monthday: Number(e.currentTarget.value) })}
				/>
			{/if}
			{#if state.monthMode === 'nth' && state.unit === 'month'}
				<select class="tt-field-select-input" aria-label="Which occurrence" bind:value={state.nthN}>
					{#each NTH_OPTIONS as o}<option value={o.value}>{o.label}</option>{/each}
				</select>
				<select class="tt-field-select-input" aria-label="Day kind" bind:value={state.nthTarget}>
					{#each NTH_TARGETS as o}<option value={o.value}>{o.label}</option>{/each}
				</select>
			{/if}
		</div>
	{/if}

	<div class="tt-rb-row">
		<span class="tt-rb-text">Counts from</span>
		<select class="tt-field-select-input" aria-label="Counts from" bind:value={state.basis}>
			<option value="schedule">the due date</option>
			<option value="completion">when it's completed</option>
		</select>
	</div>

	<div class="tt-rb-row">
		<span class="tt-rb-text">On a weekend or holiday</span>
		<select class="tt-field-select-input" aria-label="On a non-working day" bind:value={state.roll}>
			<option value="">keep the date</option>
			<option value="next">move to the next working day</option>
			<option value="previous">move to the previous working day</option>
		</select>
	</div>

	<div class="tt-rb-row">
		<span class="tt-rb-text">Ends</span>
		<select class="tt-field-select-input" aria-label="Ends" bind:value={state.end}>
			<option value="never">never</option>
			<option value="until">on a date</option>
			<option value="count">after a number of times</option>
		</select>
		{#if state.end === 'until'}
			<input class="tt-field-input" type="date" aria-label="End date" bind:value={state.until} />
		{/if}
		{#if state.end === 'count'}
			<input
				class="tt-field-input tt-rb-number"
				type="number"
				min="1"
				aria-label="Number of times"
				value={state.count}
				on:input={(e) => (state = { ...state, count: Number(e.currentTarget.value) })}
			/>
			<span class="tt-rb-text">more</span>
		{/if}
	</div>

	<div class="tt-rb-summary" aria-live="polite">
		{#if result.rule}
			<span class="tt-rb-describe">{describeRepeat(result.rule)}</span>
			{#if preview.length > 0}
				<span class="tt-rb-preview">Next: {preview.map((d) => formatHumanDate(d, today)).join(' · ')}</span>
			{:else}
				<span class="tt-rb-preview">No further dates — this series has ended.</span>
			{/if}
		{:else}
			<span class="tt-chip-warning">{result.error}</span>
		{/if}
	</div>

	<div class="tt-rb-actions">
		<button type="button" class="tt-btn tt-btn-sm" on:click={onCancel}>Cancel</button>
		<button type="button" class="tt-btn tt-btn-sm tt-btn-primary" disabled={!result.rule} on:click={save}>Save repeat</button>
	</div>
</div>

<style>
	/* Layout only — controls use the shared .tt-field-input / .tt-btn primitives. */
	.tt-repeat-builder {
		display: flex;
		flex-direction: column;
		gap: var(--tt-space-2, 8px);
		padding: var(--tt-space-2, 8px);
		border: var(--border-width, 1px) solid var(--background-modifier-border);
		border-radius: var(--tt-control-radius, 6px);
		min-width: 0;
	}

	.tt-rb-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--tt-space-1, 4px);
		min-width: 0;
	}

	/* Same select treatment as SelectField; `height: auto` beats the theme's fixed */
	/* select height, which otherwise clips the text (CLAUDE.md theme trap). */
	.tt-rb-row select.tt-field-select-input {
		flex: 0 1 auto;
		min-width: 0;
		max-width: 100%;
		height: auto;
		padding: var(--dropdown-padding, 0.45rem var(--tt-space-3, 12px));
		min-height: var(--tt-control-height, var(--input-height, 38px));
		line-height: 1.35;
		background: var(--dropdown-background, var(--background-modifier-form-field));
		cursor: pointer;
	}

	.tt-rb-row input.tt-field-input {
		height: auto;
		min-height: var(--tt-control-height, var(--input-height, 38px));
	}

	.tt-rb-text {
		font-size: 0.82rem;
		color: var(--text-muted);
	}

	.tt-rb-number {
		width: 4.5em;
		flex: 0 0 auto;
	}

	.tt-rb-days {
		gap: 2px;
	}

	.tt-rb-day {
		min-width: 2.4em;
	}

	.tt-rb-summary {
		display: flex;
		flex-direction: column;
		gap: 2px;
		font-size: 0.8rem;
	}

	.tt-rb-preview {
		font-size: 0.72rem;
		color: var(--text-muted);
	}

	.tt-rb-actions {
		display: flex;
		justify-content: flex-end;
		gap: var(--tt-space-1, 4px);
	}
</style>
