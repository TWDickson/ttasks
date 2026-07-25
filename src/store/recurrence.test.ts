import { describe, it, expect } from 'vitest';
import {
	advanceDate,
	deriveAnchorDay,
	nextDueDate,
	nextStartDate,
	isValidRecurrenceRule,
	isValidRecurrenceType,
	RECURRENCE_OPTIONS,
	RECURRENCE_TYPES,
} from './recurrence';

type AdvanceCase = readonly [label: string, date: string, rule: string, expected: string];
type NextDueCase = readonly [label: string, rule: string, type: string, dueDate: string | null, completionDate: string, expected: string];
type NextStartCase = readonly [label: string, rule: string, type: string, startDate: string | null, dueDate: string | null, completionDate: string, expected: string | null];
type BoolCase = readonly [label: string, input: unknown, expected: boolean];

function runAdvanceCases(cases: readonly AdvanceCase[], anchorDay?: number): void {
	it.each(cases)('%s', (_label, date, rule, expected) => {
		expect(advanceDate(date, rule, anchorDay)).toBe(expected);
	});
}

function runNextDueCases(cases: readonly NextDueCase[]): void {
	it.each(cases)('%s', (_label, rule, type, dueDate, completionDate, expected) => {
		expect(nextDueDate(rule, type as any, dueDate, completionDate)).toBe(expected);
	});
}

function runNextStartCases(cases: readonly NextStartCase[]): void {
	it.each(cases)('%s', (_label, rule, type, startDate, dueDate, completionDate, expected) => {
		expect(nextStartDate(rule, type as any, startDate, dueDate, completionDate)).toBe(expected);
	});
}

function runBooleanCases(cases: readonly BoolCase[], fn: (value: unknown) => boolean): void {
	it.each(cases)('%s', (_label, input, expected) => {
		expect(fn(input)).toBe(expected);
	});
}

// ── advanceDate ───────────────────────────────────────────────────────────────

