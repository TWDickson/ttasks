/**
 * The Share/Sync JSON contract for repeats. Exports have always carried two
 * strings, `recurrence` (a cadence) and `recurrence_type` (`fixed` /
 * `from_completion`), and the work AI that consumes them knows only that shape.
 * Since the repeat redesign the vault stores a `RepeatRule`; this adapter keeps
 * the contract unchanged:
 *
 *  - a preset rule exports as its preset name, exactly as before;
 *  - a custom rule exports as its human description — readable, and harmless,
 *    because importing the same text back is recognised as "unchanged";
 *  - an import sets a rule only from a cadence it understands, and never
 *    clears or guesses one.
 *
 * Pure module — no Obsidian imports.
 */
import { describeRepeat } from '../repeat/describe';
import { basisName, presetFromText, presetOf, ruleFromPreset, type RepeatBasisName } from '../repeat/presets';
import type { RepeatRule } from '../repeat/types';

export interface RepeatContract {
	recurrence: string | null;
	recurrence_type: RepeatBasisName | null;
}

export function repeatToContract(rule: RepeatRule | null): RepeatContract {
	if (!rule) return { recurrence: null, recurrence_type: null };
	return { recurrence: presetOf(rule) ?? describeRepeat(rule), recurrence_type: basisName(rule) };
}

const asBasis = (value: string | null | undefined): RepeatBasisName | null =>
	value === 'fixed' || value === 'from_completion' ? value : null;

/**
 * The rule an imported record asks for, or `undefined` for "leave it alone" —
 * which covers an omitted/blank cadence, an unchanged one, and one we can't parse.
 */
export function repeatFromContract(
	recurrence: string | null | undefined,
	recurrenceType: string | null | undefined,
	dueDate: string | null | undefined,
	current: RepeatRule | null,
): RepeatRule | undefined {
	const currentView = repeatToContract(current);
	const basis = asBasis(recurrenceType) ?? currentView.recurrence_type;
	const cadence = recurrence?.trim() ? recurrence : currentView.recurrence;
	if (!cadence) return undefined;

	const preset = presetFromText(cadence);
	if (preset) {
		const next = ruleFromPreset(preset, basis, dueDate);
		return current && JSON.stringify(next) === JSON.stringify(current) ? undefined : next;
	}
	// The unchanged description of a custom rule: only the basis can have moved.
	if (current && cadence === currentView.recurrence && basis !== currentView.recurrence_type) {
		const { basis: _old, ...rest } = current;
		return basis === 'from_completion' ? { ...rest, basis: 'completion' } : rest;
	}
	return undefined;
}
