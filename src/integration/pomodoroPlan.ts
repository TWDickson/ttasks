// Pure planner for "focus until X:XX". NO Obsidian imports — enforced by
// architectureBoundaries.test.ts. Given the minutes available before a target
// time and the Pomodoro config, it lays out the phases that fit, ending cleanly
// so nothing gets cut off by the target. The runtime service applies the *same*
// per-boundary rule against the wall clock, so this preview never diverges from
// what actually runs.
//
// The rule at each phase boundary, given R minutes remaining and the next mode M:
//   • R >= full(M)            → run M at full length
//   • M is focus and R >= 1   → run a shortened "fill" focus of R minutes (final)
//   • otherwise               → stop (leave the small remainder idle)

import { type PomodoroConfig, type PomodoroMode, type PomodoroSession, nextMode, phaseDurationSec } from './pomodoro';

export interface PlanPhase {
	mode: PomodoroMode;
	minutes: number;
	/** True for a shortened trailing focus that fills the leftover gap exactly. */
	isFill: boolean;
}

export interface FocusPlan {
	/** Ordered phases to run; empty when not even a 1-minute focus fits. */
	phases: PlanPhase[];
	/** Number of focus phases (full + any trailing fill). */
	focusCount: number;
	/** Sum of phase minutes (== available minutes minus any idle remainder). */
	plannedMinutes: number;
	/** True when the last phase is a shortened fill focus. */
	endsWithFill: boolean;
}

const EMPTY_PLAN: FocusPlan = { phases: [], focusCount: 0, plannedMinutes: 0, endsWithFill: false };

function phaseMinutes(mode: PomodoroMode, config: PomodoroConfig): number {
	return Math.round(phaseDurationSec(mode, config) / 60);
}

/** Whole-minute length of a trailing fill focus for `remainingMinutes`, or 0 if too short. */
export function fillFocusMinutes(remainingMinutes: number): number {
	const whole = Math.floor(remainingMinutes);
	return whole >= 1 ? whole : 0;
}

/**
 * Parse an "until" input into available minutes from `now`. Accepts a clock time
 * ("10:30", "9:05" — 24-hour, today) or a bare duration in minutes ("90"). Returns
 * null for unparseable input or a clock time that has already passed today.
 */
export function parseUntilInput(input: string, now: Date): number | null {
	const trimmed = input.trim();
	if (trimmed === '') return null;

	const bare = /^\d{1,3}$/.exec(trimmed);
	if (bare) {
		const minutes = parseInt(trimmed, 10);
		return minutes >= 1 ? minutes : null;
	}

	const clock = /^(\d{1,2}):(\d{2})$/.exec(trimmed);
	if (clock) {
		const hours = parseInt(clock[1], 10);
		const mins = parseInt(clock[2], 10);
		if (hours > 23 || mins > 59) return null;
		const target = new Date(now);
		target.setHours(hours, mins, 0, 0);
		const diffMinutes = Math.floor((target.getTime() - now.getTime()) / 60_000);
		return diffMinutes >= 1 ? diffMinutes : null;
	}

	return null;
}

/**
 * Plan the phases that fit before the target. `availableMinutes` is the gap from
 * now to the target time; the caller derives it from the clock so this stays
 * deterministic and unit-testable.
 */
export function planFocusUntil(availableMinutes: number, config: PomodoroConfig): FocusPlan {
	let remaining = Math.max(0, Math.floor(availableMinutes));
	if (remaining <= 0) return EMPTY_PLAN;

	const phases: PlanPhase[] = [];
	let completedFocus = 0;
	let mode: PomodoroMode = 'focus';

	// Bound the loop defensively: at most one phase per available minute.
	for (let guard = 0; guard <= availableMinutes + 2; guard++) {
		const full = phaseMinutes(mode, config);
		if (remaining >= full) {
			phases.push({ mode, minutes: full, isFill: false });
			remaining -= full;
			const next = nextMode({ mode, completedFocus } as PomodoroSession, config);
			if (mode === 'focus') completedFocus++;
			mode = next;
			continue;
		}
		if (mode === 'focus') {
			const fill = fillFocusMinutes(remaining);
			if (fill >= 1) phases.push({ mode: 'focus', minutes: fill, isFill: true });
		}
		break;
	}

	const focusCount = phases.filter((p) => p.mode === 'focus').length;
	const plannedMinutes = phases.reduce((sum, p) => sum + p.minutes, 0);
	const endsWithFill = phases.length > 0 && phases[phases.length - 1].isFill;
	return { phases, focusCount, plannedMinutes, endsWithFill };
}