describe('advanceDate', () => {
	describe('daily', () => {
		runAdvanceCases([
			['advances a normal day by 1', '2026-04-15', 'daily', '2026-04-16'],
			['advances across a month boundary', '2026-04-30', 'daily', '2026-05-01'],
			['advances across a year boundary', '2026-12-31', 'daily', '2027-01-01'],
		]);
	});

	describe('weekly', () => {
		runAdvanceCases([
			['advances by 7 days', '2026-04-15', 'weekly', '2026-04-22'],
			['advances across a month boundary', '2026-04-28', 'weekly', '2026-05-05'],
		]);
	});

	describe('biweekly', () => {
		runAdvanceCases([
			['advances by 14 days', '2026-04-01', 'biweekly', '2026-04-15'],
			['advances across a month boundary', '2026-04-25', 'biweekly', '2026-05-09'],
		]);
	});

	describe('monthly', () => {
		it('advances by one calendar month', () => {
			expect(advanceDate('2026-04-15', 'monthly')).toBe('2026-05-15');
		});

		it('advances across a year boundary', () => {
			expect(advanceDate('2026-12-10', 'monthly')).toBe('2027-01-10');
		});

		it('clamps to last day of short month (Jan 31 → Feb 28)', () => {
			expect(advanceDate('2026-01-31', 'monthly')).toBe('2026-02-28');
		});

		it('clamps to last day of short month (Jan 31 → Feb 29 on leap year)', () => {
			expect(advanceDate('2024-01-31', 'monthly')).toBe('2024-02-29');
		});

		it('Mar 31 → Apr 30', () => {
			expect(advanceDate('2026-03-31', 'monthly')).toBe('2026-04-30');
		});

		// Un-anchored, each step is computed from the previous *clamped* date, so a
		// month-end schedule collapses onto February's day and stays there. This is
		// RP-1 / DT-3 in AUDIT_2026-07.md; it is pinned here as the documented
		// un-anchored contract, not as desirable behaviour. Pass an anchorDay to
		// avoid it — see the 'anchored (RP-1 drift fix)' block below.
		it('advancing repeatedly from Jan 31 drifts to the clamped day (no anchor)', () => {
			const feb = advanceDate('2026-01-31', 'monthly');
			const mar = advanceDate(feb, 'monthly');
			const apr = advanceDate(mar, 'monthly');

			expect(feb).toBe('2026-02-28');
			expect(mar).toBe('2026-03-28');
			expect(apr).toBe('2026-04-28');
		});

		it('keeps leap-day day-of-month when target month supports it', () => {
			expect(advanceDate('2024-02-29', 'monthly')).toBe('2024-03-29');
		});
	});

	// RP-1 / DT-3: passing the schedule's real day-of-month makes the short-month
	// clamp per-occurrence instead of cumulative, so a month-end schedule recovers
	// its day instead of collapsing onto February's.
	describe('anchored (RP-1 drift fix)', () => {
		it('recovers the anchor day after a short month (Feb 28 + anchor 31 → Mar 31)', () => {
			expect(advanceDate('2026-02-28', 'monthly', 31)).toBe('2026-03-31');
		});

		it('holds a month-end schedule for a full year instead of drifting', () => {
			const chain: string[] = [];
			let date = '2026-01-31';
			for (let i = 0; i < 12; i++) {
				date = advanceDate(date, 'monthly', 31);
				chain.push(date);
			}

			expect(chain).toEqual([
				'2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31',
				'2026-06-30', '2026-07-31', '2026-08-31', '2026-09-30',
				'2026-10-31', '2026-11-30', '2026-12-31', '2027-01-31',
			]);
		});

		it('clamps a 31st anchor into a leap February', () => {
			expect(advanceDate('2024-01-31', 'monthly', 31)).toBe('2024-02-29');
		});

		it('holds a 30th anchor without being pulled to month-end', () => {
			const feb = advanceDate('2026-01-30', 'monthly', 30);
			const mar = advanceDate(feb, 'monthly', 30);
			const apr = advanceDate(mar, 'monthly', 30);
			const may = advanceDate(apr, 'monthly', 30);

			// Apr 30 is month-end, but the anchor is 30 — May must not become the 31st.
			expect([feb, mar, apr, may]).toEqual(['2026-02-28', '2026-03-30', '2026-04-30', '2026-05-30']);
		});

		it('an anchor at or below the target month length is a no-op', () => {
			expect(advanceDate('2026-04-15', 'monthly', 15)).toBe('2026-05-15');
		});

		it('yearly recovers a leap day in the next leap year', () => {
			const chain: string[] = [];
			let date = '2024-02-29';
			for (let i = 0; i < 4; i++) {
				date = advanceDate(date, 'yearly', 29);
				chain.push(date);
			}

			expect(chain).toEqual(['2025-02-28', '2026-02-28', '2027-02-28', '2028-02-29']);
		});

		describe('day-based rules ignore the anchor', () => {
			runAdvanceCases([
				['daily ignores anchorDay', '2026-04-15', 'daily', '2026-04-16'],
				['weekly ignores anchorDay', '2026-04-15', 'weekly', '2026-04-22'],
				['biweekly ignores anchorDay', '2026-04-15', 'biweekly', '2026-04-29'],
			], 31);
		});

		describe('unusable anchors fall back to the date’s own day', () => {
			it.each([
				['zero', 0],
				['negative', -5],
				['NaN', Number.NaN],
				['Infinity', Number.POSITIVE_INFINITY],
			])('%s is ignored', (_label, anchor) => {
				expect(advanceDate('2026-01-31', 'monthly', anchor as number)).toBe('2026-02-28');
			});

			it('null is ignored', () => {
				expect(advanceDate('2026-01-31', 'monthly', null)).toBe('2026-02-28');
			});

			it('an anchor beyond 31 clamps to 31', () => {
				expect(advanceDate('2026-02-28', 'monthly', 99)).toBe('2026-03-31');
			});

			it('a fractional anchor truncates', () => {
				expect(advanceDate('2026-02-28', 'monthly', 31.7)).toBe('2026-03-31');
			});
		});
	});

	describe('yearly', () => {
		runAdvanceCases([
			['advances by one year', '2026-04-15', 'yearly', '2027-04-15'],
			['advances across leap year boundary (Feb 29 → Feb 28)', '2024-02-29', 'yearly', '2025-02-28'],
			['keeps Feb 28 on leap years (no auto-upgrade to Feb 29)', '2023-02-28', 'yearly', '2024-02-28'],
		]);
	});

	describe('DST boundaries (calendar-safe)', () => {
		runAdvanceCases([
			['daily advance across US spring-forward weekend stays calendar-correct', '2026-03-08', 'daily', '2026-03-09'],
			['weekly advance across US fall-back weekend stays calendar-correct', '2026-11-01', 'weekly', '2026-11-08'],
		]);
	});

	describe('unknown rule', () => {
		runAdvanceCases([
			['returns the original date unchanged', '2026-04-15', 'quarterly', '2026-04-15'],
			['returns the original date for empty string rule', '2026-04-15', '', '2026-04-15'],
		]);
	});
});

