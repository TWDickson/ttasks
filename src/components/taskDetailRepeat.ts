/**
 * The detail pane's repeat controls, as pure functions: what the preset menu
 * shows for a rule, what a menu choice does to it, and the next-occurrences
 * preview. The menu is the preset layer over `RepeatRule`; a rule the presets
 * can't express is shown as "Custom — …" and left alone rather than flattened.
 */
import { describeRepeat } from '../repeat/describe';
import { nextOccurrence } from '../repeat/next';
import {
	REPEAT_PRESET_LABELS, basisName, isRepeatPreset, presetOf, ruleFromPreset,
	type RepeatBasisName,
} from '../repeat/presets';
import type { RepeatCalendar, RepeatRule } from '../repeat/types';

export const CUSTOM_REPEAT = 'custom';

/** The menu's current value: '' (doesn't repeat), a preset, or `custom`. */
export function repeatMenuValue(rule: RepeatRule | null): string {
	if (!rule) return '';
	return presetOf(rule) ?? CUSTOM_REPEAT;
}

export function repeatMenuOptions(rule: RepeatRule | null, presets: readonly string[]): { options: string[]; labels: Record<string, string> } {
	const labels: Record<string, string> = { ...REPEAT_PRESET_LABELS };
	if (rule && presetOf(rule) === null) {
		labels[CUSTOM_REPEAT] = `Custom — ${describeRepeat(rule)}`;
		return { options: [...presets, CUSTOM_REPEAT], labels };
	}
	return { options: [...presets], labels };
}

/** The rule after picking `choice` from the menu; `undefined` means "no change". */
export function ruleForMenuChoice(
	rule: RepeatRule | null,
	choice: string,
	dueDate: string | null,
): RepeatRule | null | undefined {
	if (choice === '') return null;
	if (!isRepeatPreset(choice)) return undefined; // "custom" re-selected: keep it
	return ruleFromPreset(choice, basisName(rule), dueDate);
}

/** The rule after switching between a fixed schedule and after-completion. */
export function ruleForBasisChoice(rule: RepeatRule | null, basis: RepeatBasisName, dueDate: string | null): RepeatRule | null {
	if (!rule) return null;
	const preset = presetOf(rule);
	if (preset) return ruleFromPreset(preset, basis, dueDate);
	const { basis: _old, ...rest } = rule;
	return basis === 'from_completion' ? { ...rest, basis: 'completion' } : rest;
}

/**
 * The next few dates the rule will produce from this task — the quickest way to
 * check that "first working day of the month" does what was meant. Completion-
 * based rules preview from today, since that's where they'd restart.
 */
export function previewOccurrences(
	rule: RepeatRule | null,
	dueDate: string | null,
	today: string,
	count = 3,
	calendar?: RepeatCalendar,
): string[] {
	if (!rule) return [];
	const anchor = rule.basis === 'completion' ? today : (dueDate ?? today);
	const out: string[] = [];
	let after = anchor;
	let remaining = rule.count;
	for (let i = 0; i < count; i++) {
		const next = nextOccurrence(remaining === undefined ? rule : { ...rule, count: remaining }, anchor, after, calendar);
		if (next === null) break;
		out.push(next);
		after = next;
		if (remaining !== undefined) remaining -= 1;
	}
	return out;
}
