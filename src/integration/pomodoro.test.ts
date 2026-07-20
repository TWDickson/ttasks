import { describe, expect, it } from 'vitest';
import {
	DEFAULT_POMODORO_CONFIG,
	advancePhase,
	elapsedMinutes,
	formatRemaining,
	isPhaseComplete,
	nextMode,
	pauseSession,
	phaseDurationSec,
	remainingFraction,
	resumeSession,
	shouldLogFocus,
	startSession,
	tickSession,
	type PomodoroConfig,
} from './pomodoro';

const cfg: PomodoroConfig = { focusMinutes: 25, shortBreakMinutes: 5, longBreakMinutes: 15, longBreakInterval: 4 };

describe('phaseDurationSec', () => {
	it('converts each mode to seconds', () => {
		expect(phaseDurationSec('focus', cfg)).toBe(1500);
		expect(phaseDurationSec('short-break', cfg)).toBe(300);
		expect(phaseDurationSec('long-break', cfg)).toBe(900);
	});

	it('falls back to defaults for non-positive/invalid config', () => {
		const bad: PomodoroConfig = { focusMinutes: 0, shortBreakMinutes: -5, longBreakMinutes: NaN, longBreakInterval: 4 };
		expect(phaseDurationSec('focus', bad)).toBe(DEFAULT_POMODORO_CONFIG.focusMinutes * 60);
		expect(phaseDurationSec('short-break', bad)).toBe(DEFAULT_POMODORO_CONFIG.shortBreakMinutes * 60);
		expect(phaseDurationSec('long-break', bad)).toBe(DEFAULT_POMODORO_CONFIG.longBreakMinutes * 60);
	});
});

describe('startSession', () => {
	it('begins a running focus phase at full duration', () => {
		const s = startSession('a/b.md', 'Task B', cfg);
		expect(s).toMatchObject({ taskPath: 'a/b.md', taskName: 'Task B', mode: 'focus', running: true, completedFocus: 0 });
		expect(s.remainingSec).toBe(1500);
		expect(s.durationSec).toBe(1500);
	});
});

describe('tickSession', () => {
	it('decrements remaining by whole seconds', () => {
		const s = startSession('a.md', 'A', cfg);
		expect(tickSession(s, 1).remainingSec).toBe(1499);
		expect(tickSession(s, 30).remainingSec).toBe(1470);
	});

	it('clamps at zero and never goes negative', () => {
		const s = { ...startSession('a.md', 'A', cfg), remainingSec: 3 };
		expect(tickSession(s, 10).remainingSec).toBe(0);
	});

	it('is a no-op while paused', () => {
		const s = pauseSession(startSession('a.md', 'A', cfg));
		expect(tickSession(s, 5)).toBe(s);
	});
});

describe('pause/resume', () => {
	it('pause stops running; resume restarts; both idempotent', () => {
		const s = startSession('a.md', 'A', cfg);
		const paused = pauseSession(s);
		expect(paused.running).toBe(false);
		expect(pauseSession(paused)).toBe(paused);
		const resumed = resumeSession(paused);
		expect(resumed.running).toBe(true);
		expect(resumeSession(resumed)).toBe(resumed);
	});
});

describe('nextMode', () => {
	it('short break after a normal focus, long break on the interval', () => {
		const s = startSession('a.md', 'A', cfg);
		expect(nextMode({ ...s, completedFocus: 0 }, cfg)).toBe('short-break'); // 1st focus
		expect(nextMode({ ...s, completedFocus: 2 }, cfg)).toBe('short-break'); // 3rd focus
		expect(nextMode({ ...s, completedFocus: 3 }, cfg)).toBe('long-break');  // 4th focus
	});

	it('always returns to focus after any break', () => {
		const s = startSession('a.md', 'A', cfg);
		expect(nextMode({ ...s, mode: 'short-break' }, cfg)).toBe('focus');
		expect(nextMode({ ...s, mode: 'long-break' }, cfg)).toBe('focus');
	});
});

describe('advancePhase', () => {
	it('focus → short break bumps completedFocus and resets the clock', () => {
		const done = { ...startSession('a.md', 'A', cfg), remainingSec: 0 };
		const next = advancePhase(done, cfg);
		expect(next.mode).toBe('short-break');
		expect(next.completedFocus).toBe(1);
		expect(next.remainingSec).toBe(300);
		expect(next.running).toBe(true);
	});

	it('focus → long break on the interval', () => {
		const done = { ...startSession('a.md', 'A', cfg), remainingSec: 0, completedFocus: 3 };
		const next = advancePhase(done, cfg);
		expect(next.mode).toBe('long-break');
		expect(next.completedFocus).toBe(4);
		expect(next.remainingSec).toBe(900);
	});

	it('break → focus does not change completedFocus', () => {
		const brk = { ...startSession('a.md', 'A', cfg), mode: 'short-break' as const, remainingSec: 0, completedFocus: 1 };
		const next = advancePhase(brk, cfg);
		expect(next.mode).toBe('focus');
		expect(next.completedFocus).toBe(1);
		expect(next.remainingSec).toBe(1500);
	});
});

describe('shouldLogFocus', () => {
	it('true only for a completed focus phase', () => {
		const s = startSession('a.md', 'A', cfg);
		expect(shouldLogFocus({ ...s, remainingSec: 0 })).toBe(true);
		expect(shouldLogFocus({ ...s, remainingSec: 5 })).toBe(false);
		expect(shouldLogFocus({ ...s, mode: 'short-break', remainingSec: 0 })).toBe(false);
	});
});

describe('elapsedMinutes', () => {
	it('reports whole minutes elapsed in the current phase', () => {
		const s = startSession('a.md', 'A', cfg);
		expect(elapsedMinutes(s)).toBe(0);
		expect(elapsedMinutes({ ...s, remainingSec: 1500 - 630 })).toBe(10); // 10.5 min → 10
		expect(elapsedMinutes({ ...s, remainingSec: 0 })).toBe(25);
	});
});

describe('formatRemaining', () => {
	it('formats MM:SS zero-padded', () => {
		const s = startSession('a.md', 'A', cfg);
		expect(formatRemaining(s)).toBe('25:00');
		expect(formatRemaining({ ...s, remainingSec: 305 })).toBe('05:05');
		expect(formatRemaining({ ...s, remainingSec: 9 })).toBe('00:09');
		expect(formatRemaining({ ...s, remainingSec: 0 })).toBe('00:00');
	});
});

describe('isPhaseComplete', () => {
	it('true at or below zero remaining', () => {
		const s = startSession('a.md', 'A', cfg);
		expect(isPhaseComplete({ ...s, remainingSec: 0 })).toBe(true);
		expect(isPhaseComplete({ ...s, remainingSec: 1 })).toBe(false);
	});
});

describe('remainingFraction', () => {
	it('is 1 at full duration and 0 at zero remaining', () => {
		const s = startSession('a.md', 'A', cfg);
		expect(remainingFraction(s)).toBe(1);
		expect(remainingFraction({ ...s, remainingSec: 0 })).toBe(0);
	});

	it('is the proportion of remaining/duration mid-phase', () => {
		const s = startSession('a.md', 'A', cfg);
		expect(remainingFraction({ ...s, remainingSec: 750 })).toBeCloseTo(0.5);
	});

	it('clamps and guards against a zero/negative duration', () => {
		const s = startSession('a.md', 'A', cfg);
		expect(remainingFraction({ ...s, durationSec: 0, remainingSec: 0 })).toBe(0);
		expect(remainingFraction({ ...s, remainingSec: -10 })).toBe(0);
	});
});
