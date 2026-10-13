/**
 * The preset layer over `RepeatRule`: the five simple cadences the UI menu
 * offers, plus the schedule/after-completion switch. Also the shape the Share/Sync
 * JSON contract has always carried (`recurrence` / `recurrence_type`), so that
 * external consumers see no change.
 *
 * A rule that isn't one of these (a hand-edited "every 2 weeks on Mon/Wed", an
 * nth-weekday rule, an end condition…) has no preset and is shown as "Custom".
 *
 * Pure module — no Obsidian imports.
 */
import type { RepeatRule } from './types';

export const REPEAT_PRESETS = ['daily', 'weekly', 'biweekly', 'monthly', 'yearly'] as const;
export type RepeatPreset = typeof REPEAT_PRESETS[number];

export const REPEAT_PRESET_LABELS: Record<RepeatPreset, string> = {
	daily: 'Daily',
	weekly: 'Weekly',
	biweekly: 'Every 2 weeks',
	monthly: 'Monthly',
	yearly: 'Yearly',
};

/** The legacy `recurrence_type` vocabulary, kept for the UI and the JSON contract. */
export const REPEAT_BASES = ['fixed', 'from_completion'] as const;
export type RepeatBasisName = typeof REPEAT_BASES[number];

export const REPEAT_BASIS_LABELS: Record<RepeatBasisName, string> = {
	fixed: 'Fixed schedule',
	from_completion: 'After completion',
};

export function isRepeatPreset(value: unknown): value is RepeatPreset {
	return typeof value === 'string' && (REPEAT_PRESETS as readonly string[]).includes(value);
}

function dayOfMonth(date: string | null | undefined): number | null {
	const m = typeof date === 'string' ? /^\d{4}-\d{2}-(\d{2})/.exec(date) : null;
	return m ? Number(m[1]) : null;
}

/**
 * Build a rule from a preset. A fixed monthly/yearly rule pins its day-of-month
 * to the due date's, so a month-end schedule keeps its day (RP-1).
 */
export function ruleFromPreset(
	preset: RepeatPreset,
	basis: RepeatBasisName | null | undefined,
	dueDate: string | null | undefined,
): RepeatRule {
	const rule: RepeatRule = {
		daily: { every: 1, unit: 'day' as const },
		weekly: { every: 1, unit: 'week' as const },
		biweekly: { every: 2, unit: 'week' as const },
		monthly: { every: 1, unit: 'month' as const },
		yearly: { every: 1, unit: 'year' as const },
	}[preset];
	if (basis === 'from_completion') return { ...rule, basis: 'completion' };
	const day = dayOfMonth(dueDate);
	if ((rule.unit === 'month' || rule.unit === 'year') && day !== null) return { ...rule, monthday: day };
	return { ...rule };
}

/** The preset a rule is an instance of, or null for a custom rule. */
export function presetOf(rule: RepeatRule | null | undefined): RepeatPreset | null {
	if (!rule) return null;
	if (rule.roll || rule.until !== undefined || rule.count !== undefined || rule.nth || rule.weekdays?.length) return null;
	if (rule.monthday === 'last' || rule.month !== undefined) return null;
	const { every, unit } = rule;
	if (unit === 'day' && every === 1 && rule.monthday === undefined) return 'daily';
	if (unit === 'week' && rule.monthday === undefined) return every === 1 ? 'weekly' : every === 2 ? 'biweekly' : null;
	if (unit === 'month' && every === 1) return 'monthly';
	if (unit === 'year' && every === 1) return 'yearly';
	return null;
}

export function basisName(rule: RepeatRule | null | undefined): RepeatBasisName | null {
	if (!rule) return null;
	return rule.basis === 'completion' ? 'from_completion' : 'fixed';
}

/**
 * When a task's due date is rescheduled, a fixed preset-style monthly/yearly rule
 * follows it to the new day — the same "rescheduling redefines the anchor" rule
 * the old engine applied (RP-1). Rules with `last` / nth / an explicit month are
 * left alone: their day is not tied to the due date.
 */
export function repinToDueDate(rule: RepeatRule, dueDate: string | null | undefined): RepeatRule {
	if (rule.basis === 'completion' || rule.nth || rule.month !== undefined) return rule;
	if (rule.unit !== 'month' && rule.unit !== 'year') return rule;
	if (rule.monthday === 'last') return rule;
	const day = dayOfMonth(dueDate);
	if (day === null || day === rule.monthday) return rule;
	return { ...rule, monthday: day };
}

/**
 * Parse the few plain-English cadences quick capture and the Tasks-plugin 🔁 emoji
 * produce ("every week", "every 2 weeks", "monthly"…). Anything else is not a
 * repeat we understand and yields null — never a guess.
 */
export function presetFromText(text: string | null | undefined): RepeatPreset | null {
	if (!text) return null;
	const t = text.trim().toLowerCase().replace(/\s+/g, ' ');
	if (isRepeatPreset(t)) return t;
	const table: Record<string, RepeatPreset> = {
		'every day': 'daily', 'every week': 'weekly', 'every 2 weeks': 'biweekly', 'every two weeks': 'biweekly',
		'every other week': 'biweekly', 'every month': 'monthly', 'every year': 'yearly', 'annually': 'yearly',
		'fortnightly': 'biweekly',
	};
	return table[t] ?? null;
}
