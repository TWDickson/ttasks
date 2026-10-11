/**
 * Bridge from the pre-redesign `recurrence` / `recurrence_type` /
 * `recurrence_anchor_day` fields to a `RepeatRule`.
 *
 * Exists so the new engine can be proven equivalent to `store/recurrence.ts`
 * (`legacyEquivalence.test.ts`) before the cutover, and so the MD-4 migration
 * script has one reviewed mapping to port. **Deleted with `recurrence.ts` at the
 * schema cutover.**
 *
 * Pure module — no Obsidian imports.
 */
import type { RepeatRule } from './types';

export function ruleFromLegacy(
	recurrence: string | null | undefined,
	recurrenceType: string | null | undefined,
	anchorDay: number | null | undefined,
): RepeatRule | null {
	let rule: RepeatRule;
	switch (recurrence) {
		case 'daily': rule = { every: 1, unit: 'day' }; break;
		case 'weekly': rule = { every: 1, unit: 'week' }; break;
		case 'biweekly': rule = { every: 2, unit: 'week' }; break;
		case 'monthly': rule = { every: 1, unit: 'month' }; break;
		case 'yearly': rule = { every: 1, unit: 'year' }; break;
		default: return null;
	}
	if (recurrenceType === 'from_completion') {
		rule.basis = 'completion';
	} else if (
		(rule.unit === 'month' || rule.unit === 'year')
		&& typeof anchorDay === 'number' && Number.isFinite(anchorDay) && anchorDay >= 1
	) {
		// A pinned day-of-month: only the schedule basis accumulates clamp drift.
		rule.monthday = Math.min(Math.trunc(anchorDay), 31);
	}
	return rule;
}
