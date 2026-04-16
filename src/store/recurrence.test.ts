import { describe, it, expect } from 'vitest';
import {
	advanceDate,
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

function runAdvanceCases(cases: readonly AdvanceCase[]): void {
	it.each(cases)('%s', (_label, date, rule, expected) => {
		expect(advanceDate(date, rule)).toBe(expected);
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

		it('advancing repeatedly from Jan 31 drifts to the clamped day', () => {
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

	it('for unknown rules, fixed mode returns the original startDate unchanged', () => {
		expect(nextStartDate('quarterly', 'fixed', '2026-04-01', '2026-04-15', '2026-04-16')).toBe('2026-04-01');
	});

	it('for unknown rules, from_completion returns completionDate', () => {
		expect(nextStartDate('quarterly', 'from_completion', '2026-04-01', '2026-04-15', '2026-04-16')).toBe('2026-04-16');
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
