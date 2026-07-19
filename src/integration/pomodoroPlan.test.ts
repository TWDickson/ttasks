import { describe, expect, it } from 'vitest';
import type { PomodoroConfig } from './pomodoro';
import { fillFocusMinutes, parseUntilInput, planFocusUntil } from './pomodoroPlan';

const cfg: PomodoroConfig = { focusMinutes: 25, shortBreakMinutes: 5, longBreakMinutes: 15, longBreakInterval: 4 };

describe('fillFocusMinutes', () => {
	it('floors to whole minutes and needs at least one', () => {
		expect(fillFocusMinutes(8.9)).toBe(8);
		expect(fillFocusMinutes(1)).toBe(1);
		expect(fillFocusMinutes(0.9)).toBe(0);
		expect(fillFocusMinutes(0)).toBe(0);
	});
});

describe('planFocusUntil', () => {
	it('returns an empty plan when no focus fits', () => {
		expect(planFocusUntil(0, cfg).phases).toEqual([]);
		expect(planFocusUntil(-10, cfg).phases).toEqual([]);
	});

	it('fills a sub-focus gap with a single shortened focus', () => {
		const plan = planFocusUntil(12, cfg);
		expect(plan.phases).toEqual([{ mode: 'focus', minutes: 12, isFill: true }]);
		expect(plan.focusCount).toBe(1);
		expect(plan.endsWithFill).toBe(true);
	});

	it('lays down focus/break cycles and ends on a full focus when it fits exactly', () => {
		// 25 + 5 + 25 = 55
		const plan = planFocusUntil(55, cfg);
		expect(plan.phases).toEqual([
			{ mode: 'focus', minutes: 25, isFill: false },
			{ mode: 'short-break', minutes: 5, isFill: false },
			{ mode: 'focus', minutes: 25, isFill: false },
		]);
		expect(plan.focusCount).toBe(2);
		expect(plan.endsWithFill).toBe(false);
		expect(plan.plannedMinutes).toBe(55);
	});

	it('runs a break that fits then a trailing fill focus for the remainder', () => {
		// 63 min: focus25, break5, then focus does not fit (need 25, have 33-30=3) → fill 3
		const plan = planFocusUntil(33, cfg);
		expect(plan.phases).toEqual([
			{ mode: 'focus', minutes: 25, isFill: false },
			{ mode: 'short-break', minutes: 5, isFill: false },
			{ mode: 'focus', minutes: 3, isFill: true },
		]);
		expect(plan.plannedMinutes).toBe(33);
		expect(plan.endsWithFill).toBe(true);
	});

	it('leaves a tiny remainder idle when only a short break would follow', () => {
		// 27 min: focus25 done, remaining 2 < break5 and next is a break → stop, 2 min idle
		const plan = planFocusUntil(27, cfg);
		expect(plan.phases).toEqual([{ mode: 'focus', minutes: 25, isFill: false }]);
		expect(plan.plannedMinutes).toBe(25);
		expect(plan.endsWithFill).toBe(false);
	});

	it('takes a long break on the configured interval', () => {
		// 4 focus + 3 short breaks = 100 + 15 = 115; the 4th cycle boundary is a long break
		const plan = planFocusUntil(140, cfg);
		const modes = plan.phases.map((p) => p.mode);
		expect(modes).toContain('long-break');
		expect(plan.focusCount).toBeGreaterThanOrEqual(4);
	});
});

describe('parseUntilInput', () => {
	const now = new Date('2026-07-19T09:00:00');

	it('parses a bare minute duration', () => {
		expect(parseUntilInput('90', now)).toBe(90);
		expect(parseUntilInput(' 45 ', now)).toBe(45);
	});

	it('parses a clock time later today into minutes from now', () => {
		expect(parseUntilInput('10:30', now)).toBe(90);
		expect(parseUntilInput('9:05', now)).toBe(5);
	});

	it('rejects past clock times and garbage', () => {
		expect(parseUntilInput('08:00', now)).toBeNull();
		expect(parseUntilInput('09:00', now)).toBeNull(); // now, zero minutes
		expect(parseUntilInput('25:00', now)).toBeNull();
		expect(parseUntilInput('10:99', now)).toBeNull();
		expect(parseUntilInput('abc', now)).toBeNull();
		expect(parseUntilInput('', now)).toBeNull();
		expect(parseUntilInput('0', now)).toBeNull();
	});
});
