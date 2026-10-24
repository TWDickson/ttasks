import { describe, expect, it } from 'vitest';
import { pomodoroPhaseLabel, sessionForTask } from './taskDetailPomodoro';
import type { PomodoroSession } from '../integration/pomodoro';

const session = (overrides: Partial<PomodoroSession> = {}) => ({
	taskPath: 'Tasks/a.md',
	mode: 'focus',
	...overrides,
}) as PomodoroSession;

describe('sessionForTask', () => {
	it('returns the session only for the task that owns it', () => {
		expect(sessionForTask(session(), 'Tasks/a.md')).toEqual(session());
		expect(sessionForTask(session(), 'Tasks/b.md')).toBeNull();
		expect(sessionForTask(session({ taskPath: null }), 'Tasks/a.md')).toBeNull();
		expect(sessionForTask(null, 'Tasks/a.md')).toBeNull();
		expect(sessionForTask(session(), null)).toBeNull();
	});
});

describe('pomodoroPhaseLabel', () => {
	it('names each phase, and nothing without a session', () => {
		expect(pomodoroPhaseLabel(session())).toBe('Focus');
		expect(pomodoroPhaseLabel(session({ mode: 'short-break' }))).toBe('Short break');
		expect(pomodoroPhaseLabel(session({ mode: 'long-break' }))).toBe('Long break');
		expect(pomodoroPhaseLabel(null)).toBe('');
	});
});