// ── nextDueDate ───────────────────────────────────────────────────────────────

describe('nextDueDate', () => {
	describe('fixed mode (default)', () => {
		it('advances from dueDate when provided', () => {
			// Weekly, due 2026-04-13 (Mon), completed on 2026-04-16 (Thu)
			// Fixed: next due = 2026-04-20 (Mon), regardless of completion date
			expect(nextDueDate('weekly', 'fixed', '2026-04-13', '2026-04-16')).toBe('2026-04-20');
		});

		it('falls back to completionDate when dueDate is null', () => {
			expect(nextDueDate('weekly', 'fixed', null, '2026-04-16')).toBe('2026-04-23');
		});

		it('uses fixed mode when recurrence_type is null', () => {
			expect(nextDueDate('monthly', null, '2026-04-01', '2026-04-16')).toBe('2026-05-01');
		});

		it('uses fixed mode when recurrence_type is undefined', () => {
			expect(nextDueDate('monthly', undefined, '2026-04-01', '2026-04-16')).toBe('2026-05-01');
		});

		it('maintains cadence even when completed very late', () => {
			// Task was due 2026-01-01, completed 2026-04-16 (months late)
			// Fixed: next due = 2026-02-01 (original schedule preserved)
			expect(nextDueDate('monthly', 'fixed', '2026-01-01', '2026-04-16')).toBe('2026-02-01');
		});

		it('with month-end due dates, fixed mode still advances from dueDate', () => {
			expect(nextDueDate('monthly', 'fixed', '2026-01-31', '2026-04-30')).toBe('2026-02-28');
		});
	});

	describe('from_completion mode', () => {
		it('advances from completionDate, ignoring dueDate', () => {
			// Weekly, due 2026-04-13, completed on 2026-04-16
			// From completion: next due = 2026-04-23
			expect(nextDueDate('weekly', 'from_completion', '2026-04-13', '2026-04-16')).toBe('2026-04-23');
		});

		it('works the same when dueDate is null', () => {
			expect(nextDueDate('weekly', 'from_completion', null, '2026-04-16')).toBe('2026-04-23');
		});

		it('when completed early, next due is earlier than fixed would give', () => {
			// Task due 2026-04-20, completed on 2026-04-16 (early)
			// from_completion: next = 2026-04-23 (earlier than fixed's 2026-04-27)
			const fromCompletion = nextDueDate('weekly', 'from_completion', '2026-04-20', '2026-04-16');
			const fixed          = nextDueDate('weekly', 'fixed',           '2026-04-20', '2026-04-16');
			expect(fromCompletion).toBe('2026-04-23');
			expect(fixed).toBe('2026-04-27');
		});

		it('when completed late, next due reflects the actual completion date', () => {
			// Monthly, due 2026-01-01, completed 2026-04-16
			// from_completion: next = 2026-05-16
			expect(nextDueDate('monthly', 'from_completion', '2026-01-01', '2026-04-16')).toBe('2026-05-16');
		});

		it('with month-end values, from_completion ignores dueDate and advances completionDate', () => {
			expect(nextDueDate('monthly', 'from_completion', '2026-01-31', '2026-04-30')).toBe('2026-05-30');
		});
	});

	describe('anchorDay (RP-1)', () => {
		it('fixed mode passes the anchor through to the month clamp', () => {
			expect(nextDueDate('monthly', 'fixed', '2026-02-28', '2026-02-28', 31)).toBe('2026-03-31');
		});

		it('omitting the anchor preserves the un-anchored result', () => {
			expect(nextDueDate('monthly', 'fixed', '2026-02-28', '2026-02-28')).toBe('2026-03-28');
		});

		it('from_completion ignores the anchor (no chain to drift)', () => {
			// The clock restarts from the completion date every time, so the previous
			// occurrence never feeds the next one.
			expect(nextDueDate('monthly', 'from_completion', '2026-01-31', '2026-02-28', 31)).toBe('2026-03-28');
		});
	});

	describe('unknown rule passthrough', () => {
		it('returns dueDate unchanged in fixed mode', () => {
			expect(nextDueDate('quarterly', 'fixed', '2026-04-10', '2026-04-16')).toBe('2026-04-10');
		});

		it('returns completionDate unchanged in from_completion mode', () => {
			expect(nextDueDate('quarterly', 'from_completion', '2026-04-10', '2026-04-16')).toBe('2026-04-16');
		});
	});

	describe('all recurrence rules fire correctly via both modes', () => {
		runNextDueCases([
			['daily / fixed', 'daily', 'fixed', '2026-04-10', '2026-04-16', '2026-04-11'],
			['daily / from_completion', 'daily', 'from_completion', null, '2026-04-16', '2026-04-17'],
			['weekly / fixed', 'weekly', 'fixed', '2026-04-10', '2026-04-16', '2026-04-17'],
			['weekly / from_completion', 'weekly', 'from_completion', null, '2026-04-16', '2026-04-23'],
			['biweekly / fixed', 'biweekly', 'fixed', '2026-04-10', '2026-04-16', '2026-04-24'],
			['biweekly / from_completion', 'biweekly', 'from_completion', null, '2026-04-16', '2026-04-30'],
			['monthly / fixed', 'monthly', 'fixed', '2026-04-10', '2026-04-16', '2026-05-10'],
			['monthly / from_completion', 'monthly', 'from_completion', null, '2026-04-16', '2026-05-16'],
			['yearly / fixed', 'yearly', 'fixed', '2026-04-10', '2026-04-16', '2027-04-10'],
			['yearly / from_completion', 'yearly', 'from_completion', null, '2026-04-16', '2027-04-16'],
		]);
	});
});

