import { describe, expect, it } from 'vitest';
import { type PomodoroSession, startSession } from './pomodoro';
import { pomodoroStatusBarView } from './pomodoroStatusBar';

const CONFIG = { focusMinutes: 25, shortBreakMinutes: 5, longBreakMinutes: 15, longBreakInterval: 4 };

function session(overrides: Partial<PomodoroSession> = {}): PomodoroSession {
	return { ...startSession('tasks/a.md', 'Alpha', CONFIG), ...overrides };
}

describe('pomodoroStatusBarView', () => {
	it('returns null when there is no session', () => {
		expect(pomodoroStatusBarView(null)).toBeNull();
	});

	it('shows the remaining time as MM:SS', () => {
		const view = pomodoroStatusBarView(session({ remainingSec: 12 * 60 + 34 }));
		expect(view?.text).toBe('12:34');
	});

	it('zero-pads the readout to a stable width', () => {
		const view = pomodoroStatusBarView(session({ remainingSec: 9 }));
		expect(view?.text).toBe('00:09');
	});

	it('puts the phase, remaining, task, and pause hint in the tooltip', () => {
		const view = pomodoroStatusBarView(session({ remainingSec: 300 }));
		expect(view?.tooltip).toContain('Focus');
		expect(view?.tooltip).toContain('05:00 left');
		expect(view?.tooltip).toContain('Alpha');
		expect(view?.tooltip).toContain('Click to pause');
	});

	it('marks a paused session and offers resume in the tooltip', () => {
		const view = pomodoroStatusBarView(session({ running: false, remainingSec: 60 }));
		expect(view?.running).toBe(false);
		expect(view?.tooltip).toContain('paused');
		expect(view?.tooltip).toContain('Click to resume');
	});

	it('labels break phases distinctly', () => {
		expect(pomodoroStatusBarView(session({ mode: 'short-break' }))?.tooltip).toContain('Short break');
		const longBreak = pomodoroStatusBarView(session({ mode: 'long-break' }));
		expect(longBreak?.mode).toBe('long-break');
		expect(longBreak?.tooltip).toContain('Long break');
	});

	it('flags a trailing fill focus as final', () => {
		const view = pomodoroStatusBarView(session({ isFill: true, remainingSec: 120 }));
		expect(view?.tooltip).toContain('· final');
	});

	it('omits the task segment for an untethered session', () => {
		const view = pomodoroStatusBarView(session({ taskPath: null, taskName: null, remainingSec: 60 }));
		expect(view?.tooltip).not.toContain('· Alpha');
		expect(view?.tooltip).toContain('Focus');
	});
});
