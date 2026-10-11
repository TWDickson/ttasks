import { describe, expect, it } from 'vitest';
import { advanceDate, deriveAnchorDay, nextDueDate, nextStartDate } from '../store/recurrence';
import { nextOccurrence } from './next';
import { ruleFromLegacy } from './legacy';
import { addDays, daysInMonth, parseYmd } from './dates';

/**
 * The cutover swaps `store/recurrence.ts` for `src/repeat/`. This pins that the
 * new engine returns exactly what the old one does for every legacy rule, over
 * a long run of dates — so nothing about existing recurring tasks changes when
 * the swap happens.
 */
const RULES = ['daily', 'weekly', 'biweekly', 'monthly', 'yearly'] as const;
const START = '2023-12-20';
const DAYS = 480; // spans a leap year's Feb 29 (2024) and into 2025

const dates = Array.from({ length: DAYS }, (_, i) => addDays(START, i));

/** An anchor is consistent with a due date when the due date is that anchor's day, clamped to its month. */
function consistent(due: string, anchor: number): boolean {
	const { y, m, d } = parseYmd(due);
	return d === Math.min(anchor, daysInMonth(y, m));
}

describe('new engine ≡ legacy recurrence.ts', () => {
	it('fixed schedule, anchor derived from the due date', () => {
		for (const rule of RULES) {
			const repeat = (due: string) => ruleFromLegacy(rule, 'fixed', deriveAnchorDay(due))!;
			for (const due of dates) {
				expect(nextOccurrence(repeat(due), due, due), `${rule} from ${due}`).toBe(
					nextDueDate(rule, 'fixed', due, '2030-01-01', deriveAnchorDay(due)),
				);
			}
		}
	});

	it('fixed schedule with a pinned anchor day (month-end chains)', () => {
		for (const rule of ['monthly', 'yearly'] as const) {
			for (const anchor of [29, 30, 31]) {
				for (const due of dates.filter((d) => consistent(d, anchor))) {
					const repeat = ruleFromLegacy(rule, 'fixed', anchor)!;
					expect(nextOccurrence(repeat, due, due), `${rule} anchor ${anchor} from ${due}`).toBe(
						nextDueDate(rule, 'fixed', due, '2030-01-01', anchor),
					);
				}
			}
		}
	});

	it('from completion', () => {
		for (const rule of RULES) {
			const repeat = ruleFromLegacy(rule, 'from_completion', 31)!;
			for (const completed of dates) {
				expect(nextOccurrence(repeat, completed, completed), `${rule} done ${completed}`).toBe(
					nextDueDate(rule, 'from_completion', '2020-01-01', completed, 31),
				);
			}
		}
	});

	it('start-date advancement matches', () => {
		for (const rule of RULES) {
			for (const start of dates) {
				const repeat = ruleFromLegacy(rule, 'fixed', deriveAnchorDay(start))!;
				expect(nextOccurrence(repeat, start, start)).toBe(nextStartDate(rule, 'fixed', start, null, '2030-01-01', deriveAnchorDay(start)));
			}
		}
	});

	it('agrees with advanceDate on a month-end chain stepped repeatedly', () => {
		const repeat = ruleFromLegacy('monthly', 'fixed', 31)!;
		let legacy = '2026-01-31';
		let current = '2026-01-31';
		for (let i = 0; i < 24; i++) {
			legacy = advanceDate(legacy, 'monthly', 31);
			current = nextOccurrence(repeat, '2026-01-31', current)!;
			expect(current).toBe(legacy);
		}
	});

	it('knows nothing about an unrecognised legacy rule', () => {
		expect(ruleFromLegacy('fortnightly', 'fixed', null)).toBeNull();
		expect(ruleFromLegacy(null, null, null)).toBeNull();
	});

	it('documents the one intended divergence: an anchor day later than the due date', () => {
		// Due Jan 15 but pinned to the 31st (a hand-edited date). The old code
		// advanced a whole interval (Feb 28); the new engine returns the next
		// occurrence on the pinned schedule, which is still in January.
		const repeat = ruleFromLegacy('monthly', 'fixed', 31)!;
		expect(nextDueDate('monthly', 'fixed', '2026-01-15', '2030-01-01', 31)).toBe('2026-02-28');
		expect(nextOccurrence(repeat, '2026-01-15', '2026-01-15')).toBe('2026-01-31');
	});
});