// ── nextStartDate ─────────────────────────────────────────────────────────────

describe('nextStartDate', () => {
	runNextStartCases([
		['returns null when task has no start date', 'weekly', 'fixed', null, '2026-04-13', '2026-04-16', null],
	]);

	describe('fixed mode', () => {
		runNextStartCases([
			// start 2026-04-11, due 2026-04-13 (2 day lead)
			// Next start = 2026-04-18, next due = 2026-04-20 — gap preserved
			['advances start date by the same interval (preserves offset from due)', 'weekly', 'fixed', '2026-04-11', '2026-04-13', '2026-04-16', '2026-04-18'],
			['advances monthly start date', 'monthly', 'fixed', '2026-04-01', '2026-04-15', '2026-04-16', '2026-05-01'],
		]);
	});

	describe('from_completion mode', () => {
		runNextStartCases([
			// Completed 2026-04-16; next start = completion + 1 week
			['advances start date from completionDate', 'weekly', 'from_completion', '2026-04-11', '2026-04-13', '2026-04-16', '2026-04-23'],
			['advances monthly start date from completion', 'monthly', 'from_completion', '2026-04-01', '2026-04-15', '2026-04-16', '2026-05-16'],
		]);
	});

	describe('anchorDay (RP-1)', () => {
		it('anchors the start date independently of the due date', () => {
			// start 2026-02-28 (anchor 31), due later in the month — the start date
			// carries its own anchor, so it recovers the 31st too.
			expect(nextStartDate('monthly', 'fixed', '2026-02-28', '2026-03-05', '2026-02-28', 31)).toBe('2026-03-31');
		});

		it('from_completion ignores the anchor', () => {
			expect(nextStartDate('monthly', 'from_completion', '2026-02-28', '2026-03-05', '2026-02-28', 31)).toBe('2026-03-28');
		});
	});

	it('for unknown rules, fixed mode returns the original startDate unchanged', () => {
		expect(nextStartDate('quarterly', 'fixed', '2026-04-01', '2026-04-15', '2026-04-16')).toBe('2026-04-01');
	});

	it('for unknown rules, from_completion returns completionDate', () => {
		expect(nextStartDate('quarterly', 'from_completion', '2026-04-01', '2026-04-15', '2026-04-16')).toBe('2026-04-16');
	});
});

