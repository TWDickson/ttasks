// Pure Pomodoro timer state machine. NO Obsidian imports — enforced by
// architectureBoundaries.test.ts. The service layer (main.ts) owns the interval
// tick, the reactive store, frontmatter writes, and notifications; this module
// only models phase state + transitions so the whole cycle is unit-testable.

export type PomodoroMode = 'focus' | 'short-break' | 'long-break';

export interface PomodoroConfig {
	focusMinutes: number;
	shortBreakMinutes: number;
	longBreakMinutes: number;
	/** Take a long break after this many completed focus phases. */
	longBreakInterval: number;
}

export interface PomodoroSession {
	/** The task this session is focused on, or null for an untethered session. */
	taskPath: string | null;
	/** Display name of the task, or null when untethered. */
	taskName: string | null;
	mode: PomodoroMode;
	/** Full length of the current phase, in seconds. */
	durationSec: number;
	/** Seconds left in the current phase (0 = phase complete). */
	remainingSec: number;
	/** false while paused. */
	running: boolean;
	/** Completed focus phases so far this session (drives long-break cadence). */
	completedFocus: number;
	/**
	 * Wall-clock target (epoch ms) for a "focus until X" session, or null for an
	 * open-ended session. When set, the service stops the cycle at the target so
	 * nothing runs past it. Wall-clock, not budget: pausing eats into the time.
	 */
	targetEndMs: number | null;
	/** True for a shortened trailing focus that fills the gap up to the target. */
	isFill: boolean;
}

export const DEFAULT_POMODORO_CONFIG: PomodoroConfig = {
	focusMinutes: 25,
	shortBreakMinutes: 5,
	longBreakMinutes: 15,
	longBreakInterval: 4,
};

function positiveOr(value: number, fallback: number): number {
	return Number.isFinite(value) && value > 0 ? value : fallback;
}

/** Phase length in seconds for a mode under a config; guards against bad config. */
export function phaseDurationSec(mode: PomodoroMode, config: PomodoroConfig): number {
	const minutes =
		mode === 'focus'
			? positiveOr(config.focusMinutes, DEFAULT_POMODORO_CONFIG.focusMinutes)
			: mode === 'short-break'
				? positiveOr(config.shortBreakMinutes, DEFAULT_POMODORO_CONFIG.shortBreakMinutes)
				: positiveOr(config.longBreakMinutes, DEFAULT_POMODORO_CONFIG.longBreakMinutes);
	return Math.round(minutes * 60);
}

/** Begin a fresh focus session on a task (or untethered when path/name are null), running. */
export function startSession(taskPath: string | null, taskName: string | null, config: PomodoroConfig): PomodoroSession {
	const durationSec = phaseDurationSec('focus', config);
	return {
		taskPath,
		taskName,
		mode: 'focus',
		durationSec,
		remainingSec: durationSec,
		running: true,
		completedFocus: 0,
		targetEndMs: null,
		isFill: false,
	};
}

/** Advance the clock by whole seconds; clamps at 0. No-op while paused. */
export function tickSession(session: PomodoroSession, elapsedSec = 1): PomodoroSession {
	if (!session.running) return session;
	const step = Math.max(0, Math.round(elapsedSec));
	const remainingSec = Math.max(0, session.remainingSec - step);
	return { ...session, remainingSec };
}

export function isPhaseComplete(session: PomodoroSession): boolean {
	return session.remainingSec <= 0;
}

export function pauseSession(session: PomodoroSession): PomodoroSession {
	return session.running ? { ...session, running: false } : session;
}

export function resumeSession(session: PomodoroSession): PomodoroSession {
	return session.running ? session : { ...session, running: true };
}

/** Which mode follows the current one once its phase completes. */
export function nextMode(session: PomodoroSession, config: PomodoroConfig): PomodoroMode {
	if (session.mode !== 'focus') return 'focus';
	const interval = Math.round(positiveOr(config.longBreakInterval, DEFAULT_POMODORO_CONFIG.longBreakInterval));
	const focusDone = session.completedFocus + 1;
	return focusDone % interval === 0 ? 'long-break' : 'short-break';
}

/**
 * Transition to the next phase after the current one completes. A finished focus
 * phase bumps `completedFocus` — the caller logs the pomodoro at that point. The
 * returned session is reset to the next phase's full duration and left running so
 * the cycle can auto-continue; the caller can `pauseSession` it for a manual gate.
 */
export function advancePhase(session: PomodoroSession, config: PomodoroConfig): PomodoroSession {
	const mode = nextMode(session, config);
	const completedFocus = session.mode === 'focus' ? session.completedFocus + 1 : session.completedFocus;
	const durationSec = phaseDurationSec(mode, config);
	// An auto-advanced phase is never a fill; targetEndMs carries via the spread.
	return { ...session, mode, completedFocus, durationSec, remainingSec: durationSec, running: true, isFill: false };
}

/** True when the current phase is a *completed* focus phase (time to log it). */
export function shouldLogFocus(session: PomodoroSession): boolean {
	return session.mode === 'focus' && isPhaseComplete(session);
}

/** Whole minutes elapsed in the current phase — used to log partial time on stop. */
export function elapsedMinutes(session: PomodoroSession): number {
	return Math.floor(Math.max(0, session.durationSec - session.remainingSec) / 60);
}

/** "MM:SS" for the remaining time, zero-padded to a stable width. */
export function formatRemaining(session: PomodoroSession): string {
	const total = Math.max(0, session.remainingSec);
	const minutes = Math.floor(total / 60);
	const seconds = total % 60;
	return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}