// ── deriveAnchorDay ───────────────────────────────────────────────────────────

describe('deriveAnchorDay', () => {
	it.each([
		['a month-end date', '2026-01-31', 31],
		['a mid-month date', '2026-04-15', 15],
		['the first of the month', '2026-04-01', 1],
		['a leap day', '2024-02-29', 29],
	])('reads the day-of-month from %s', (_label, date, expected) => {
		expect(deriveAnchorDay(date as string)).toBe(expected);
	});

	it.each([
		['null', null],
		['undefined', undefined],
		['an empty string', ''],
		['a non-date string', 'tomorrow'],
		['a partial date', '2026-04'],
		['a datetime', '2026-04-15T09:00'],
		['a non-string', 20260415 as unknown as string],
	])('returns null for %s (leaves the schedule un-anchored)', (_label, value) => {
		expect(deriveAnchorDay(value as string | null | undefined)).toBeNull();
	});

	it('round-trips through advanceDate to hold a month-end schedule', () => {
		const anchor = deriveAnchorDay('2026-01-31');
		expect(advanceDate(advanceDate('2026-01-31', 'monthly', anchor), 'monthly', anchor)).toBe('2026-03-31');
	});
});

// ── Guards ────────────────────────────────────────────────────────────────────

describe('isValidRecurrenceRule', () => {
	it.each(RECURRENCE_OPTIONS)('accepts %s', (rule) => {
		expect(isValidRecurrenceRule(rule)).toBe(true);
	});

	runBooleanCases([
		['rejects unknown string: quarterly', 'quarterly', false],
		['rejects unknown string: empty', '', false],
		['rejects unknown string: Monthly', 'Monthly', false],
		['rejects unknown string: spaced monthly', ' monthly ', false],
		['rejects non-string: null', null, false],
		['rejects non-string: number', 42, false],
		['rejects non-string: undefined', undefined, false],
	], isValidRecurrenceRule);
});

describe('isValidRecurrenceType', () => {
	it.each(RECURRENCE_TYPES)('accepts %s', (type) => {
		expect(isValidRecurrenceType(type)).toBe(true);
	});

	runBooleanCases([
		['rejects unknown string: rolling', 'rolling', false],
		['rejects unknown string: FIXED', 'FIXED', false],
		['rejects unknown string: spaced fixed', ' fixed ', false],
		['rejects non-string: null', null, false],
	], isValidRecurrenceType);
});
